import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JobStatus, RoleCode } from '@prisma/client';
import { BillingCalculationService } from '../billing/billing-calculation.service';
import { toClientInvoiceDetail } from '../billing/invoice-detail.presenter';
import { InvoiceViewService } from '../billing/invoice-view.service';
import { AuthUserPayload } from '../auth/interfaces/auth-user.interface';
import { AuditService } from '../common/services/audit.service';
import {
  buildPaginatedMeta,
  paginationSkipTake,
} from '../common/dto/pagination-query.dto';
import {
  estimateEtaMinutes,
  haversineDistanceMeters,
  parseCoordinate,
} from '../common/geo.util';
import { OrganizationVerificationPolicy } from '../common/policies/organization-verification.policy';
import { PrimaryLocationSetupPolicy } from '../common/policies/primary-location-setup.policy';
import { ResourceOwnerPolicy } from '../common/policies/resource-owner.policy';
import { DispatchingService } from '../dispatching/dispatching.service';
import { DISPATCH_WINDOW_MS } from '../queue/queue.constants';
import { GuardianLocationService } from '../guardians/guardian-location.service';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { CreateJobDto } from './dto/create-job.dto';
import { ListJobsQueryDto } from './dto/list-jobs-query.dto';
import { JobReferenceService } from './job-reference.service';
import { InAppNotificationAction } from '../notifications/in-app-notification.actions';
import { EmailNotificationService } from '../notifications/email-notification.service';
import { EmailTemplateId } from '../notifications/email-template.ids';
import { NotificationsService } from '../notifications/notifications.service';
import {
  JobTrackingAssignment,
  JobTrackingResponse,
  TRACKABLE_ASSIGNMENT_STATUSES,
} from './job-tracking.types';
import { JobStaffingPresenterService } from './job-staffing-presenter.service';
import { STAFFED_ASSIGNMENT_STATUSES } from './job-staffing.util';
import { ServicesService } from '../services/services.service';
import { BookingSettingsService } from '../services/booking-settings.service';

