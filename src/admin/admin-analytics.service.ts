import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';

@Injectable()
export class AdminAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsMaterializer: AnalyticsService,
  ) {}

  async jobFacts(filters?: { district?: string; from?: Date; to?: Date }) {
    const now = new Date();
    await this.analyticsMaterializer.backfillWindow({
      from: filters?.from ?? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      to: filters?.to ?? now,
      district: filters?.district,
    });

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

  async guardianPerformance(guardianId?: string) {
    const now = new Date();
    await this.analyticsMaterializer.backfillWindow({
      from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      to: now,
      guardianId,
    });

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

    const kpis = await this.analyticsMaterializer.kpiSummary();

    return {
      jobCount,
      activeGuardians: guardianCount,
      pendingOrgVerifications: pendingOrgs,
      pendingGuardianVerifications: pendingGuardians,
      totalRevenue: revenue._sum.totalRevenue ?? 0,
      kpis,
    };
  }

  backfill(input: {
    from: Date;
    to: Date;
    district?: string;
    organizationId?: string;
    guardianId?: string;
  }) {
    return this.analyticsMaterializer.backfillWindow(input);
  }
}
