import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignmentStatus,
  EarlyReleaseResolution,
  JobStatus,
  Prisma,
  ReplacementResolution,
  RoleCode,
  ShiftStatus,
} from '@prisma/client';
import { AuthUserPayload } from '../auth/interfaces/auth-user.interface';
import { BillingService } from '../billing/billing.service';
import { AuditService } from '../common/services/audit.service';
import { ResourceOwnerPolicy } from '../common/policies/resource-owner.policy';
import { ShiftStateService } from '../guardians/shift-state.service';
import { GuardianPayPolicyService } from '../guardian-payroll/guardian-pay-policy.service';
import { DispatchingService } from '../dispatching/dispatching.service';
import { EmailNotificationService } from '../notifications/email-notification.service';
import { EmailTemplateId } from '../notifications/email-template.ids';
import { InAppNotificationAction } from '../notifications/in-app-notification.actions';
import { NotificationsService } from '../notifications/notifications.service';
import { isEarlyReleaseApproved } from './early-release.util';
import { JobLifecycleService } from '../jobs/job-lifecycle.service';
import { OutboxService } from '../outbox/outbox.service';
import { DISPATCH_WINDOW_MS } from '../queue/queue.constants';
import { QueueService } from '../queue/queue.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  cancelCompetingOffersInTransaction,
  releaseCompetingOffers,
} from './competing-offer-release.util';
import { assertAssignmentTransitionAllowed } from './assignment-transitions';
import { NoShowReasonCode } from './dto/no-show.dto';
import { assertSeekingReplacementState } from './replacement-invariants';

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
    private readonly notifications: NotificationsService,
    @Inject(forwardRef(() => DispatchingService))
    private readonly dispatching: DispatchingService,
    private readonly payPolicy: GuardianPayPolicyService,
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
            AssignmentStatus.REPLACEMENT_REQUESTED,
            AssignmentStatus.AWAITING_RELIEF,
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

      const guardian = await tx.guardian.findUnique({
        where: { id: guardianId },
        select: { employmentType: true, hourlyPayRate: true },
      });
      if (!guardian) {
        throw new NotFoundException('Guardian not found');
      }

      const resolvedPayPolicy = await this.payPolicy.resolvePayPolicy(
        assignment.job.jobType,
        guardian.employmentType,
        assignment.job.scheduledStart,
      );

      const updated = await this.updateOptimistic(tx, assignmentId, assignment.versionNumber, {
        status: AssignmentStatus.ACCEPTED,
        acceptedAt: new Date(),
        payPolicyModel: resolvedPayPolicy.model,
        payMinimumHours: resolvedPayPolicy.minimumHours,
        payPolicyResolvedAt: new Date(),
        hourlyPayRateAtCommit: guardian.hourlyPayRate,
        payApplyOnEarlyRelease: resolvedPayPolicy.applyOnEarlyRelease,
      });

      await tx.guardianShiftState.update({
        where: { guardianId },
        data: { shiftStatus: ShiftStatus.BUSY, availableForJobs: false },
      });

      if (assignment.job.status !== JobStatus.SEEKING_REPLACEMENT) {
        await this.lifecycle.transitionToAssigned(tx, assignment.jobId);
      }

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
      include: { job: true },
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

    const isReplacement =
      assignment.job.status === JobStatus.SEEKING_REPLACEMENT;
    if (!isReplacement || !this.dispatching.isReplacementDispatchPaused(assignment.job)) {
      await this.outbox.enqueue({
        aggregateType: 'job',
        aggregateId: assignment.jobId,
        eventType: 'JOB_DISPATCH_REQUESTED',
        payload: { jobId: assignment.jobId, replacement: isReplacement },
      });
    }

    return { assignmentId, status: AssignmentStatus.DECLINED };
  }

  async enRoute(assignmentId: string, guardianId: string) {
    return this.transition(assignmentId, guardianId, AssignmentStatus.ACCEPTED, AssignmentStatus.EN_ROUTE, 'EN_ROUTE');
  }

  async onSite(assignmentId: string, guardianId: string) {
    const assignment = await this.prisma.jobAssignment.findUnique({
      where: { id: assignmentId },
      include: { job: true },
    });
    if (!assignment || assignment.guardianId !== guardianId) {
      throw new NotFoundException('Assignment not found');
    }
    if (assignment.status !== AssignmentStatus.EN_ROUTE) {
      throw new BadRequestException(`Expected status ${AssignmentStatus.EN_ROUTE}`);
    }

    if (
      assignment.replacesAssignmentId &&
      assignment.job.status === JobStatus.SEEKING_REPLACEMENT
    ) {
      return this.executeReplacementHandoff(assignmentId, assignment);
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
    if (
      assignment.status === AssignmentStatus.REPLACEMENT_REQUESTED ||
      assignment.status === AssignmentStatus.AWAITING_RELIEF
    ) {
      throw new BadRequestException('Cannot request early release during replacement workflow');
    }
    if (assignment.status !== AssignmentStatus.ON_SITE) {
      throw new BadRequestException('Early release can only be requested while on site');
    }
    if (assignment.replacementRequestedAt && !assignment.replacementResolution) {
      throw new BadRequestException('Cannot request early release while replacement is pending');
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
      await this.notifications.notifyOrgOwnersInApp(
        assignment.job.organizationId,
        'Early release requested',
        `Job ${assignment.job.referenceNumber}: ${reason}`,
        {
          assignmentId,
          jobId: assignment.job.id,
          action: InAppNotificationAction.REVIEW_EARLY_RELEASE,
        },
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

    await this.notifications.notifyGuardianInApp(
      assignment.guardianId,
      'Early release approved',
      `Your early release request for job ${assignment.job.referenceNumber} was approved.`,
      { assignmentId, jobId: assignment.job.id },
    );

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

    await this.notifications.notifyGuardianInApp(
      assignment.guardianId,
      'Early release denied',
      note ??
        `Your early release request for job ${assignment.job.referenceNumber} was denied.`,
      { assignmentId, jobId: assignment.job.id },
    );

    return result;
  }

  async autoApproveEarlyRelease(assignmentId: string) {
    const assignment = await this.prisma.jobAssignment.findUnique({
      where: { id: assignmentId },
      include: { job: { select: { id: true, referenceNumber: true } } },
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

    await this.notifications.notifyGuardianInApp(
      assignment.guardianId,
      'Early release approved',
      `Your early release request for job ${assignment.job.referenceNumber} was auto-approved.`,
      { assignmentId, jobId: assignment.job.id },
    );

    return updated;
  }

  async requestReplacement(
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
      throw new BadRequestException('Replacement can only be requested while on site');
    }
    if (assignment.job.status === JobStatus.SEEKING_REPLACEMENT) {
      throw new BadRequestException('Replacement dispatch is already in progress for this job');
    }
    if (assignment.job.status !== JobStatus.IN_PROGRESS) {
      throw new BadRequestException('Replacement can only be requested for in-progress jobs');
    }

    try {
      assertAssignmentTransitionAllowed(
        AssignmentStatus.ON_SITE,
        AssignmentStatus.REPLACEMENT_REQUESTED,
      );
    } catch {
      throw new BadRequestException('Cannot request replacement from current status');
    }

    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      await this.updateOptimistic(tx, assignmentId, assignment.versionNumber, {
        status: AssignmentStatus.REPLACEMENT_REQUESTED,
      });
      return tx.jobAssignment.update({
        where: { id: assignmentId },
        data: {
          replacementRequestedAt: now,
          replacementReason: reason,
          replacementResolvedAt: null,
          replacementResolution: null,
          replacementResolvedByUserId: null,
        },
      });
    });

    await this.audit.log({
      action: 'REPLACEMENT_REQUESTED',
      entityType: 'job.job_assignments',
      entityId: assignmentId,
      afterState: { reason },
    });

    await this.emails.sendToOpsAdmins(
      EmailTemplateId.ASSIGNMENT_REPLACEMENT_REQUESTED,
      {
        jobReference: assignment.job.referenceNumber,
        jobId: assignment.job.id,
        reason,
        assignmentId,
      },
      { entityType: 'job.job_assignments', entityId: assignmentId },
    );

    await this.notifications.notifyOpsAdminsInApp(
      'Replacement requested',
      `Job ${assignment.job.referenceNumber}: ${reason}`,
      {
        assignmentId,
        jobId: assignment.job.id,
        action: InAppNotificationAction.REVIEW_REPLACEMENT,
      },
    );

    return result;
  }

  async listReplacementRequests() {
    return this.prisma.jobAssignment.findMany({
      where: { status: AssignmentStatus.REPLACEMENT_REQUESTED },
      include: {
        job: { include: { organization: true, location: true } },
        guardian: { include: { user: { select: { fullName: true, email: true } } } },
      },
      orderBy: { replacementRequestedAt: 'asc' },
    });
  }

  async denyReplacement(assignmentId: string, actorUserId: string, note?: string) {
    const assignment = await this.prisma.jobAssignment.findUnique({
      where: { id: assignmentId },
      include: { job: true, guardian: true },
    });
    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }
    if (assignment.status !== AssignmentStatus.REPLACEMENT_REQUESTED) {
      throw new BadRequestException('Assignment is not awaiting replacement approval');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await this.updateOptimistic(tx, assignmentId, assignment.versionNumber, {
        status: AssignmentStatus.ON_SITE,
      });
      return tx.jobAssignment.update({
        where: { id: assignmentId },
        data: {
          replacementResolution: ReplacementResolution.DENIED,
          replacementResolvedAt: new Date(),
          replacementResolvedByUserId: actorUserId,
          replacementReason: note
            ? `${assignment.replacementReason ?? ''} | denied: ${note}`.trim()
            : assignment.replacementReason,
        },
      });
    });

    await this.audit.log({
      actorUserId,
      action: 'REPLACEMENT_DENIED',
      entityType: 'job.job_assignments',
      entityId: assignmentId,
      afterState: { note },
    });

    await this.notifications.notifyGuardianInApp(
      assignment.guardianId,
      'Replacement denied',
      note ?? `Your replacement request for job ${assignment.job.referenceNumber} was denied.`,
      { assignmentId, jobId: assignment.job.id },
    );

    return result;
  }

  async approveReplacement(assignmentId: string, actorUserId: string) {
    const assignment = await this.prisma.jobAssignment.findUnique({
      where: { id: assignmentId },
      include: { job: true },
    });
    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }
    if (assignment.status !== AssignmentStatus.REPLACEMENT_REQUESTED) {
      throw new BadRequestException('Assignment is not awaiting replacement approval');
    }
    if (assignment.job.status !== JobStatus.IN_PROGRESS) {
      throw new BadRequestException('Job must be in progress to approve replacement');
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await this.updateOptimistic(tx, assignmentId, assignment.versionNumber, {
        status: AssignmentStatus.AWAITING_RELIEF,
      });
      await tx.jobAssignment.update({
        where: { id: assignmentId },
        data: {
          replacementResolution: ReplacementResolution.APPROVED,
          replacementResolvedAt: now,
          replacementResolvedByUserId: actorUserId,
        },
      });
      await this.lifecycle.transitionToSeekingReplacement(tx, assignment.jobId, actorUserId);
      await tx.job.update({
        where: { id: assignment.jobId },
        data: {
          replacementDepartingAssignmentId: assignmentId,
          dispatchDeadlineAt: new Date(Date.now() + 600_000),
          dispatchStartedAt: now,
          dispatchFailureReason: null,
          unreachableSince: null,
        },
      });
    });

    await this.audit.log({
      actorUserId,
      action: 'REPLACEMENT_APPROVED',
      entityType: 'job.job_assignments',
      entityId: assignmentId,
    });

    const approved = await this.prisma.jobAssignment.findUnique({
      where: { id: assignmentId },
    });
    assertSeekingReplacementState(approved, null);

    await this.dispatching.requestReplacementDispatch(assignment.jobId);

    await this.notifications.notifyGuardianInApp(
      assignment.guardianId,
      'Replacement approved',
      `Stay on site for job ${assignment.job.referenceNumber} until your replacement arrives.`,
      { assignmentId, jobId: assignment.job.id },
    );

    return { assignmentId, jobId: assignment.jobId, status: JobStatus.SEEKING_REPLACEMENT };
  }

  private async executeReplacementHandoff(
    substituteAssignmentId: string,
    substituteAssignment: {
      id: string;
      jobId: string;
      guardianId: string;
      status: AssignmentStatus;
      versionNumber: number;
      replacesAssignmentId: string | null;
      job: {
        id: string;
        organizationId: string;
        referenceNumber: string;
        status: JobStatus;
        replacementDepartingAssignmentId: string | null;
      };
    },
  ) {
    const originalId =
      substituteAssignment.replacesAssignmentId ??
      substituteAssignment.job.replacementDepartingAssignmentId;
    if (!originalId) {
      throw new BadRequestException('Replacement handoff is missing departing assignment');
    }

    const original = await this.prisma.jobAssignment.findUnique({
      where: { id: originalId },
      include: { guardian: { include: { user: { select: { fullName: true } } } } },
    });
    if (
      !original ||
      original.status !== AssignmentStatus.AWAITING_RELIEF ||
      original.replacementResolution !== ReplacementResolution.APPROVED
    ) {
      throw new BadRequestException('Original assignment is not ready for handoff');
    }

    assertSeekingReplacementState(original, substituteAssignment);

    const handoffAt = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      await this.updateOptimistic(tx, original.id, original.versionNumber, {
        status: AssignmentStatus.COMPLETED,
      });
      await tx.jobAssignment.update({
        where: { id: original.id },
        data: { completedAt: handoffAt },
      });

      const updated = await this.updateOptimistic(
        tx,
        substituteAssignmentId,
        substituteAssignment.versionNumber,
        { status: AssignmentStatus.ON_SITE },
      );
      await tx.jobAssignment.update({
        where: { id: substituteAssignmentId },
        data: { arrivedAt: handoffAt },
      });

      await this.lifecycle.transitionFromSeekingReplacementToInProgress(
        tx,
        substituteAssignment.jobId,
      );
      await tx.job.update({
        where: { id: substituteAssignment.jobId },
        data: {
          replacementDepartingAssignmentId: null,
          dispatchFailureReason: null,
        },
      });

      await tx.guardianShiftState.update({
        where: { guardianId: original.guardianId },
        data: { shiftStatus: ShiftStatus.AVAILABLE, availableForJobs: true },
      });

      return updated;
    });

    await this.audit.log({
      action: 'REPLACEMENT_HANDOFF_COMPLETED',
      entityType: 'job.job_assignments',
      entityId: substituteAssignmentId,
      afterState: {
        originalAssignmentId: original.id,
        substituteAssignmentId,
      },
    });

    const subGuardian = await this.prisma.guardian.findUnique({
      where: { id: substituteAssignment.guardianId },
      include: { user: { select: { fullName: true } } },
    });

    await this.emails.sendToOrgOwners(
      substituteAssignment.job.organizationId,
      EmailTemplateId.ASSIGNMENT_REPLACEMENT_COMPLETED,
      {
        jobReference: substituteAssignment.job.referenceNumber,
        jobId: substituteAssignment.job.id,
        guardianName:
          subGuardian?.user.fullName ?? subGuardian?.guardianCode ?? 'Replacement officer',
      },
      { entityType: 'job.job_assignments', entityId: substituteAssignmentId },
    );

    await this.notifications.notifyOrgOwnersInApp(
      substituteAssignment.job.organizationId,
      'Officer replaced',
      `A replacement officer is now on site for job ${substituteAssignment.job.referenceNumber}.`,
      { jobId: substituteAssignment.job.id, assignmentId: substituteAssignmentId },
    );

    return result;
  }

  async complete(assignmentId: string, guardianId: string, actorUserId: string) {
    const assignment = await this.prisma.jobAssignment.findUnique({
      where: { id: assignmentId },
      include: { job: true },
    });
    if (!assignment || assignment.guardianId !== guardianId) {
      throw new NotFoundException('Assignment not found');
    }
    if (assignment.status === AssignmentStatus.AWAITING_RELIEF) {
      throw new BadRequestException('Remain on site until the replacement officer arrives');
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
      payPolicyModel?: Prisma.JobAssignmentUpdateInput['payPolicyModel'];
      payMinimumHours?: Prisma.Decimal;
      payPolicyResolvedAt?: Date;
      hourlyPayRateAtCommit?: Prisma.Decimal | null;
      payApplyOnEarlyRelease?: boolean;
    },
  ) {
    const result = await tx.jobAssignment.updateMany({
      where: { id, versionNumber },
      data: {
        status: data.status,
        acceptedAt: data.acceptedAt,
        payPolicyModel: data.payPolicyModel,
        payMinimumHours: data.payMinimumHours,
        payPolicyResolvedAt: data.payPolicyResolvedAt,
        hourlyPayRateAtCommit: data.hourlyPayRateAtCommit,
        payApplyOnEarlyRelease: data.payApplyOnEarlyRelease,
        versionNumber: { increment: 1 },
      },
    });
    if (result.count === 0) {
      throw new ConflictException('Assignment was modified concurrently');
    }
    return tx.jobAssignment.findUniqueOrThrow({ where: { id } });
  }
}
