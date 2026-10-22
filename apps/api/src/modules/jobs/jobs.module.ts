import { Global, Inject, Injectable, Logger, Module, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { ENV, type Env } from '../../config/env';
import { NotificationsService, PUSH_QUEUE } from '../notifications/notifications.service';
import { MAINTENANCE_TASKS, MaintenanceService, SCHEDULE_MS, type MaintenanceTask } from './maintenance.service';

const MAINTENANCE_QUEUE = 'nexvolt-maintenance';
const PUSH_QUEUE_NAME = 'nexvolt-push';

const connection = (env: Env) => new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

/**
 * BullMQ scheduling. With JOBS_ENABLED=false (tests, single-shot scripts) nothing is scheduled
 * and push is delivered inline; maintenance can still be triggered by admins on demand.
 * BullMQ guarantees each scheduled job runs once even with several API instances.
 */
@Injectable()
export class JobsRunner implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Jobs');
  private workers: Worker[] = [];
  private queues: Queue[] = [];

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly maintenance: MaintenanceService,
    private readonly notifications: NotificationsService,
    @Inject(PUSH_QUEUE) private readonly pushQueue: Queue | null,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.env.JOBS_ENABLED) {
      this.logger.log('Background jobs disabled (JOBS_ENABLED=false)');
      return;
    }
    const maintenanceQueue = new Queue(MAINTENANCE_QUEUE, { connection: connection(this.env) });
    this.queues.push(maintenanceQueue);
    for (const task of MAINTENANCE_TASKS) {
      await maintenanceQueue.upsertJobScheduler(task, { every: SCHEDULE_MS[task] }, { name: task, opts: { removeOnComplete: 100, removeOnFail: 500 } });
    }
    this.workers.push(
      new Worker(MAINTENANCE_QUEUE, (job) => this.maintenance.run(job.name as MaintenanceTask), { connection: connection(this.env), concurrency: 1 }),
      new Worker(PUSH_QUEUE_NAME, (job) => this.notifications.deliver(job.data.notificationId as string), { connection: connection(this.env), concurrency: 5 }),
    );
    for (const w of this.workers) w.on('failed', (job, err) => this.logger.warn(`Job ${job?.name} failed: ${err.message}`));
    this.logger.log(`Scheduled ${MAINTENANCE_TASKS.length} maintenance tasks`);
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all(this.queues.map((q) => q.close()));
    if (this.pushQueue) await this.pushQueue.close();
  }
}

@Global()
@Module({
  providers: [
    MaintenanceService,
    JobsRunner,
    {
      provide: PUSH_QUEUE,
      inject: [ENV],
      useFactory: (env: Env) => (env.JOBS_ENABLED ? new Queue(PUSH_QUEUE_NAME, { connection: connection(env) }) : null),
    },
  ],
  exports: [MaintenanceService, PUSH_QUEUE],
})
export class JobsModule {}
