/**
 * Bookings need refunds; payments need booking transitions. To avoid a module cycle,
 * bookings depend on this port and the payments module provides the implementation.
 */
export interface RefundRequest {
  bookingId: string;
  amountMinor: number;
  chargingFeePortionMinor: number;
  reason: string;
  idempotencyKey: string;
  initiatedById: string | null;
}

export interface RefundPort {
  /** Returns null when the booking has no captured payment to refund. */
  refundBooking(req: RefundRequest): Promise<{ refundId: string; status: string } | null>;
}

export const REFUND_PORT = Symbol('REFUND_PORT');
