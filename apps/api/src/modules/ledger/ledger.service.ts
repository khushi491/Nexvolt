import { Injectable } from '@nestjs/common';
import {
  hostLedgerForCapture,
  hostLedgerForRefund,
  type EarningsSummaryDto,
  type LedgerEntryDto,
  type PayoutDto,
} from '@nexvolt/shared';
import type { Booking, HostLedgerEntry, Payment, Payout, Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import type { RequestMeta } from '../../common/auth/decorators';
import { AuditService } from '../../common/audit/audit.service';
import { AppError, isUniqueViolation } from '../../common/errors/app-error';
import { PrismaService, type Tx } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';

const LABELS: Record<string, string> = {
  BOOKING_GROSS: 'Charging fee',
  PLATFORM_COMMISSION: 'Nexvolt commission',
  PAYMENT_FEE: 'Payment processing fee',
  REFUND_REVERSAL: 'Refund to driver',
  COMMISSION_REVERSAL: 'Commission returned on refund',
  ADJUSTMENT: 'Adjustment',
  PAYOUT: 'Payout',
};

export function toLedgerDto(
  e: HostLedgerEntry & { booking?: { code: string } | null },
): LedgerEntryDto {
  return {
    id: e.id,
    type: e.type,
    status: e.status,
    amountMinor: e.amountMinor,
    description: e.description,
    bookingId: e.bookingId,
    bookingCode: e.booking?.code ?? null,
    payoutId: e.payoutId,
    createdAt: e.createdAt.toISOString(),
    eligibleAt: e.eligibleAt?.toISOString() ?? null,
  };
}

/**
 * Append-only host ledger. Every posting has a deterministic idempotency key so that
 * webhook retries, reordering and job re-runs can never double-post.
 * "Eligible" means owed to the host — NOT transferred. Only a confirmed payout is paid.
 */
@Injectable()
export class LedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private async post(tx: Tx, entry: Prisma.HostLedgerEntryUncheckedCreateInput): Promise<void> {
    if (entry.amountMinor === 0) return;
    const exists = await tx.hostLedgerEntry.findUnique({
      where: { idempotencyKey: entry.idempotencyKey },
    });
    if (exists) return;
    try {
      await tx.hostLedgerEntry.create({ data: entry });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }

  async postCapture(
    tx: Tx,
    booking: Booking & { charger: { hostId: string } },
    payment: Payment,
  ): Promise<void> {
    const s = await this.settings.get();
    const lines = hostLedgerForCapture({
      chargingFeeMinor: booking.chargingFeeMinor,
      commissionBps: booking.commissionBps,
      gatewayFeeMinor: payment.providerFeeMinor ?? 0,
      gatewayFeeBearer: s.gatewayFeeBearer,
      paidTotalMinor: payment.amountMinor,
    });
    for (const l of lines) {
      await this.post(tx, {
        hostId: booking.charger.hostId,
        bookingId: booking.id,
        type: l.type,
        amountMinor: l.amountMinor,
        description: `${LABELS[l.type]} · ${booking.code}`,
        idempotencyKey: `capture:${payment.id}:${l.type}`,
      });
    }
  }

  async postRefund(
    tx: Tx,
    booking: Booking & { charger: { hostId: string } },
    refundId: string,
    chargingFeeRefundMinor: number,
  ): Promise<void> {
    const lines = hostLedgerForRefund({
      chargingFeeMinor: booking.chargingFeeMinor,
      chargingFeeRefundMinor,
      commissionBps: booking.commissionBps,
    });
    const settled = ['SETTLED', 'CANCELLED'].includes(booking.status);
    for (const l of lines) {
      await this.post(tx, {
        hostId: booking.charger.hostId,
        bookingId: booking.id,
        type: l.type,
        amountMinor: l.amountMinor,
        status: settled ? 'ELIGIBLE' : 'PENDING',
        eligibleAt: settled ? new Date() : null,
        description: `${LABELS[l.type]} · ${booking.code}`,
        idempotencyKey: `refund:${refundId}:${l.type}`,
      });
    }
  }

  /** Void reversals for a refund that the provider reported as failed. */
  async voidRefund(tx: Tx, refundId: string): Promise<void> {
    await tx.hostLedgerEntry.updateMany({
      where: {
        idempotencyKey: { startsWith: `refund:${refundId}:` },
        status: { in: ['PENDING', 'ELIGIBLE'] },
      },
      data: { status: 'VOID' },
    });
  }

  async markBookingEligible(tx: Tx, bookingId: string): Promise<number> {
    const r = await tx.hostLedgerEntry.updateMany({
      where: { bookingId, status: 'PENDING' },
      data: { status: 'ELIGIBLE', eligibleAt: new Date() },
    });
    return r.count;
  }

  async adjustment(
    tx: Tx,
    hostId: string,
    bookingId: string | null,
    amountMinor: number,
    description: string,
    key: string,
  ): Promise<void> {
    await this.post(tx, {
      hostId,
      bookingId,
      type: 'ADJUSTMENT',
      amountMinor,
      description,
      idempotencyKey: key,
      status: 'ELIGIBLE',
      eligibleAt: new Date(),
    });
  }

  async summary(hostId: string): Promise<EarningsSummaryDto> {
    const host = await this.prisma.hostProfile.findUniqueOrThrow({ where: { id: hostId } });
    const groups = await this.prisma.hostLedgerEntry.groupBy({
      by: ['type', 'status'],
      where: { hostId, status: { not: 'VOID' } },
      _sum: { amountMinor: true },
    });
    const sum = (pred: (g: (typeof groups)[number]) => boolean) =>
      groups.filter(pred).reduce((a, g) => a + (g._sum.amountMinor ?? 0), 0);
    return {
      grossMinor: sum((g) => g.type === 'BOOKING_GROSS'),
      commissionMinor: sum(
        (g) => g.type === 'PLATFORM_COMMISSION' || g.type === 'COMMISSION_REVERSAL',
      ),
      paymentFeesMinor: sum((g) => g.type === 'PAYMENT_FEE'),
      refundsMinor: sum((g) => g.type === 'REFUND_REVERSAL'),
      adjustmentsMinor: sum((g) => g.type === 'ADJUSTMENT'),
      pendingMinor: sum((g) => g.status === 'PENDING'),
      eligibleMinor: sum((g) => g.status === 'ELIGIBLE'),
      inPayoutMinor: sum((g) => g.status === 'IN_PAYOUT'),
      paidOutMinor: sum((g) => g.status === 'PAID_OUT'),
      payoutAccountStatus: host.payoutAccountStatus,
    };
  }

  async entries(hostId: string, limit = 100): Promise<LedgerEntryDto[]> {
    const rows = await this.prisma.hostLedgerEntry.findMany({
      where: { hostId },
      include: { booking: { select: { code: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500),
    });
    return rows.map(toLedgerDto);
  }

  toPayoutDto(
    p: Payout & { host: { displayName: string }; _count?: { entries: number } },
  ): PayoutDto {
    return {
      id: p.id,
      hostId: p.hostId,
      hostDisplayName: p.host.displayName,
      amountMinor: p.amountMinor,
      status: p.status,
      method: p.method,
      externalReference: p.externalReference,
      failureReason: p.failureReason,
      entryCount: p._count?.entries ?? 0,
      createdAt: p.createdAt.toISOString(),
      confirmedAt: p.confirmedAt?.toISOString() ?? null,
    };
  }

  async payouts(where: Prisma.PayoutWhereInput, limit = 100): Promise<PayoutDto[]> {
    const rows = await this.prisma.payout.findMany({
      where,
      include: { host: { select: { displayName: true } }, _count: { select: { entries: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((p) => this.toPayoutDto(p));
  }

  /** Hosts with a positive eligible balance (admin payout queue). */
  async eligibleBalances() {
    const rows = await this.prisma.hostLedgerEntry.groupBy({
      by: ['hostId'],
      where: { status: 'ELIGIBLE', payoutId: null },
      _sum: { amountMinor: true },
      _count: true,
    });
    const hosts = await this.prisma.hostProfile.findMany({
      where: { id: { in: rows.map((r) => r.hostId) } },
    });
    return rows
      .map((r) => {
        const h = hosts.find((x) => x.id === r.hostId)!;
        return {
          hostId: r.hostId,
          hostDisplayName: h.displayName,
          payoutAccountStatus: h.payoutAccountStatus,
          eligibleMinor: r._sum.amountMinor ?? 0,
          entryCount: r._count,
        };
      })
      .filter((r) => r.eligibleMinor > 0);
  }

  /**
   * Batch a host's eligible entries into a payout awaiting transfer. This does NOT move
   * money: an admin performs the transfer via a supported channel and records its reference.
   */
  async createPayout(
    hostId: string,
    reason: string,
    actor: AuthUser,
    meta: RequestMeta,
  ): Promise<PayoutDto> {
    const host = await this.prisma.hostProfile.findUnique({ where: { id: hostId } });
    if (!host) throw AppError.notFound('Host');
    if (host.payoutAccountStatus !== 'ACTIVE') {
      throw AppError.unprocessable(
        'PAYOUT_ACCOUNT_NOT_ACTIVE',
        'Host payout account is not verified',
      );
    }
    if (host.suspendedAt)
      throw AppError.unprocessable('HOST_SUSPENDED', 'Payouts are on hold for suspended hosts');
    const payout = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM host_profiles WHERE id = ${hostId}::uuid FOR UPDATE`;
      const entries = await tx.hostLedgerEntry.findMany({
        where: { hostId, status: 'ELIGIBLE', payoutId: null },
      });
      const amount = entries.reduce((a, e) => a + e.amountMinor, 0);
      if (amount <= 0)
        throw AppError.unprocessable(
          'NOTHING_TO_PAY',
          'No positive eligible balance for this host',
        );
      const p = await tx.payout.create({
        data: { hostId, amountMinor: amount, createdById: actor.id },
      });
      const upd = await tx.hostLedgerEntry.updateMany({
        where: { id: { in: entries.map((e) => e.id) }, status: 'ELIGIBLE', payoutId: null },
        data: { status: 'IN_PAYOUT', payoutId: p.id },
      });
      if (upd.count !== entries.length)
        throw AppError.conflict('LEDGER_CHANGED', 'Ledger changed during payout creation; retry');
      await this.audit.log(
        {
          actor,
          action: 'payout.create',
          resourceType: 'Payout',
          resourceId: p.id,
          reason,
          newValue: { hostId, amountMinor: amount, entries: entries.length },
          meta,
        },
        tx,
      );
      return p;
    });
    return (await this.payouts({ id: payout.id }))[0]!;
  }

  async markPayoutPaid(
    id: string,
    externalReference: string,
    reason: string,
    actor: AuthUser,
    meta: RequestMeta,
  ): Promise<PayoutDto> {
    const p = await this.prisma.payout.findUnique({ where: { id }, include: { host: true } });
    if (!p) throw AppError.notFound('Payout');
    if (p.status !== 'READY_FOR_PAYOUT' && p.status !== 'PROCESSING')
      throw AppError.conflict('INVALID_STATE', `Payout is ${p.status}`);
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.payout.updateMany({
        where: { id, status: p.status },
        data: {
          status: 'PAID',
          externalReference,
          confirmedById: actor.id,
          confirmedAt: new Date(),
        },
      });
      if (r.count === 0) throw AppError.conflict('PAYOUT_CHANGED', 'Payout changed; refresh');
      await tx.hostLedgerEntry.updateMany({
        where: { payoutId: id },
        data: { status: 'PAID_OUT' },
      });
      await this.audit.log(
        {
          actor,
          action: 'payout.mark_paid',
          resourceType: 'Payout',
          resourceId: id,
          reason,
          oldValue: { status: p.status },
          newValue: { status: 'PAID', externalReference },
          meta,
        },
        tx,
      );
    });
    await this.notifications.notify({
      userId: p.host.userId,
      type: 'PAYOUT_STATUS',
      title: 'Payout sent',
      body: `A payout of ₹${(p.amountMinor / 100).toFixed(2)} was recorded as transferred (ref ${externalReference}). It may take time to reflect in your bank.`,
      data: { payoutId: id },
    });
    return (await this.payouts({ id }))[0]!;
  }

  async markPayoutFailed(
    id: string,
    reason: string,
    actor: AuthUser,
    meta: RequestMeta,
  ): Promise<PayoutDto> {
    const p = await this.prisma.payout.findUnique({ where: { id } });
    if (!p) throw AppError.notFound('Payout');
    if (p.status === 'PAID')
      throw AppError.conflict(
        'INVALID_STATE',
        'Paid payouts cannot be failed; post an adjustment instead',
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.payout.update({ where: { id }, data: { status: 'FAILED', failureReason: reason } });
      // Return entries to the eligible pool.
      await tx.hostLedgerEntry.updateMany({
        where: { payoutId: id },
        data: { status: 'ELIGIBLE', payoutId: null },
      });
      await this.audit.log(
        {
          actor,
          action: 'payout.mark_failed',
          resourceType: 'Payout',
          resourceId: id,
          reason,
          oldValue: { status: p.status },
          newValue: { status: 'FAILED' },
          meta,
        },
        tx,
      );
    });
    return (await this.payouts({ id }))[0]!;
  }
}
