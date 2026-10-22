import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { addMinutes, formatIst, type PaymentOrderDto, type PaymentStatus } from '@nexvolt/shared';
import { Prisma, type Payment } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { sha256Hex } from '../../common/crypto/crypto.service';
import { AppError, isOverlapViolation, isUniqueViolation } from '../../common/errors/app-error';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ENV, type Env } from '../../config/env';
import { BookingTransitionsService, SYSTEM } from '../booking-core/booking-transitions.service';
import { LedgerService } from '../ledger/ledger.service';
import { NotificationsService, type NotifyInput } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import type { ProviderPayment } from './providers/payment-provider';
import { PROVIDER_REGISTRY, type PaymentProviderRegistry } from './providers/provider-registry';
import { RefundsService } from './refunds.service';

/** Forward-only precedence so reordered events can never move a payment backwards. */
const RANK: Record<PaymentStatus, number> = {
  CREATED: 0,
  FAILED: 1,
  AUTHORIZED: 2,
  CAPTURED: 3,
  PARTIALLY_REFUNDED: 4,
  REFUNDED: 4,
};
const LIVE: PaymentStatus[] = ['AUTHORIZED', 'CAPTURED', 'PARTIALLY_REFUNDED'];
const CHECKOUT_TOKEN_TTL_S = 20 * 60;

interface CheckoutToken {
  typ: 'checkout';
  sub: string;
  pid: string;
}

export interface ApplyResult {
  paymentStatus: PaymentStatus;
  bookingStatus: string;
  bookingId: string;
}

