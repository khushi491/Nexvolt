import { describe, expect, it } from 'vitest';
import { availableSlots, openRangesForDate, validateSlot, type SlotConstraints, type WeeklyRule } from '../src/availability';
import { intervalsOverlap, istToUtc, toIstParts } from '../src/time';

const constraints: SlotConstraints = {
  minDurationMinutes: 30,
  maxDurationMinutes: 240,
  bufferMinutes: 15,
  slotStepMinutes: 15,
  minLeadTimeMinutes: 15,
  maxAdvanceBookingDays: 30,
};
// 2026-10-21 is a Wednesday (dayOfWeek 3) in IST.
const DATE = '2026-10-21';
const rules: WeeklyRule[] = [
  { dayOfWeek: 3, startMinute: 9 * 60, endMinute: 13 * 60 },
  { dayOfWeek: 3, startMinute: 12 * 60, endMinute: 18 * 60 }, // overlapping windows merge
  { dayOfWeek: 3, startMinute: 22 * 60, endMinute: 1440 },
  { dayOfWeek: 4, startMinute: 0, endMinute: 2 * 60 },
];
const now = new Date('2026-10-20T00:00:00Z');

describe('time helpers', () => {
  it('converts IST local time to UTC and back', () => {
    const d = istToUtc(DATE, 9 * 60);
    expect(d.toISOString()).toBe('2026-10-21T03:30:00.000Z');
    expect(toIstParts(d)).toEqual({ date: DATE, dayOfWeek: 3, minuteOfDay: 540 });
  });
  it('treats intervals as half-open', () => {
    const a = { start: new Date('2026-01-01T10:00Z'), end: new Date('2026-01-01T11:00Z') };
    const b = { start: new Date('2026-01-01T11:00Z'), end: new Date('2026-01-01T12:00Z') };
    expect(intervalsOverlap(a, b)).toBe(false);
    expect(intervalsOverlap(a, { ...b, start: new Date('2026-01-01T10:59Z') })).toBe(true);
  });
});

describe('availability', () => {
  it('merges overlapping weekly windows', () => {
    expect(openRangesForDate(DATE, rules, [])).toEqual([
      [540, 1080],
      [1320, 1440],
    ]);
  });
  it('blackout exceptions remove the whole day', () => {
    expect(openRangesForDate(DATE, rules, [{ date: DATE, type: 'BLACKOUT' }])).toEqual([]);
  });
  it('custom hours replace weekly rules for that date', () => {
    expect(
      openRangesForDate(DATE, rules, [{ date: DATE, type: 'CUSTOM_HOURS', startMinute: 600, endMinute: 660 }]),
    ).toEqual([[600, 660]]);
  });
  it('accepts a slot inside a window and rejects one crossing its edge', () => {
    const base = { now, rules, exceptions: [], constraints, busy: [] };
    expect(validateSlot({ ...base, start: istToUtc(DATE, 600), end: istToUtc(DATE, 660) })).toEqual({ ok: true });
    expect(validateSlot({ ...base, start: istToUtc(DATE, 1050), end: istToUtc(DATE, 1110) })).toEqual({
      ok: false,
      reason: 'OUTSIDE_AVAILABILITY',
    });
  });
  it('allows a slot spanning midnight when windows are contiguous', () => {
    const base = { now, rules, exceptions: [], constraints, busy: [] };
    expect(validateSlot({ ...base, start: istToUtc(DATE, 23 * 60), end: istToUtc('2026-10-22', 60) })).toEqual({ ok: true });
  });
  it('enforces min/max duration, alignment, lead time and horizon', () => {
    const base = { now, rules, exceptions: [], constraints, busy: [] };
    const s = istToUtc(DATE, 600);
    expect(validateSlot({ ...base, start: s, end: istToUtc(DATE, 615) })).toMatchObject({ reason: 'TOO_SHORT' });
    expect(validateSlot({ ...base, start: s, end: istToUtc(DATE, 1000) })).toMatchObject({ reason: 'MISALIGNED' });
    expect(validateSlot({ ...base, start: s, end: istToUtc(DATE, 900) })).toMatchObject({ reason: 'TOO_LONG' });
    expect(validateSlot({ ...base, now: new Date(s.getTime() - 5 * 60_000), start: s, end: istToUtc(DATE, 660) })).toMatchObject({ reason: 'TOO_SOON' });
    expect(validateSlot({ ...base, now: new Date('2026-09-01T00:00Z'), start: s, end: istToUtc(DATE, 660) })).toMatchObject({ reason: 'TOO_FAR_AHEAD' });
  });
  it('respects buffers around existing bookings (both directions)', () => {
    const existing = { start: istToUtc(DATE, 600), blockedUntil: istToUtc(DATE, 660 + 15) }; // 10:00–11:00 + 15m buffer
    const base = { now, rules, exceptions: [], constraints, busy: [existing] };
    // Starts inside the buffer after the existing booking.
    expect(validateSlot({ ...base, start: istToUtc(DATE, 660), end: istToUtc(DATE, 720) })).toMatchObject({ reason: 'OVERLAPS_EXISTING' });
    expect(validateSlot({ ...base, start: istToUtc(DATE, 675), end: istToUtc(DATE, 735) })).toEqual({ ok: true });
    // Ends right at the existing start, but its own buffer would overlap.
    expect(validateSlot({ ...base, start: istToUtc(DATE, 540), end: istToUtc(DATE, 600) })).toMatchObject({ reason: 'OVERLAPS_EXISTING' });
    expect(validateSlot({ ...base, start: istToUtc(DATE, 540), end: istToUtc(DATE, 585) })).toEqual({ ok: true });
  });
  it('lists only free start times', () => {
    const existing = { start: istToUtc(DATE, 600), blockedUntil: istToUtc(DATE, 675) };
    const slots = availableSlots({ localDate: DATE, durationMinutes: 60, now, rules, exceptions: [], constraints, busy: [existing] });
    const starts = slots.map((s) => toIstParts(s.start).minuteOfDay);
    expect(starts).not.toContain(540); // 09:00–10:00 + 15m buffer would overlap 10:00
    expect(starts).not.toContain(570);
    expect(starts).not.toContain(600);
    expect(starts).toContain(675);
    expect(starts).not.toContain(1035); // would end 18:15, outside window
  });
});
