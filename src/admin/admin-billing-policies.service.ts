import { Injectable, NotFoundException } from '@nestjs/common';
import { BillingPolicyModel, JobType, Prisma } from '@prisma/client';
import { AuditService } from '../common/services/audit.service';
import { PrismaService } from '../prisma/prisma.service';

export type CreateBillingPolicyInput = {
  priority: number;
  organizationId?: string;
  jobType?: JobType;
  model: BillingPolicyModel;
  minimumHours?: number;
  prorationEnabled?: boolean;
  allowEarlyRelease?: boolean;
  earlyReleaseRequiresClientApproval?: boolean;
  autoApproveAfterMinutes?: number;
  validFrom?: string;
  validUntil?: string;
};

@Injectable()
export class AdminBillingPoliciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.billingPolicy.findMany({
      orderBy: { priority: 'desc' },
      include: {
        organization: {
          select: { id: true, legalName: true, tradingName: true },
        },
      },
    });
  }

  async create(data: CreateBillingPolicyInput, actorUserId: string) {
    const created = await this.prisma.billingPolicy.create({
      data: {
        priority: data.priority,
        organizationId: data.organizationId,
        jobType: data.jobType,
        model: data.model,
        minimumHours: data.minimumHours ?? 2,
        prorationEnabled: data.prorationEnabled ?? true,
        allowEarlyRelease: data.allowEarlyRelease ?? false,
        earlyReleaseRequiresClientApproval:
          data.earlyReleaseRequiresClientApproval ?? true,
        autoApproveAfterMinutes: data.autoApproveAfterMinutes,
        validFrom: data.validFrom ? new Date(data.validFrom) : undefined,
        validUntil: data.validUntil ? new Date(data.validUntil) : undefined,
      },
      include: {
        organization: {
          select: { id: true, legalName: true, tradingName: true },
        },
      },
    });

    await this.audit.log({
      actorUserId,
      action: 'BILLING_POLICY_CREATED',
      entityType: 'billing.billing_policies',
      entityId: created.id,
      afterState: {
        model: created.model,
        priority: created.priority,
        organizationId: created.organizationId,
        jobType: created.jobType,
      },
    });

    return created;
  }

  async update(
    id: string,
    data: Partial<CreateBillingPolicyInput>,
    actorUserId: string,
  ) {
    const existing = await this.prisma.billingPolicy.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Billing policy not found');
    }

    const updateData: Prisma.BillingPolicyUpdateInput = {};
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.organizationId !== undefined) {
      updateData.organization = data.organizationId
        ? { connect: { id: data.organizationId } }
        : { disconnect: true };
    }
    if (data.jobType !== undefined) updateData.jobType = data.jobType;
    if (data.model !== undefined) updateData.model = data.model;
    if (data.minimumHours !== undefined) updateData.minimumHours = data.minimumHours;
    if (data.prorationEnabled !== undefined) {
      updateData.prorationEnabled = data.prorationEnabled;
    }
    if (data.allowEarlyRelease !== undefined) {
      updateData.allowEarlyRelease = data.allowEarlyRelease;
    }
    if (data.earlyReleaseRequiresClientApproval !== undefined) {
      updateData.earlyReleaseRequiresClientApproval =
        data.earlyReleaseRequiresClientApproval;
    }
    if (data.autoApproveAfterMinutes !== undefined) {
      updateData.autoApproveAfterMinutes = data.autoApproveAfterMinutes;
    }
    if (data.validFrom !== undefined) {
      updateData.validFrom = new Date(data.validFrom);
    }
    if (data.validUntil !== undefined) {
      updateData.validUntil = data.validUntil ? new Date(data.validUntil) : null;
    }

    const updated = await this.prisma.billingPolicy.update({
      where: { id },
      data: updateData,
      include: {
        organization: {
          select: { id: true, legalName: true, tradingName: true },
        },
      },
    });

    await this.audit.log({
      actorUserId,
      action: 'BILLING_POLICY_UPDATED',
      entityType: 'billing.billing_policies',
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
