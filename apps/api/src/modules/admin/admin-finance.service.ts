import { Inject, Injectable } from '@nestjs/common';
import {
  addMinutes,
  diffMinutes,
  settleKwh,
  type AdminOverviewDto,
  type AuditLogDto,
  type GeoClusterDto,
  type PriceBreakdown,
} from '@nexvolt/shared';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import type { RequestMeta } from '../../common/auth/decorators';
import { AuditService } from '../../common/audit/audit.service';
import { AppError } from '../../common/errors/app-error';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ENV, type Env } from '../../config/env';
import { BookingTransitionsService } from '../booking-core/booking-transitions.service';
import { BOOKING_INCLUDE, BookingMapper } from '../bookings/booking.mapper';
import { BookingsService } from '../bookings/bookings.service';
import { LedgerService } from '../ledger/ledger.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RefundsService, toRefundDto } from '../payments/refunds.service';
import { SettingsService } from '../settings/settings.service';
import { toDisputeDto } from '../support/support.service';

type Page = { q?: string; status?: string; limit: number; offset: number };

const csvCell = (v: unknown) => {
  const s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v);
  // Neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const toCsv = (header: string[], rows: unknown[][]) => [header.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n');

@Injectable()
export class AdminFinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly bookings: BookingsService,
    private readonly bookingMapper: BookingMapper,
    private readonly transitions: BookingTransitionsService,
    private readonly refunds: RefundsService,
    private readonly ledger: LedgerService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
    private readonly idempotency: IdempotencyService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async overview(): Promise<AdminOverviewDto> {
    const since = addMinutes(new Date(), -30 * 1440);
    const [activeHosts, verifiedChargers, pendingChargerReviews, pendingHostReviews, bookingsTotal, bookingsLast30d, cancellations, disputes, finished, openTickets, openIncidents, captured, refunded, commission, demoCount] =
      await Promise.all([
        this.prisma.hostProfile.count({ where: { suspendedAt: null, chargers: { some: { status: 'VERIFIED', isPublished: true } } } }),
        this.prisma.charger.count({ where: { status: 'VERIFIED' } }),
        this.prisma.charger.count({ where: { status: 'PENDING_REVIEW' } }),
        this.prisma.hostProfile.count({ where: { kycStatus: 'PENDING_REVIEW' } }),
        this.prisma.booking.count({ where: { status: { notIn: ['EXPIRED'] } } }),
        this.prisma.booking.count({ where: { createdAt: { gte: since }, status: { notIn: ['EXPIRED'] } } }),
        this.prisma.booking.count({ where: { status: 'CANCELLED' } }),
        this.prisma.dispute.count(),
        this.prisma.booking.count({ where: { status: { in: ['COMPLETED', 'SETTLED', 'DISPUTED'] } } }),
        this.prisma.supportTicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
        this.prisma.incidentReport.count({ where: { status: { not: 'RESOLVED' } } }),
        this.prisma.payment.aggregate({ _sum: { amountMinor: true }, where: { status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED'] } } }),
        this.prisma.refund.aggregate({ _sum: { amountMinor: true }, where: { status: { in: ['PENDING', 'PROCESSED'] } } }),
        // Commission is recognised only once earnings are no longer pending (settled / cancelled with fee).
        this.prisma.hostLedgerEntry.aggregate({ _sum: { amountMinor: true }, where: { type: { in: ['PLATFORM_COMMISSION', 'COMMISSION_REVERSAL'] }, status: { in: ['ELIGIBLE', 'IN_PAYOUT', 'PAID_OUT'] } } }),
        this.prisma.payment.count({ where: { isDemo: true, status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED'] } } }),
      ]);
    return {
      activeHosts,
      verifiedChargers,
      pendingChargerReviews,
      pendingHostReviews,
      bookingsTotal,
      bookingsLast30d,
      gmvMinor: (captured._sum.amountMinor ?? 0) - (refunded._sum.amountMinor ?? 0),
      commissionRecognizedMinor: -(commission._sum.amountMinor ?? 0),
      cancellations,
      disputes,
      disputeRatio: finished ? Math.round((disputes / finished) * 1000) / 1000 : 0,
      openTickets,
      openIncidents,
      demoMode: this.env.LOCAL_DEMO_MODE,
      includesDemoPayments: demoCount > 0,
    };
  }

  // ── Bookings ──
  async listBookings(p: Page, viewer: AuthUser) {
    const where: Prisma.BookingWhereInput = {
      ...(p.status ? { status: p.status as Prisma.BookingWhereInput['status'] } : {}),
      ...(p.q ? { OR: [{ code: { contains: p.q.toUpperCase() } }, { charger: { title: { contains: p.q, mode: 'insensitive' } } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.booking.findMany({ where, include: BOOKING_INCLUDE, orderBy: { createdAt: 'desc' }, take: p.limit, skip: p.offset }),
      this.prisma.booking.count({ where }),
    ]);
    return { items: await Promise.all(rows.map((b) => this.bookingMapper.toDto(b, viewer))), total, limit: p.limit, offset: p.offset };
  }

  async bookingDetail(id: string, viewer: AuthUser) {
    const b = await this.bookings.load(id);
    const [events, payments, refunds, disputes, ledger] = await Promise.all([
      this.bookings.events(viewer, id),
      this.prisma.payment.findMany({ where: { bookingId: id }, include: { events: { orderBy: { receivedAt: 'asc' }, select: { eventType: true, receivedAt: true, processedAt: true, processingError: true } } }, orderBy: { createdAt: 'asc' } }),
      this.refunds.forBooking(id),
      this.prisma.dispute.findMany({ where: { bookingId: id }, include: { booking: { select: { code: true } } } }),
      this.prisma.hostLedgerEntry.findMany({ where: { bookingId: id }, orderBy: { createdAt: 'asc' } }),
    ]);
    return {
      booking: await this.bookingMapper.toDto(b, viewer),
      events,
      payments: payments.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })),
      refunds,
      disputes: disputes.map(toDisputeDto),
      ledger: ledger.map((e) => ({ type: e.type, status: e.status, amountMinor: e.amountMinor, description: e.description, createdAt: e.createdAt.toISOString() })),
    };
  }

  // ── Payments & refunds ──
  async listPayments(p: Page) {
    const where: Prisma.PaymentWhereInput = p.status ? { status: p.status as Prisma.PaymentWhereInput['status'] } : {};
    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({ where, include: { booking: { select: { code: true } } }, orderBy: { createdAt: 'desc' }, take: p.limit, skip: p.offset }),
      this.prisma.payment.count({ where }),
    ]);
    return {
      items: items.map((x) => ({
        id: x.id,
        bookingId: x.bookingId,
        bookingCode: x.booking.code,
        provider: x.provider,
        isDemo: x.isDemo,
        status: x.status,
        amountMinor: x.amountMinor,
        amountRefundedMinor: x.amountRefundedMinor,
        providerFeeMinor: x.providerFeeMinor,
        providerOrderId: x.providerOrderId,
        providerPaymentId: x.providerPaymentId,
        method: x.method,
        failureReason: x.failureReason,
        capturedAt: x.capturedAt?.toISOString() ?? null,
        lastReconciledAt: x.lastReconciledAt?.toISOString() ?? null,
        createdAt: x.createdAt.toISOString(),
      })),
      total,
      limit: p.limit,
      offset: p.offset,
    };
  }

  async listRefunds(p: Page) {
    const where: Prisma.RefundWhereInput = p.status ? { status: p.status as Prisma.RefundWhereInput['status'] } : {};
    const [items, total] = await Promise.all([
      this.prisma.refund.findMany({ where, orderBy: { createdAt: 'desc' }, take: p.limit, skip: p.offset }),
      this.prisma.refund.count({ where }),
    ]);
    return { items: items.map((r) => ({ ...toRefundDto(r), failureReason: r.failureReason })), total, limit: p.limit, offset: p.offset };
  }

  async refund(input: { bookingId: string; amountMinor: number; reason: string }, actor: AuthUser, meta: RequestMeta) {
    return this.idempotency.run('admin.refund', actor.id, meta.idempotencyKey, input, async () => {
      const b = await this.prisma.booking.findUnique({ where: { id: input.bookingId } });
      if (!b) throw AppError.notFound('Booking');
      const pay = await this.prisma.payment.findFirst({ where: { bookingId: b.id, status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED'] } } });
      if (!pay) throw AppError.unprocessable('NO_CAPTURED_PAYMENT', 'This booking has no refundable payment');
      const chargingFeePortion = Math.min(b.chargingFeeMinor, Math.round((b.chargingFeeMinor * input.amountMinor) / pay.amountMinor));
      const r = await this.refunds.issue(pay.id, {
        bookingId: b.id,
        amountMinor: input.amountMinor,
        chargingFeePortionMinor: chargingFeePortion,
        reason: `Admin refund: ${input.reason}`,
        idempotencyKey: `admin:${meta.idempotencyKey}`,
        initiatedById: actor.id,
      });
      await this.audit.log({ actor, action: 'refund.issue', resourceType: 'Booking', resourceId: b.id, reason: input.reason, newValue: { refundId: r.id, amountMinor: input.amountMinor }, meta });
      return r;
    });
  }

  // ── Disputes ──
  async listDisputes(p: Page) {
    const where: Prisma.DisputeWhereInput = p.status ? { status: p.status as Prisma.DisputeWhereInput['status'] } : { status: { in: ['OPEN', 'UNDER_REVIEW'] } };
    const [items, total] = await Promise.all([
      this.prisma.dispute.findMany({ where, include: { booking: { select: { code: true } } }, orderBy: { createdAt: 'asc' }, take: p.limit, skip: p.offset }),
      this.prisma.dispute.count({ where }),
    ]);
    return { items: items.map(toDisputeDto), total, limit: p.limit, offset: p.offset };
  }

  async markDisputeUnderReview(id: string, actor: AuthUser, meta: RequestMeta) {
    const d = await this.prisma.dispute.findUnique({ where: { id } });
    if (!d || d.status !== 'OPEN') throw AppError.conflict('INVALID_STATE', 'Dispute is not open');
    await this.prisma.dispute.update({ where: { id }, data: { status: 'UNDER_REVIEW' } });
    await this.audit.log({ actor, action: 'dispute.review', resourceType: 'Dispute', resourceId: id, oldValue: { status: 'OPEN' }, newValue: { status: 'UNDER_REVIEW' }, meta });
    return { id, status: 'UNDER_REVIEW' };
  }

  /**
   * Resolve a dispute. DRIVER_FAVOUR → booking CANCELLED with full remaining refund.
   * HOST_FAVOUR / SPLIT → booking COMPLETED (optionally reconciling kWh and/or issuing a
   * partial refund); earnings then settle through the normal dispute window.
   */
  async resolveDispute(
    id: string,
    input: { outcome: 'RESOLVED_DRIVER_FAVOUR' | 'RESOLVED_HOST_FAVOUR' | 'RESOLVED_SPLIT'; billableEnergyWh?: number; refundAmountMinor?: number; notes: string },
    actor: AuthUser,
    meta: RequestMeta,
  ) {
    const d = await this.prisma.dispute.findUnique({ where: { id }, include: { booking: true } });
    if (!d) throw AppError.notFound('Dispute');
    if (!['OPEN', 'UNDER_REVIEW'].includes(d.status)) throw AppError.conflict('INVALID_STATE', 'Dispute is already resolved');
    const b = d.booking;
    const s = await this.settings.get();
    const pay = await this.prisma.payment.findFirst({ where: { bookingId: b.id, status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED'] } } });
    const refundable = pay ? pay.amountMinor - pay.amountRefundedMinor : 0;

    let refundMinor = 0;
    let chargingFeePortion = 0;
    let finalCharging = b.finalChargingFeeMinor ?? b.chargingFeeMinor;
    let finalTotal = b.finalTotalMinor ?? b.totalMinor;
    if (input.outcome === 'RESOLVED_DRIVER_FAVOUR') {
      refundMinor = refundable;
      chargingFeePortion = pay ? Math.min(b.chargingFeeMinor, Math.round((b.chargingFeeMinor * refundable) / pay.amountMinor)) : 0;
    } else {
      if (b.pricingUnit === 'PER_KWH' && input.billableEnergyWh != null) {
        const prepaid: PriceBreakdown = {
          pricingUnit: 'PER_KWH', unitPriceMinor: b.unitPriceMinor, durationMinutes: diffMinutes(b.endAt, b.startAt), estimatedEnergyWh: b.estimatedEnergyWh,
          chargingFeeMinor: b.chargingFeeMinor, serviceFeeMinor: b.serviceFeeMinor, serviceFeeTaxMinor: b.serviceFeeTaxMinor, totalMinor: b.totalMinor,
          commissionBps: b.commissionBps, commissionMinor: 0, hostEarningsBeforeGatewayFeesMinor: 0, isEstimate: true, lineItems: [],
        };
        const settled = settleKwh(prepaid, input.billableEnergyWh, { ...s, commissionBps: b.commissionBps });
        finalCharging = settled.finalChargingFeeMinor;
        finalTotal = settled.finalTotalMinor;
        refundMinor = Math.max(0, settled.refundDueMinor - (pay?.amountRefundedMinor ?? 0));
        chargingFeePortion = Math.max(0, b.chargingFeeMinor - finalCharging);
      }
      if (input.refundAmountMinor) {
        refundMinor += input.refundAmountMinor;
        chargingFeePortion += pay ? Math.round((b.chargingFeeMinor * input.refundAmountMinor) / pay.amountMinor) : 0;
      }
      if (input.outcome === 'RESOLVED_HOST_FAVOUR' && refundMinor > 0 && input.billableEnergyWh == null) {
        throw AppError.unprocessable('INCONSISTENT_RESOLUTION', 'Host-favour resolutions should not include a discretionary refund; use a split resolution');
      }
    }
    if (refundMinor > refundable) throw AppError.unprocessable('REFUND_EXCEEDS_BALANCE', `Refundable balance is ₹${(refundable / 100).toFixed(2)}`);
    chargingFeePortion = Math.min(chargingFeePortion, b.chargingFeeMinor);

    await this.prisma.$transaction(async (tx) => {
      const locked = await this.transitions.lock(tx, b.id);
      const target = input.outcome === 'RESOLVED_DRIVER_FAVOUR' ? 'CANCELLED' : 'COMPLETED';
      if (locked.status === 'DISPUTED') {
        await this.transitions.transition(tx, locked, target, { type: 'ADMIN', id: actor.id }, {
          reason: `Dispute resolved: ${input.outcome}`,
          data: target === 'COMPLETED'
            ? { completedAt: locked.completedAt ?? new Date(), finalChargingFeeMinor: finalCharging, finalTotalMinor: finalTotal }
            : { cancelledAt: new Date(), cancelledByType: 'ADMIN', cancelReason: `Dispute resolved in driver's favour: ${input.notes.slice(0, 200)}` },
        });
      }
      if (input.billableEnergyWh != null) {
        // Original readings stay immutable; the reconciled energy is recorded on the session and in the audit log.
        await tx.chargingSession.updateMany({ where: { bookingId: b.id }, data: { meteredEnergyWh: input.billableEnergyWh, status: 'RECONCILED' } });
      }
      await tx.dispute.update({ where: { id }, data: { status: input.outcome, resolutionNotes: input.notes, resolvedById: actor.id, resolvedAt: new Date() } });
      if (input.outcome === 'RESOLVED_DRIVER_FAVOUR') await this.ledger.markBookingEligible(tx, b.id);
      await this.audit.log({ actor, action: 'dispute.resolve', resourceType: 'Dispute', resourceId: id, reason: input.notes, oldValue: { status: d.status, bookingStatus: b.status }, newValue: { status: input.outcome, refundMinor, billableEnergyWh: input.billableEnergyWh }, meta }, tx);
    });
    if (refundMinor > 0) {
      await this.refunds.refundBooking({ bookingId: b.id, amountMinor: refundMinor, chargingFeePortionMinor: chargingFeePortion, reason: `Dispute resolution (${input.outcome})`, idempotencyKey: `dispute:${id}`, initiatedById: actor.id });
    }
    const host = await this.prisma.charger.findUniqueOrThrow({ where: { id: b.chargerId }, include: { host: true } });
    const body = `Dispute on ${b.code} resolved${refundMinor ? `; refund of ₹${(refundMinor / 100).toFixed(2)} initiated` : ''}. ${input.notes.slice(0, 120)}`;
    await this.notifications.notify([
      { userId: b.driverId, type: 'DISPUTE_UPDATE', title: 'Dispute resolved', body, data: { bookingId: b.id } },
      { userId: host.host.userId, type: 'DISPUTE_UPDATE', title: 'Dispute resolved', body, data: { bookingId: b.id } },
    ]);
    return toDisputeDto(await this.prisma.dispute.findUniqueOrThrow({ where: { id }, include: { booking: { select: { code: true } } } }));
  }

  // ── Audit & exports ──
  async auditLogs(q: { resourceType?: string; resourceId?: string; actorId?: string; limit: number }): Promise<AuditLogDto[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: { resourceType: q.resourceType, resourceId: q.resourceId, actorId: q.actorId },
      include: { actor: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: q.limit,
    });
    return rows.map((r) => ({
      id: r.id,
      actorId: r.actorId,
      actorName: r.actor?.name ?? null,
      actorRole: r.actorRole,
      action: r.action,
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      reason: r.reason,
      oldValue: r.oldValue,
      newValue: r.newValue,
      ip: r.ip,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** CSV exports. Contain no phone numbers, addresses or payment instrument data. */
  async export(type: string, actor: AuthUser, meta: RequestMeta): Promise<string> {
    let csv: string;
    if (type === 'bookings') {
      const rows = await this.prisma.booking.findMany({ include: { charger: { select: { title: true, city: true } } }, orderBy: { createdAt: 'desc' }, take: 10_000 });
      csv = toCsv(['code', 'status', 'charger', 'city', 'startAt', 'endAt', 'pricingUnit', 'totalMinor', 'finalTotalMinor', 'commissionBps', 'isSample', 'createdAt'],
        rows.map((b) => [b.code, b.status, b.charger.title, b.charger.city, b.startAt, b.endAt, b.pricingUnit, b.totalMinor, b.finalTotalMinor, b.commissionBps, b.isSample, b.createdAt]));
    } else if (type === 'payments') {
      const rows = await this.prisma.payment.findMany({ include: { booking: { select: { code: true } } }, orderBy: { createdAt: 'desc' }, take: 10_000 });
      csv = toCsv(['bookingCode', 'provider', 'isDemo', 'status', 'amountMinor', 'amountRefundedMinor', 'providerFeeMinor', 'providerOrderId', 'providerPaymentId', 'capturedAt'],
        rows.map((p) => [p.booking.code, p.provider, p.isDemo, p.status, p.amountMinor, p.amountRefundedMinor, p.providerFeeMinor, p.providerOrderId, p.providerPaymentId, p.capturedAt]));
    } else if (type === 'ledger') {
      const rows = await this.prisma.hostLedgerEntry.findMany({ include: { host: { select: { displayName: true } }, booking: { select: { code: true } } }, orderBy: { createdAt: 'desc' }, take: 50_000 });
      csv = toCsv(['host', 'bookingCode', 'type', 'status', 'amountMinor', 'payoutId', 'createdAt', 'eligibleAt'],
        rows.map((e) => [e.host.displayName, e.booking?.code, e.type, e.status, e.amountMinor, e.payoutId, e.createdAt, e.eligibleAt]));
    } else if (type === 'payouts') {
      const rows = await this.prisma.payout.findMany({ include: { host: { select: { displayName: true } } }, orderBy: { createdAt: 'desc' }, take: 10_000 });
      csv = toCsv(['payoutId', 'host', 'status', 'method', 'amountMinor', 'externalReference', 'createdAt', 'confirmedAt'],
        rows.map((p) => [p.id, p.host.displayName, p.status, p.method, p.amountMinor, p.externalReference, p.createdAt, p.confirmedAt]));
    } else {
      throw AppError.notFound('Export type');
    }
    await this.audit.log({ actor, action: 'export.download', resourceType: 'Export', resourceId: type, meta });
    return csv;
  }

  /** City-level clusters from APPROXIMATE public coordinates only — no exact locations. */
  async geo(): Promise<GeoClusterDto[]> {
    const rows = await this.prisma.$queryRaw<Array<{ city: string; state: string; lat: number; lng: number; chargers: bigint; verified: bigint; bookings30d: bigint }>>`
      SELECT c.city, c.state,
        ROUND(AVG(c."publicLat")::numeric, 2)::float AS lat, ROUND(AVG(c."publicLng")::numeric, 2)::float AS lng,
        COUNT(*) AS chargers,
        COUNT(*) FILTER (WHERE c.status = 'VERIFIED') AS verified,
        (SELECT COUNT(*) FROM bookings b JOIN chargers c2 ON c2.id = b."chargerId"
          WHERE c2.city = c.city AND b."createdAt" > now() - interval '30 days' AND b.status <> 'EXPIRED') AS bookings30d
      FROM chargers c GROUP BY c.city, c.state ORDER BY chargers DESC`;
    return rows.map((r) => ({ city: r.city, state: r.state, center: { lat: r.lat, lng: r.lng }, chargers: Number(r.chargers), verified: Number(r.verified), bookings30d: Number(r.bookings30d) }));
  }
}
