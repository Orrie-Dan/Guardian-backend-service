import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  AssignmentStatus,
  JobPriority,
  JobStatus,
  Prisma,
  ShiftStatus,
} from '@prisma/client';
import { AuditService } from '../common/services/audit.service';
import { GuardianDispatchEligibilityService } from '../guardians/guardian-dispatch-eligibility.service';
import { ShiftStateService } from '../guardians/shift-state.service';
import { JobLifecycleService } from '../jobs/job-lifecycle.service';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import {
  DISPATCH_UNREACHABLE_GRACE_MS,
  DISPATCH_WINDOW_MS,
  MAX_OFFERS_PER_JOB,
  OFFER_TTL_MS,
  URGENT_PARALLEL_OFFERS,
} from '../queue/queue.constants';
import { BillingService } from '../billing/billing.service';
import { EmailNotificationService } from '../notifications/email-notification.service';
import { EmailTemplateId } from '../notifications/email-template.ids';
import {
  cancelCompetingOffersInTransaction,
  releaseCompetingOffers,
} from '../assignments/competing-offer-release.util';

export type DispatchFailureReason =
  | 'dispatch_timeout'
  | 'dispatch_pool_exhausted'
  | 'dispatch_no_eligible_guardians'
  | 'dispatch_unreachable_pool'
  | 'dispatch_max_offers_exceeded';

type DispatchAnomaly = {
  metric: 'dispatch.duplicate_candidate_selected' | 'dispatch.no_candidates_after_exclusion';
  reason: string;
  guardianId?: string;
  excludedCount: number;
  poolCount?: number;
  candidateCount?: number;
  reachableCount?: number;
  eligibleIds?: string[];
  reachableIds?: string[];
  triedIds?: string[];
};

@Injectable()
export class DispatchingService implements OnModuleInit {
  private readonly logger = new Logger(DispatchingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly audit: AuditService,
    private readonly eligibility: GuardianDispatchEligibilityService,
    private readonly shiftState: ShiftStateService,
    private readonly outbox: OutboxService,
    private readonly lifecycle: JobLifecycleService,
    private readonly billing: BillingService,
    private readonly emails: EmailNotificationService,
  ) {}

  onModuleInit(): void {
    this.queue.registerOfferExpiryHandler(({ assignmentId }) =>
      this.expireOffer(assignmentId),
    );
  }

  async requestDispatch(jobId: string): Promise<{ jobId: string; queued: boolean }> {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    if (job.status !== JobStatus.PENDING && job.status !== JobStatus.DISPATCHING) {
      throw new BadRequestException(`Job cannot be dispatched in status ${job.status}`);
    }

    await this.ensureDispatchSchedule(jobId, job.dispatchDeadlineAt, job.dispatchStartedAt);

    await this.transitionJobStatus(jobId, job.status, JobStatus.DISPATCHING);

    await this.outbox.enqueue({
      aggregateType: 'job',
      aggregateId: jobId,
      eventType: 'JOB_DISPATCH_REQUESTED',
      payload: { jobId },
    });

    await this.audit.log({
      action: 'JOB_DISPATCH_REQUESTED',
      entityType: 'job.jobs',
      entityId: jobId,
    });

    return { jobId, queued: true };
  }

