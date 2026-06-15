import { forwardRef, Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AssignmentStatus, JobStatus } from '@prisma/client';
import { DispatchingService } from '../dispatching/dispatching.service';
import { PrismaService } from '../prisma/prisma.service';

const ACTIVE_ASSIGNMENT_STATUSES = new Set<AssignmentStatus>([
  AssignmentStatus.ACCEPTED,
  AssignmentStatus.EN_ROUTE,
  AssignmentStatus.ON_SITE,
  AssignmentStatus.EARLY_RELEASE_REQUESTED,
  AssignmentStatus.REPLACEMENT_REQUESTED,
  AssignmentStatus.AWAITING_RELIEF,
]);

const REPLACEMENT_PIPELINE_STATUSES = new Set<AssignmentStatus>([
  AssignmentStatus.OFFERED,
  AssignmentStatus.ACCEPTED,
  AssignmentStatus.EN_ROUTE,
]);

@Injectable()
export class JobStatusReconciliationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobStatusReconciliationService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => DispatchingService))
    private readonly dispatching: DispatchingService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.scanForDrift(), 60_000);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async scanForDrift() {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      await this.failOverdueDispatchJobs();
      await this.failPoolExhaustedDispatchJobs();

      const jobs = await this.prisma.job.findMany({
        where: {
          status: {
            in: [
              JobStatus.ASSIGNED,
              JobStatus.IN_PROGRESS,
              JobStatus.SEEKING_REPLACEMENT,
              JobStatus.COMPLETED,
              JobStatus.DISPATCHING,
            ],
          },
        },
        select: {
          id: true,
          status: true,
          assignments: {
            select: { status: true },
          },
        },
      });

      const invalidJobs = jobs.filter((job) => {
        const statuses = job.assignments.map((a) => a.status);
        const hasActiveAssignment = statuses.some((status) =>
          ACTIVE_ASSIGNMENT_STATUSES.has(status),
        );
        if (job.status === JobStatus.ASSIGNED || job.status === JobStatus.IN_PROGRESS) {
          return !hasActiveAssignment;
        }
        if (
          job.status === JobStatus.COMPLETED ||
          job.status === JobStatus.AWAITING_CONFIRMATION
        ) {
          return hasActiveAssignment;
        }
        if (job.status === JobStatus.DISPATCHING) {
          return statuses.includes(AssignmentStatus.ON_SITE);
        }
        if (job.status === JobStatus.SEEKING_REPLACEMENT) {
          const hasAwaitingReliefOriginal = statuses.includes(
            AssignmentStatus.AWAITING_RELIEF,
          );
          const hasLegacyOnSiteOriginal = statuses.includes(AssignmentStatus.ON_SITE);
          const hasReplacementPipeline = statuses.some((status) =>
            REPLACEMENT_PIPELINE_STATUSES.has(status),
          );
          return (
            !hasAwaitingReliefOriginal &&
            !hasLegacyOnSiteOriginal &&
            !hasReplacementPipeline
          );
        }
        return false;
      });

      if (invalidJobs.length) {
        this.logger.warn(
          `Detected ${invalidJobs.length} potentially inconsistent job states`,
        );
      }
    } finally {
      this.running = false;
    }
  }

  private async failOverdueDispatchJobs(): Promise<void> {
    const overdue = await this.prisma.job.findMany({
      where: {
        status: { in: [JobStatus.PENDING, JobStatus.DISPATCHING] },
        dispatchDeadlineAt: { lte: new Date() },
      },
      select: { id: true },
    });

    for (const job of overdue) {
      const failed = await this.dispatching.failDispatchDueToTimeout(job.id);
      if (failed) {
        this.logger.warn(`Failed job ${job.id} after dispatch deadline`);
      }
    }
  }

  private async failPoolExhaustedDispatchJobs(): Promise<void> {
    const active = await this.prisma.job.findMany({
      where: { status: { in: [JobStatus.PENDING, JobStatus.DISPATCHING] } },
      select: { id: true },
    });

    for (const job of active) {
      const failed = await this.dispatching.failDispatchPoolExhaustedIfApplicable(job.id);
      if (failed) {
        this.logger.warn(`Failed job ${job.id} after dispatch pool exhausted`);
      }
    }
  }
}
