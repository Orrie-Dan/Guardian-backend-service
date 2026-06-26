import { BadRequestException, Injectable } from '@nestjs/common';
import { JobStatus, Prisma } from '@prisma/client';
import { OutboxService } from '../outbox/outbox.service';
import {
  cancelExcessOffersInTransaction,
  CompetingOffer,
} from '../assignments/competing-offer-release.util';
import { JobLifecycleService } from './job-lifecycle.service';
import {
  computeJobStaffingProgress,
  countStaffedGuardians,
  lockJobForStaffingUpdate,
} from './job-staffing.util';

export type StaffingAcceptResult = {
  progress: Awaited<ReturnType<typeof computeJobStaffingProgress>>;
  excessOffers: CompetingOffer[];
  shouldContinueDispatch: boolean;
};

@Injectable()
export class JobStaffingService {
  constructor(
    private readonly lifecycle: JobLifecycleService,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * After an offer is accepted, update job staffing state under row lock.
   * Returns excess offers to cancel when all slots are filled.
   */
  async applyAcceptStaffingUpdate(
    tx: Prisma.TransactionClient,
    jobId: string,
    job: {
      status: JobStatus;
      requestedGuardianCount: number;
    },
    changedBy?: string,
  ): Promise<StaffingAcceptResult> {
    if (job.status === JobStatus.SEEKING_REPLACEMENT) {
      const progress = await computeJobStaffingProgress(
        tx,
        jobId,
        job.requestedGuardianCount,
      );
      return { progress, excessOffers: [], shouldContinueDispatch: false };
    }

    await lockJobForStaffingUpdate(tx, jobId);

    const staffedBefore = await countStaffedGuardians(tx, jobId);
    if (staffedBefore > job.requestedGuardianCount) {
      throw new BadRequestException('All guardian slots are already filled');
    }

    const progress = await computeJobStaffingProgress(
      tx,
      jobId,
      job.requestedGuardianCount,
    );

    if (progress.isFullyStaffed) {
      await this.lifecycle.transitionToAssigned(tx, jobId, changedBy);
      const excessOffers = await cancelExcessOffersInTransaction(tx, jobId);
      return { progress, excessOffers, shouldContinueDispatch: false };
    }

    await this.lifecycle.transitionToPartiallyAssigned(tx, jobId, changedBy);
    return {
      progress,
      excessOffers: [],
      shouldContinueDispatch: progress.remainingGuardianSlots > progress.pendingOfferCount,
    };
  }

  async applyUnfilledSlotRedispatch(
    tx: Prisma.TransactionClient,
    jobId: string,
    job: {
      status: JobStatus;
      requestedGuardianCount: number;
    },
    changedBy?: string,
    reason?: string,
  ): Promise<void> {
    if (job.status === JobStatus.SEEKING_REPLACEMENT) {
      return;
    }

    await lockJobForStaffingUpdate(tx, jobId);
    const progress = await computeJobStaffingProgress(
      tx,
      jobId,
      job.requestedGuardianCount,
    );
    if (progress.isFullyStaffed) {
      if (job.status !== JobStatus.ASSIGNED && job.status !== JobStatus.IN_PROGRESS) {
        await this.lifecycle.transitionToAssigned(tx, jobId, changedBy);
      }
      return;
    }

    if (job.status === JobStatus.IN_PROGRESS) {
      await this.outbox.enqueueInTransaction(tx, {
        aggregateType: 'job',
        aggregateId: jobId,
        eventType: 'JOB_DISPATCH_REQUESTED',
        payload: { jobId, refill: true },
      });
      return;
    }

    if (
      job.status === JobStatus.ASSIGNED ||
      job.status === JobStatus.PARTIALLY_ASSIGNED
    ) {
      await this.lifecycle.transitionToPartiallyAssigned(tx, jobId, changedBy, reason);
    } else {
      await this.lifecycle.redispatchAfterNoShowInTransaction(
        tx,
        jobId,
        changedBy,
        reason,
      );
      return;
    }

    await this.outbox.enqueueInTransaction(tx, {
      aggregateType: 'job',
      aggregateId: jobId,
      eventType: 'JOB_DISPATCH_REQUESTED',
      payload: { jobId, refill: true },
    });
  }
}
