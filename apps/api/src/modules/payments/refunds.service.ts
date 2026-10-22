import { Inject, Injectable, Logger } from '@nestjs/common';
import type { RefundDto } from '@nexvolt/shared';
import type { Refund } from '@prisma/client';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BookingTransitionsService } from '../booking-core/booking-transitions.service';
import type { RefundPort, RefundRequest } from '../bookings/refund-port';
import { LedgerService } from '../ledger/ledger.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { ProviderRefund } from './providers/payment-provider';
import { PROVIDER_REGISTRY, type PaymentProviderRegistry } from './providers/provider-registry';

export function toRefundDto(r: Refund): RefundDto {
  return {
    id: r.id,
    paymentId: r.paymentId,
    bookingId: r.bookingId,
    amountMinor: r.amountMinor,
    status: r.status,
    reason: r.reason,
    providerRefundId: r.providerRefundId,
    createdAt: r.createdAt.toISOString(),
  };
}

const LIVE = ['CAPTURED', 'PARTIALLY_REFUNDED'] as const;

/**
 * Refunds are recorded (and the refundable balance reserved) in our DB *before* calling the
 * provider, keyed by an idempotency key, so retries cannot over-refund. The provider result
 * (or a later webhook / reconciliation) moves the refund to PROCESSED or FAILED.
 */