/** Strip anything that is not needed for audit (cards, VPA, email, contact never stored). */
export function sanitizeProviderPayload(payload: unknown): Prisma.InputJsonValue {
  const keep = [
    'id',
    'entity',
    'status',
    'amount',
    'currency',
    'order_id',
    'payment_id',
    'method',
    'error_code',
    'error_description',
    'fee',
    'tax',
    'amount_refunded',
    'created_at',
    'captured',
  ];
  const pick = (o: Record<string, unknown> | undefined) =>
    o ? Object.fromEntries(Object.entries(o).filter(([k]) => keep.includes(k))) : undefined;
  const p = payload as {
    event?: string;
    payload?: Record<string, { entity?: Record<string, unknown> }>;
  };
  return JSON.parse(
    JSON.stringify({
      event: p?.event,
      payment: pick(p?.payload?.payment?.entity),
      order: pick(p?.payload?.order?.entity),
      refund: pick(p?.payload?.refund?.entity),
    }),
  );
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Payments');

  constructor(
    private readonly prisma: PrismaService,
    private readonly transitions: BookingTransitionsService,
    private readonly ledger: LedgerService,
    private readonly refunds: RefundsService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
    private readonly idempotency: IdempotencyService,
    private readonly jwt: JwtService,
    @Inject(PROVIDER_REGISTRY) private readonly providers: PaymentProviderRegistry,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ───────────── Orders & checkout ─────────────

  private toOrderDto(
    p: Payment,
    bookingCode: string,
    expiresAt: Date | null,
  ): PaymentOrderDto & { checkoutUrl: string } {
    return {
      paymentId: p.id,
      provider: p.provider,
      isDemo: p.isDemo,
      providerOrderId: p.providerOrderId,
      amountMinor: p.amountMinor,
      currency: 'INR',
      keyId: p.provider === 'RAZORPAY' ? (this.providers.razorpay?.publicKeyId ?? null) : null,
      bookingCode,
      description: `Nexvolt charging booking ${bookingCode}`,
      expiresAt: expiresAt?.toISOString() ?? null,
      checkoutUrl: '',
    };
  }

  async createOrder(user: AuthUser, bookingId: string, idemKey: string | null) {
    return this.idempotency.run('payment.order', user.id, idemKey, { bookingId }, async () => {
      const provider = this.providers.active;
      const s = await this.settings.get();
      const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
      if (!booking || booking.driverId !== user.id) throw AppError.notFound('Booking');
      if (!['HELD', 'PENDING_PAYMENT'].includes(booking.status)) {
        throw AppError.conflict(
          'NOT_PAYABLE',
          `This booking is ${booking.status.toLowerCase().replace(/_/g, ' ')} and cannot be paid`,
        );
      }
      if (!booking.holdExpiresAt || booking.holdExpiresAt < new Date()) {
        throw AppError.conflict('HOLD_EXPIRED', 'Your slot hold has expired. Please book again.');
      }
      // Reuse an open order for this booking: one booking → at most one payable order.
      const open = await this.prisma.payment.findFirst({
        where: {
          bookingId,
          provider: provider.name,
          status: { in: ['CREATED', 'FAILED'] },
          amountMinor: booking.totalMinor,
        },
        orderBy: { createdAt: 'desc' },
      });
      let payment = open;
      if (!payment) {
        const { orderId } = await provider.createOrder({
          amountMinor: booking.totalMinor,
          currency: 'INR',
          receipt: booking.code,
          notes: { bookingId: booking.id, bookingCode: booking.code },
        });
        try {
          payment = await this.prisma.payment.create({
            data: {
              bookingId,
              provider: provider.name,
              isDemo: provider.isDemo,
              providerOrderId: orderId,
              amountMinor: booking.totalMinor,
              idempotencyKey: `order:${bookingId}:${sha256Hex(idemKey!).slice(0, 16)}`,
            },
          });
        } catch (e) {
          if (!isUniqueViolation(e)) throw e;
          payment = await this.prisma.payment.findFirstOrThrow({
            where: { bookingId, status: { in: ['CREATED', 'FAILED'] } },
          });
        }
      }
      let expiresAt = booking.holdExpiresAt;
      if (booking.status === 'HELD') {
        expiresAt = new Date(
          Math.min(
            addMinutes(new Date(), s.paymentWindowMinutes).getTime(),
            booking.startAt.getTime(),
          ),
        );
        await this.prisma.$transaction(async (tx) => {
          const locked = await this.transitions.lock(tx, bookingId);
          if (locked.status === 'HELD') {
            await this.transitions.transition(
              tx,
              locked,
              'PENDING_PAYMENT',
              { type: 'DRIVER', id: user.id },
              { hold: { kind: 'PAYMENT', expiresAt: expiresAt! } },
            );
          }
        });
      }
      const dto = this.toOrderDto(payment, booking.code, expiresAt);
      dto.checkoutUrl = await this.checkoutUrl(user.id, payment.id);
      return dto;
    });
  }

  async checkoutUrl(userId: string, paymentId: string): Promise<string> {
    const token = await this.jwt.signAsync(
      { typ: 'checkout', sub: userId, pid: paymentId } satisfies CheckoutToken,
      { expiresIn: CHECKOUT_TOKEN_TTL_S },
    );
    return `${this.env.API_PUBLIC_URL}/api/v1/payments/checkout/${paymentId}?t=${encodeURIComponent(token)}`;
  }

  async verifyCheckoutToken(token: string, paymentId?: string): Promise<CheckoutToken> {
    try {
      const t = await this.jwt.verifyAsync<CheckoutToken>(token);
      if (t.typ !== 'checkout' || (paymentId && t.pid !== paymentId)) throw new Error('bad token');
      return t;
    } catch {
      throw new AppError(
        'CHECKOUT_LINK_INVALID',
        'This payment link has expired. Return to the app and try again.',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  async checkoutContext(paymentId: string, token: string) {
    await this.verifyCheckoutToken(token, paymentId);
    const p = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { booking: { include: { charger: true } } },
    });
    if (!p) throw AppError.notFound('Payment');
    return {
      payment: p,
      keyId: p.provider === 'RAZORPAY' ? (this.providers.razorpay?.publicKeyId ?? null) : null,
      title: p.booking.charger.title,
      startText: formatIst(p.booking.startAt),
      payable: ['CREATED', 'FAILED'].includes(p.status) && p.booking.status === 'PENDING_PAYMENT',
    };
  }

  // ───────────── Verification (client callback → provider is source of truth) ─────────────

  async verifyCheckout(
    userId: string,
    input: {
      bookingId?: string;
      paymentId?: string;
      providerOrderId: string;
      providerPaymentId: string;
      signature: string;
    },
  ) {
    const p = await this.prisma.payment.findUnique({
      where: { providerOrderId: input.providerOrderId },
      include: { booking: true },
    });
    if (
      !p ||
      p.booking.driverId !== userId ||
      (input.bookingId && p.bookingId !== input.bookingId) ||
      (input.paymentId && p.id !== input.paymentId)
    ) {
      throw AppError.notFound('Payment');
    }
    const provider = this.providers.get(p.provider);
    if (
      !provider.verifyCheckoutSignature(
        input.providerOrderId,
        input.providerPaymentId,
        input.signature,
      )
    ) {
      throw AppError.unprocessable('SIGNATURE_INVALID', 'Payment verification failed');
    }
    // Never trust the client: re-read the payment from the provider before acting.
    const remote = await provider.fetchPayment(input.providerPaymentId);
    if (remote.orderId !== p.providerOrderId)
      throw AppError.unprocessable('SIGNATURE_INVALID', 'Payment verification failed');
    return this.applyProviderPayment(remote, 'checkout_verify');
  }

  async demoComplete(
    userId: string,
    bookingId: string,
    outcome: 'SUCCESS' | 'FAILURE',
  ): Promise<ApplyResult> {
    if (!this.providers.demo) throw AppError.notFound('Route');
    const p = await this.prisma.payment.findFirst({
      where: {
        bookingId,
        isDemo: true,
        status: { in: ['CREATED', 'FAILED'] },
        booking: { driverId: userId },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!p) throw AppError.notFound('Demo payment');
    return this.applyProviderPayment(
      this.providers.demo.simulate(p.providerOrderId, p.amountMinor, outcome),
      'demo',
    );
  }

  // ───────────── The single state-application path ─────────────

  /**
   * Apply authoritative provider state. Idempotent and order-independent: used by the
   * checkout callback, webhooks, reconciliation and demo mode. Double charges are prevented
   * by forward-only status precedence, a unique "one live payment per booking" index, and
   * automatic refunds for payments that arrive for a booking that can no longer be honoured.
   */
  async applyProviderPayment(pp: ProviderPayment, source: string): Promise<ApplyResult> {
    const p0 = await this.prisma.payment.findUnique({ where: { providerOrderId: pp.orderId } });
    if (!p0) throw AppError.notFound('Payment');
    if (pp.amountMinor !== p0.amountMinor || pp.currency !== p0.currency) {
      this.logger.error(
        `Amount/currency mismatch on payment ${p0.id} (${source}) — refusing to confirm`,
      );
      await this.prisma.payment.update({
        where: { id: p0.id },
        data: { failureReason: 'AMOUNT_MISMATCH: manual review required' },
      });
      throw AppError.unprocessable('AMOUNT_MISMATCH', 'Payment amount does not match the booking');
    }

    const after: Array<() => Promise<unknown>> = [];
    const notices: NotifyInput[] = [];
    const result = await this.prisma.$transaction(async (tx) => {
      const booking = await this.transitions.lock(tx, p0.bookingId);
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${p0.id}::uuid FOR UPDATE`;
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: p0.id } });
      const done = (b = booking): ApplyResult => ({
        paymentStatus: payment.status,
        bookingStatus: b.status,
        bookingId: b.id,
      });
      await tx.payment.update({
        where: { id: payment.id },
        data: { lastReconciledAt: new Date() },
      });

      if (pp.status === 'created') return done();

      if (pp.status === 'failed') {
        if (RANK[payment.status] <= RANK.FAILED) {
          const upd = await tx.payment.update({
            where: { id: payment.id },
            data: { status: 'FAILED', failureReason: pp.errorDescription ?? 'Payment failed' },
          });
          notices.push({
            userId: booking.driverId,
            type: 'PAYMENT_STATUS',
            title: payment.isDemo ? 'DEMO payment failed' : 'Payment failed',
            body: `Payment for ${booking.code} did not go through. You can retry until ${booking.holdExpiresAt ? formatIst(booking.holdExpiresAt) : 'your hold expires'}. You have not been charged.`,
            data: { bookingId: booking.id },
          });
          return {
            paymentStatus: upd.status,
            bookingStatus: booking.status,
            bookingId: booking.id,
          };
        }
        return done(); // a late "failed" never overrides a success
      }

      if (pp.status === 'authorized') {
        if (RANK[payment.status] >= RANK.AUTHORIZED) return done();
        const upd = await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'AUTHORIZED',
            providerPaymentId: pp.id,
            method: pp.method,
            authorizedAt: new Date(),
            failureReason: null,
          },
        });
        if (['PENDING_PAYMENT', 'EXPIRED'].includes(booking.status)) {
          // Capture explicitly; the resulting "captured" state flows back through this method.
          after.push(async () => {
            const captured = await this.providers
              .get(payment.provider)
              .capture(pp.id, payment.amountMinor, payment.currency);
            await this.applyProviderPayment(captured, `${source}:capture`);
          });
        }
        // Otherwise leave uncaptured: Razorpay auto-refunds authorisations that are never captured.
        return { paymentStatus: upd.status, bookingStatus: booking.status, bookingId: booking.id };
      }

      // captured / refunded
      if (RANK[payment.status] >= RANK.CAPTURED) {
        if (payment.providerFeeMinor == null && pp.feeMinor != null) {
          await tx.payment.update({
            where: { id: payment.id },
            data: { providerFeeMinor: pp.feeMinor, providerTaxMinor: pp.taxMinor },
          });
        }
        return done();
      }
      const capturedData = {
        providerPaymentId: pp.id,
        method: pp.method,
        providerFeeMinor: pp.feeMinor,
        providerTaxMinor: pp.taxMinor,
        capturedAt: new Date(),
        failureReason: null,
      };
      const otherLive = await tx.payment.findFirst({
        where: { bookingId: booking.id, id: { not: payment.id }, status: { in: LIVE } },
      });
      if (otherLive) {
        // Duplicate payment for an already-paid booking → full refund, never a second charge.
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            ...capturedData,
            status: 'FAILED',
            failureReason: 'DUPLICATE_PAYMENT: refund issued',
          },
        });
        after.push(() => this.refundDuplicate(payment.id, pp));
        return {
          paymentStatus: 'FAILED' as PaymentStatus,
          bookingStatus: booking.status,
          bookingId: booking.id,
        };
      }
      const captured = await tx.payment.update({
        where: { id: payment.id },
        data: { ...capturedData, status: 'CAPTURED' },
      });
      const withHost = async () =>
        tx.booking.findUniqueOrThrow({
          where: { id: booking.id },
          include: {
            charger: { select: { hostId: true, title: true, host: { select: { userId: true } } } },
          },
        });
      const confirmNotices = async () => {
        const b = await withHost();
        notices.push(
          {
            userId: b.driverId,
            type: 'BOOKING_CONFIRMED',
            title: payment.isDemo ? 'Booking confirmed (DEMO PAYMENT)' : 'Booking confirmed',
            body: `${b.code} at ${b.charger.title}, ${formatIst(b.startAt)}.`,
            data: { bookingId: b.id },
          },
          {
            userId: b.charger.host.userId,
            type: 'BOOKING_CONFIRMED',
            title: 'New confirmed booking',
            body: `${b.code}: ${formatIst(b.startAt)}.`,
            data: { bookingId: b.id },
          },
        );
      };

      if (booking.status === 'PENDING_PAYMENT' || booking.status === 'HELD') {
        const confirmed = await this.transitions.transition(
          tx,
          booking.status === 'HELD'
            ? await this.transitions.transition(tx, booking, 'PENDING_PAYMENT', SYSTEM)
            : booking,
          'CONFIRMED',
          SYSTEM,
          {
            reason: `Payment captured (${source})`,
            metadata: { paymentId: payment.id, isDemo: payment.isDemo },
          },
        );
        await this.ledger.postCapture(tx, await withHost(), captured);
        await confirmNotices();
        return {
          paymentStatus: captured.status,
          bookingStatus: confirmed.status,
          bookingId: booking.id,
        };
      }

      if (booking.status === 'EXPIRED') {
        // Late payment: re-confirm only if the slot is still free (exclusion constraint decides).
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${booking.chargerId}, 0))`;
        await tx.$executeRawUnsafe('SAVEPOINT late_confirm');
        try {
          const confirmed = await this.transitions.transition(tx, booking, 'CONFIRMED', SYSTEM, {
            reason: 'Late payment; slot still available',
          });
          await tx.$executeRawUnsafe('RELEASE SAVEPOINT late_confirm');
          await this.ledger.postCapture(tx, await withHost(), captured);
          await confirmNotices();
          return {
            paymentStatus: captured.status,
            bookingStatus: confirmed.status,
            bookingId: booking.id,
          };
        } catch (e) {
          if (!isOverlapViolation(e)) throw e;
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT late_confirm');
          const failed = await this.transitions.transition(tx, booking, 'FAILED', SYSTEM, {
            reason: 'Late payment; slot no longer available — refunded',
          });
          after.push(() =>
            this.refundAll(
              booking.id,
              payment.id,
              'Late payment after hold expired; slot was taken',
            ),
          );
          notices.push({
            userId: booking.driverId,
            type: 'PAYMENT_STATUS',
            title: 'Payment refunded',
            body: `Your payment for ${booking.code} arrived after the hold expired and the slot was taken. A full refund has been initiated.`,
            data: { bookingId: booking.id },
          });
          return {
            paymentStatus: captured.status,
            bookingStatus: failed.status,
            bookingId: booking.id,
          };
        }
      }

      // Booking already cancelled/failed/etc: the money must go back.
      after.push(() =>
        this.refundAll(
          booking.id,
          payment.id,
          `Payment received for a ${booking.status.toLowerCase()} booking`,
        ),
      );
      notices.push({
        userId: booking.driverId,
        type: 'PAYMENT_STATUS',
        title: 'Payment refunded',
        body: `Your booking ${booking.code} was no longer active, so your payment is being refunded in full.`,
        data: { bookingId: booking.id },
      });
      return {
        paymentStatus: captured.status,
        bookingStatus: booking.status,
        bookingId: booking.id,
      };
    });

    for (const fn of after) {
      try {
        await fn();
      } catch (e) {
        this.logger.error(
          `Post-payment action failed for ${p0.id}: ${(e as Error).message} — reconciliation will retry`,
        );
      }
    }
    await this.notifications.notify(notices);
    return result;
  }

  private async refundAll(bookingId: string, paymentId: string, reason: string) {
    const p = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    const remaining = p.amountMinor - p.amountRefundedMinor;
    if (remaining <= 0) return;
    // No capture ledger was posted for this payment, so no host reversal is needed.
    await this.refunds.issue(paymentId, {
      bookingId,
      amountMinor: remaining,
      chargingFeePortionMinor: 0,
      reason,
      idempotencyKey: `auto-full:${paymentId}`,
      initiatedById: null,
    });
  }

  private async refundDuplicate(paymentId: string, pp: ProviderPayment) {
    const p = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    const existing = await this.prisma.refund.findUnique({
      where: { idempotencyKey: `duplicate:${paymentId}` },
    });
    if (existing) return;
    const refund = await this.prisma.refund.create({
      data: {
        paymentId,
        bookingId: p.bookingId,
        amountMinor: p.amountMinor,
        reason: 'Duplicate payment',
        idempotencyKey: `duplicate:${paymentId}`,
      },
    });
    const pr = await this.providers.get(p.provider).refund(pp.id, p.amountMinor, refund.id);
    await this.refunds.applyProviderRefund(pr);
    if (pr.status !== 'failed')
      await this.prisma.payment.update({
        where: { id: paymentId },
        data: { amountRefundedMinor: p.amountMinor, status: 'REFUNDED' },
      });
  }

  // ───────────── Webhooks & reconciliation ─────────────

  async handleRazorpayWebhook(
    rawBody: Buffer | undefined,
    signature: string | undefined,
    eventId: string | undefined,
  ) {
    const rz = this.providers.razorpay;
    if (!rz) throw AppError.notFound('Route');
    if (!rawBody || !signature || !rz.verifyWebhookSignature(rawBody, signature)) {
      throw new AppError('WEBHOOK_SIGNATURE_INVALID', 'Invalid signature', HttpStatus.BAD_REQUEST);
    }
    const body = JSON.parse(rawBody.toString('utf8')) as {
      event: string;
      payload: Record<string, { entity: Record<string, unknown> }>;
    };
    const dedupeKey = eventId ? `rzp:${eventId}` : `rzp-body:${sha256Hex(rawBody)}`;
    let event = await this.prisma.paymentEvent.findUnique({ where: { dedupeKey } });
    if (event?.processedAt) return { status: 'duplicate' };
    if (!event) {
      const orderId = (body.payload.payment?.entity?.order_id ?? body.payload.order?.entity?.id) as
        string | undefined;
      const payment = orderId
        ? await this.prisma.payment.findUnique({ where: { providerOrderId: orderId } })
        : null;
      try {
        event = await this.prisma.paymentEvent.create({
          data: {
            dedupeKey,
            provider: 'RAZORPAY',
            eventType: body.event,
            payload: sanitizeProviderPayload(body),
            signatureVerified: true,
            paymentId: payment?.id,
          },
        });
      } catch (e) {
        if (isUniqueViolation(e)) return { status: 'duplicate' };
        throw e;
      }
    }
    try {
      await this.processWebhookEvent(body);
      await this.prisma.paymentEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date(), processingError: null },
      });
      return { status: 'processed' };
    } catch (e) {
      const msg = (e as Error).message;
      await this.prisma.paymentEvent.update({
        where: { id: event.id },
        data: { processingError: msg.slice(0, 500) },
      });
      if (e instanceof AppError && e.status < 500) return { status: 'ignored', reason: e.code }; // permanent; don't make Razorpay retry
      throw e; // transient → 5xx → Razorpay retries
    }
  }

  private async processWebhookEvent(body: {
    event: string;
    payload: Record<string, { entity: Record<string, unknown> }>;
  }) {
    const rz = this.providers.razorpay!;
    if (body.event.startsWith('payment.') || body.event === 'order.paid') {
      const paymentId = body.payload.payment?.entity?.id as string | undefined;
      if (!paymentId) return;
      // Re-fetch current state: handles reordering (e.g. "authorized" arriving after "captured").
      await this.applyProviderPayment(await rz.fetchPayment(paymentId), `webhook:${body.event}`);
    } else if (body.event.startsWith('refund.')) {
      const paymentId = body.payload.refund?.entity?.payment_id as string | undefined;
      const refundId = body.payload.refund?.entity?.id as string | undefined;
      if (!paymentId) return;
      const remote = (await rz.fetchRefunds(paymentId)).find((r) => r.id === refundId);
      if (remote) await this.refunds.applyProviderRefund(remote);
    }
  }

  /** Poll the provider for payments stuck in CREATED/AUTHORIZED (missed webhooks, closed app). */
  async reconcilePending(): Promise<number> {
    const rz = this.providers.razorpay;
    if (!rz) return 0;
    const stale = await this.prisma.payment.findMany({
      where: {
        provider: 'RAZORPAY',
        status: { in: ['CREATED', 'AUTHORIZED', 'FAILED'] },
        createdAt: { gt: new Date(Date.now() - 48 * 3600_000), lt: new Date(Date.now() - 60_000) },
      },
      take: 100,
    });
    for (const p of stale) {
      try {
        const remote = await rz.fetchOrderPayments(p.providerOrderId);
        const best = remote.sort((a, b) => RANK[toStatus(b.status)] - RANK[toStatus(a.status)])[0];
        if (best) await this.applyProviderPayment(best, 'reconcile');
        else
          await this.prisma.payment.update({
            where: { id: p.id },
            data: { lastReconciledAt: new Date() },
          });
      } catch (e) {
        this.logger.warn(`Reconcile ${p.id} failed: ${(e as Error).message}`);
      }
    }
    return stale.length;
  }

  async bookingIdForPayment(paymentId: string): Promise<string> {
    const p = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { bookingId: true },
    });
    if (!p) throw AppError.notFound('Payment');
    return p.bookingId;
  }

  async forBooking(user: AuthUser, bookingId: string) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { charger: { select: { hostId: true } } },
    });
    if (!b || (b.driverId !== user.id && b.charger.hostId !== user.hostProfileId && !user.isStaff))
      throw AppError.notFound('Booking');
    const [payments, refunds] = await Promise.all([
      this.prisma.payment.findMany({ where: { bookingId }, orderBy: { createdAt: 'asc' } }),
      this.refunds.forBooking(bookingId),
    ]);
    return {
      payments: payments.map((p) => ({
        id: p.id,
        provider: p.provider,
        isDemo: p.isDemo,
        status: p.status,
        amountMinor: p.amountMinor,
        amountRefundedMinor: p.amountRefundedMinor,
        method: p.method,
        failureReason: p.failureReason,
        capturedAt: p.capturedAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
      })),
      refunds,
    };
  }
}

function toStatus(s: ProviderPayment['status']): PaymentStatus {
  return (
    {
      created: 'CREATED',
      authorized: 'AUTHORIZED',
      captured: 'CAPTURED',
      refunded: 'REFUNDED',
      failed: 'FAILED',
    } as const
  )[s];
}
