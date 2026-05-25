import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
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
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly shiftState: ShiftStateService,
    private readonly outbox: OutboxService,
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

      await tx.jobStatusHistory.create({
        data: {
          jobId: assignment.jobId,
          oldStatus: assignment.job.status,
          newStatus: JobStatus.ASSIGNED,
          changedBy: null,
        },
      });
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
    const result = await this.transition(
      assignmentId,
      guardianId,
      AssignmentStatus.EN_ROUTE,
      AssignmentStatus.ON_SITE,
      'ON_SITE',
    );
    await this.prisma.jobAssignment.update({
      where: { id: assignmentId },
      data: { arrivedAt: new Date() },
    });
    const assignment = await this.prisma.jobAssignment.findUnique({
      where: { id: assignmentId },
      include: { job: true },
    });
    if (assignment && assignment.job.status === JobStatus.ASSIGNED) {
      await this.prisma.$transaction(async (tx) => {
        await tx.job.update({
          where: { id: assignment.jobId },
          data: { status: JobStatus.IN_PROGRESS },
        });
        await tx.jobStatusHistory.create({
          data: {
            jobId: assignment.jobId,
            oldStatus: JobStatus.ASSIGNED,
            newStatus: JobStatus.IN_PROGRESS,
          },
        });
      });
    }
    return result;
  }

  async complete(assignmentId: string, guardianId: string) {
    const result = await this.transition(
      assignmentId,
      guardianId,
      AssignmentStatus.ON_SITE,
      AssignmentStatus.COMPLETED,
      'ASSIGNMENT_COMPLETED',
    );
    await this.prisma.jobAssignment.update({
      where: { id: assignmentId },
      data: { completedAt: new Date() },
    });
    await this.shiftState.setAvailable(guardianId);
    return result;
  }

  async noShow(assignmentId: string, reason?: string) {
    const assignment = await this.prisma.jobAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await this.updateOptimistic(tx, assignmentId, assignment.versionNumber, {
        status: AssignmentStatus.NO_SHOW,
      });
      await tx.jobAssignment.update({
        where: { id: assignmentId },
        data: { noShowReason: reason },
      });
      await this.shiftState.setAvailable(assignment.guardianId);
    });

    await this.audit.log({
      action: 'ASSIGNMENT_NO_SHOW',
      entityType: 'job.job_assignments',
      entityId: assignmentId,
      afterState: { reason },
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

    const updated = await this.prisma.$transaction((tx) =>
      this.updateOptimistic(tx, assignmentId, assignment.versionNumber, { status: to }),
    );

    await this.audit.log({
      action: auditAction,
      entityType: 'job.job_assignments',
      entityId: assignmentId,
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
