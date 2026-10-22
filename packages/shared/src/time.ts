/**
 * Time utilities. All persisted timestamps are UTC. India Standard Time is a
 * fixed UTC+05:30 offset with no DST, which lets availability maths stay
 * deterministic without a tz database. Other timezones are out of MVP scope.
 */
export const INDIA_TZ = 'Asia/Kolkata';
export const IST_OFFSET_MINUTES = 330;
const MINUTE_MS = 60_000;
const DAY_MINUTES = 1440;

export interface Interval {
  start: Date;
  end: Date;
}

/** Half-open interval overlap: [a.start, a.end) ∩ [b.start, b.end) ≠ ∅ */
export function intervalsOverlap(a: Interval, b: Interval): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * MINUTE_MS);
}

export function diffMinutes(later: Date, earlier: Date): number {
  return Math.round((later.getTime() - earlier.getTime()) / MINUTE_MS);
}

/** Local IST calendar parts of a UTC instant. dayOfWeek: 0 = Sunday. */
export function toIstParts(d: Date): { date: string; dayOfWeek: number; minuteOfDay: number } {
  const shifted = new Date(d.getTime() + IST_OFFSET_MINUTES * MINUTE_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return {
    date: `${y}-${m}-${day}`,
    dayOfWeek: shifted.getUTCDay(),
    minuteOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/** UTC instant for an IST local date (YYYY-MM-DD) + minute of day (may be 1440 = next midnight). */
export function istToUtc(localDate: string, minuteOfDay: number): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!m) throw new RangeError(`Invalid local date: ${localDate}`);
  const utcMidnight = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(utcMidnight + (minuteOfDay - IST_OFFSET_MINUTES) * MINUTE_MS);
}

/** Next IST calendar date string. */
export function nextLocalDate(localDate: string): string {
  return toIstParts(istToUtc(localDate, DAY_MINUTES)).date;
}

export function dayOfWeekForLocalDate(localDate: string): number {
  return toIstParts(istToUtc(localDate, 0)).dayOfWeek;
}

/** Human display in IST, e.g. "Mon, 21 Oct, 6:30 pm". Uses Intl when available. */
export function formatIst(d: Date | string, opts: Intl.DateTimeFormatOptions = {}): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: INDIA_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    ...opts,
  }).format(date);
}

export function minutesToHHMM(minuteOfDay: number): string {
  const h = Math.floor(minuteOfDay / 60);
  const m = minuteOfDay % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function hhmmToMinutes(hhmm: string): number {
  const m = /^([01]\d|2[0-4]):([0-5]\d)$/.exec(hhmm);
  if (!m) throw new RangeError(`Invalid HH:MM: ${hhmm}`);
  const total = Number(m[1]) * 60 + Number(m[2]);
  if (total > DAY_MINUTES) throw new RangeError(`Invalid HH:MM: ${hhmm}`);
  return total;
}
