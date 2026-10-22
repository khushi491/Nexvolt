import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  addMinutes,
  CANCELLATION_POLICY_COPY,
  computeCancellationRefund,
  diffMinutes,
  effectivePowerKw,
  formatIst,
  googleMapsDirectionsUrl,
  quotePrice,
  SLOT_REJECTION_MESSAGES,
  validateSlot,
  type BookingAccessDto,
  type BookingDto,
  type BookingEventDto,
  type CancellationPreviewDto,
  type ConnectorType,
  type QuoteBookingInput,
  type QuoteDto,
  type ReceiptDto,
} from '@nexvolt/shared';
import { Prisma, type Booking } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import type { RequestMeta } from '../../common/auth/decorators';
import { AuditService } from '../../common/audit/audit.service';
import { humanCode } from '../../common/crypto/crypto.service';
import { AppError, isOverlapViolation, isUniqueViolation } from '../../common/errors/app-error';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  BookingTransitionsService,
  SYSTEM,
  type Actor,
} from '../booking-core/booking-transitions.service';
import { assertBookable, AvailabilityService } from '../chargers/availability.service';
import { ChargerMapper } from '../chargers/charger.mapper';
import { compatibilityFor } from '../chargers/public-chargers.service';
import { LedgerService } from '../ledger/ledger.service';
import { NotificationsService, type NotifyInput } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { BOOKING_INCLUDE, BookingMapper, primaryPayment, type BookingFull } from './booking.mapper';
import { REFUND_PORT, type RefundPort } from './refund-port';