  async processDispatch(jobId: string): Promise<void> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { location: true },
    });
    if (
      !job ||
      job.status === JobStatus.CANCELLED ||
      job.status === JobStatus.COMPLETED ||
      job.status === JobStatus.AWAITING_CONFIRMATION
    ) {
      return;
    }
    if (job.status === JobStatus.FAILED) {
      return;
    }

    await this.ensureDispatchSchedule(jobId, job.dispatchDeadlineAt, job.dispatchStartedAt);
    if (!job.dispatchDeadlineAt) {
      job.dispatchDeadlineAt = new Date(Date.now() + DISPATCH_WINDOW_MS);
    }

    if (await this.evaluateTerminalFailures(job)) {
      return;
    }

    if (job.offersSentCount >= MAX_OFFERS_PER_JOB) {
      await this.failJob(job, 'dispatch_max_offers_exceeded');
      return;
    }

    const district = job.location.district;
    const isUrgent = job.priority === JobPriority.URGENT;

    if (isUrgent) {
      await this.processUrgentParallelDispatch(jobId, job, district);
      return;
    }

    const dispatchResult = await this.prisma.$transaction(async (tx) => {
      const pick = await this.eligibility.pickNextReachableGuardian(district, jobId, tx);
      if (!pick.guardian) {
        return {
          assignments: [] as { id: string; guardianId: string; expiresAt: Date }[],
          anomaly:
            pick.excludedCount > 0 || pick.candidateCount === 0
              ? ({
                  metric: 'dispatch.no_candidates_after_exclusion' as const,
                  reason: 'no_candidates_after_exclusion',
                  excludedCount: pick.excludedCount,
                  poolCount: pick.poolCount,
                  candidateCount: pick.candidateCount,
                  reachableCount: pick.reachableCount,
                  eligibleIds: pick.eligibleIds,
                  reachableIds: pick.reachableIds,
                  triedIds: [...(await this.eligibility.getTriedGuardianIds(jobId, tx))],
                } satisfies DispatchAnomaly)
              : undefined,
          pick,
        };
      }

      const duplicateSelection = await this.wasGuardianPreviouslyTried(
        tx,
        jobId,
        pick.guardian.id,
      );
      if (duplicateSelection) {
        return {
          assignments: [],
          anomaly: {
            metric: 'dispatch.duplicate_candidate_selected' as const,
            reason: 'duplicate_candidate_selected',
            guardianId: pick.guardian.id,
            excludedCount: pick.excludedCount,
            poolCount: pick.poolCount,
            candidateCount: pick.candidateCount,
            reachableCount: pick.reachableCount,
            eligibleIds: pick.eligibleIds,
            reachableIds: pick.reachableIds,
            triedIds: [...(await this.eligibility.getTriedGuardianIds(jobId, tx))],
          } satisfies DispatchAnomaly,
          pick,
        };
      }

      const created = await this.createOfferInTransaction(
        tx,
        jobId,
        pick.guardian.id,
      );
      return { assignments: [created], anomaly: undefined, pick };
    });

    if (dispatchResult.anomaly) {
      await this.logDispatchAnomaly(jobId, job, dispatchResult.anomaly);
      await this.writeDispatchAudit(jobId, job.offersSentCount, dispatchResult.anomaly.metric, {
        ...dispatchResult.anomaly,
      });
      await this.updateUnreachableState(
        jobId,
        dispatchResult.pick.eligibleIds.length,
        dispatchResult.pick.reachableCount,
      );
      await this.handleDispatchFailure(jobId);
      return;
    }

    for (const assignment of dispatchResult.assignments) {
      await this.finalizeOffer(jobId, assignment);
    }
  }

  private async processUrgentParallelDispatch(
    jobId: string,
    job: {
      id: string;
      offersSentCount: number;
      referenceNumber?: string;
    },
    district: string,
  ): Promise<void> {
    const dispatchResult = await this.prisma.$transaction(async (tx) => {
      const pick = await this.eligibility.pickParallelReachableGuardians(
        district,
        jobId,
        URGENT_PARALLEL_OFFERS,
        tx,
      );

      if (!pick.guardians.length) {
        return {
          assignments: [] as { id: string; guardianId: string; expiresAt: Date }[],
          anomaly: {
            metric: 'dispatch.no_candidates_after_exclusion' as const,
            reason: 'no_candidates_after_exclusion',
            excludedCount: pick.excludedCount,
            poolCount: pick.candidateCount + pick.excludedCount,
            candidateCount: pick.candidateCount,
            reachableCount: pick.reachableCount,
            eligibleIds: pick.eligibleIds,
            reachableIds: pick.reachableIds,
            triedIds: [...(await this.eligibility.getTriedGuardianIds(jobId, tx))],
          } satisfies DispatchAnomaly,
          pick,
        };
      }

      const assignments: { id: string; guardianId: string; expiresAt: Date }[] = [];
      for (const guardian of pick.guardians) {
        const created = await this.createOfferInTransaction(tx, jobId, guardian.id);
        assignments.push(created);
      }
      return { assignments, anomaly: undefined, pick };
    });

    if (dispatchResult.anomaly) {
      await this.logDispatchAnomaly(jobId, job, dispatchResult.anomaly);
      await this.writeDispatchAudit(jobId, job.offersSentCount, dispatchResult.anomaly.metric, {
        ...dispatchResult.anomaly,
      });
      await this.updateUnreachableState(
        jobId,
        dispatchResult.pick.eligibleIds.length,
        dispatchResult.pick.reachableCount,
      );
      await this.handleDispatchFailure(jobId);
      return;
    }

    for (const assignment of dispatchResult.assignments) {
      await this.finalizeOffer(jobId, assignment);
    }
  }

  private async createOfferInTransaction(
    tx: Prisma.TransactionClient,
    jobId: string,
    guardianId: string,
  ) {
    const round = (await tx.jobAssignment.count({ where: { jobId } })) + 1;
    const expiresAt = new Date(Date.now() + OFFER_TTL_MS);

    const created = await tx.jobAssignment.create({
      data: {
        jobId,
        guardianId,
        assignmentRound: round,
        status: AssignmentStatus.OFFERED,
        expiresAt,
      },
    });

    await tx.guardianShiftState.update({
      where: { guardianId },
      data: {
        shiftStatus: ShiftStatus.BUSY,
        availableForJobs: false,
      },
    });

    await tx.job.update({
      where: { id: jobId },
      data: {
        offersSentCount: { increment: 1 },
        dispatchAttempts: { increment: 1 },
        unreachableSince: null,
      },
    });

    return created;
  }

  private async finalizeOffer(
    jobId: string,
    assignment: { id: string; guardianId: string; expiresAt: Date },
  ): Promise<void> {
    await this.queue.scheduleOfferExpiry(assignment.id, OFFER_TTL_MS);

    await this.audit.log({
      action: 'GUARDIAN_OFFERED',
      entityType: 'job.job_assignments',
      entityId: assignment.id,
      afterState: {
        jobId,
        guardianId: assignment.guardianId,
        expiresAt: assignment.expiresAt,
      },
    });

    await this.writeDispatchAudit(jobId, 0, 'offer_sent', {
      assignmentId: assignment.id,
      guardianId: assignment.guardianId,
    });

    const jobRecord = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { referenceNumber: true },
    });
    await this.emails.sendToGuardianUser(
      assignment.guardianId,
      EmailTemplateId.DISPATCH_OFFER_RECEIVED,
      {
        jobReference: jobRecord?.referenceNumber ?? jobId,
        jobId,
      },
      { entityType: 'job.job_assignments', entityId: assignment.id },
    );
  }

  private async wasGuardianPreviouslyTried(
    tx: Prisma.TransactionClient,
    jobId: string,
    guardianId: string,
  ): Promise<boolean> {
    const tried = await this.eligibility.getTriedGuardianIds(jobId, tx);
    return tried.has(guardianId);
  }

  private async logDispatchAnomaly(
    jobId: string,
    job: { offersSentCount: number },
    anomaly: DispatchAnomaly,
  ): Promise<void> {
    this.logger.warn(
      `[${anomaly.metric}] jobId=${jobId} guardianId=${anomaly.guardianId ?? 'n/a'} ` +
        `offersSentCount=${job.offersSentCount} ` +
        `excludedCount=${anomaly.excludedCount} poolCount=${anomaly.poolCount ?? 0} ` +
        `candidateCount=${anomaly.candidateCount ?? 0} reachableCount=${anomaly.reachableCount ?? 0} ` +
        `reason=${anomaly.reason}`,
    );

    await this.audit.log({
      action:
        anomaly.metric === 'dispatch.duplicate_candidate_selected'
          ? 'DISPATCH_DUPLICATE_CANDIDATE_SELECTED'
          : 'DISPATCH_NO_CANDIDATES_AFTER_EXCLUSION',
      entityType: 'job.jobs',
      entityId: jobId,
      afterState: {
        metric: anomaly.metric,
        reason: anomaly.reason,
        guardianId: anomaly.guardianId ?? null,
        offersSentCount: job.offersSentCount,
        excludedCount: anomaly.excludedCount,
        poolCount: anomaly.poolCount ?? null,
        candidateCount: anomaly.candidateCount ?? null,
        reachableCount: anomaly.reachableCount ?? null,
        eligibleIds: anomaly.eligibleIds ?? null,
        reachableIds: anomaly.reachableIds ?? null,
        triedIds: anomaly.triedIds ?? null,
      },
    });
  }

  async releaseInFlightOffersForJob(jobId: string): Promise<void> {
    const offered = await this.prisma.jobAssignment.findMany({
      where: { jobId, status: AssignmentStatus.OFFERED },
    });
    if (!offered.length) {
      return;
    }

    for (const assignment of offered) {
      await this.queue.cancelOfferExpiry(assignment.id);
    }

    await this.prisma.jobAssignment.updateMany({
      where: { jobId, status: AssignmentStatus.OFFERED },
      data: { status: AssignmentStatus.CANCELLED },
    });

    for (const assignment of offered) {
      await this.shiftState.setAvailable(assignment.guardianId);
    }
  }

  async failDispatchDueToTimeout(jobId: string): Promise<boolean> {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      return false;
    }
    return this.failIfDispatchTimedOut(job);
  }

  async failDispatchPoolExhaustedIfApplicable(jobId: string): Promise<boolean> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { location: true },
    });
    if (!job) {
      return false;
    }
    return this.failIfDispatchPoolExhausted(job, job.location.district);
  }

  async getDispatchDebug(jobId: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: {
        location: true,
        assignments: {
          select: {
            id: true,
            guardianId: true,
            status: true,
            offerSentAt: true,
            expiresAt: true,
          },
          orderBy: { offerSentAt: 'desc' },
        },
      },
    });
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const district = job.location.district;
    const normalizedDistrict = this.eligibility.normalizeDistrict(district);
    const eligibleCount = await this.eligibility.countEligibleGuardians(district);
    const eligibleRows = await this.eligibility.listEligibleGuardianIds(
      district,
      this.eligibility.defaultPoolLimit(),
      [],
    );
    const eligibleIds = eligibleRows.map((r) => r.id);
    const triedIds = [...(await this.eligibility.getTriedGuardianIds(jobId))];
    const reachableIds = await this.eligibility.filterReachable(eligibleIds);
    const activeOffer = job.assignments.find((a) => a.status === AssignmentStatus.OFFERED);

    return {
      jobId: job.id,
      jobStatus: job.status,
      priority: job.priority,
      district,
      normalizedDistrict,
      dispatchStartedAt: job.dispatchStartedAt,
      dispatchDeadlineAt: job.dispatchDeadlineAt,
      dispatchFailureReason: job.dispatchFailureReason,
      offersSentCount: job.offersSentCount,
      unreachableSince: job.unreachableSince,
      eligibleCount,
      eligibleIds,
      triedIds,
      reachableIds,
      untriedEligibleIds: eligibleIds.filter((id) => !triedIds.includes(id)),
      activeOffer: activeOffer ?? null,
      assignments: job.assignments,
    };
  }

  private async ensureDispatchSchedule(
    jobId: string,
    existingDeadline: Date | null,
    existingStartedAt: Date | null,
  ): Promise<void> {
    const data: Prisma.JobUpdateInput = {};
    if (!existingDeadline) {
      data.dispatchDeadlineAt = new Date(Date.now() + DISPATCH_WINDOW_MS);
    }
    if (!existingStartedAt) {
      data.dispatchStartedAt = new Date();
    }
    if (Object.keys(data).length > 0) {
      await this.prisma.job.update({ where: { id: jobId }, data });
    }
  }

  private isDispatchTimedOut(dispatchDeadlineAt: Date | null): boolean {
    return Boolean(dispatchDeadlineAt && dispatchDeadlineAt <= new Date());
  }

  private async evaluateTerminalFailures(job: {
    id: string;
    status: JobStatus;
    dispatchDeadlineAt: Date | null;
    unreachableSince: Date | null;
    offersSentCount: number;
    location: { district: string };
  }): Promise<boolean> {
    if (await this.failIfDispatchTimedOut(job)) {
      return true;
    }
    if (await this.failIfDispatchPoolExhausted(job, job.location.district)) {
      return true;
    }
    if (await this.failIfUnreachableGraceExceeded(job)) {
      return true;
    }
    return false;
  }

  private async failIfDispatchTimedOut(job: {
    id: string;
    status: JobStatus;
    dispatchDeadlineAt: Date | null;
  }): Promise<boolean> {
    if (
      job.status !== JobStatus.PENDING &&
      job.status !== JobStatus.DISPATCHING
    ) {
      return false;
    }
    if (!this.isDispatchTimedOut(job.dispatchDeadlineAt)) {
      return false;
    }
    await this.failJob(job, 'dispatch_timeout');
    return true;
  }

  private async failIfDispatchPoolExhausted(
    job: { id: string; status: JobStatus },
    district: string,
  ): Promise<boolean> {
    if (
      job.status !== JobStatus.PENDING &&
      job.status !== JobStatus.DISPATCHING
    ) {
      return false;
    }
    if (await this.eligibility.hasActiveOffer(job.id)) {
      return false;
    }

    const eligibleCount = await this.eligibility.countEligibleGuardians(district);
    if (eligibleCount === 0) {
      return false;
    }

    const eligibleRows = await this.eligibility.listEligibleGuardianIds(
      district,
      eligibleCount,
      [],
    );
    const tried = await this.eligibility.getTriedGuardianIds(job.id);
    const allTried =
      eligibleRows.length > 0 && eligibleRows.every((row) => tried.has(row.id));

    if (!allTried) {
      return false;
    }

    await this.failJob(job, 'dispatch_pool_exhausted');
    return true;
  }

  private async failIfUnreachableGraceExceeded(job: {
    id: string;
    status: JobStatus;
    unreachableSince: Date | null;
  }): Promise<boolean> {
    if (
      job.status !== JobStatus.PENDING &&
      job.status !== JobStatus.DISPATCHING
    ) {
      return false;
    }
    if (!job.unreachableSince) {
      return false;
    }
    const graceEnd = job.unreachableSince.getTime() + DISPATCH_UNREACHABLE_GRACE_MS;
    if (Date.now() < graceEnd) {
      return false;
    }
    await this.failJob(job, 'dispatch_unreachable_pool');
    return true;
  }

  private async failJob(
    job: { id: string; status: JobStatus },
    reason: DispatchFailureReason,
  ): Promise<void> {
    await this.releaseInFlightOffersForJob(job.id);
    await this.prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { id: job.id },
        data: {
          status: JobStatus.FAILED,
          dispatchFailureReason: reason,
        },
      });
      await tx.jobStatusHistory.create({
        data: {
          jobId: job.id,
          oldStatus: job.status,
          newStatus: JobStatus.FAILED,
          reason,
        },
      });
    });
    await this.writeDispatchAudit(job.id, 0, 'job_failed', { reason });
    this.logger.warn(`Job ${job.id} failed: ${reason}`);
  }

  private async updateUnreachableState(
    jobId: string,
    eligibleCount: number,
    reachableCount: number,
  ): Promise<void> {
    if (eligibleCount > 0 && reachableCount === 0) {
      await this.prisma.job.updateMany({
        where: { id: jobId, unreachableSince: null },
        data: { unreachableSince: new Date() },
      });
      return;
    }
    if (reachableCount > 0) {
      await this.prisma.job.update({
        where: { id: jobId },
        data: { unreachableSince: null },
      });
    }
  }

  private async handleDispatchFailure(jobId: string): Promise<void> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { location: true },
    });
    if (!job) {
      return;
    }
    if (await this.evaluateTerminalFailures(job)) {
      return;
    }

    const baseMs = 2_000;
    const maxMs = 30_000;
    const delayMs = Math.min(
      baseMs * 2 ** Math.max(job.offersSentCount, 0),
      maxMs,
    );

    await this.outbox.enqueue({
      aggregateType: 'job',
      aggregateId: jobId,
      eventType: 'JOB_DISPATCH_REQUESTED',
      payload: { jobId },
      scheduledAt: new Date(Date.now() + delayMs),
    });
  }

  async acceptOffer(assignmentId: string, guardianId: string) {
    let competingOffers: Awaited<ReturnType<typeof cancelCompetingOffersInTransaction>> = [];

    const result = await this.prisma.$transaction(async (tx) => {
      const assignment = await tx.jobAssignment.findUnique({
        where: { id: assignmentId },
        include: { job: true },
      });

      if (!assignment || assignment.guardianId !== guardianId) {
        throw new NotFoundException('Assignment not found');
      }
      if (assignment.status !== AssignmentStatus.OFFERED) {
        throw new BadRequestException('Offer is no longer active');
      }
      if (assignment.expiresAt < new Date()) {
        throw new BadRequestException('Offer has expired');
      }

      const updated = await this.updateAssignmentOptimistic(tx, assignmentId, assignment.versionNumber, {
        status: AssignmentStatus.ACCEPTED,
        acceptedAt: new Date(),
      });

      await tx.guardianShiftState.update({
        where: { guardianId },
        data: { shiftStatus: ShiftStatus.BUSY, availableForJobs: false },
      });

      await this.lifecycle.transitionToAssigned(tx, assignment.jobId);

      competingOffers = await cancelCompetingOffersInTransaction(
        tx,
        assignment.jobId,
        assignmentId,
      );

      await tx.job.update({
        where: { id: assignment.jobId },
        data: { unreachableSince: null },
      });

      return updated;
    });

    await releaseCompetingOffers(competingOffers, this.queue, this.shiftState);

    await this.audit.log({
      action: 'OFFER_ACCEPTED',
      entityType: 'job.job_assignments',
      entityId: assignmentId,
    });

    return result;
  }

  async rejectOffer(assignmentId: string, guardianId: string) {
    const assignment = await this.prisma.jobAssignment.findUnique({
      where: { id: assignmentId },
    });

    if (!assignment || assignment.guardianId !== guardianId) {
      throw new NotFoundException('Assignment not found');
    }
    if (assignment.status !== AssignmentStatus.OFFERED) {
      throw new BadRequestException('Offer is no longer active');
    }

    await this.prisma.$transaction(async (tx) => {
      await this.updateAssignmentOptimistic(tx, assignmentId, assignment.versionNumber, {
        status: AssignmentStatus.DECLINED,
      });
      await this.shiftState.setAvailable(guardianId);
    });

    await this.audit.log({
      action: 'OFFER_DECLINED',
      entityType: 'job.job_assignments',
      entityId: assignmentId,
    });

    await this.writeDispatchAudit(assignment.jobId, 0, 'offer_declined', {
      assignmentId,
      guardianId,
    });

    await this.outbox.enqueue({
      aggregateType: 'job',
      aggregateId: assignment.jobId,
      eventType: 'JOB_DISPATCH_REQUESTED',
      payload: { jobId: assignment.jobId },
    });

    return { assignmentId, status: AssignmentStatus.DECLINED };
  }

  async expireOffer(assignmentId: string): Promise<void> {
    const assignment = await this.prisma.jobAssignment.findUnique({
      where: { id: assignmentId },
      include: { job: true },
    });

    if (!assignment || assignment.status !== AssignmentStatus.OFFERED) {
      return;
    }
    if (
      assignment.job.status === JobStatus.CANCELLED ||
      assignment.job.status === JobStatus.COMPLETED ||
      assignment.job.status === JobStatus.AWAITING_CONFIRMATION
    ) {
      return;
    }
    if (assignment.expiresAt > new Date()) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await this.updateAssignmentOptimistic(tx, assignmentId, assignment.versionNumber, {
        status: AssignmentStatus.EXPIRED,
      });
      await this.shiftState.setAvailable(assignment.guardianId);
    });

    const job = await this.prisma.job.findUnique({
      where: { id: assignment.jobId },
      include: { location: true },
    });

    if (
      job &&
      (job.status === JobStatus.PENDING || job.status === JobStatus.DISPATCHING)
    ) {
      if (await this.evaluateTerminalFailures(job)) {
        return;
      }
      await this.outbox.enqueue({
        aggregateType: 'job',
        aggregateId: assignment.jobId,
        eventType: 'JOB_DISPATCH_REQUESTED',
        payload: { jobId: assignment.jobId },
      });
    }
  }

  async completeJob(jobId: string, actorUserId: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, status: true },
    });
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (job.status === JobStatus.COMPLETED) {
      const invoice = await this.billing.issueDraftForJobId(jobId, actorUserId);
      return { jobId, status: JobStatus.COMPLETED, invoice };
    }

    if (job.status !== JobStatus.AWAITING_CONFIRMATION) {
      throw new BadRequestException(
        'Job can only be confirmed after guardian completion',
      );
    }

    await this.lifecycle.confirmBilling(jobId, actorUserId);
    const invoice = await this.billing.issueDraftForJobId(jobId, actorUserId);
    return { jobId, status: JobStatus.COMPLETED, invoice };
  }

  private async writeDispatchAudit(
    jobId: string,
    pass: number,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.dispatchAuditLog.create({
      data: {
        jobId,
        pass,
        event,
        payload: payload as Prisma.InputJsonValue,
      },
    });
  }

  private async updateAssignmentOptimistic(
    tx: Prisma.TransactionClient,
    id: string,
    versionNumber: number,
    data: {
      status?: AssignmentStatus;
      acceptedAt?: Date;
    },
  ) {
    const result = await tx.jobAssignment.updateMany({
      where: { id, versionNumber },
      data: {
        status: data.status,
        acceptedAt: data.acceptedAt,
        versionNumber: { increment: 1 },
      },
    });
    if (result.count === 0) {
      throw new ConflictException('Assignment was modified concurrently');
    }
    return tx.jobAssignment.findUniqueOrThrow({ where: { id } });
  }

  private async transitionJobStatus(
    jobId: string,
    oldStatus: JobStatus,
    newStatus: JobStatus,
    reason?: string,
    changedBy?: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.job.update({ where: { id: jobId }, data: { status: newStatus } });
      await this.recordJobStatus(tx, jobId, oldStatus, newStatus, changedBy, reason);
    });
  }

  private async recordJobStatus(
    tx: Prisma.TransactionClient,
    jobId: string,
    oldStatus: JobStatus,
    newStatus: JobStatus,
    changedBy?: string,
    reason?: string,
  ) {
    await tx.jobStatusHistory.create({
      data: {
        jobId,
        oldStatus,
        newStatus,
        changedBy: changedBy ?? null,
        reason,
      },
    });
  }
}
