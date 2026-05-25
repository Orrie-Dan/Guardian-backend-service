import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DispatchingService } from '../dispatching/dispatching.service';
import { OutboxService } from './outbox.service';

@Injectable()
export class OutboxWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxWorker.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly outbox: OutboxService,
    @Inject(forwardRef(() => DispatchingService))
    private readonly dispatching: DispatchingService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    this.timer = setInterval(() => void this.tick(), 2_000);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async tick(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const events = await this.outbox.claimBatch();
      for (const event of events) {
        await this.processEvent(event);
      }
    } catch (err) {
      this.logger.error(err instanceof Error ? err.message : String(err));
    } finally {
      this.running = false;
    }
  }

  private async processEvent(event: {
    id: string;
    eventType: string;
    payload: Prisma.JsonValue;
    retries: number;
  }): Promise<void> {
    try {
      switch (event.eventType) {
        case 'JOB_DISPATCH_REQUESTED': {
          const payload = event.payload as { jobId: string };
          await this.dispatching.processDispatch(payload.jobId);
          break;
        }
        default:
          this.logger.warn(`Unhandled outbox event: ${event.eventType}`);
      }
      await this.outbox.markCompleted(event.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.outbox.markFailed(event.id, message, event.retries);
    }
  }
}
