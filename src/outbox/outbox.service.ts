import { Injectable } from '@nestjs/common';
import { OutboxStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface OutboxEnqueueInput {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Prisma.InputJsonValue;
  scheduledAt?: Date;
}

@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  enqueueInTransaction(
    tx: Prisma.TransactionClient,
    input: OutboxEnqueueInput,
  ) {
    return tx.outboxEvent.create({
      data: {
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        eventType: input.eventType,
        payload: input.payload,
        scheduledAt: input.scheduledAt ?? new Date(),
        status: OutboxStatus.PENDING,
      },
    });
  }

  async enqueue(input: OutboxEnqueueInput) {
    return this.prisma.outboxEvent.create({
      data: {
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        eventType: input.eventType,
        payload: input.payload,
        scheduledAt: input.scheduledAt ?? new Date(),
        status: OutboxStatus.PENDING,
      },
    });
  }

  async claimBatch(limit = 20) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id::text AS id FROM system.outbox_events
        WHERE status = 'PENDING' AND scheduled_at <= NOW()
        ORDER BY scheduled_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      `;

      if (!rows.length) {
        return [];
      }

      await tx.outboxEvent.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { status: OutboxStatus.PROCESSING },
      });

      return tx.outboxEvent.findMany({
        where: { id: { in: rows.map((r) => r.id) } },
      });
    });
  }

  async markCompleted(id: string) {
    return this.prisma.outboxEvent.update({
      where: { id },
      data: { status: OutboxStatus.COMPLETED, processedAt: new Date() },
    });
  }

  async markFailed(id: string, error: string, retries: number) {
    const maxRetries = 5;
    const nextRetries = retries + 1;
    const status =
      nextRetries >= maxRetries ? OutboxStatus.DEAD_LETTER : OutboxStatus.FAILED;
    const backoffMs = Math.min(60_000, 2 ** nextRetries * 1000);

    return this.prisma.outboxEvent.update({
      where: { id },
      data: {
        status,
        retries: nextRetries,
        lastError: error,
        scheduledAt:
          status === OutboxStatus.FAILED
            ? new Date(Date.now() + backoffMs)
            : undefined,
      },
    });
  }
}
