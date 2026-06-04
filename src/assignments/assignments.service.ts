import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignmentStatus,
  EarlyReleaseResolution,
  Prisma,
  RoleCode,
  ShiftStatus,
} from '@prisma/client';
import { AuthUserPayload } from '../auth/interfaces/auth-user.interface';
import { BillingService } from '../billing/billing.service';
import { AuditService } from '../common/services/audit.service';
import { ResourceOwnerPolicy } from '../common/policies/resource-owner.policy';
import { ShiftStateService } from '../guardians/shift-state.service';
import { EmailNotificationService } from '../notifications/email-notification.service';
import { EmailTemplateId } from '../notifications/email-template.ids';
import { isEarlyReleaseApproved } from './early-release.util';
import { JobLifecycleService } from '../jobs/job-lifecycle.service';
import { OutboxService } from '../outbox/outbox.service';
import { QueueService } from '../queue/queue.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  cancelCompetingOffersInTransaction,
  releaseCompetingOffers,
} from './competing-offer-release.util';
import { assertAssignmentTransitionAllowed } from './assignment-transitions';
import { NoShowReasonCode } from './dto/no-show.dto';

const NO_SHOW_ALLOWED_FROM_STATUSES = new Set<AssignmentStatus>([
  AssignmentStatus.OFFERED,
  AssignmentStatus.ACCEPTED,
  AssignmentStatus.EN_ROUTE,
]);

type ManualNoShowInput = {
  reasonCode: NoShowReasonCode;
  reasonNote?: string;
  actorUserId: string;
  actorRole: RoleCode;
};