const MAX_OPEN_HOLDS_PER_DRIVER = 3;
const CHECK_IN_EARLY_MINUTES = 15;

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transitions: BookingTransitionsService,
    private readonly availability: AvailabilityService,
    private readonly settings: SettingsService,
    private readonly mapper: BookingMapper,
    private readonly chargerMapper: ChargerMapper,
    private readonly notifications: NotificationsService,
    private readonly idempotency: IdempotencyService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    @Optional() @Inject(REFUND_PORT) private readonly refunds?: RefundPort,
  ) {}

  // ───────────── Loading & access control ─────────────

  async load(id: string): Promise<BookingFull> {
    const b = await this.prisma.booking.findUnique({ where: { id }, include: BOOKING_INCLUDE });
    if (!b) throw AppError.notFound('Booking');
    return b;
  }

  /** Who is acting on this booking. Throws 404 (not 403) to avoid confirming existence. */
  actorFor(
    user: AuthUser,
    b: Pick<Booking, 'driverId'> & { charger: { hostId: string } },
    allowStaff = true,
  ): Actor {
    if (b.driverId === user.id) return { type: 'DRIVER', id: user.id };
    if (user.hostProfileId && b.charger.hostId === user.hostProfileId)
      return { type: 'HOST', id: user.id };
    if (allowStaff && user.isStaff) return { type: 'ADMIN', id: user.id };
    throw AppError.notFound('Booking');
  }

  async get(user: AuthUser, id: string): Promise<BookingDto> {
    const b = await this.load(id);
    this.actorFor(user, b);
    return this.mapper.toDto(b, user);
  }

  async listForDriver(
    user: AuthUser,
    scope: 'upcoming' | 'past' | 'all',
    limit: number,
  ): Promise<BookingDto[]> {
    const now = new Date();
    const where: Prisma.BookingWhereInput = { driverId: user.id };
    if (scope === 'upcoming')
      Object.assign(where, {
        endAt: { gte: now },
        status: {
          in: [
            'AWAITING_HOST_APPROVAL',
            'HELD',
            'PENDING_PAYMENT',
            'CONFIRMED',
            'CHECKED_IN',
            'CHARGING',
          ],
        },
      });
    if (scope === 'past')
      Object.assign(where, {
        OR: [
          { endAt: { lt: now } },
          {
            status: {
              in: ['COMPLETED', 'SETTLED', 'CANCELLED', 'EXPIRED', 'NO_SHOW', 'FAILED', 'DISPUTED'],
            },
          },
        ],
      });
    const rows = await this.prisma.booking.findMany({
      where,
      include: BOOKING_INCLUDE,
      orderBy: { startAt: scope === 'upcoming' ? 'asc' : 'desc' },
      take: limit,
    });
    return Promise.all(rows.map((b) => this.mapper.toDto(b, user)));
  }

  async listForHost(
    user: AuthUser,
    scope: 'upcoming' | 'past' | 'all',
    limit: number,
    status?: string,
  ): Promise<BookingDto[]> {
    if (!user.hostProfileId) throw AppError.forbidden('Complete host onboarding first');
    const now = new Date();
    const where: Prisma.BookingWhereInput = { charger: { hostId: user.hostProfileId } };
    if (status) where.status = status as Booking['status'];
    if (scope === 'upcoming') where.endAt = { gte: now };
    if (scope === 'past') where.endAt = { lt: now };
    const rows = await this.prisma.booking.findMany({
      where,
      include: BOOKING_INCLUDE,
      orderBy: { startAt: scope === 'past' ? 'desc' : 'asc' },
      take: limit,
    });
    return Promise.all(rows.map((b) => this.mapper.toDto(b, user)));
  }

  // ───────────── Quote & create ─────────────

  private async prepare(user: AuthUser, input: QuoteBookingInput) {
    const charger = await this.prisma.charger.findUnique({
      where: { id: input.chargerId },
      include: { host: true, connectors: true },
    });
    if (!charger) throw AppError.notFound('Charger');
    assertBookable(charger);
    if (charger.host.userId === user.id)
      throw AppError.unprocessable('OWN_CHARGER', 'You cannot book your own charger');
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: input.vehicleId, ownerId: user.id, deletedAt: null },
      include: { connectors: true },
    });
    if (!vehicle) throw AppError.notFound('Vehicle');

    const compatibility = compatibilityFor(vehicle, charger);
    const connector = charger.connectors.find((k) => k.connectorType === input.connectorType);
    const vehicleHas = vehicle.connectors.some((k) => k.connectorType === input.connectorType);
    const effectiveKw =
      connector && vehicleHas
        ? effectivePowerKw(
            {
              connectorType: connector.connectorType as ConnectorType,
              powerKw: Number(connector.powerKw),
            },
            charger.currentType,
            {
              connectors: vehicle.connectors.map((k) => k.connectorType as ConnectorType),
              maxAcKw: Number(vehicle.maxAcKw),
              maxDcKw: vehicle.maxDcKw == null ? null : Number(vehicle.maxDcKw),
            },
          )
        : 0;

    const start = new Date(input.startAt);
    const end = new Date(input.endAt);
    const s = await this.settings.get();
    const ctx = await this.availability.context(charger, start, end);
    const slot = validateSlot({ start, end, now: new Date(), ...ctx });
    const breakdown =
      effectiveKw > 0 && end > start
        ? quotePrice(
            {
              pricingUnit: charger.pricingUnit,
              unitPriceMinor: charger.unitPriceMinor,
              durationMinutes: diffMinutes(end, start),
              effectivePowerKw: effectiveKw,
            },
            s,
          )
        : null;
    return {
      charger,
      vehicle,
      compatibility,
      effectiveKw,
      start,
      end,
      slot,
      breakdown,
      settings: s,
    };
  }

  async quote(user: AuthUser, input: QuoteBookingInput): Promise<QuoteDto> {
    const p = await this.prepare(user, input);
    const incompatible = p.effectiveKw <= 0;
    const rejection = incompatible
      ? 'INCOMPATIBLE_CONNECTOR'
      : p.slot.ok
        ? undefined
        : p.slot.reason;
    return {
      valid: !rejection,
      rejection,
      rejectionMessage: incompatible
        ? 'Your vehicle cannot charge from this connector.'
        : !p.slot.ok
          ? SLOT_REJECTION_MESSAGES[p.slot.reason]
          : undefined,
      compatibility: p.compatibility,
      pricing: p.breakdown
        ? {
            pricingUnit: p.breakdown.pricingUnit,
            unitPriceMinor: p.breakdown.unitPriceMinor,
            durationMinutes: p.breakdown.durationMinutes,
            estimatedEnergyWh: p.breakdown.estimatedEnergyWh,
            chargingFeeMinor: p.breakdown.chargingFeeMinor,
            serviceFeeMinor: p.breakdown.serviceFeeMinor,
            serviceFeeTaxMinor: p.breakdown.serviceFeeTaxMinor,
            totalMinor: p.breakdown.totalMinor,
            isEstimate: p.breakdown.isEstimate,
            lineItems: p.breakdown.lineItems,
            currency: 'INR',
          }
        : null,
      cancellationPolicy: p.charger.cancellationPolicy,
      cancellationPolicyText: CANCELLATION_POLICY_COPY[p.charger.cancellationPolicy],
      approvalMode: p.charger.approvalMode,
    };
  }

  /**
   * Create a booking hold. Guarantees against double booking come from the database
   * exclusion constraint; the in-transaction availability check only produces friendly errors.
   */
  async create(
    user: AuthUser,
    input: QuoteBookingInput & { acceptPolicies: true },
    idemKey: string | null,
  ): Promise<BookingDto> {
    return this.idempotency.run('booking.create', user.id, idemKey, input, async () => {
      const p = await this.prepare(user, input);
      if (p.effectiveKw <= 0)
        throw AppError.unprocessable(
          'INCOMPATIBLE_CONNECTOR',
          'Your vehicle cannot charge from this connector',
        );
      if (!p.slot.ok) {
        const code = p.slot.reason === 'OVERLAPS_EXISTING' ? 'SLOT_UNAVAILABLE' : p.slot.reason;
        throw p.slot.reason === 'OVERLAPS_EXISTING'
          ? AppError.conflict(code, SLOT_REJECTION_MESSAGES[p.slot.reason])
          : AppError.unprocessable(code, SLOT_REJECTION_MESSAGES[p.slot.reason]);
      }
      const q = p.breakdown!;
      const openHolds = await this.prisma.booking.count({
        where: {
          driverId: user.id,
          status: { in: ['AWAITING_HOST_APPROVAL', 'HELD', 'PENDING_PAYMENT'] },
          holdExpiresAt: { gt: new Date() },
        },
      });
      if (openHolds >= MAX_OPEN_HOLDS_PER_DRIVER) {
        throw AppError.unprocessable(
          'TOO_MANY_HOLDS',
          'You have too many unpaid holds. Complete or cancel one first.',
        );
      }
      const manual = p.charger.approvalMode === 'MANUAL';
      const now = new Date();
      const holdExpiresAt = manual
        ? new Date(
            Math.min(
              addMinutes(now, p.settings.hostApprovalWindowMinutes).getTime(),
              p.start.getTime(),
            ),
          )
        : addMinutes(now, p.settings.holdMinutes);

      let created: Booking;
      try {
        created = await this.prisma.$transaction(async (tx) => {
          // Serialise capacity changes per charger. Concurrent overlapping inserts under the GiST
          // exclusion constraint can otherwise deadlock (40P01) and all fail; this lock makes
          // contenders queue so exactly one wins. Other chargers are unaffected.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${p.charger.id}, 0))`;
          await this.transitions.expireStaleHolds(tx, p.charger.id);
          const ctx = await this.availability.context(p.charger, p.start, p.end, { tx });
          if (!validateSlot({ start: p.start, end: p.end, now, ...ctx }).ok) {
            throw AppError.conflict('SLOT_UNAVAILABLE', SLOT_REJECTION_MESSAGES.OVERLAPS_EXISTING);
          }
          const status = manual ? 'AWAITING_HOST_APPROVAL' : 'HELD';
          const b = await tx.booking.create({
            data: {
              code: humanCode('NV'),
              driverId: user.id,
              chargerId: p.charger.id,
              vehicleId: p.vehicle.id,
              connectorType: input.connectorType,
              status,
              startAt: p.start,
              endAt: p.end,
              blockedUntil: addMinutes(p.end, p.charger.bufferMinutes),
              holdExpiresAt,
              approvalMode: p.charger.approvalMode,
              cancellationPolicy: p.charger.cancellationPolicy,
              policyAcceptedAt: now,
              pricingUnit: q.pricingUnit,
              unitPriceMinor: q.unitPriceMinor,
              effectivePowerKw: new Prisma.Decimal(p.effectiveKw),
              estimatedEnergyWh: q.estimatedEnergyWh,
              chargingFeeMinor: q.chargingFeeMinor,
              serviceFeeMinor: q.serviceFeeMinor,
              serviceFeeTaxMinor: q.serviceFeeTaxMinor,
              totalMinor: q.totalMinor,
              commissionBps: q.commissionBps,
              idempotencyKey: idemKey!,
              isSample: p.charger.isSample,
            },
          });
          await tx.bookingStatusEvent.create({
            data: {
              bookingId: b.id,
              fromStatus: null,
              toStatus: status,
              actorType: 'DRIVER',
              actorId: user.id,
            },
          });
          await tx.bookingHold.create({
            data: {
              bookingId: b.id,
              kind: manual ? 'HOST_APPROVAL' : 'CHECKOUT',
              expiresAt: holdExpiresAt,
            },
          });
          return b;
        });
      } catch (e) {
        if (isOverlapViolation(e))
          throw AppError.conflict('SLOT_UNAVAILABLE', SLOT_REJECTION_MESSAGES.OVERLAPS_EXISTING);
        if (isUniqueViolation(e, 'idempotencyKey')) {
          const existing = await this.prisma.booking.findUnique({
            where: { driverId_idempotencyKey: { driverId: user.id, idempotencyKey: idemKey! } },
          });
          if (existing) return this.get(user, existing.id);
        }
        throw e;
      }
      if (manual) {
        await this.notifications.notify({
          userId: p.charger.host.userId,
          type: 'BOOKING_REQUESTED',
          title: 'New booking request',
          body: `${p.charger.title}: ${formatIst(p.start)}. Respond before ${formatIst(holdExpiresAt)}.`,
          data: { bookingId: created.id },
        });
      }
      return this.get(user, created.id);
    });
  }

  // ───────────── Host decisions ─────────────

  async approve(user: AuthUser, id: string): Promise<BookingDto> {
    const s = await this.settings.get();
    const b = await this.prisma.$transaction(async (tx) => {
      const locked = await this.transitions.lock(tx, id);
      const full = await tx.booking.findUniqueOrThrow({
        where: { id },
        include: { charger: true },
      });
      const actor = this.actorFor(user, full, false);
      if (actor.type !== 'HOST') throw AppError.forbidden('Only the host can approve');
      if (locked.holdExpiresAt && locked.holdExpiresAt < new Date())
        throw AppError.conflict('REQUEST_EXPIRED', 'This request has expired');
      const expiresAt = new Date(
        Math.min(
          addMinutes(new Date(), s.paymentWindowMinutes).getTime(),
          locked.startAt.getTime(),
        ),
      );
      return this.transitions.transition(tx, locked, 'HELD', actor, {
        hold: { kind: 'CHECKOUT', expiresAt },
      });
    });
    await this.notifications.notify({
      userId: b.driverId,
      type: 'BOOKING_APPROVED',
      title: 'Booking approved — complete payment',
      body: `Pay before ${formatIst(b.holdExpiresAt!)} to confirm ${b.code}.`,
      data: { bookingId: b.id },
    });
    return this.get(user, id);
  }

  async decline(user: AuthUser, id: string, reason: string): Promise<BookingDto> {
    const b = await this.prisma.$transaction(async (tx) => {
      const locked = await this.transitions.lock(tx, id);
      const full = await tx.booking.findUniqueOrThrow({
        where: { id },
        include: { charger: true },
      });
      const actor = this.actorFor(user, full, false);
      if (actor.type !== 'HOST' || locked.status !== 'AWAITING_HOST_APPROVAL')
        throw AppError.conflict('INVALID_STATE', 'Only pending requests can be declined');
      return this.transitions.transition(tx, locked, 'CANCELLED', actor, {
        reason,
        data: {
          cancelledAt: new Date(),
          cancelledByType: 'HOST',
          cancelReason: `Declined by host: ${reason}`,
        },
      });
    });
    await this.notifications.notify({
      userId: b.driverId,
      type: 'BOOKING_DECLINED',
      title: 'Booking request declined',
      body: `The host could not accept ${b.code}. You have not been charged.`,
      data: { bookingId: b.id },
    });
    return this.get(user, id);
  }

  // ───────────── Cancellation ─────────────

  private async refundPlan(b: BookingFull, actor: Actor): Promise<CancellationPreviewDto> {
    const s = await this.settings.get();
    const pay = primaryPayment(b.payments);
    const paid =
      pay && ['CAPTURED', 'PARTIALLY_REFUNDED'].includes(pay.status)
        ? pay.amountMinor - pay.amountRefundedMinor
        : 0;
    if (paid <= 0)
      return {
        refundMinor: 0,
        retainedMinor: 0,
        refundBps: 0,
        reason: 'No payment has been captured',
      };
    const r = computeCancellationRefund({
      paidTotalMinor: paid,
      chargingFeeMinor: b.chargingFeeMinor,
      policy: b.cancellationPolicy,
      tiers: s.cancellationTiers,
      minutesBeforeStart: diffMinutes(b.startAt, new Date()),
      cancelledBy:
        actor.type === 'DRIVER' ? 'DRIVER' : actor.type === 'HOST' ? 'HOST' : 'ADMIN_FULL_REFUND',
    });
    return {
      refundMinor: r.refundMinor,
      retainedMinor: r.retainedMinor,
      refundBps: r.refundBps,
      reason: r.reason,
    };
  }

  async cancellationPreview(user: AuthUser, id: string): Promise<CancellationPreviewDto> {
    const b = await this.load(id);
    return this.refundPlan(b, this.actorFor(user, b));
  }

  async cancel(
    user: AuthUser,
    id: string,
    reason: string,
    meta?: RequestMeta,
  ): Promise<BookingDto> {
    const before = await this.load(id);
    // Only full admins may cancel on the platform's behalf (it always refunds in full).
    const actor = this.actorFor(user, before, user.isAdmin);
    if (
      actor.type === 'DRIVER' &&
      !['AWAITING_HOST_APPROVAL', 'HELD', 'PENDING_PAYMENT', 'CONFIRMED'].includes(before.status)
    ) {
      throw AppError.conflict(
        'NOT_CANCELLABLE',
        'This booking can no longer be cancelled. Contact support if something went wrong.',
      );
    }
    const plan = await this.refundPlan(before, actor);
    const chargingFeePortion = Math.min(
      before.chargingFeeMinor,
      Math.round((before.chargingFeeMinor * plan.refundBps) / 10_000),
    );
    const b = await this.prisma.$transaction(async (tx) => {
      const locked = await this.transitions.lock(tx, id);
      const cancelled = await this.transitions.transition(tx, locked, 'CANCELLED', actor, {
        reason,
        metadata: { refundMinor: plan.refundMinor, policy: before.cancellationPolicy },
        data: { cancelledAt: new Date(), cancelledByType: actor.type, cancelReason: reason },
      });
      if (actor.type === 'ADMIN') {
        await this.audit.log(
          {
            actor: user,
            action: 'booking.cancel',
            resourceType: 'Booking',
            resourceId: id,
            reason,
            oldValue: { status: before.status },
            newValue: { status: 'CANCELLED', refundMinor: plan.refundMinor },
            meta,
          },
          tx,
        );
      }
      // Any retained cancellation fee is earned by the host now (net of commission).
      await this.ledger.markBookingEligible(tx, id);
      return cancelled;
    });
    if (plan.refundMinor > 0) {
      if (!this.refunds)
        throw AppError.unavailable('REFUNDS_UNAVAILABLE', 'Refund service unavailable');
      await this.refunds.refundBooking({
        bookingId: id,
        amountMinor: plan.refundMinor,
        chargingFeePortionMinor: chargingFeePortion,
        reason: `Cancellation: ${plan.reason}`,
        idempotencyKey: `cancel:${id}`,
        initiatedById: user.id,
      });
    }
    const other: NotifyInput[] = [];
    const hostUserId = (
      await this.prisma.hostProfile.findUniqueOrThrow({ where: { id: before.charger.hostId } })
    ).userId;
    const body = `${b.code} on ${formatIst(b.startAt)} was cancelled.${plan.refundMinor ? ` Refund of ₹${(plan.refundMinor / 100).toFixed(2)} initiated.` : ''}`;
    if (actor.type !== 'DRIVER')
      other.push({
        userId: b.driverId,
        type: 'BOOKING_CANCELLED',
        title: 'Booking cancelled',
        body,
        data: { bookingId: id },
      });
    if (actor.type !== 'HOST')
      other.push({
        userId: hostUserId,
        type: 'BOOKING_CANCELLED',
        title: 'Booking cancelled',
        body: `${b.code} on ${formatIst(b.startAt)} was cancelled.`,
        data: { bookingId: id },
      });
    await this.notifications.notify(other);
    return this.get(user, id);
  }

  // ───────────── Arrival ─────────────

  async checkIn(user: AuthUser, id: string): Promise<BookingDto> {
    const before = await this.load(id);
    const actor = this.actorFor(user, before, false);
    const now = new Date();
    if (now < addMinutes(before.startAt, -CHECK_IN_EARLY_MINUTES)) {
      throw AppError.unprocessable(
        'TOO_EARLY',
        `Check-in opens ${CHECK_IN_EARLY_MINUTES} minutes before your slot`,
      );
    }
    if (now > before.endAt)
      throw AppError.unprocessable('SLOT_ENDED', 'This booking’s slot has ended');
    await this.prisma.$transaction(async (tx) => {
      const locked = await this.transitions.lock(tx, id);
      await this.transitions.transition(tx, locked, 'CHECKED_IN', actor, {
        data: { checkedInAt: now },
      });
      await tx.chargingSession.create({
        data: { bookingId: id, mode: 'MANUAL_METER', status: 'NOT_STARTED' },
      });
    });
    const hostUserId = (
      await this.prisma.hostProfile.findUniqueOrThrow({ where: { id: before.charger.hostId } })
    ).userId;
    await this.notifications.notify(
      actor.type === 'DRIVER'
        ? {
            userId: hostUserId,
            type: 'DRIVER_ARRIVED',
            title: 'Driver has arrived',
            body: `${before.code}: the driver checked in. Confirm the start meter reading together.`,
            data: { bookingId: id },
          }
        : {
            userId: before.driverId,
            type: 'DRIVER_ARRIVED',
            title: 'Host checked you in',
            body: `${before.code}: record the start meter reading to begin.`,
            data: { bookingId: id },
          },
    );
    return this.get(user, id);
  }

  async markNoShow(user: AuthUser, id: string): Promise<BookingDto> {
    const s = await this.settings.get();
    const before = await this.load(id);
    const actor = this.actorFor(user, before, false);
    if (actor.type !== 'HOST') throw AppError.forbidden('Only the host can mark a no-show');
    if (new Date() < addMinutes(before.startAt, s.noShowGraceMinutes)) {
      throw AppError.unprocessable(
        'GRACE_PERIOD',
        `You can mark a no-show ${s.noShowGraceMinutes} minutes after the start time`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const locked = await this.transitions.lock(tx, id);
      await this.transitions.transition(tx, locked, 'NO_SHOW', actor, {
        reason: 'Driver did not arrive',
      });
    });
    await this.notifications.notify({
      userId: before.driverId,
      type: 'BOOKING_CANCELLED',
      title: 'Marked as no-show',
      body: `${before.code} was marked as a no-show by the host. If this is wrong, raise a dispute.`,
      data: { bookingId: id },
    });
    return this.get(user, id);
  }

  // ───────────── Private access details ─────────────

  async access(user: AuthUser, id: string, meta: RequestMeta): Promise<BookingAccessDto> {
    const s = await this.settings.get();
    const b = await this.load(id);
    const actor = this.actorFor(user, b);
    if (actor.type === 'DRIVER') {
      if (!['CONFIRMED', 'CHECKED_IN', 'CHARGING'].includes(b.status)) {
        throw AppError.forbidden('The exact address is only shared for confirmed bookings');
      }
      const now = new Date();
      if (now < addMinutes(b.startAt, -s.accessRevealMinutesBefore)) {
        throw AppError.forbidden(
          `The exact address will be available from ${formatIst(addMinutes(b.startAt, -s.accessRevealMinutesBefore))}`,
        );
      }
    }
    if (!b.accessRevealedAt && actor.type === 'DRIVER') {
      await this.prisma.booking.update({ where: { id }, data: { accessRevealedAt: new Date() } });
    }
    await this.audit.log({
      actor: user,
      action: 'booking.access.reveal',
      resourceType: 'Booking',
      resourceId: id,
      meta,
    });
    const charger = await this.prisma.charger.findUniqueOrThrow({ where: { id: b.chargerId } });
    const location = await this.chargerMapper.exactLocation(charger.id);
    return {
      bookingId: id,
      address: this.chargerMapper.privateAddress(charger),
      location,
      accessInstructions: this.chargerMapper.accessInstructions(charger),
      parkingNotes: charger.parkingNotes,
      navigationUrl: googleMapsDirectionsUrl(location),
    };
  }

  async events(user: AuthUser, id: string): Promise<BookingEventDto[]> {
    const b = await this.load(id);
    this.actorFor(user, b);
    const rows = await this.prisma.bookingStatusEvent.findMany({
      where: { bookingId: id },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((e) => ({
      id: e.id,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      actorType: e.actorType,
      reason: e.reason,
      createdAt: e.createdAt.toISOString(),
    }));
  }

  async receipt(user: AuthUser, id: string): Promise<ReceiptDto> {
    const b = await this.load(id);
    this.actorFor(user, b);
    const pay = primaryPayment(b.payments);
    if (!pay || !['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(pay.status)) {
      throw AppError.unprocessable(
        'NO_RECEIPT',
        'A receipt is available once payment is confirmed',
      );
    }
    const host = await this.prisma.hostProfile.findUniqueOrThrow({
      where: { id: b.charger.hostId },
    });
    const dto = await this.mapper.toDto(b, user);
    const notes = [
      'This is a payment receipt, not a GST tax invoice. Tax invoicing is pending professional review.',
      b.pricingUnit === 'PER_HOUR'
        ? 'Billed for the reserved time slot, not for energy delivered.'
        : 'Billed for verified metered energy; any unused prepayment is refunded.',
    ];
    if (pay.isDemo) notes.unshift('DEMO PAYMENT — no real money was charged.');
    if (b.isSample) notes.unshift('Sample booking on a fictional demo listing.');
    return {
      receiptNumber: `RCPT-${b.code.slice(3)}`,
      bookingCode: b.code,
      issuedAt: (pay.capturedAt ?? pay.createdAt).toISOString(),
      status: b.status,
      isDemoPayment: pay.isDemo,
      chargerTitle: b.charger.title,
      locality: b.charger.locality,
      city: b.charger.city,
      hostDisplayName: host.displayName,
      startAt: b.startAt.toISOString(),
      endAt: b.endAt.toISOString(),
      actualDurationMinutes: b.session?.durationMinutes ?? null,
      pricingUnit: b.pricingUnit,
      unitPriceMinor: b.unitPriceMinor,
      estimatedEnergyWh: b.estimatedEnergyWh,
      meteredEnergyWh: b.session?.meteredEnergyWh ?? null,
      lineItems: dto.pricing.lineItems,
      paidMinor: pay.amountMinor,
      refundedMinor: pay.amountRefundedMinor,
      netPaidMinor: pay.amountMinor - pay.amountRefundedMinor,
      paymentMethod: pay.method,
      providerPaymentId: pay.providerPaymentId,
      notes,
    };
  }

  // ───────────── Maintenance (used by jobs) ─────────────

  async expireHolds(): Promise<number> {
    const rows = await this.prisma.$transaction((tx) => this.transitions.expireStaleHolds(tx));
    await this.notifications.notify(
      rows.map((r) => ({
        userId: r.driverId,
        type: 'BOOKING_EXPIRED' as const,
        title: 'Booking hold expired',
        body:
          r.fromStatus === 'AWAITING_HOST_APPROVAL'
            ? 'The host did not respond in time. You were not charged.'
            : 'Your slot hold expired before payment. You were not charged.',
        data: { bookingId: r.id },
      })),
    );
    return rows.length;
  }

  /** COMPLETED bookings past the dispute window → SETTLED, earnings payout-eligible. */
  async settleDue(): Promise<number> {
    const s = await this.settings.get();
    const cutoff = addMinutes(new Date(), -s.disputeWindowHours * 60);
    const due = await this.prisma.booking.findMany({
      where: {
        OR: [
          { status: 'COMPLETED', completedAt: { lt: cutoff } },
          { status: 'NO_SHOW', startAt: { lt: cutoff } },
        ],
        disputes: { none: { status: { in: ['OPEN', 'UNDER_REVIEW'] } } },
      },
      select: { id: true },
      take: 200,
    });
    let n = 0;
    for (const { id } of due) {
      await this.prisma.$transaction(async (tx) => {
        const b = await this.transitions.lock(tx, id);
        if (b.status === 'COMPLETED')
          await this.transitions.transition(tx, b, 'SETTLED', SYSTEM, {
            data: { settledAt: new Date() },
          });
        await this.ledger.markBookingEligible(tx, id);
      });
      n++;
    }
    return n;
  }

  async sendReminders(): Promise<number> {
    const now = new Date();
    const rows = await this.prisma.booking.findMany({
      where: {
        status: 'CONFIRMED',
        reminderSentAt: null,
        startAt: { gt: now, lte: addMinutes(now, 60) },
      },
      take: 200,
    });
    for (const b of rows) {
      const r = await this.prisma.booking.updateMany({
        where: { id: b.id, reminderSentAt: null },
        data: { reminderSentAt: now },
      });
      if (r.count) {
        await this.notifications.notify({
          userId: b.driverId,
          type: 'BOOKING_REMINDER',
          title: 'Your charging slot starts soon',
          body: `${b.code} starts at ${formatIst(b.startAt)}. The exact address is in your booking.`,
          data: { bookingId: b.id },
        });
      }
    }
    return rows.length;
  }
}
