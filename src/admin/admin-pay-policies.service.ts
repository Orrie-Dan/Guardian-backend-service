import { Injectable, NotFoundException } from '@nestjs/common';
import { EmploymentType, JobType, PayPolicyModel, Prisma } from '@prisma/client';
import { AuditService } from '../common/services/audit.service';
import { PrismaService } from '../prisma/prisma.service';

export type CreatePayPolicyInput = {
  priority: number;
  jobType?: JobType;
  employmentType?: EmploymentType;
  model: PayPolicyModel;
  minimumHours?: number;
  applyOnEarlyRelease?: boolean;
  validFrom?: string;
  validUntil?: string;
};

@Injectable()
export class AdminPayPoliciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.payPolicy.findMany({
      orderBy: { priority: 'desc' },
    });
  }

  async create(data: CreatePayPolicyInput, actorUserId: string) {
    const created = await this.prisma.payPolicy.create({
      data: {
        priority: data.priority,
        jobType: data.jobType,
        employmentType: data.employmentType,
        model: data.model,
        minimumHours: data.minimumHours ?? 1,
        applyOnEarlyRelease: data.applyOnEarlyRelease ?? true,
        validFrom: data.validFrom ? new Date(data.validFrom) : undefined,
        validUntil: data.validUntil ? new Date(data.validUntil) : undefined,
      },
    });

    await this.audit.log({
      actorUserId,
      action: 'PAY_POLICY_CREATED',
      entityType: 'billing.pay_policies',
      entityId: created.id,
      afterState: {
        model: created.model,
        priority: created.priority,
        jobType: created.jobType,
        employmentType: created.employmentType,
        minimumHours: created.minimumHours.toString(),
      },
    });

    return created;
  }

  async update(
    id: string,
    data: Partial<CreatePayPolicyInput>,
    actorUserId: string,
  ) {
    const existing = await this.prisma.payPolicy.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Pay policy not found');
    }

    const updateData: Prisma.PayPolicyUpdateInput = {};
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.jobType !== undefined) updateData.jobType = data.jobType;
    if (data.employmentType !== undefined) {
      updateData.employmentType = data.employmentType;
    }
    if (data.model !== undefined) updateData.model = data.model;
    if (data.minimumHours !== undefined) updateData.minimumHours = data.minimumHours;
    if (data.applyOnEarlyRelease !== undefined) {
      updateData.applyOnEarlyRelease = data.applyOnEarlyRelease;
    }
    if (data.validFrom !== undefined) {
      updateData.validFrom = new Date(data.validFrom);
    }
    if (data.validUntil !== undefined) {
      updateData.validUntil = data.validUntil ? new Date(data.validUntil) : null;
    }

    const updated = await this.prisma.payPolicy.update({
      where: { id },
      data: updateData,
    });

    await this.audit.log({
      actorUserId,
      action: 'PAY_POLICY_UPDATED',
      entityType: 'billing.pay_policies',
      entityId: id,
      beforeState: {
        model: existing.model,
        priority: existing.priority,
      },
      afterState: {
        model: updated.model,
        priority: updated.priority,
      },
    });

    return updated;
  }
}
