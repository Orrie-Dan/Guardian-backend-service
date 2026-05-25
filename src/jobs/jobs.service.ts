import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JobStatus, RoleCode } from '@prisma/client';
import { AuthUserPayload } from '../auth/interfaces/auth-user.interface';
import { AuditService } from '../common/services/audit.service';
import {
  buildPaginatedMeta,
  paginationSkipTake,
} from '../common/dto/pagination-query.dto';
import { OrganizationVerificationPolicy } from '../common/policies/organization-verification.policy';
import { PrimaryLocationSetupPolicy } from '../common/policies/primary-location-setup.policy';
import { ResourceOwnerPolicy } from '../common/policies/resource-owner.policy';
import { DispatchingService } from '../dispatching/dispatching.service';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { CreateJobDto } from './dto/create-job.dto';
import { ListJobsQueryDto } from './dto/list-jobs-query.dto';
import { JobReferenceService } from './job-reference.service';

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
  ) {}

  async create(dto: CreateJobDto, actor: AuthUserPayload, autoDispatch = true) {
    await this.policy.assertOrgMember(dto.organizationId, actor);
    if (!this.policy.isOps(actor)) {
      await this.locationSetup.assertCanBookJobs(dto.organizationId);
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

    const job = await this.prisma.$transaction(async (tx) => {
      const created = await tx.job.create({
        data: {
          referenceNumber,
          organizationId: dto.organizationId,
          locationId: dto.locationId,
          createdBy: actor.sub,
          jobType: dto.jobType,
          priority: dto.priority,
          scheduledStart: new Date(dto.scheduledStart),
          scheduledEnd: new Date(dto.scheduledEnd),
          notes: dto.notes,
          specialInstructions: dto.specialInstructions,
          requestedGuardianCount: dto.requestedGuardianCount ?? 1,
          status: JobStatus.PENDING,
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
        include: { location: true },
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
    return this.prisma.job.findUnique({
      where: { id: job.id },
      include: {
        location: true,
        assignments: {
          include: { guardian: { include: { user: true } } },
          orderBy: { offerSentAt: 'desc' },
        },
        statusHistory: { orderBy: { changedAt: 'desc' }, take: 20 },
      },
    });
  }

  async timeline(id: string, actor: AuthUserPayload) {
    await this.policy.assertJobAccess(id, actor);
    return this.prisma.jobStatusHistory.findMany({
      where: { jobId: id },
      orderBy: { changedAt: 'desc' },
    });
  }

  async cancel(id: string, actor: AuthUserPayload, reason?: string) {
    const job = await this.policy.assertJobAccess(id, actor);
    if (!this.policy.isOps(actor)) {
      await this.orgVerification.assertOrgVerifiedForMutations(job.organizationId);
    }
    if (
      job.status === JobStatus.COMPLETED ||
      job.status === JobStatus.CANCELLED
    ) {
      throw new BadRequestException('Job cannot be cancelled');
    }

    await this.dispatching.releaseInFlightOffersForJob(id);

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
    return this.prisma.invoice.findUnique({
      where: { jobId },
      include: { payments: true, ebmReceipt: true },
    });
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
