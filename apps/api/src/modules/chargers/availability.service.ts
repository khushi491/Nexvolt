import { Injectable } from '@nestjs/common';
import {
  addMinutes,
  availableSlots,
  CAPACITY_BLOCKING_STATUSES,
  istToUtc,
  type AvailabilityDto,
  type BusyInterval,
  type DateException,
  type PlatformSettings,
  type SlotConstraints,
  type WeeklyRule,
} from '@nexvolt/shared';
import type { Charger } from '@prisma/client';
import type { Tx } from '../../common/prisma/prisma.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { SettingsService } from '../settings/settings.service';
import { dateOnly } from './charger.mapper';

export interface AvailabilityContext {
  rules: WeeklyRule[];
  exceptions: DateException[];
  busy: BusyInterval[];
  constraints: SlotConstraints;
}

export function constraintsFor(
  c: Pick<Charger, 'minDurationMinutes' | 'maxDurationMinutes' | 'bufferMinutes'>,
  s: PlatformSettings,
): SlotConstraints {
  return {
    minDurationMinutes: c.minDurationMinutes,
    maxDurationMinutes: c.maxDurationMinutes,
    bufferMinutes: c.bufferMinutes,
    slotStepMinutes: s.slotStepMinutes,
    minLeadTimeMinutes: s.minLeadTimeMinutes,
    maxAdvanceBookingDays: s.maxAdvanceBookingDays,
  };
}

/** A charger is bookable only when verified by an admin, published, not paused, and its host is active. */
export function assertBookable(c: Charger & { host: { suspendedAt: Date | null } }): void {
  if (c.status !== 'VERIFIED' || !c.isPublished) {
    throw AppError.unprocessable(
      'CHARGER_NOT_VERIFIED',
      'This charger is not verified and published, so it cannot be booked',
    );
  }
  if (c.pausedAt)
    throw AppError.unprocessable('CHARGER_PAUSED', 'This charger is temporarily unavailable');
  if (c.host.suspendedAt)
    throw AppError.unprocessable('HOST_SUSPENDED', 'This charger is currently unavailable');
}

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** Rules, exceptions and capacity-blocking intervals for a charger around [from, to]. */
  async context(
    charger: Charger,
    from: Date,
    to: Date,
    opts: { tx?: Tx; excludeBookingId?: string } = {},
  ): Promise<AvailabilityContext> {
    const db = opts.tx ?? this.prisma;
    const settings = await this.settings.get();
    const now = new Date();
    const [rules, exceptions, bookings] = await Promise.all([
      db.chargerAvailabilityRule.findMany({ where: { chargerId: charger.id } }),
      db.availabilityException.findMany({
        where: {
          chargerId: charger.id,
          date: { gte: addMinutes(from, -2 * 1440), lte: addMinutes(to, 2 * 1440) },
        },
      }),
      db.booking.findMany({
        where: {
          chargerId: charger.id,
          status: { in: CAPACITY_BLOCKING_STATUSES },
          startAt: { lt: addMinutes(to, 1440) },
          blockedUntil: { gt: addMinutes(from, -1440) },
          ...(opts.excludeBookingId ? { id: { not: opts.excludeBookingId } } : {}),
        },
        select: { startAt: true, blockedUntil: true, status: true, holdExpiresAt: true },
      }),
    ]);
    return {
      rules: rules.map((r) => ({
        dayOfWeek: r.dayOfWeek,
        startMinute: r.startMinute,
        endMinute: r.endMinute,
      })),
      exceptions: exceptions.map((e) => ({
        date: dateOnly(e.date),
        type: e.type,
        startMinute: e.startMinute,
        endMinute: e.endMinute,
      })),
      // Stale holds no longer block (they are expired lazily before any insert).
      busy: bookings
        .filter(
          (b) =>
            !(
              ['HELD', 'PENDING_PAYMENT', 'AWAITING_HOST_APPROVAL'].includes(b.status) &&
              b.holdExpiresAt &&
              b.holdExpiresAt < now
            ),
        )
        .map((b) => ({ start: b.startAt, blockedUntil: b.blockedUntil })),
      constraints: constraintsFor(charger, settings),
    };
  }

  async slotsForDate(
    chargerId: string,
    date: string,
    durationMinutes: number,
  ): Promise<AvailabilityDto> {
    const charger = await this.prisma.charger.findUnique({
      where: { id: chargerId },
      include: { host: true },
    });
    if (!charger) throw AppError.notFound('Charger');
    assertBookable(charger);
    const from = istToUtc(date, 0);
    const to = istToUtc(date, 1440 + durationMinutes);
    const ctx = await this.context(charger, from, to);
    const slots = availableSlots({ localDate: date, durationMinutes, now: new Date(), ...ctx });
    return {
      chargerId,
      date,
      timezone: 'Asia/Kolkata',
      durationMinutes,
      slots: slots.map((s) => ({ startAt: s.start.toISOString(), endAt: s.end.toISOString() })),
    };
  }
}
