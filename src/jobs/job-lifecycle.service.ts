import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AssignmentStatus, JobStatus, Prisma } from '@prisma/client';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { DISPATCH_WINDOW_MS } from '../queue/queue.constants';

@Injectable()
export class JobLifecycleService {
  private readonly logger = new Logger(JobLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  transitionToAssigned(
    tx: Prisma.TransactionClient,
    jobId: string,
    changedBy?: string,
  ) {
    return this.transitionJobStatus(
      tx,
      jobId,
      JobStatus.ASSIGNED,
      [JobStatus.PENDING, JobStatus.DISPATCHING],
      changedBy,
    );
  }

  transitionToInProgress(
    tx: Prisma.TransactionClient,
    jobId: string,
    changedBy?: string,
  ) {
    return this.transitionJobStatus(
      tx,
      jobId,
      JobStatus.IN_PROGRESS,
      [JobStatus.ASSIGNED],
      changedBy,
    );
  }

  transitionToSeekingReplacement(
    tx: Prisma.TransactionClient,
    jobId: string,
    changedBy?: string,
  ) {
    return this.transitionJobStatus(
      tx,
      jobId,
      JobStatus.SEEKING_REPLACEMENT,
      [JobStatus.IN_PROGRESS],
      changedBy,
      'replacement_approved',
    );
  }

  transitionFromSeekingReplacementToInProgress(
    tx: Prisma.TransactionClient,
    jobId: string,
    changedBy?: string,
  ) {
    return this.transitionJobStatus(
      tx,
      jobId,
      JobStatus.IN_PROGRESS,
      [JobStatus.SEEKING_REPLACEMENT],
      changedBy,
      'replacement_handoff_completed',
    );
  }

  async completeFromAssignment(jobId: string, changedBy?: string) {
    await this.prisma.$transaction((tx) =>
      this.transitionJobStatus(
        tx,
        jobId,
        JobStatus.AWAITING_CONFIRMATION,
        [JobStatus.IN_PROGRESS, JobStatus.ASSIGNED],
        changedBy,
        'guardian_assignment_completed',
      ),
    );
  }

  async confirmBilling(jobId: string, changedBy?: string) {
    await this.prisma.$transaction((tx) =>
      this.transitionJobStatus(
        tx,
        jobId,
        JobStatus.COMPLETED,
        [JobStatus.AWAITING_CONFIRMATION],
        changedBy,
        'billing_confirmed',
      ),
    );
  }

  /** @deprecated Prefer confirmBilling after guardian complete. */
  async completeExplicit(jobId: string, changedBy: string) {
    const completedAssignment = await this.prisma.jobAssignment.findFirst({
      where: { jobId, status: AssignmentStatus.COMPLETED },
      select: { id: true },
    });
    if (!completedAssignment) {
      throw new BadRequestException(
        'Job can only be completed after an assignment is completed',
      );
    }

    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { status: true },
    });
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (job.status === JobStatus.COMPLETED) {
      return;
    }

    if (job.status === JobStatus.AWAITING_CONFIRMATION) {
      await this.confirmBilling(jobId, changedBy);
      return;
    }

    await this.prisma.$transaction((tx) =>
      this.transitionJobStatus(
        tx,
        jobId,
        JobStatus.COMPLETED,
        [JobStatus.IN_PROGRESS, JobStatus.ASSIGNED],
        changedBy,
      ),
    );
  }

  async redispatchAfterNoShow(jobId: string, changedBy?: string, reason?: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.redispatchAfterNoShowInTransaction(tx, jobId, changedBy, reason);
    });
  }

  async redispatchAfterNoShowInTransaction(
    tx: Prisma.TransactionClient,
    jobId: string,
    changedBy?: string,
    reason?: string,
  ) {
    await this.transitionJobStatus(
      tx,
      jobId,
      JobStatus.DISPATCHING,
      [JobStatus.ASSIGNED, JobStatus.IN_PROGRESS, JobStatus.DISPATCHING],
      changedBy,
      reason ?? 'assignment_no_show',
    );
    await tx.job.update({
      where: { id: jobId },
      data: {
        dispatchDeadlineAt: new Date(Date.now() + DISPATCH_WINDOW_MS),
        dispatchStartedAt: new Date(),
        dispatchFailureReason: null,
        unreachableSince: null,
      },
    });
    await this.outbox.enqueueInTransaction(tx, {
      aggregateType: 'job',
      aggregateId: jobId,
      eventType: 'JOB_DISPATCH_REQUESTED',
      payload: { jobId },
    });
  }

  private async transitionJobStatus(
    tx: Prisma.TransactionClient,
    jobId: string,
    targetStatus: JobStatus,
    allowedFrom: JobStatus[],
    changedBy?: string,
    reason?: string,
  ) {
    const job = await tx.job.findUnique({
      where: { id: jobId },
      select: { id: true, status: true },
    });
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (job.status === targetStatus) {
      return;
    }

    if (!allowedFrom.includes(job.status)) {
      this.logger.warn(
        `Rejected job transition ${job.status} -> ${targetStatus} for job ${jobId}`,
      );
      throw new BadRequestException(
        `Cannot move job from ${job.status} to ${targetStatus}`,
      );
    }

    await tx.job.update({
      where: { id: jobId },
      data: { status: targetStatus },
    });
    await tx.jobStatusHistory.create({
      data: {
        jobId,
        oldStatus: job.status,
        newStatus: targetStatus,
        changedBy: changedBy ?? null,
        reason,
      },
    });
  }
}
