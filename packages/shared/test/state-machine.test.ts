import { describe, expect, it } from 'vitest';
import {
  assertTransition,
  BOOKING_TRANSITIONS,
  canTransition,
  InvalidTransitionError,
} from '../src/booking-state-machine';
import { BookingStatus } from '../src/enums';

describe('booking state machine', () => {
  it('follows the happy path with the correct actors', () => {
    expect(canTransition('HELD', 'PENDING_PAYMENT', 'DRIVER')).toBe(true);
    expect(canTransition('PENDING_PAYMENT', 'CONFIRMED', 'SYSTEM')).toBe(true);
    expect(canTransition('CONFIRMED', 'CHECKED_IN', 'DRIVER')).toBe(true);
    expect(canTransition('CHECKED_IN', 'CHARGING', 'HOST')).toBe(true);
    expect(canTransition('CHARGING', 'COMPLETED', 'SYSTEM')).toBe(true);
    expect(canTransition('COMPLETED', 'SETTLED', 'SYSTEM')).toBe(true);
  });
  it('never lets a client confirm a payment', () => {
    expect(canTransition('PENDING_PAYMENT', 'CONFIRMED', 'DRIVER')).toBe(false);
    expect(canTransition('PENDING_PAYMENT', 'CONFIRMED', 'HOST')).toBe(false);
    expect(canTransition('PENDING_PAYMENT', 'CONFIRMED', 'ADMIN')).toBe(false);
  });
  it('blocks skipping states and leaving terminal states', () => {
    expect(canTransition('HELD', 'CONFIRMED', 'SYSTEM')).toBe(false);
    expect(canTransition('CONFIRMED', 'COMPLETED', 'SYSTEM')).toBe(false);
    expect(BOOKING_TRANSITIONS.SETTLED).toHaveLength(0);
    expect(BOOKING_TRANSITIONS.CANCELLED).toHaveLength(0);
    expect(() => assertTransition('CANCELLED', 'CONFIRMED', 'SYSTEM')).toThrow(
      InvalidTransitionError,
    );
  });
  it('only lets hosts approve manual requests', () => {
    expect(canTransition('AWAITING_HOST_APPROVAL', 'HELD', 'HOST')).toBe(true);
    expect(canTransition('AWAITING_HOST_APPROVAL', 'HELD', 'DRIVER')).toBe(false);
  });
  it('only admins resolve disputes', () => {
    expect(canTransition('DISPUTED', 'COMPLETED', 'ADMIN')).toBe(true);
    expect(canTransition('DISPUTED', 'COMPLETED', 'HOST')).toBe(false);
    expect(canTransition('DISPUTED', 'COMPLETED', 'SYSTEM')).toBe(false);
  });
  it('every transition target is a known status', () => {
    const all = new Set(Object.values(BookingStatus));
    for (const rules of Object.values(BOOKING_TRANSITIONS))
      for (const r of rules) expect(all.has(r.to)).toBe(true);
  });
});
