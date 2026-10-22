import type { ActorType, BookingStatus } from './enums';

/**
 * Booking state machine.
 *
 *   (MANUAL approval)  AWAITING_HOST_APPROVAL ──host approves──┐
 *                                                              ▼
 *   (AUTOMATIC)  ──────────────────────────────────────────▶ HELD ─▶ PENDING_PAYMENT ─▶ CONFIRMED
 *        ─▶ CHECKED_IN ─▶ CHARGING ─▶ COMPLETED ─▶ SETTLED
 *
 * Side branches: CANCELLED, EXPIRED, NO_SHOW, FAILED, DISPUTED.
 * Each edge lists which actor types may trigger it. Time-based and ownership
 * guards are enforced by the API service layer in addition to this table.
 */
export interface TransitionRule {
  to: BookingStatus;
  actors: readonly ActorType[];
  description: string;
}

const T = (to: BookingStatus, actors: ActorType[], description: string): TransitionRule => ({
  to,
  actors,
  description,
});

export const BOOKING_TRANSITIONS: Readonly<Record<BookingStatus, readonly TransitionRule[]>> = {
  AWAITING_HOST_APPROVAL: [
    T('HELD', ['HOST'], 'Host approves request; driver gets a payment hold'),
    T('CANCELLED', ['HOST', 'DRIVER', 'ADMIN'], 'Host declines or driver withdraws request'),
    T('EXPIRED', ['SYSTEM'], 'Host did not respond before the approval deadline'),
  ],
  HELD: [
    T('PENDING_PAYMENT', ['DRIVER', 'SYSTEM'], 'Payment order created'),
    T('CANCELLED', ['DRIVER', 'ADMIN'], 'Driver abandons checkout'),
    T('EXPIRED', ['SYSTEM'], 'Hold expired before payment'),
  ],
  PENDING_PAYMENT: [
    T('CONFIRMED', ['SYSTEM'], 'Server-verified payment captured'),
    T('FAILED', ['SYSTEM'], 'Payment could not be completed or slot could not be secured'),
    T('EXPIRED', ['SYSTEM'], 'Payment window elapsed'),
    T('CANCELLED', ['DRIVER', 'ADMIN'], 'Driver abandons checkout'),
  ],
  CONFIRMED: [
    T('CHECKED_IN', ['DRIVER', 'HOST'], 'Driver arrived and check-in recorded'),
    T('CANCELLED', ['DRIVER', 'HOST', 'ADMIN'], 'Cancellation per policy'),
    T('NO_SHOW', ['HOST', 'SYSTEM'], 'Driver did not arrive within grace period'),
    T('DISPUTED', ['DRIVER', 'HOST'], 'Problem raised before check-in (e.g. no access)'),
  ],
  CHECKED_IN: [
    T('CHARGING', ['DRIVER', 'HOST', 'SYSTEM'], 'Session start recorded'),
    T('CANCELLED', ['ADMIN', 'HOST'], 'Charger unusable after arrival; driver refunded'),
    T('DISPUTED', ['DRIVER', 'HOST'], 'Problem raised after arrival'),
  ],
  CHARGING: [
    T('COMPLETED', ['SYSTEM', 'ADMIN'], 'Both parties confirmed end readings, or admin reconciled'),
    T('DISPUTED', ['DRIVER', 'HOST', 'SYSTEM'], 'Meter discrepancy or other dispute'),
  ],
  COMPLETED: [
    T('SETTLED', ['SYSTEM', 'ADMIN'], 'Dispute window closed; host earnings eligible for payout'),
    T('DISPUTED', ['DRIVER', 'HOST'], 'Dispute raised within the dispute window'),
  ],
  DISPUTED: [
    T('COMPLETED', ['ADMIN'], 'Admin resolved dispute; charge stands (possibly adjusted)'),
    T('CANCELLED', ['ADMIN'], 'Admin resolved dispute with full refund'),
  ],
  EXPIRED: [
    T('CONFIRMED', ['SYSTEM'], 'Late but verified payment arrived and the slot is still free'),
    T('FAILED', ['SYSTEM'], 'Late payment arrived but the slot is gone; payment refunded'),
  ],
  NO_SHOW: [T('DISPUTED', ['DRIVER'], 'Driver contests no-show')],
  SETTLED: [],
  CANCELLED: [],
  FAILED: [],
};

export const TERMINAL_BOOKING_STATUSES: BookingStatus[] = ['SETTLED', 'CANCELLED', 'FAILED'];

export function findTransition(from: BookingStatus, to: BookingStatus): TransitionRule | undefined {
  return BOOKING_TRANSITIONS[from].find((r) => r.to === to);
}

export function canTransition(from: BookingStatus, to: BookingStatus, actor: ActorType): boolean {
  const rule = findTransition(from, to);
  return !!rule && rule.actors.includes(actor);
}

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: BookingStatus,
    public readonly to: BookingStatus,
    public readonly actor: ActorType,
  ) {
    super(`Booking cannot move from ${from} to ${to} (actor: ${actor})`);
    this.name = 'InvalidTransitionError';
  }
}

export function assertTransition(from: BookingStatus, to: BookingStatus, actor: ActorType): void {
  if (!canTransition(from, to, actor)) throw new InvalidTransitionError(from, to, actor);
}

/** Driver-facing label + tone for status chips. */
export const BOOKING_STATUS_DISPLAY: Record<
  BookingStatus,
  { label: string; tone: 'neutral' | 'info' | 'positive' | 'warning' | 'danger' }
> = {
  AWAITING_HOST_APPROVAL: { label: 'Awaiting host', tone: 'warning' },
  HELD: { label: 'Slot held', tone: 'info' },
  PENDING_PAYMENT: { label: 'Payment pending', tone: 'warning' },
  CONFIRMED: { label: 'Confirmed', tone: 'positive' },
  CHECKED_IN: { label: 'Checked in', tone: 'info' },
  CHARGING: { label: 'Charging', tone: 'info' },
  COMPLETED: { label: 'Completed', tone: 'positive' },
  SETTLED: { label: 'Settled', tone: 'neutral' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  EXPIRED: { label: 'Expired', tone: 'neutral' },
  NO_SHOW: { label: 'No-show', tone: 'danger' },
  FAILED: { label: 'Failed', tone: 'danger' },
  DISPUTED: { label: 'In dispute', tone: 'danger' },
};
