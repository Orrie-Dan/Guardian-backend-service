import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  jobFacts(filters?: { district?: string; from?: Date; to?: Date }) {
    const where: Record<string, unknown> = {};
    if (filters?.district) {
      where.district = filters.district;
    }
    if (filters?.from || filters?.to) {
      where.date = {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      };
    }
    return this.prisma.jobFactsDaily.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 100,
    });
  }

  guardianPerformance(guardianId?: string) {
    return this.prisma.guardianPerformanceDaily.findMany({
      where: guardianId ? { guardianId } : {},
      orderBy: { date: 'desc' },
      take: 100,
    });
  }

  async dashboard() {
    const [jobCount, guardianCount, pendingOrgs, pendingGuardians] =
      await Promise.all([
        this.prisma.job.count(),
        this.prisma.guardian.count({ where: { status: 'ACTIVE' } }),
        this.prisma.organization.count({
          where: { verificationStatus: 'PENDING' },
        }),
        this.prisma.guardian.count({
          where: { verificationStatus: 'PENDING' },
        }),
      ]);

    const revenue = await this.prisma.jobFactsDaily.aggregate({
      _sum: { totalRevenue: true },
    });

    return {
      jobCount,
      activeGuardians: guardianCount,
      pendingOrgVerifications: pendingOrgs,
      pendingGuardianVerifications: pendingGuardians,
      totalRevenue: revenue._sum.totalRevenue ?? 0,
    };
  }
}