const jobWithLocationAndOrganization = {
  location: true,
  organization: true,
} as const;

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly references: JobReferenceService,
    private readonly outbox: OutboxService,
    private readonly policy: ResourceOwnerPolicy,
    private readonly orgVerification: OrganizationVerificationPolicy,
    private readonly locationSetup: PrimaryLocationSetupPolicy,
    private readonly audit: AuditService,
    private readonly dispatching: DispatchingService,
    private readonly emails: EmailNotificationService,
    private readonly notifications: NotificationsService,
    private readonly guardianLocation: GuardianLocationService,
    private readonly billingCalculation: BillingCalculationService,
    private readonly invoiceView: InvoiceViewService,
    private readonly staffingPresenter: JobStaffingPresenterService,
    private readonly servicesCatalog: ServicesService,
    private readonly bookingSettings: BookingSettingsService,
  ) {}

  async create(dto: CreateJobDto, actor: AuthUserPayload, autoDispatch = true) {
    await this.policy.assertOrgMember(dto.organizationId, actor);
    if (!this.policy.isOps(actor)) {
      await this.locationSetup.assertCanBookJobs(dto.organizationId);
    }

    await this.servicesCatalog.getByCode(dto.jobType);

    const scheduledStart = new Date(dto.scheduledStart);
    const scheduledEnd = new Date(dto.scheduledEnd);
    const bookingPolicy = await this.bookingSettings.getPolicy();
    const durationHours =
      (scheduledEnd.getTime() - scheduledStart.getTime()) / (1000 * 60 * 60);
    if (durationHours < bookingPolicy.minimumBookingHours) {
      throw new BadRequestException(
        `Minimum booking is ${bookingPolicy.minimumBookingHours} hour(s)`,
      );
    }

    const location = await this.prisma.location.findFirst({
      where: {
        id: dto.locationId,
        organizationId: dto.organizationId,
      },
    });
    if (!location) {
      throw new NotFoundException('Location not found for organization');
    }

    const referenceNumber = await this.references.nextReference();
    const billingPolicy = await this.billingCalculation.resolveBillingPolicy(
      dto.organizationId,
      dto.jobType,
      scheduledStart,
    );

    const job = await this.prisma.$transaction(async (tx) => {
      const created = await tx.job.create({
        data: {
          referenceNumber,
          organizationId: dto.organizationId,
          locationId: dto.locationId,
          createdBy: actor.sub,
          jobType: dto.jobType,
          priority: dto.priority,
          scheduledStart,
          scheduledEnd,
          notes: dto.notes,
          specialInstructions: dto.specialInstructions,
          requestedGuardianCount: dto.requestedGuardianCount ?? 1,
          status: JobStatus.PENDING,
          billingPolicyModel: billingPolicy.model,
          billingMinimumHours: billingPolicy.minimumHours,
          billingPolicyResolvedAt: new Date(),
          billingAllowEarlyRelease: billingPolicy.allowEarlyRelease,
          billingProrationEnabled: billingPolicy.prorationEnabled,
          billingEarlyReleaseRequiresClientApproval:
            billingPolicy.earlyReleaseRequiresClientApproval,
          billingAutoApproveAfterMinutes: billingPolicy.autoApproveAfterMinutes,
          dispatchDeadlineAt: autoDispatch
            ? new Date(Date.now() + DISPATCH_WINDOW_MS)
            : undefined,
          dispatchStartedAt: autoDispatch ? new Date() : undefined,
        },
      });

      await tx.jobStatusHistory.create({
        data: {
          jobId: created.id,
          oldStatus: null,
          newStatus: JobStatus.PENDING,
          changedBy: actor.sub,
        },
      });

      if (autoDispatch) {
        await this.outbox.enqueueInTransaction(tx, {
          aggregateType: 'job',
          aggregateId: created.id,
          eventType: 'JOB_DISPATCH_REQUESTED',
          payload: { jobId: created.id },
        });
      }

      return created;
    });

    await this.audit.log({
      actorUserId: actor.sub,
      action: 'JOB_CREATED',
      entityType: 'job.jobs',
      entityId: job.id,
    });

    await this.emails.sendToOrgOwners(
      dto.organizationId,
      EmailTemplateId.JOB_CREATED,
      { jobReference: job.referenceNumber, jobId: job.id },
      { entityType: 'job.jobs', entityId: job.id },
    );
    await this.notifications.notifyOrgOwnersInApp(
      dto.organizationId,
      'Job created',
      `Job ${job.referenceNumber} has been created.`,
      { jobId: job.id, action: InAppNotificationAction.VIEW_JOB },
    );

    return job;
  }

  async list(query: ListJobsQueryDto, actor: AuthUserPayload) {
    const { skip, take } = paginationSkipTake(query);
    const where: Record<string, unknown> = {};

    if (query.status) {
      where.status = query.status;
    }

    if (this.policy.isOps(actor)) {
      if (query.organizationId) {
        where.organizationId = query.organizationId;
      }
    } else if (actor.guardianId && actor.roles.includes(RoleCode.GUARDIAN)) {
      where.assignments = { some: { guardianId: actor.guardianId } };
    } else {
      const orgId = query.organizationId ?? actor.activeOrgId ?? actor.orgId;
      if (!orgId) {
        throw new ForbiddenException('Organization context required');
      }
      await this.policy.assertOrgMember(orgId, actor);
      where.organizationId = orgId;
    }

    const [items, total] = await Promise.all([
      this.prisma.job.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: query.order },
        include: jobWithLocationAndOrganization,
      }),
      this.prisma.job.count({ where }),
    ]);

    return {
      items,
      meta: buildPaginatedMeta(query.page, query.limit, total),
    };
  }

  async findOne(id: string, actor: AuthUserPayload) {
    const job = await this.policy.assertJobAccess(id, actor);
    const record = await this.prisma.job.findUnique({
      where: { id: job.id },
      include: {
        ...jobWithLocationAndOrganization,
        assignments: {
          include: { guardian: { include: { user: true } } },
          orderBy: { offerSentAt: 'desc' },
        },
        statusHistory: { orderBy: { changedAt: 'desc' }, take: 20 },
      },
    });
    if (!record) {
      throw new NotFoundException('Job not found');
    }
    const staffing = await this.staffingPresenter.buildStaffingProgress(
      this.prisma,
      record.id,
      record.requestedGuardianCount,
    );
    const assignedGuardians = record.assignments
      .filter((a) => a.replacesAssignmentId === null)
      .filter((a) => STAFFED_ASSIGNMENT_STATUSES.includes(a.status))
      .map((a) => ({
        assignmentId: a.id,
        guardianId: a.guardianId,
        status: a.status,
        displayName:
          a.guardian.user.fullName?.trim() || a.guardian.user.phoneNumber || null,
        acceptedAt: a.acceptedAt?.toISOString() ?? null,
      }));

    return {
      ...record,
      staffing,
      assignedGuardians,
      assignmentProgress: {
        filled: staffing.acceptedGuardianCount,
        requested: staffing.requestedGuardianCount,
        remaining: staffing.remainingGuardianSlots,
        isFullyStaffed: staffing.isFullyStaffed,
      },
    };
  }

  async timeline(id: string, actor: AuthUserPayload) {
    await this.policy.assertJobAccess(id, actor);
    return this.prisma.jobStatusHistory.findMany({
      where: { jobId: id },
      orderBy: { changedAt: 'desc' },
    });
  }

  async getTracking(jobId: string, actor: AuthUserPayload): Promise<JobTrackingResponse> {
    await this.policy.assertJobAccess(jobId, actor);

    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: {
        location: true,
        assignments: {
          where: {
            replacesAssignmentId: null,
            status: { in: TRACKABLE_ASSIGNMENT_STATUSES },
          },
          orderBy: { acceptedAt: 'asc' },
          include: {
            guardian: {
              include: {
                user: {
                  select: {
                    fullName: true,
                    phoneNumber: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const staffing = await this.staffingPresenter.buildStaffingProgress(
      this.prisma,
      job.id,
      job.requestedGuardianCount,
    );

    if (!job.assignments.length) {
      throw new BadRequestException(
        'Live tracking is only available after a guardian accepts the job',
      );
    }

    const destLat = job.location.latitude.toString();
    const destLng = job.location.longitude.toString();
    const siteLat = parseCoordinate(destLat);
    const siteLng = parseCoordinate(destLng);

    const assignedGuardians: JobTrackingAssignment[] = [];
    for (const assignment of job.assignments) {
      const location = await this.guardianLocation.getCurrent(assignment.guardianId);
      const guardianLat = parseCoordinate(location.latitude);
      const guardianLng = parseCoordinate(location.longitude);

      let distanceMeters: number | null = null;
      let etaMinutes: number | null = null;
      if (
        guardianLat != null &&
        guardianLng != null &&
        siteLat != null &&
        siteLng != null
      ) {
        distanceMeters = Math.round(
          haversineDistanceMeters(guardianLat, guardianLng, siteLat, siteLng),
        );
        etaMinutes = estimateEtaMinutes(distanceMeters, location.speed);
      }

      const user = assignment.guardian.user;
      const displayName = user.fullName?.trim() || user.phoneNumber || null;
      assignedGuardians.push({
        id: assignment.id,
        status: assignment.status,
        acceptedAt: assignment.acceptedAt?.toISOString() ?? null,
        arrivedAt: assignment.arrivedAt?.toISOString() ?? null,
        guardian: {
          id: assignment.guardianId,
          displayName,
        },
        location,
        distanceMeters,
        etaMinutes,
      });
    }

    const primary = assignedGuardians[0];

    return {
      jobId: job.id,
      jobStatus: job.status,
      staffing,
      assignment: {
        id: primary.id,
        status: primary.status,
        acceptedAt: primary.acceptedAt,
        arrivedAt: primary.arrivedAt,
      },
      guardian: primary.guardian,
      location: primary.location,
      destination: {
        locationId: job.location.id,
        name: job.location.name,
        address: job.location.address,
        latitude: destLat,
        longitude: destLng,
      },
      distanceMeters: primary.distanceMeters,
      etaMinutes: primary.etaMinutes,
      assignedGuardians,
    };
  }

  async cancel(id: string, actor: AuthUserPayload, reason?: string) {
    const job = await this.policy.assertJobAccess(id, actor);
    if (!this.policy.isOps(actor)) {
      await this.orgVerification.assertOrgVerifiedForMutations(job.organizationId);
    }
    if (
      job.status === JobStatus.COMPLETED ||
      job.status === JobStatus.CANCELLED ||
      job.status === JobStatus.AWAITING_CONFIRMATION
    ) {
      throw new BadRequestException('Job cannot be cancelled');
    }

    await this.dispatching.releaseReplacementPipelineForJob(id);
    await this.dispatching.releaseActiveStaffedAssignmentsForJob(id);

    await this.prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { id },
        data: { status: JobStatus.CANCELLED },
      });
      await tx.jobStatusHistory.create({
        data: {
          jobId: id,
          oldStatus: job.status,
          newStatus: JobStatus.CANCELLED,
          changedBy: actor.sub,
          reason,
        },
      });
    });

    await this.audit.log({
      actorUserId: actor.sub,
      action: 'JOB_CANCELLED',
      entityType: 'job.jobs',
      entityId: id,
      afterState: { reason },
    });

    await this.emails.sendToOrgOwners(
      job.organizationId,
      EmailTemplateId.JOB_CANCELLED,
      {
        jobReference: job.referenceNumber,
        jobId: id,
        reason: reason ?? undefined,
      },
      { entityType: 'job.jobs', entityId: id },
    );
    await this.notifications.notifyOrgOwnersInApp(
      job.organizationId,
      'Job cancelled',
      reason
        ? `Job ${job.referenceNumber} was cancelled: ${reason}`
        : `Job ${job.referenceNumber} was cancelled.`,
      { jobId: id, action: InAppNotificationAction.VIEW_JOB },
    );

    return { id, status: JobStatus.CANCELLED };
  }

  async dispatch(jobId: string, actor?: AuthUserPayload) {
    if (actor && !this.policy.isOps(actor)) {
      const job = await this.policy.assertJobAccess(jobId, actor);
      await this.orgVerification.assertOrgVerifiedForMutations(job.organizationId);
    }
    return this.dispatching.requestDispatch(jobId);
  }

  complete(jobId: string, actorUserId: string) {
    return this.dispatching.completeJob(jobId, actorUserId);
  }

  async getInvoice(jobId: string, actor: AuthUserPayload) {
    await this.policy.assertJobAccess(jobId, actor);
    const invoice = await this.prisma.invoice.findUnique({
      where: { jobId },
      include: { payments: true, ebmReceipt: true, job: true },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found for job');
    }
    const viewed = await this.invoiceView.applyPendingConfirmationOnView(
      invoice,
      actor.sub,
    );
    return toClientInvoiceDetail(viewed);
  }

  async createIncident(jobId: string, dto: CreateIncidentDto, actor: AuthUserPayload) {
    const job = await this.policy.assertJobAccess(jobId, actor);
    const assignment = await this.prisma.jobAssignment.findUnique({
      where: { id: dto.assignmentId },
    });
    if (!assignment || assignment.jobId !== job.id) {
      throw new NotFoundException('Assignment not found for job');
    }
    if (actor.guardianId && assignment.guardianId !== actor.guardianId) {
      throw new ForbiddenException();
    }

    const incident = await this.prisma.fieldIncident.create({
      data: {
        assignmentId: dto.assignmentId,
        incidentType: dto.incidentType,
        severity: dto.severity,
        description: dto.description,
        mediaIds: dto.mediaIds ?? [],
        createdBy: actor.sub,
      },
    });

    await this.audit.log({
      actorUserId: actor.sub,
      action: 'INCIDENT_REPORTED',
      entityType: 'job.field_incidents',
      entityId: incident.id,
    });

    return incident;
  }

  async listIncidents(jobId: string, actor: AuthUserPayload) {
    await this.policy.assertJobAccess(jobId, actor);
    return this.prisma.fieldIncident.findMany({
      where: { assignment: { jobId } },
      include: { assignment: true, reporter: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
