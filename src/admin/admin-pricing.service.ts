import { Injectable, NotFoundException } from '@nestjs/common';
import { JobType, PricingModel, Prisma } from '@prisma/client';
import { AuditService } from '../common/services/audit.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminPricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.pricingRule.findMany({
      orderBy: { priority: 'desc' },
    });
  }

  create(
    data: {
      priority: number;
      organizationId?: string;
      district?: string;
      jobType?: JobType;
      pricingModel: PricingModel;
      hourlyRate?: number;
      flatFee?: number;
    },
    actorUserId: string,
  ) {
    return this.prisma.pricingRule.create({
      data: {
        priority: data.priority,
        organizationId: data.organizationId,
        district: data.district,
        jobType: data.jobType,
        pricingModel: data.pricingModel,
        hourlyRate: data.hourlyRate,
        flatFee: data.flatFee,
      },
    });
  }

  async update(
    id: string,
    data: Prisma.PricingRuleUpdateInput,
    actorUserId: string,
  ) {
    const rule = await this.prisma.pricingRule.findUnique({ where: { id } });
    if (!rule) {
      throw new NotFoundException('Pricing rule not found');
    }
    return this.prisma.pricingRule.update({ where: { id }, data });
  }
}
