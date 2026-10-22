import { Injectable } from '@nestjs/common';
import {
  assessReadings,
  diffMinutes,
  kwhStringToWh,
  MAX_PHOTO_BYTES,
  settleKwh,
  type MeterAssessment,
  type MeterPhase,
  type PriceBreakdown,
  type SessionDto,
} from '@nexvolt/shared';
import { Prisma, type Booking, type ChargingSession } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { AppError, isUniqueViolation } from '../../common/errors/app-error';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { PrismaService, type Tx } from '../../common/prisma/prisma.service';
import {
  BookingTransitionsService,
  SYSTEM,
  type Actor,
} from '../booking-core/booking-transitions.service';
import { toSessionDto } from '../bookings/booking.mapper';
import { BookingsService } from '../bookings/bookings.service';
import { NotificationsService, type NotifyInput } from '../notifications/notifications.service';
import { RefundsService } from '../payments/refunds.service';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../storage/storage.service';
import { adapterFor } from './adapters/charger-adapter';

type ConfirmInput = { readingKwh?: string; evidenceId?: string; note?: string };

const SESSION_INCLUDE = {
  readings: { include: { evidence: true }, orderBy: { recordedAt: 'asc' as const } },
};

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly transitions: BookingTransitionsService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly refunds: RefundsService,
    private readonly storage: StorageService,
    private readonly idempotency: IdempotencyService,
  ) {}

  private async context(user: AuthUser, bookingId: string, allowStaff = false) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { charger: { include: { host: true } } },
    });
    if (!booking) throw AppError.notFound('Booking');
    const actor = this.bookings.actorFor(user, booking, allowStaff);
    return {
      booking,
      actor,
      counterpartyUserId: actor.type === 'DRIVER' ? booking.charger.host.userId : booking.driverId,
    };
  }

  async get(
    user: AuthUser,
    bookingId: string,
  ): Promise<SessionDto & { controlCapability: 'NONE'; notice: string }> {
    const { booking } = await this.context(user, bookingId, true);
    const s = await this.prisma.chargingSession.findUnique({
      where: { bookingId },
      include: SESSION_INCLUDE,
    });
    if (!s) throw AppError.notFound('Session (check in first)');
    const adapter = adapterFor(booking.charger);
    return {
      ...toSessionDto(s, booking),
      controlCapability: 'NONE',
      notice: adapter.supportsRemoteControl
        ? ''
        : 'Nexvolt cannot start, stop or monitor this charger remotely. Plug in and operate the charger as instructed by the host, then record meter readings. Energy shown before confirmation is an estimate.',
    };
  }

  // ── Evidence photos ──
  async createEvidenceUpload(
    user: AuthUser,
    bookingId: string,
    input: { mimeType: string; sizeBytes: number },
  ) {
    const { booking } = await this.context(user, bookingId);
    if (!['CHECKED_IN', 'CHARGING', 'DISPUTED'].includes(booking.status))
      throw AppError.conflict('INVALID_STATE', 'Evidence can be added during a session');
    const count = await this.prisma.meterEvidence.count({
      where: { bookingId, uploaderId: user.id },
    });
    if (count >= 6)
      throw AppError.unprocessable('EVIDENCE_LIMIT', 'Up to 6 evidence photos per person');
    const key = this.storage.newKey(`evidence/${bookingId}`, input.mimeType);
    const upload = await this.storage.presignUpload(key, input.mimeType, input.sizeBytes);
    const ev = await this.prisma.meterEvidence.create({
      data: {
        bookingId,
        uploaderId: user.id,
        storageKey: key,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
      },
    });
    return { evidenceId: ev.id, upload: { ...upload, key: undefined } };
  }

  async completeEvidenceUpload(user: AuthUser, bookingId: string, evidenceId: string) {
    await this.context(user, bookingId);
    const ev = await this.prisma.meterEvidence.findFirst({
      where: { id: evidenceId, bookingId, uploaderId: user.id },
    });
    if (!ev) throw AppError.notFound('Evidence');
    const check = await this.storage.verifyUpload(ev.storageKey, ev.mimeType, MAX_PHOTO_BYTES);
    await this.prisma.meterEvidence.update({
      where: { id: ev.id },
      data: { status: check.ok ? 'UPLOADED' : 'REJECTED', sizeBytes: check.sizeBytes },
    });
    if (!check.ok)
      throw AppError.unprocessable('UPLOAD_REJECTED', check.reason ?? 'Upload rejected');
    return { evidenceId: ev.id, status: 'UPLOADED' };
  }

  async evidenceUrl(user: AuthUser, bookingId: string, evidenceId: string) {
    await this.context(user, bookingId, true);
    const ev = await this.prisma.meterEvidence.findFirst({
      where: { id: evidenceId, bookingId, status: 'UPLOADED' },
    });
    if (!ev) throw AppError.notFound('Evidence');
    return { url: await this.storage.presignDownload(ev.storageKey) };
  }

  // ── Readings ──
  private async recordReading(
    tx: Tx,
    session: ChargingSession,
    booking: Booking,
    actor: Actor,
    user: AuthUser,
    phase: MeterPhase,
    input: ConfirmInput,
  ) {
    if (booking.pricingUnit === 'PER_KWH' && !input.readingKwh) {
      throw AppError.unprocessable(
        'READING_REQUIRED',
        'A meter reading is required for per-kWh bookings',
      );
    }
    if (!input.readingKwh) return;
    const startOwn =
      phase === 'END'
        ? await tx.meterReading.findUnique({
            where: {
              sessionId_phase_recordedByRole: {
                sessionId: session.id,
                phase: 'START',
                recordedByRole: actor.type,
              },
            },
          })
        : null;
    if (
      startOwn &&
      kwhStringToWh(input.readingKwh) < kwhStringToWh(startOwn.readingKwh.toFixed(3))
    ) {
      throw AppError.unprocessable(
        'READING_BELOW_START',
        'End reading cannot be lower than your start reading',
      );
    }
    try {
      const r = await tx.meterReading.create({
        data: {
          sessionId: session.id,
          phase,
          readingKwh: new Prisma.Decimal(input.readingKwh),
          recordedById: user.id,
          recordedByRole: actor.type,
          note: input.note ?? null,
        },
      });
      if (input.evidenceId) {
        const linked = await tx.meterEvidence.updateMany({
          where: {
            id: input.evidenceId,
            bookingId: booking.id,
            uploaderId: user.id,
            status: 'UPLOADED',
            readingId: null,
          },
          data: { readingId: r.id },
        });
        if (!linked.count)
          throw AppError.unprocessable(
            'EVIDENCE_INVALID',
            'Evidence photo not found or not uploaded',
          );
      }
    } catch (e) {
      if (isUniqueViolation(e))
        throw AppError.conflict(
          'READING_ALREADY_RECORDED',
          `You already recorded the ${phase.toLowerCase()} reading. Corrections go through support.`,
        );
      throw e;
    }
  }

  async confirmStart(user: AuthUser, bookingId: string, input: ConfirmInput) {
    const { actor, counterpartyUserId } = await this.context(user, bookingId);
    await this.prisma.$transaction(async (tx) => {
      let booking = await this.transitions.lock(tx, bookingId);
      if (!['CHECKED_IN', 'CHARGING'].includes(booking.status))
        throw AppError.conflict('INVALID_STATE', 'Check in before starting the session');
      const session = await tx.chargingSession.findUniqueOrThrow({ where: { bookingId } });
      const field = actor.type === 'DRIVER' ? 'driverStartConfirmedAt' : 'hostStartConfirmedAt';
      if (session[field])
        throw AppError.conflict('ALREADY_CONFIRMED', 'You already confirmed the start');
      await this.recordReading(tx, session, booking, actor, user, 'START', input);
      const now = new Date();
      await tx.chargingSession.update({
        where: { id: session.id },
        data: {
          [field]: now,
          ...(session.startedAt ? {} : { startedAt: now, status: 'IN_PROGRESS' }),
        },
      });
      if (booking.status === 'CHECKED_IN')
        booking = await this.transitions.transition(tx, booking, 'CHARGING', actor, {
          reason: 'Session start confirmed',
        });
    });
    await this.notifications.notify({
      userId: counterpartyUserId,
      type: 'CHARGING_CONFIRMATION_NEEDED',
      title: 'Confirm session start',
      body: 'The other party recorded the session start. Please confirm the start meter reading.',
      data: { bookingId },
    });
    return this.get(user, bookingId);
  }

  async confirmEnd(user: AuthUser, bookingId: string, input: ConfirmInput) {
    const { actor, counterpartyUserId } = await this.context(user, bookingId);
    const bothConfirmed = await this.prisma.$transaction(async (tx) => {
      const booking = await this.transitions.lock(tx, bookingId);
      if (booking.status !== 'CHARGING')
        throw AppError.conflict('INVALID_STATE', 'The session has not started');
      const session = await tx.chargingSession.findUniqueOrThrow({ where: { bookingId } });
      const own = actor.type === 'DRIVER' ? 'driverEndConfirmedAt' : 'hostEndConfirmedAt';
      const ownStart = actor.type === 'DRIVER' ? 'driverStartConfirmedAt' : 'hostStartConfirmedAt';
      if (!session[ownStart])
        throw AppError.conflict('START_NOT_CONFIRMED', 'Confirm the session start first');
      if (session[own])
        throw AppError.conflict('ALREADY_CONFIRMED', 'You already confirmed the end');
      await this.recordReading(tx, session, booking, actor, user, 'END', input);
      const now = new Date();
      const updated = await tx.chargingSession.update({
        where: { id: session.id },
        data: {
          [own]: now,
          ...(session.endedAt ? {} : { endedAt: now, status: 'AWAITING_CONFIRMATION' }),
        },
      });
      return !!(updated.driverEndConfirmedAt && updated.hostEndConfirmedAt);
    });
    if (bothConfirmed) return this.complete(user, bookingId, `auto:${bookingId}`);
    await this.notifications.notify({
      userId: counterpartyUserId,
      type: 'CHARGING_CONFIRMATION_NEEDED',
      title: 'Confirm session end',
      body: 'The other party ended the session. Please confirm the end meter reading to complete it.',
      data: { bookingId },
    });
    return this.get(user, bookingId);
  }

  /** Idempotent completion: assessment → COMPLETED (with kWh settlement) or DISPUTED. */
  async complete(user: AuthUser, bookingId: string, idemKey: string | null) {
    await this.context(user, bookingId);
    const run = async () => {
      const s = await this.settings.get();
      let refund: { amountMinor: number; chargingFeePortionMinor: number } | null = null;
      const notices: NotifyInput[] = [];
      await this.prisma.$transaction(async (tx) => {
        const booking = await this.transitions.lock(tx, bookingId);
        if (booking.status !== 'CHARGING') return; // already completed/disputed — idempotent no-op
        const session = await tx.chargingSession.findUniqueOrThrow({
          where: { bookingId },
          include: { readings: true },
        });
        if (!session.driverEndConfirmedAt || !session.hostEndConfirmedAt) {
          throw AppError.unprocessable(
            'AWAITING_CONFIRMATION',
            'Both driver and host must confirm the end of the session',
          );
        }
        const charger = await tx.charger.findUniqueOrThrow({
          where: { id: booking.chargerId },
          include: { host: true },
        });
        const durationMinutes = Math.max(0, diffMinutes(session.endedAt!, session.startedAt!));
        const wh = (phase: MeterPhase, role: 'DRIVER' | 'HOST') => {
          const r = session.readings.find((x) => x.phase === phase && x.recordedByRole === role);
          return r ? kwhStringToWh(r.readingKwh.toFixed(3)) : null;
        };
        const hasReadings = session.readings.length > 0;
        const assessment: MeterAssessment | null = hasReadings
          ? assessReadings({
              host: { startWh: wh('START', 'HOST'), endWh: wh('END', 'HOST') },
              driver: { startWh: wh('START', 'DRIVER'), endWh: wh('END', 'DRIVER') },
              maxPowerKw: Number(charger.maxPowerKw),
              durationMinutes,
              toleranceWh: s.meterToleranceWh,
              toleranceBps: s.meterToleranceBps,
              headroomBps: s.meterPlausibilityHeadroomBps,
            })
          : null;
        const problem =
          assessment && ['DISCREPANCY', 'IMPLAUSIBLE', 'INVALID'].includes(assessment.status);
        const kwhIncomplete = booking.pricingUnit === 'PER_KWH' && assessment?.status !== 'AGREED';

        await tx.chargingSession.update({
          where: { id: session.id },
          data: {
            durationMinutes,
            assessment: assessment
              ? (assessment as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            completionIdempotencyKey: idemKey,
            ...(problem || kwhIncomplete
              ? { status: 'DISPUTED' }
              : {
                  status: 'CONFIRMED',
                  meteredEnergyWh:
                    assessment?.status === 'AGREED' ? assessment.billableEnergyWh! : null,
                }),
          },
        });

        if (problem || kwhIncomplete) {
          await this.transitions.transition(tx, booking, 'DISPUTED', SYSTEM, {
            reason: assessment?.message ?? 'Meter readings incomplete',
          });
          await tx.dispute.create({
            data: {
              bookingId,
              raisedByRole: 'SYSTEM',
              reason: 'METER_DISCREPANCY',
              description:
                assessment?.message ?? 'Per-kWh session completed without agreed meter readings.',
              assessment: assessment ? (assessment as unknown as Prisma.InputJsonValue) : undefined,
              previousBookingStatus: 'CHARGING',
            },
          });
          const body =
            'Meter readings did not match, so this session is under review. Nexvolt support will reconcile it; payouts are on hold until then.';
          notices.push(
            {
              userId: booking.driverId,
              type: 'DISPUTE_UPDATE',
              title: 'Session under review',
              body,
              data: { bookingId },
            },
            {
              userId: charger.host.userId,
              type: 'DISPUTE_UPDATE',
              title: 'Session under review',
              body,
              data: { bookingId },
            },
          );
          return;
        }

        let finalChargingFeeMinor = booking.chargingFeeMinor;
        let finalTotalMinor = booking.totalMinor;
        if (booking.pricingUnit === 'PER_KWH' && assessment?.status === 'AGREED') {
          const prepaid: PriceBreakdown = {
            pricingUnit: 'PER_KWH',
            unitPriceMinor: booking.unitPriceMinor,
            durationMinutes: diffMinutes(booking.endAt, booking.startAt),
            estimatedEnergyWh: booking.estimatedEnergyWh,
            chargingFeeMinor: booking.chargingFeeMinor,
            serviceFeeMinor: booking.serviceFeeMinor,
            serviceFeeTaxMinor: booking.serviceFeeTaxMinor,
            totalMinor: booking.totalMinor,
            commissionBps: booking.commissionBps,
            commissionMinor: 0,
            hostEarningsBeforeGatewayFeesMinor: 0,
            isEstimate: true,
            lineItems: [],
          };
          const settled = settleKwh(prepaid, assessment.billableEnergyWh!, {
            ...s,
            commissionBps: booking.commissionBps,
          });
          finalChargingFeeMinor = settled.finalChargingFeeMinor;
          finalTotalMinor = settled.finalTotalMinor;
          if (settled.refundDueMinor > 0)
            refund = {
              amountMinor: settled.refundDueMinor,
              chargingFeePortionMinor: booking.chargingFeeMinor - finalChargingFeeMinor,
            };
        }
        await this.transitions.transition(tx, booking, 'COMPLETED', SYSTEM, {
          reason: 'Both parties confirmed the session',
          data: { completedAt: new Date(), finalChargingFeeMinor, finalTotalMinor },
        });
        const energy =
          assessment?.status === 'AGREED'
            ? ` Verified energy: ${(assessment.billableEnergyWh! / 1000).toFixed(2)} kWh.`
            : '';
        notices.push(
          {
            userId: booking.driverId,
            type: 'CHARGING_COMPLETED',
            title: 'Charging complete',
            body: `${booking.code}: ${durationMinutes} min.${energy} Your receipt is ready — please leave a review.`,
            data: { bookingId },
          },
          {
            userId: charger.host.userId,
            type: 'CHARGING_COMPLETED',
            title: 'Session completed',
            body: `${booking.code} completed. Earnings become payout-eligible after the ${s.disputeWindowHours}h dispute window.`,
            data: { bookingId },
          },
        );
      });
      if (refund) {
        const r = refund as { amountMinor: number; chargingFeePortionMinor: number };
        await this.refunds.refundBooking({
          bookingId,
          amountMinor: r.amountMinor,
          chargingFeePortionMinor: r.chargingFeePortionMinor,
          reason: 'Unused prepaid energy (verified kWh lower than estimate)',
          idempotencyKey: `kwh-settle:${bookingId}`,
          initiatedById: null,
        });
      }
      await this.notifications.notify(notices);
      return this.get(user, bookingId);
    };
    return idemKey
      ? this.idempotency.run('session.complete', user.id, idemKey, { bookingId }, run)
      : run();
  }
}
