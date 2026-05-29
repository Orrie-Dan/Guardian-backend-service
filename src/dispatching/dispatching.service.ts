import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  AssignmentStatus,
  JobStatus,
  Prisma,
  ShiftStatus,
} from '@prisma/client';
import { AuditService } from '../common/services/audit.service';
import { ShiftStateService } from '../guardians/shift-state.service';
import { OutboxService } from '../outbox/outbox.service';
import { PresenceService } from '../redis/presence.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import {
  CANDIDATE_POOL_SIZE,
  OFFER_TTL_MS,
} from '../queue/queue.constants';
import { BillingService } from '../billing/billing.service';
import { EmailNotificationService } from '../notifications/email-notification.service';
import { EmailTemplateId } from '../notifications/email-template.ids';

type LockedGuardian = { id: string };

@Injectable()
export class DispatchingService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly audit: AuditService,
    private readonly presence: PresenceService,
    private readonly shiftState: ShiftStateService,
    private readonly outbox: OutboxService,
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
    if (!job || job.status === JobStatus.CANCELLED || job.status === JobStatus.COMPLETED) {
      return;
    }
    if (await this.failIfDispatchExhausted(job)) {
      return;
    }

    const assignment = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockNextGuardian(tx, job.location.district);
      if (!locked) {
        return null;
      }

      const round =
        (await tx.jobAssignment.count({ where: { jobId } })) + 1;
      const expiresAt = new Date(Date.now() + OFFER_TTL_MS);

      const created = await tx.jobAssignment.create({
        data: {
          jobId,
          guardianId: locked.id,
          assignmentRound: round,
          status: AssignmentStatus.OFFERED,
          expiresAt,
        },
      });

      await tx.guardianShiftState.update({
        where: { guardianId: locked.id },
        data: {
          shiftStatus: ShiftStatus.BUSY,
          availableForJobs: false,
        },
      });

      await tx.job.update({
        where: { id: jobId },
        data: { dispatchAttempts: { increment: 1 } },
      });

      return created;
    });

    if (!assignment) {
      await this.handleDispatchFailure(jobId);
      return;
    }

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

  private async lockNextGuardian(
    tx: Prisma.TransactionClient,
    district: string,
  ): Promise<LockedGuardian | null> {
    const rows = await tx.$queryRaw<LockedGuardian[]>`
      SELECT g.id::text AS id
      FROM guardian.guardians g
      INNER JOIN guardian.guardian_shift_state s ON s.guardian_id = g.id
      WHERE s.shift_status = 'AVAILABLE'
        AND s.available_for_jobs = true
        AND g.status = 'ACTIVE'
        AND g.verification_status = 'VERIFIED'
        AND (
          g.district_base = ${district}
          OR ${district} = ANY(g.coverage_districts)
        )
        AND EXISTS (
          SELECT 1 FROM guardian.certifications c
          WHERE c.guardian_id = g.id
            AND c.verification_status = 'VERIFIED'
            AND (c.expiry_date IS NULL OR c.expiry_date >= CURRENT_DATE)
        )
      ORDER BY g.reliability_score DESC
      FOR UPDATE OF g SKIP LOCKED
      LIMIT ${CANDIDATE_POOL_SIZE}
    `;

    const reachable = await this.presence.filterReachableGuardianIds(
      rows.map((r) => r.id),
    );
    const chosen = rows.find((r) => reachable.includes(r.id));
    return chosen ?? null;
  }

  /** Cancels open offers and releases guardians when a job is cancelled. */
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

  private async failIfDispatchExhausted(job: {
    id: string;
    status: JobStatus;
    dispatchAttempts: number;
    maxDispatchAttempts: number;
  }): Promise<boolean> {
    if (job.dispatchAttempts >= job.maxDispatchAttempts) {
      await this.transitionJobStatus(
        job.id,
        job.status,
        JobStatus.FAILED,
        'dispatch_exhausted',
      );
      return true;
    }
    return false;
  }

  private async handleDispatchFailure(jobId: string): Promise<void> {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      return;
    }

    if (await this.failIfDispatchExhausted(job)) {
      return;
    }

    await this.outbox.enqueue({
      aggregateType: 'job',
      aggregateId: jobId,
      eventType: 'JOB_DISPATCH_REQUESTED',
      payload: { jobId },
      scheduledAt: new Date(Date.now() + 2_000),
    });
  }

  async acceptOffer(assignmentId: string, guardianId: string) {
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

      await this.recordJobStatus(tx, assignment.jobId, assignment.job.status, JobStatus.ASSIGNED);
      await tx.job.update({
        where: { id: assignment.jobId },
        data: { status: JobStatus.ASSIGNED },
      });

      await tx.jobAssignment.updateMany({
        where: {
          jobId: assignment.jobId,
          id: { not: assignmentId },
          status: AssignmentStatus.OFFERED,
        },
        data: { status: AssignmentStatus.CANCELLED },
      });

      return updated;
    });

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
      assignment.job.status === JobStatus.COMPLETED
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
    });

    if (
      job &&
      (job.status === JobStatus.PENDING || job.status === JobStatus.DISPATCHING)
    ) {
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
      include: { location: true },
    });
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    await this.transitionJobStatus(
      jobId,
      job.status,
      JobStatus.COMPLETED,
      undefined,
      actorUserId,
    );

    await this.billing.createInvoiceForJob(job);

    await this.emails.sendToOrgOwners(
      job.organizationId,
      EmailTemplateId.JOB_COMPLETED,
      { jobReference: job.referenceNumber, jobId },
      { entityType: 'job.jobs', entityId: jobId },
    );

    return { jobId, status: JobStatus.COMPLETED };
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