@Injectable()
export class RefundsService implements RefundPort {
  private readonly logger = new Logger('Refunds');

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly notifications: NotificationsService,
    private readonly transitions: BookingTransitionsService,
    @Inject(PROVIDER_REGISTRY) private readonly providers: PaymentProviderRegistry,
  ) {}

  async refundBooking(req: RefundRequest): Promise<{ refundId: string; status: string } | null> {
    const payment = await this.prisma.payment.findFirst({
      where: { bookingId: req.bookingId, status: { in: [...LIVE] } },
    });
    if (!payment) return null;
    const r = await this.issue(payment.id, req);
    return { refundId: r.id, status: r.status };
  }

  async issue(
    paymentId: string,
    req: Omit<RefundRequest, 'bookingId'> & { bookingId?: string },
  ): Promise<RefundDto> {
    const existing = await this.prisma.refund.findUnique({
      where: { idempotencyKey: req.idempotencyKey },
    });
    if (existing) return toRefundDto(existing);

    const refund = await this.prisma.$transaction(async (tx) => {
      const p0 = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      await this.transitions.lock(tx, p0.bookingId); // lock order: booking → payment
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
      const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      if (!(LIVE as readonly string[]).includes(p.status))
        throw AppError.unprocessable('NOT_REFUNDABLE', 'This payment cannot be refunded');
      const refundable = p.amountMinor - p.amountRefundedMinor;
      if (req.amountMinor <= 0 || req.amountMinor > refundable) {
        throw AppError.unprocessable(
          'REFUND_EXCEEDS_BALANCE',
          `Refundable balance is ₹${(refundable / 100).toFixed(2)}`,
        );
      }
      const r = await tx.refund.create({
        data: {
          paymentId,
          bookingId: p.bookingId,
          amountMinor: req.amountMinor,
          chargingFeePortionMinor: req.chargingFeePortionMinor,
          reason: req.reason,
          idempotencyKey: req.idempotencyKey,
          initiatedById: req.initiatedById,
        },
      });
      const newRefunded = p.amountRefundedMinor + req.amountMinor;
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          amountRefundedMinor: newRefunded,
          status: newRefunded >= p.amountMinor ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        },
      });
      const booking = await tx.booking.findUniqueOrThrow({
        where: { id: p.bookingId },
        include: { charger: { select: { hostId: true } } },
      });
      await this.ledger.postRefund(tx, booking, r.id, req.chargingFeePortionMinor);
      return r;
    });

    const payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    try {
      const pr = await this.providers
        .get(payment.provider)
        .refund(payment.providerPaymentId!, refund.amountMinor, refund.id);
      await this.applyProviderRefund(pr);
    } catch (e) {
      this.logger.warn(
        `Refund ${refund.id} provider call failed; will reconcile: ${(e as Error).message}`,
      );
      await this.prisma.refund.update({
        where: { id: refund.id },
        data: { failureReason: 'Provider call failed; pending reconciliation' },
      });
    }
    return toRefundDto(await this.prisma.refund.findUniqueOrThrow({ where: { id: refund.id } }));
  }

  /** Apply authoritative refund state from the provider (API response, webhook or reconciliation). */
  async applyProviderRefund(pr: ProviderRefund): Promise<void> {
    const refund =
      (await this.prisma.refund.findUnique({ where: { providerRefundId: pr.id } })) ??
      (pr.internalRefundId
        ? await this.prisma.refund.findUnique({ where: { id: pr.internalRefundId } })
        : null);
    if (!refund) {
      this.logger.warn(
        `Provider refund ${pr.id} does not match any Nexvolt refund (created outside Nexvolt?)`,
      );
      return;
    }
    if (refund.status !== 'PENDING') {
      if (!refund.providerRefundId)
        await this.prisma.refund.update({
          where: { id: refund.id },
          data: { providerRefundId: pr.id },
        });
      return;
    }
    if (pr.status === 'pending') {
      await this.prisma.refund.update({
        where: { id: refund.id },
        data: { providerRefundId: pr.id, failureReason: null },
      });
      return;
    }
    const booking = await this.prisma.booking.findUniqueOrThrow({
      where: { id: refund.bookingId },
    });
    if (pr.status === 'processed') {
      const r = await this.prisma.refund.updateMany({
        where: { id: refund.id, status: 'PENDING' },
        data: {
          status: 'PROCESSED',
          providerRefundId: pr.id,
          processedAt: new Date(),
          failureReason: null,
        },
      });
      if (r.count) {
        await this.notifications.notify({
          userId: booking.driverId,
          type: 'REFUND_STATUS',
          title: 'Refund processed',
          body: `₹${(refund.amountMinor / 100).toFixed(2)} for ${booking.code} was processed. Banks can take 5–7 working days to credit it.`,
          data: { bookingId: booking.id },
        });
      }
      return;
    }
    // failed: release the reserved balance and void ledger reversals
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.refund.updateMany({
        where: { id: refund.id, status: 'PENDING' },
        data: {
          status: 'FAILED',
          providerRefundId: pr.id,
          failureReason: 'Provider reported refund failure',
        },
      });
      if (!r.count) return;
      const p = await tx.payment.findUniqueOrThrow({ where: { id: refund.paymentId } });
      const refunded = Math.max(0, p.amountRefundedMinor - refund.amountMinor);
      await tx.payment.update({
        where: { id: p.id },
        data: {
          amountRefundedMinor: refunded,
          status: refunded === 0 ? 'CAPTURED' : 'PARTIALLY_REFUNDED',
        },
      });
      await this.ledger.voidRefund(tx, refund.id);
    });
    this.logger.error(`Refund ${refund.id} FAILED at provider — needs admin attention`);
  }

  /** Re-drive refunds stuck in PENDING (provider unreachable, missed webhooks). */
  async reconcilePending(): Promise<number> {
    const stuck = await this.prisma.refund.findMany({
      where: { status: 'PENDING', createdAt: { lt: new Date(Date.now() - 2 * 60_000) } },
      include: { payment: true },
      take: 50,
    });
    for (const r of stuck) {
      try {
        const provider = this.providers.get(r.payment.provider);
        const remote = (await provider.fetchRefunds(r.payment.providerPaymentId!)).find(
          (x) => x.id === r.providerRefundId || x.internalRefundId === r.id,
        );
        if (remote) await this.applyProviderRefund(remote);
        else if (!r.providerRefundId)
          await this.applyProviderRefund(
            await provider.refund(r.payment.providerPaymentId!, r.amountMinor, r.id),
          );
      } catch (e) {
        this.logger.warn(`Refund reconciliation for ${r.id} failed: ${(e as Error).message}`);
      }
    }
    return stuck.length;
  }

  async forBooking(bookingId: string): Promise<RefundDto[]> {
    return (
      await this.prisma.refund.findMany({ where: { bookingId }, orderBy: { createdAt: 'asc' } })
    ).map(toRefundDto);
  }
}
