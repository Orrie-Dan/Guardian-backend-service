import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, Worker } from 'bullmq';
import { parseRedisConnection } from '../redis/redis.config';
import { RedisService } from '../redis/redis.service';
import {
  CONNECTIVITY_QUEUE,
  DISPATCH_QUEUE,
  OFFER_EXPIRY_QUEUE,
} from './queue.constants';

export type DispatchJobPayload = { jobId: string };
export type OfferExpiryPayload = { assignmentId: string };
export type ConnectivityPayload = { guardianId: string };

type JobHandler<T> = (payload: T) => Promise<void>;

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly connection: ReturnType<typeof parseRedisConnection>;
  private dispatchQueue?: Queue<DispatchJobPayload>;
  private offerExpiryQueue?: Queue<OfferExpiryPayload>;
  private connectivityQueue?: Queue<ConnectivityPayload>;
  private workers: Worker[] = [];
  private readonly timers = new Set<NodeJS.Timeout>();
  private readonly offerExpiryTimers = new Map<string, NodeJS.Timeout>();

  private dispatchHandler?: JobHandler<DispatchJobPayload>;
  private offerExpiryHandler?: JobHandler<OfferExpiryPayload>;
  private connectivityHandler?: JobHandler<ConnectivityPayload>;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.connection = parseRedisConnection(config);
  }

  private useInProcess(): boolean {
    return process.env.NODE_ENV === 'test' || this.redis.useInProcessMode();
  }

  onModuleInit(): void {
    if (this.useInProcess()) {
      this.logger.log('Using in-process queue handlers (no BullMQ)');
      return;
    }

    this.dispatchQueue = new Queue(DISPATCH_QUEUE, {
      connection: this.connection,
    });
    this.offerExpiryQueue = new Queue(OFFER_EXPIRY_QUEUE, {
      connection: this.connection,
    });
    this.connectivityQueue = new Queue(CONNECTIVITY_QUEUE, {
      connection: this.connection,
    });
  }

  registerDispatchHandler(handler: JobHandler<DispatchJobPayload>): void {
    this.dispatchHandler = handler;
    if (!this.useInProcess()) {
      this.workers.push(
        new Worker(
          DISPATCH_QUEUE,
          async (job: Job<DispatchJobPayload>) => handler(job.data),
          { connection: this.connection },
        ),
      );
    }
  }

  registerOfferExpiryHandler(handler: JobHandler<OfferExpiryPayload>): void {
    this.offerExpiryHandler = handler;
    if (!this.useInProcess()) {
      this.workers.push(
        new Worker(
          OFFER_EXPIRY_QUEUE,
          async (job: Job<OfferExpiryPayload>) => handler(job.data),
          { connection: this.connection },
        ),
      );
    }
  }

  registerConnectivityHandler(
    handler: JobHandler<ConnectivityPayload>,
  ): void {
    this.connectivityHandler = handler;
    if (!this.useInProcess()) {
      this.workers.push(
        new Worker(
          CONNECTIVITY_QUEUE,
          async (job: Job<ConnectivityPayload>) => handler(job.data),
          { connection: this.connection },
        ),
      );
    }
  }

  async enqueueDispatch(jobId: string, delayMs = 0): Promise<void> {
    if (this.useInProcess()) {
      const run = () => void this.dispatchHandler?.({ jobId });
      if (delayMs > 0) {
        const t = setTimeout(run, delayMs);
        this.timers.add(t);
      } else {
        await run();
      }
      return;
    }
    await this.dispatchQueue!.add('dispatch-job', { jobId }, { delay: delayMs });
  }

  async scheduleOfferExpiry(
    assignmentId: string,
    delayMs: number,
  ): Promise<void> {
    if (this.useInProcess()) {
      const t = setTimeout(() => {
        this.offerExpiryTimers.delete(assignmentId);
        void this.offerExpiryHandler?.({ assignmentId });
      }, delayMs);
      this.offerExpiryTimers.set(assignmentId, t);
      this.timers.add(t);
      return;
    }
    await this.offerExpiryQueue!.add(
      'expire-offer',
      { assignmentId },
      {
        delay: delayMs,
        jobId: this.offerExpiryJobId(assignmentId),
        removeOnComplete: true,
      },
    );
  }

  async cancelOfferExpiry(assignmentId: string): Promise<void> {
    if (this.useInProcess()) {
      const t = this.offerExpiryTimers.get(assignmentId);
      if (t) {
        clearTimeout(t);
        this.timers.delete(t);
        this.offerExpiryTimers.delete(assignmentId);
      }
      return;
    }
    const jobId = this.offerExpiryJobId(assignmentId);
    const job = await this.offerExpiryQueue!.getJob(jobId);
    if (job) {
      await job.remove();
    }
  }

  private offerExpiryJobId(assignmentId: string): string {
    return `offer-expiry:${assignmentId}`;
  }

  async enqueueConnectivityCheck(guardianId: string): Promise<void> {
    if (this.useInProcess()) {
      await this.connectivityHandler?.({ guardianId });
      return;
    }
    await this.connectivityQueue!.add('stale-check', { guardianId });
  }

  async onModuleDestroy(): Promise<void> {
    for (const t of this.timers) {
      clearTimeout(t);
    }
    this.timers.clear();
    await Promise.all(this.workers.map((w) => w.close()));
    await this.dispatchQueue?.close();
    await this.offerExpiryQueue?.close();
    await this.connectivityQueue?.close();
  }
}
