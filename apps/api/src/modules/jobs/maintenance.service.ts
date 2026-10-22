import { Injectable, Logger } from '@nestjs/common';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { BookingsService } from '../bookings/bookings.service';
import { PaymentsService } from '../payments/payments.service';
import { RefundsService } from '../payments/refunds.service';

export const MAINTENANCE_TASKS = [
  'expire-holds',
  'settle-bookings',
  'reconcile-payments',
  'reconcile-refunds',
  'send-reminders',
  'purge-idempotency',
] as const;
export type MaintenanceTask = (typeof MAINTENANCE_TASKS)[number];

/** How often each task runs when JOBS_ENABLED=true. */
export const SCHEDULE_MS: Record<MaintenanceTask, number> = {
  'expire-holds': 60_000,
  'settle-bookings': 5 * 60_000,
  'reconcile-payments': 5 * 60_000,
  'reconcile-refunds': 5 * 60_000,
  'send-reminders': 5 * 60_000,
  'purge-idempotency': 60 * 60_000,
};

/** Idempotent maintenance routines. Safe to run concurrently with user actions and re-run after failures. */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger('Maintenance');

  constructor(
    private readonly bookings: BookingsService,
    private readonly payments: PaymentsService,
    private readonly refunds: RefundsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async run(task: MaintenanceTask): Promise<{ task: MaintenanceTask; processed: number }> {
    const processed = await {
      'expire-holds': () => this.bookings.expireHolds(),
      'settle-bookings': () => this.bookings.settleDue(),
      'reconcile-payments': () => this.payments.reconcilePending(),
      'reconcile-refunds': () => this.refunds.reconcilePending(),
      'send-reminders': () => this.bookings.sendReminders(),
      'purge-idempotency': () => this.idempotency.purgeExpired(),
    }[task]();
    if (processed) this.logger.log(`${task}: ${processed}`);
    return { task, processed };
  }
}
