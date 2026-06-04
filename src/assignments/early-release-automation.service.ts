import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AssignmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AssignmentsService } from './assignments.service';

const EARLY_RELEASE_AUTOMATION_INTERVAL_MS = 60_000;

@Injectable()
export class EarlyReleaseAutomationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EarlyReleaseAutomationService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly assignments: AssignmentsService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    this.timer = setInterval(
      () => void this.scanAndAutoApprove(),
      EARLY_RELEASE_AUTOMATION_INTERVAL_MS,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async scanAndAutoApprove() {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const now = new Date();
      const candidates = await this.prisma.jobAssignment.findMany({
        where: {
          status: AssignmentStatus.EARLY_RELEASE_REQUESTED,
          earlyReleaseResolution: null,
          earlyReleaseAutoApproveAt: { lte: now },
        },
        select: { id: true },
      });

      for (const candidate of candidates) {
        try {
          await this.assignments.autoApproveEarlyRelease(candidate.id);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `Failed auto early-release approve for ${candidate.id}: ${message}`,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}