type NoShowTriggerType = 'MANUAL' | 'SYSTEM';

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly billing: BillingService,
    private readonly shiftState: ShiftStateService,
    private readonly lifecycle: JobLifecycleService,
    private readonly outbox: OutboxService,
    private readonly queue: QueueService,
    private readonly policy: ResourceOwnerPolicy,
    private readonly emails: EmailNotificationService,
  ) {}

  async findForGuardian(guardianId: string) {
    const offers = await this.prisma.jobAssignment.findMany({
      where: {
        guardianId,
        status: AssignmentStatus.OFFERED,
        expiresAt: { gt: new Date() },
      },
      include: {
        job: { include: { location: true, organization: true } },
      },
      orderBy: { offerSentAt: 'desc' },
    });

    const active = await this.prisma.jobAssignment.findFirst({
      where: {
        guardianId,
        status: {
          in: [
            AssignmentStatus.ACCEPTED,
            AssignmentStatus.EN_ROUTE,
            AssignmentStatus.ON_SITE,
            AssignmentStatus.EARLY_RELEASE_REQUESTED,
          ],
        },
      },
      include: {
        job: { include: { location: true, organization: true } },
      },
    });

    return { offers, activeAssignment: active };
  }

  async accept(assignmentId: string, guardianId: string) {
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

      const updated = await this.updateOptimistic(tx, assignmentId, assignment.versionNumber, {
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

  async decline(assignmentId: string, guardianId: string) {
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
      await this.updateOptimistic(tx, assignmentId, assignment.versionNumber, {
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

  async enRoute(assignmentId: string, guardianId: string) {
    return this.transition(assignmentId, guardianId, AssignmentStatus.ACCEPTED, AssignmentStatus.EN_ROUTE, 'EN_ROUTE');
  }

  async onSite(assignmentId: string, guardianId: string) {
    const assignment = await this.prisma.jobAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment || assignment.guardianId !== guardianId) {
      throw new NotFoundException('Assignment not found');
    }
    if (assignment.status !== AssignmentStatus.EN_ROUTE) {
      throw new BadRequestException(`Expected status ${AssignmentStatus.EN_ROUTE}`);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await this.updateOptimistic(tx, assignmentId, assignment.versionNumber, {
        status: AssignmentStatus.ON_SITE,
      });
      await tx.jobAssignment.update({
        where: { id: assignmentId },
        data: { arrivedAt: new Date() },
      });
      await this.lifecycle.transitionToInProgress(tx, assignment.jobId);
      return updated;
    });

    await this.audit.log({
      action: 'ON_SITE',
      entityType: 'job.job_assignments',
      entityId: assignmentId,
    });

    return result;
  }

  async requestEarlyRelease(
    assignmentId: string,
    guardianId: string,
    reason: string,
  ) {
    const assignment = await this.prisma.jobAssignment.findUnique({
      where: { id: assignmentId },
      include: { job: true },
    });
    if (!assignment || assignment.guardianId !== guardianId) {
      throw new NotFoundException('Assignment not found');
    }
    if (assignment.status !== AssignmentStatus.ON_SITE) {
      throw new BadRequestException('Early release can only be requested while on site');
    }
    if (!assignment.job.billingAllowEarlyRelease) {
      throw new BadRequestException('Early release is not allowed for this job');
    }

    const now = new Date();
    let resolution: EarlyReleaseResolution | null = null;
    let resolvedAt: Date | null = null;
    let autoApproveAt: Date | null = null;

    if (!assignment.job.billingEarlyReleaseRequiresClientApproval) {
      resolution = EarlyReleaseResolution.AUTO_APPROVED;
      resolvedAt = now;
    } else if (assignment.job.billingAutoApproveAfterMinutes) {
      autoApproveAt = new Date(
        now.getTime() + assignment.job.billingAutoApproveAfterMinutes * 60_000,
      );
    }

    try {
      assertAssignmentTransitionAllowed(
        AssignmentStatus.ON_SITE,
        AssignmentStatus.EARLY_RELEASE_REQUESTED,
      );
    } catch {
      throw new BadRequestException('Cannot request early release from current status');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await this.updateOptimistic(tx, assignmentId, assignment.versionNumber, {
        status: AssignmentStatus.EARLY_RELEASE_REQUESTED,
      });
      return tx.jobAssignment.update({
        where: { id: assignmentId },
        data: {
          earlyReleaseRequestedAt: now,
          earlyReleaseReason: reason,
          earlyReleaseResolvedAt: resolvedAt,
          earlyReleaseResolution: resolution,
          earlyReleaseAutoApproveAt: autoApproveAt,
        },
      });
    });

    await this.audit.log({
      action: 'EARLY_RELEASE_REQUESTED',
      entityType: 'job.job_assignments',
      entityId: assignmentId,
      afterState: {
        reason,
        resolution,
        autoApproveAt: autoApproveAt?.toISOString(),
      },
    });

    if (assignment.job.billingEarlyReleaseRequiresClientApproval && !resolution) {
      await this.emails.sendToOrgOwners(
        assignment.job.organizationId,
        EmailTemplateId.ASSIGNMENT_EARLY_RELEASE_REQUESTED,
        {
          jobReference: assignment.job.referenceNumber,
          jobId: assignment.job.id,
          reason,
        },
        { entityType: 'job.job_assignments', entityId: assignmentId },
      );
    }

    return result;
  }

  async approveEarlyRelease(assignmentId: string, actor: AuthUserPayload) {
    const assignment = await this.getAssignmentForClientAction(assignmentId, actor);
    if (assignment.status !== AssignmentStatus.EARLY_RELEASE_REQUESTED) {
      throw new BadRequestException('Assignment is not awaiting early release approval');
    }
    if (assignment.earlyReleaseResolution) {
      return { assignmentId, status: assignment.status, idempotent: true };
    }

    const updated = await this.prisma.jobAssignment.update({
      where: { id: assignmentId },
      data: {
        earlyReleaseResolution: EarlyReleaseResolution.APPROVED,
        earlyReleaseResolvedAt: new Date(),
        earlyReleaseAutoApproveAt: null,
      },
    });

    await this.audit.log({
      actorUserId: actor.sub,
      action: 'EARLY_RELEASE_APPROVED',
      entityType: 'job.job_assignments',
      entityId: assignmentId,
    });

    return updated;
  }

  async rejectEarlyRelease(
    assignmentId: string,
    actor: AuthUserPayload,
    note?: string,
  ) {
    const assignment = await this.getAssignmentForClientAction(assignmentId, actor);
    if (assignment.status !== AssignmentStatus.EARLY_RELEASE_REQUESTED) {
      throw new BadRequestException('Assignment is not awaiting early release approval');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await this.updateOptimistic(tx, assignmentId, assignment.versionNumber, {
        status: AssignmentStatus.ON_SITE,
      });
      return tx.jobAssignment.update({
        where: { id: assignmentId },
        data: {
          earlyReleaseResolution: EarlyReleaseResolution.REJECTED,
          earlyReleaseResolvedAt: new Date(),
          earlyReleaseAutoApproveAt: null,
          earlyReleaseReason: note
            ? `${assignment.earlyReleaseReason ?? ''} | rejected: ${note}`.trim()
            : assignment.earlyReleaseReason,
        },
      });
    });

    await this.audit.log({
      actorUserId: actor.sub,
      action: 'EARLY_RELEASE_REJECTED',
      entityType: 'job.job_assignments',
      entityId: assignmentId,
      afterState: { note },
    });

    return result;
  }

  async autoApproveEarlyRelease(assignmentId: string) {
    const assignment = await this.prisma.jobAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (
      !assignment ||
      assignment.status !== AssignmentStatus.EARLY_RELEASE_REQUESTED ||
      assignment.earlyReleaseResolution
    ) {
      return { assignmentId, skipped: true };
    }

    const updated = await this.prisma.jobAssignment.update({
      where: { id: assignmentId },
      data: {
        earlyReleaseResolution: EarlyReleaseResolution.AUTO_APPROVED,
        earlyReleaseResolvedAt: new Date(),
        earlyReleaseAutoApproveAt: null,
      },
    });

    await this.audit.log({
      action: 'EARLY_RELEASE_AUTO_APPROVED',
      entityType: 'job.job_assignments',
      entityId: assignmentId,
    });

    return updated;
  }

  async complete(assignmentId: string, guardianId: string, actorUserId: string) {
    const assignment = await this.prisma.jobAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment || assignment.guardianId !== guardianId) {
      throw new NotFoundException('Assignment not found');
    }

    const canCompleteFromOnSite = assignment.status === AssignmentStatus.ON_SITE;
    const canCompleteAfterEarlyRelease =
      assignment.status === AssignmentStatus.EARLY_RELEASE_REQUESTED &&
      isEarlyReleaseApproved(assignment.earlyReleaseResolution);

    if (!canCompleteFromOnSite && !canCompleteAfterEarlyRelease) {
      throw new BadRequestException(
        'Complete from on-site, or after early release is approved',
      );
    }

    const fromStatus = assignment.status;
    const result = await this.transition(
      assignmentId,
      guardianId,
      fromStatus,
      AssignmentStatus.COMPLETED,
      'ASSIGNMENT_COMPLETED',
    );
    await this.prisma.jobAssignment.update({
      where: { id: assignmentId },
      data: { completedAt: new Date() },
    });
    await this.lifecycle.completeFromAssignment(result.jobId, actorUserId);
    await this.billing.createDraftInvoiceForJobId(result.jobId, actorUserId);
    await this.shiftState.setAvailable(guardianId);
    return result;
  }

  private async getAssignmentForClientAction(
    assignmentId: string,
    actor: AuthUserPayload,
  ) {
    const assignment = await this.prisma.jobAssignment.findUnique({
      where: { id: assignmentId },
      include: { job: true },
    });
    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }
    await this.policy.assertOrgMember(assignment.job.organizationId, actor);
    return assignment;
  }

  async noShow(assignmentId: string, input: ManualNoShowInput) {
    return this.applyNoShow(assignmentId, {
      reasonCode: input.reasonCode,
      reasonNote: input.reasonNote,
      triggerType: 'MANUAL',
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
    });
  }

  async autoNoShow(
    assignmentId: string,
    reasonCode: NoShowReasonCode,
    reasonNote: string,
  ) {
    return this.applyNoShow(assignmentId, {
      reasonCode,
      reasonNote,
      triggerType: 'SYSTEM',
    });
  }

  private async applyNoShow(
    assignmentId: string,
    input: {
      reasonCode: NoShowReasonCode;
      reasonNote?: string;
      triggerType: NoShowTriggerType;
      actorUserId?: string;
      actorRole?: RoleCode;
    },
  ) {
    const assignment = await this.prisma.jobAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }
    if (assignment.status === AssignmentStatus.NO_SHOW) {
      return { assignmentId, status: AssignmentStatus.NO_SHOW, idempotent: true };
    }
    if (!NO_SHOW_ALLOWED_FROM_STATUSES.has(assignment.status)) {
      throw new BadRequestException(
        `Cannot mark no-show from status ${assignment.status}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await this.updateOptimistic(tx, assignmentId, assignment.versionNumber, {
        status: AssignmentStatus.NO_SHOW,
      });
      await tx.jobAssignment.update({
        where: { id: assignmentId },
        data: {
          noShowReason: input.reasonNote,
          noShowReasonCode: input.reasonCode,
          noShowTriggerType: input.triggerType,
          noShowReportedByUserId: input.actorUserId,
          noShowReportedByRole: input.actorRole,
          noShowAt: new Date(),
        },
      });
      await tx.guardianPerformanceDaily.upsert({
        where: {
          date_guardianId: {
            date: new Date(new Date().toISOString().slice(0, 10)),
            guardianId: assignment.guardianId,
          },
        },
        create: {
          date: new Date(new Date().toISOString().slice(0, 10)),
          guardianId: assignment.guardianId,
          noShowCount: 1,
        },
        update: {
          noShowCount: {
            increment: 1,
          },
        },
      });
      await this.shiftState.setAvailable(assignment.guardianId);
      await this.lifecycle.redispatchAfterNoShowInTransaction(
        tx,
        assignment.jobId,
        input.actorUserId,
        input.reasonCode,
      );
    });

    await this.audit.log({
      action: 'ASSIGNMENT_NO_SHOW',
      entityType: 'job.job_assignments',
      entityId: assignmentId,
      afterState: {
        reasonCode: input.reasonCode,
        reasonNote: input.reasonNote,
        triggerType: input.triggerType,
        actorUserId: input.actorUserId,
        actorRole: input.actorRole,
      },
    });

    return { assignmentId, status: AssignmentStatus.NO_SHOW };
  }

  private async transition(
    assignmentId: string,
    guardianId: string,
    from: AssignmentStatus,
    to: AssignmentStatus,
    auditAction: string,
  ) {
    const assignment = await this.prisma.jobAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment || assignment.guardianId !== guardianId) {
      throw new NotFoundException('Assignment not found');
    }
    if (assignment.status !== from) {
      throw new BadRequestException(`Expected status ${from}`);
    }

    try {
      assertAssignmentTransitionAllowed(from, to);
    } catch {
      throw new BadRequestException(`Cannot transition assignment from ${from} to ${to}`);
    }

    const updated = await this.prisma.$transaction((tx) =>
      this.updateOptimistic(tx, assignmentId, assignment.versionNumber, { status: to }),
    );

    await this.audit.log({
      action: auditAction,
      entityType: 'job.job_assignments',
      entityId: assignmentId,
      beforeState: { status: from },
      afterState: { status: to },
    });

    return updated;
  }

  private async updateOptimistic(
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
}
