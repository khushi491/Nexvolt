import { Injectable, Logger } from '@nestjs/common';
import { assertTransition, InvalidTransitionError, type ActorType, type BookingStatus } from '@nexvolt/shared';
import { Prisma, type Booking, type HoldKind } from '@prisma/client';
import { AppError } from '../../common/errors/app-error';
import { PrismaService, type Tx } from '../../common/prisma/prisma.service';

export interface Actor {
  type: ActorType;
  id: string | null;
}

export const SYSTEM: Actor = { type: 'SYSTEM', id: null };

export interface TransitionOptions {
  reason?: string | null;
  metadata?: Record<string, unknown>;
  data?: Prisma.BookingUpdateManyMutationInput;
  hold?: { kind: HoldKind; expiresAt: Date };
}

const HOLD_STATUSES: BookingStatus[] = ['AWAITING_HOST_APPROVAL', 'HELD', 'PENDING_PAYMENT'];

/**
 * The single place booking status changes happen. Each transition:
 *  1. is validated against the shared state machine for the actor type,
 *  2. is applied with compare-and-set on (id, status, version) so concurrent writers
 *     (webhook vs. expiry job vs. user) cannot both win,
 *  3. writes an immutable BookingStatusEvent and maintains BookingHold rows.
 */
@Injectable()
export class BookingTransitionsService {
  private readonly logger = new Logger('BookingTransitions');

  constructor(private readonly prisma: PrismaService) {}

  async transition(tx: Tx, booking: Booking, to: BookingStatus, actor: Actor, opts: TransitionOptions = {}): Promise<Booking> {
    try {
      assertTransition(booking.status, to, actor.type);
    } catch (e) {
      if (e instanceof InvalidTransitionError) {
        throw AppError.conflict('INVALID_BOOKING_TRANSITION', `This booking is ${booking.status.toLowerCase().replace(/_/g, ' ')} and cannot be changed that way`, { from: booking.status, to });
      }
      throw e;
    }
    const leavingHold = HOLD_STATUSES.includes(booking.status);
    const enteringHold = HOLD_STATUSES.includes(to);
    const res = await tx.booking.updateMany({
      where: { id: booking.id, status: booking.status, version: booking.version },
      data: {
        ...opts.data,
        status: to,
        version: { increment: 1 },
        holdExpiresAt: enteringHold ? (opts.hold?.expiresAt ?? booking.holdExpiresAt) : null,
      },
    });
    if (res.count === 0) {
      throw AppError.conflict('BOOKING_CHANGED', 'This booking was updated by another action. Refresh and try again.');
    }
    await tx.bookingStatusEvent.create({
      data: {
        bookingId: booking.id,
        fromStatus: booking.status,
        toStatus: to,
        actorType: actor.type,
        actorId: actor.id,
        reason: opts.reason ?? null,
        metadata: (opts.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    if (leavingHold || opts.hold) {
      await tx.bookingHold.updateMany({
        where: { bookingId: booking.id, releasedAt: null },
        data: { releasedAt: new Date(), releaseReason: `→ ${to}` },
      });
    }
    if (opts.hold) {
      await tx.bookingHold.create({ data: { bookingId: booking.id, kind: opts.hold.kind, expiresAt: opts.hold.expiresAt } });
    }
    return tx.booking.findUniqueOrThrow({ where: { id: booking.id } });
  }

  /** Lock a booking row for the rest of the transaction. */
  async lock(tx: Tx, bookingId: string): Promise<Booking> {
    await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId}::uuid FOR UPDATE`;
    const b = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!b) throw AppError.notFound('Booking');
    return b;
  }

  /**
   * Expire holds whose window has passed. Called lazily before any capacity insert and
   * periodically by the maintenance job, so expiry is consistent everywhere.
   */
  async expireStaleHolds(tx: Tx, chargerId?: string): Promise<Array<{ id: string; driverId: string; fromStatus: BookingStatus }>> {
    const filter = chargerId ? Prisma.sql`AND "chargerId" = ${chargerId}::uuid` : Prisma.empty;
    const rows = await tx.$queryRaw<Array<{ id: string; driverId: string; fromStatus: BookingStatus }>>`
      WITH stale AS (
        SELECT id, status FROM bookings
        WHERE status IN ('AWAITING_HOST_APPROVAL', 'HELD', 'PENDING_PAYMENT')
          AND "holdExpiresAt" IS NOT NULL AND "holdExpiresAt" < now()
          ${filter}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE bookings b SET status = 'EXPIRED', version = b.version + 1, "holdExpiresAt" = NULL, "updatedAt" = now()
      FROM stale WHERE b.id = stale.id
      RETURNING b.id, b."driverId", stale.status::text AS "fromStatus"`;
    for (const r of rows) {
      await tx.bookingStatusEvent.create({
        data: { bookingId: r.id, fromStatus: r.fromStatus, toStatus: 'EXPIRED', actorType: 'SYSTEM', reason: 'Hold expired' },
      });
      await tx.bookingHold.updateMany({ where: { bookingId: r.id, releasedAt: null }, data: { releasedAt: new Date(), releaseReason: 'expired' } });
    }
    if (rows.length) this.logger.log(`Expired ${rows.length} stale hold(s)`);
    return rows;
  }
}
