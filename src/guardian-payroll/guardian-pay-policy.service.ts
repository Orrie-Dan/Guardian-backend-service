import { Injectable, NotFoundException } from '@nestjs/common';
import {
  EmploymentType,
  JobType,
  PayPolicy,
  PayPolicyModel,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GUARDIAN_PAY_MINIMUM_HOURS_FALLBACK } from './guardian-payroll.constants';

export type ResolvedPayPolicy = Pick<
  PayPolicy,
  'model' | 'minimumHours' | 'applyOnEarlyRelease'
>;

@Injectable()
export class GuardianPayPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async resolvePayPolicy(
    jobType: JobType,
    employmentType: EmploymentType,
    effectiveAt: Date,
  ): Promise<ResolvedPayPolicy> {
    const policies = await this.prisma.payPolicy.findMany({
      where: {
        AND: [
          { validFrom: { lte: effectiveAt } },
          {
            OR: [{ validUntil: null }, { validUntil: { gte: effectiveAt } }],
          },
        ],
      },
      orderBy: { priority: 'desc' },
    });

    const match = policies.find((policy) => {
      if (policy.jobType && policy.jobType !== jobType) {
        return false;
      }
      if (policy.employmentType && policy.employmentType !== employmentType) {
        return false;
      }
      return true;
    });

    if (!match) {
      throw new NotFoundException('No pay policy matched');
    }

    return match;
  }

  /** Fallback for legacy assignments accepted before pay policy snapshot existed. */
  fallbackPayPolicy(): ResolvedPayPolicy {
    return {
      model: PayPolicyModel.MINIMUM_GUARANTEED,
      minimumHours: new Prisma.Decimal(GUARDIAN_PAY_MINIMUM_HOURS_FALLBACK),
      applyOnEarlyRelease: true,
    };
  }
}
