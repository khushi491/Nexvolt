import type { ExceptionType } from './enums';
import {
  addMinutes,
  dayOfWeekForLocalDate,
  diffMinutes,
  type Interval,
  intervalsOverlap,
  istToUtc,
  nextLocalDate,
  toIstParts,
} from './time';

/** Weekly recurring window in IST local minutes. endMinute may be 1440 (midnight). */
export interface WeeklyRule {
  dayOfWeek: number; // 0 = Sunday
  startMinute: number;
  endMinute: number;
}

/** One-off exception for an IST local date. CUSTOM_HOURS rows replace weekly rules for that date. */
export interface DateException {
  date: string; // YYYY-MM-DD (IST)
  type: ExceptionType;
  startMinute?: number | null;
  endMinute?: number | null;
}

export interface SlotConstraints {
  minDurationMinutes: number;
  maxDurationMinutes: number;
  bufferMinutes: number;
  slotStepMinutes: number;
  minLeadTimeMinutes: number;
  maxAdvanceBookingDays: number;
}

/** An existing booking/hold that occupies capacity: [start, end + its buffer). */
export interface BusyInterval {
  start: Date;
  blockedUntil: Date;
}

export type SlotRejection =
  | 'INVALID_RANGE'
  | 'MISALIGNED'
  | 'TOO_SHORT'
  | 'TOO_LONG'
  | 'TOO_SOON'
  | 'TOO_FAR_AHEAD'
  | 'OUTSIDE_AVAILABILITY'
  | 'OVERLAPS_EXISTING';

export const SLOT_REJECTION_MESSAGES: Record<SlotRejection, string> = {
  INVALID_RANGE: 'End time must be after start time.',
  MISALIGNED: 'Times must align to the booking interval.',
  TOO_SHORT: 'This slot is shorter than the host’s minimum duration.',
  TOO_LONG: 'This slot is longer than the host’s maximum duration.',
  TOO_SOON: 'This slot starts too soon to book.',
  TOO_FAR_AHEAD: 'This slot is too far in the future to book.',
  OUTSIDE_AVAILABILITY: 'The charger is not available for the whole selected time.',
  OVERLAPS_EXISTING: 'This time overlaps another booking.',
};

function mergeMinuteRanges(ranges: Array<[number, number]>): Array<[number, number]> {
  const sorted = ranges.filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}

/** Open minute ranges for an IST local date after applying exceptions. */
export function openRangesForDate(
  localDate: string,
  rules: WeeklyRule[],
  exceptions: DateException[],
): Array<[number, number]> {
  const todays = exceptions.filter((e) => e.date === localDate);
  if (todays.some((e) => e.type === 'BLACKOUT')) return [];
  const custom = todays.filter((e) => e.type === 'CUSTOM_HOURS' && e.startMinute != null && e.endMinute != null);
  if (custom.length > 0) {
    return mergeMinuteRanges(custom.map((e) => [e.startMinute as number, e.endMinute as number]));
  }
  const dow = dayOfWeekForLocalDate(localDate);
  return mergeMinuteRanges(rules.filter((r) => r.dayOfWeek === dow).map((r) => [r.startMinute, r.endMinute]));
}

/** Absolute open intervals covering [from, to], merged across midnight boundaries. */
export function openIntervalsBetween(
  from: Date,
  to: Date,
  rules: WeeklyRule[],
  exceptions: DateException[],
): Interval[] {
  const intervals: Interval[] = [];
  let date = toIstParts(addMinutes(from, -1440)).date;
  const lastDate = toIstParts(addMinutes(to, 1440)).date;
  for (let guard = 0; guard < 400; guard++) {
    for (const [s, e] of openRangesForDate(date, rules, exceptions)) {
      intervals.push({ start: istToUtc(date, s), end: istToUtc(date, e) });
    }
    if (date === lastDate) break;
    date = nextLocalDate(date);
  }
  intervals.sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: Interval[] = [];
  for (const iv of intervals) {
    const last = merged[merged.length - 1];
    if (last && iv.start.getTime() <= last.end.getTime()) {
      if (iv.end > last.end) last.end = iv.end;
    } else merged.push({ ...iv });
  }
  return merged;
}

/** The interval a booking blocks, including the host's buffer. Mirrors the DB exclusion constraint. */
export function blockedInterval(start: Date, end: Date, bufferMinutes: number): Interval {
  return { start, end: addMinutes(end, bufferMinutes) };
}

export function validateSlot(args: {
  start: Date;
  end: Date;
  now: Date;
  rules: WeeklyRule[];
  exceptions: DateException[];
  constraints: SlotConstraints;
  busy: BusyInterval[];
}): { ok: true } | { ok: false; reason: SlotRejection } {
  const { start, end, now, constraints: c } = args;
  if (!(end.getTime() > start.getTime())) return { ok: false, reason: 'INVALID_RANGE' };
  const stepMs = c.slotStepMinutes * 60_000;
  if (start.getTime() % stepMs !== 0 || end.getTime() % stepMs !== 0) return { ok: false, reason: 'MISALIGNED' };
  const duration = diffMinutes(end, start);
  if (duration < c.minDurationMinutes) return { ok: false, reason: 'TOO_SHORT' };
  if (duration > c.maxDurationMinutes) return { ok: false, reason: 'TOO_LONG' };
  if (diffMinutes(start, now) < c.minLeadTimeMinutes) return { ok: false, reason: 'TOO_SOON' };
  if (diffMinutes(start, now) > c.maxAdvanceBookingDays * 1440) return { ok: false, reason: 'TOO_FAR_AHEAD' };
  const open = openIntervalsBetween(start, end, args.rules, args.exceptions);
  const covered = open.some((iv) => iv.start <= start && iv.end >= end);
  if (!covered) return { ok: false, reason: 'OUTSIDE_AVAILABILITY' };
  const mine = blockedInterval(start, end, c.bufferMinutes);
  if (args.busy.some((b) => intervalsOverlap(mine, { start: b.start, end: b.blockedUntil }))) {
    return { ok: false, reason: 'OVERLAPS_EXISTING' };
  }
  return { ok: true };
}

export interface SlotOption {
  start: Date;
  end: Date;
}

/** Bookable start times on an IST local date for a given duration. */
export function availableSlots(args: {
  localDate: string;
  durationMinutes: number;
  now: Date;
  rules: WeeklyRule[];
  exceptions: DateException[];
  constraints: SlotConstraints;
  busy: BusyInterval[];
}): SlotOption[] {
  const { localDate, durationMinutes, constraints: c } = args;
  const out: SlotOption[] = [];
  for (const [s, e] of openRangesForDate(localDate, args.rules, args.exceptions)) {
    for (let m = Math.ceil(s / c.slotStepMinutes) * c.slotStepMinutes; m < e; m += c.slotStepMinutes) {
      const start = istToUtc(localDate, m);
      const end = addMinutes(start, durationMinutes);
      const res = validateSlot({ ...args, start, end });
      if (res.ok) out.push({ start, end });
    }
  }
  return out;
}
