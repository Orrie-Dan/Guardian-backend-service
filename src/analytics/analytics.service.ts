import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AssignmentStatus, JobStatus, NoShowTriggerType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly refreshIntervalMs = Number(
    process.env.ANALYTICS_REFRESH_INTERVAL_MS ?? 300_000,
  );

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.refreshRecentWindow(), this.refreshIntervalMs);
    void this.refreshRecentWindow();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async refreshRecentWindow() {
    const now = new Date();
    const from = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    return this.backfillWindow({ from, to: now });
  }

  async backfillWindow(input: {
    from: Date;
    to: Date;
    district?: string;
    organizationId?: string;
    guardianId?: string;
  }) {
    if (this.running) {
      return { skipped: true, reason: 'analytics materializer already running' };
    }
    this.running = true;
    const startedAt = Date.now();
    try {
      const [jobRowsWritten, guardianRowsWritten] = await Promise.all([
        this.materializeJobFacts(input),
        this.materializeGuardianPerformance(input),
      ]);
      return {
        skipped: false,
        from: input.from.toISOString(),
        to: input.to.toISOString(),
        jobRowsWritten,
        guardianRowsWritten,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Analytics backfill failed: ${message}`);
      throw error;
    } finally {
      this.running = false;
    }
  }

  async kpiSummary(input?: { from?: Date; to?: Date }) {
    const now = new Date();
    const from = input?.from ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const to = input?.to ?? now;
    const jobWhere = { createdAt: { gte: from, lte: to } };
    const assignmentWhere = {
      job: { createdAt: { gte: from, lte: to } },
    };

    const [
      jobsCreated,
      jobsFailed,
      totalOffers,
      acceptedOffers,
      expiredOffers,
      noShows,
      acceptedAssignments,
      rawJobsWithOffers,
      failedJobsByReason,
    ] =
      await Promise.all([
        this.prisma.job.count({ where: jobWhere }),
        this.prisma.job.count({ where: { ...jobWhere, status: JobStatus.FAILED } }),
        this.prisma.jobAssignment.count({ where: assignmentWhere }),
        this.prisma.jobAssignment.count({
          where: { ...assignmentWhere, acceptedAt: { not: null } },
        }),
        this.prisma.jobAssignment.count({
          where: { ...assignmentWhere, status: AssignmentStatus.EXPIRED },
        }),
        this.prisma.jobAssignment.groupBy({
          by: ['noShowTriggerType'],
          where: {
            ...assignmentWhere,
            status: AssignmentStatus.NO_SHOW,
          },
          _count: { _all: true },
        }),
        this.prisma.jobAssignment.findMany({
          where: {
            ...assignmentWhere,
            acceptedAt: { not: null },
          },
          select: {
            offerSentAt: true,
            acceptedAt: true,
            arrivedAt: true,
            completedAt: true,
          },
        }),
        this.prisma.job.findMany({
          where: jobWhere,
          select: {
            createdAt: true,
            assignments: {
              orderBy: { offerSentAt: 'asc' },
              take: 1,
              select: { offerSentAt: true },
            },
          },
        }),
        this.prisma.job.groupBy({
          by: ['dispatchFailureReason'],
          where: { ...jobWhere, status: JobStatus.FAILED },
          _count: { _all: true },
        }),
      ]);
    const jobsWithOffers = rawJobsWithOffers as Array<{
      createdAt: Date;
      assignments: Array<{ offerSentAt: Date }>;
    }>;

    const jobsAccepted = await this.prisma.jobAssignment.findMany({
      where: { ...assignmentWhere, acceptedAt: { not: null } },
      select: { jobId: true },
      distinct: ['jobId'],
    });

    const noShowTotal = noShows.reduce((acc, row) => acc + row._count._all, 0);
    const noShowManual =
      noShows.find((row) => row.noShowTriggerType === NoShowTriggerType.MANUAL)?._count
        ._all ?? 0;
    const noShowSystem =
      noShows.find((row) => row.noShowTriggerType === NoShowTriggerType.SYSTEM)?._count
        ._all ?? 0;

    const timeToAcceptMinutes = acceptedAssignments
      .map((a) => (a.acceptedAt!.getTime() - a.offerSentAt.getTime()) / 60000)
      .filter((v) => v >= 0);
    const timeToOnSiteMinutes = acceptedAssignments
      .filter((a) => Boolean(a.arrivedAt))
      .map((a) => (a.arrivedAt!.getTime() - a.acceptedAt!.getTime()) / 60000)
      .filter((v) => v >= 0);
    const timeToCompleteMinutes = acceptedAssignments
      .filter((a) => Boolean(a.completedAt))
      .map((a) => (a.completedAt!.getTime() - a.acceptedAt!.getTime()) / 60000)
      .filter((v) => v >= 0);
    const timeToFirstOfferMinutes = jobsWithOffers
      .filter((job) => job.assignments.length > 0)
      .map(
        (job) =>
          (job.assignments[0].offerSentAt.getTime() - job.createdAt.getTime()) / 60000,
      )
      .filter((v) => v >= 0);

    const safeRate = (numerator: number, denominator: number) =>
      denominator > 0 ? Number((numerator / denominator).toFixed(4)) : 0;

    return {
      window: { from: from.toISOString(), to: to.toISOString() },
      jobsCreated,
      jobsWithAcceptedOffer: jobsAccepted.length,
      totalOffers,
      acceptedOffers,
      expiredOffers,
      noShowAssignments: noShowTotal,
      noShowManual,
      noShowSystem,
      jobsFailed,
      dispatchFailuresByReason: failedJobsByReason.map((row) => ({
        reason: row.dispatchFailureReason ?? 'unknown',
        count: row._count._all,
      })),
      dispatchConversionRate: safeRate(jobsAccepted.length, jobsCreated),
      offerAcceptanceRate: safeRate(acceptedOffers, totalOffers),
      offerExpiryRate: safeRate(expiredOffers, totalOffers),
      noShowRate: safeRate(noShowTotal, acceptedOffers),
      dispatchFailureRate: safeRate(jobsFailed, jobsCreated),
      latencyMinutes: {
        p50TimeToFirstOffer: this.percentile(timeToFirstOfferMinutes, 50),
        p95TimeToFirstOffer: this.percentile(timeToFirstOfferMinutes, 95),
        p50TimeToAccept: this.percentile(timeToAcceptMinutes, 50),
        p95TimeToAccept: this.percentile(timeToAcceptMinutes, 95),
        p50TimeToOnSite: this.percentile(timeToOnSiteMinutes, 50),
        p95TimeToOnSite: this.percentile(timeToOnSiteMinutes, 95),
        p50TimeToComplete: this.percentile(timeToCompleteMinutes, 50),
        p95TimeToComplete: this.percentile(timeToCompleteMinutes, 95),
      },
    };
  }

  private async materializeJobFacts(input: {
    from: Date;
    to: Date;
    district?: string;
    organizationId?: string;
  }) {
    const jobs = await this.prisma.job.findMany({
      where: {
        createdAt: { gte: input.from, lte: input.to },
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
        ...(input.district
          ? { location: { district: input.district } }
          : {}),
      },
      select: {
        createdAt: true,
        jobType: true,
        status: true,
        assignments: {
          select: {
            offerSentAt: true,
            acceptedAt: true,
          },
        },
        location: { select: { district: true } },
        invoice: { select: { total: true } },
      },
    });

    const bucket = new Map<
      string,
      {
        date: Date;
        district: string;
        jobType: string;
        hourOfDay: number;
        jobCount: number;
        completedCount: number;
        cancelledCount: number;
        totalRevenue: number;
        responseMinutesTotal: number;
        responseMinutesCount: number;
      }
    >();

    for (const job of jobs) {
      const date = new Date(job.createdAt.toISOString().slice(0, 10));
      const district = job.location?.district ?? 'UNKNOWN';
      const hourOfDay = job.createdAt.getUTCHours();
      const key = `${date.toISOString()}|${district}|${job.jobType}|${hourOfDay}`;
      const item = bucket.get(key) ?? {
        date,
        district,
        jobType: job.jobType,
        hourOfDay,
        jobCount: 0,
        completedCount: 0,
        cancelledCount: 0,
        totalRevenue: 0,
        responseMinutesTotal: 0,
        responseMinutesCount: 0,
      };

      item.jobCount += 1;
      if (job.status === JobStatus.COMPLETED) item.completedCount += 1;
      if (job.status === JobStatus.CANCELLED) item.cancelledCount += 1;
      if (job.invoice?.total) item.totalRevenue += Number(job.invoice.total);

      for (const assignment of job.assignments) {
        if (!assignment.acceptedAt) continue;
        item.responseMinutesTotal +=
          (assignment.acceptedAt.getTime() - assignment.offerSentAt.getTime()) / 60000;
        item.responseMinutesCount += 1;
      }
      bucket.set(key, item);
    }

    let rowsWritten = 0;
    for (const row of bucket.values()) {
      await this.prisma.jobFactsDaily.upsert({
        where: {
          date_district_jobType_hourOfDay: {
            date: row.date,
            district: row.district,
            jobType: row.jobType as never,
            hourOfDay: row.hourOfDay,
          },
        },
        create: {
          date: row.date,
          district: row.district,
          jobType: row.jobType as never,
          hourOfDay: row.hourOfDay,
          jobCount: row.jobCount,
          completedCount: row.completedCount,
          cancelledCount: row.cancelledCount,
          avgResponseMinutes:
            row.responseMinutesCount > 0
              ? Number((row.responseMinutesTotal / row.responseMinutesCount).toFixed(2))
              : null,
          totalRevenue: Number(row.totalRevenue.toFixed(2)),
        },
        update: {
          jobCount: row.jobCount,
          completedCount: row.completedCount,
          cancelledCount: row.cancelledCount,
          avgResponseMinutes:
            row.responseMinutesCount > 0
              ? Number((row.responseMinutesTotal / row.responseMinutesCount).toFixed(2))
              : null,
          totalRevenue: Number(row.totalRevenue.toFixed(2)),
          computedAt: new Date(),
        },
      });
      rowsWritten += 1;
    }
    return rowsWritten;
  }

  private async materializeGuardianPerformance(input: {
    from: Date;
    to: Date;
    guardianId?: string;
    district?: string;
    organizationId?: string;
  }) {
    const assignments = await this.prisma.jobAssignment.findMany({
      where: {
        offerSentAt: { gte: input.from, lte: input.to },
        ...(input.guardianId ? { guardianId: input.guardianId } : {}),
        ...(input.organizationId || input.district
          ? {
              job: {
                ...(input.organizationId ? { organizationId: input.organizationId } : {}),
                ...(input.district ? { location: { district: input.district } } : {}),
              },
            }
          : {}),
      },
      select: {
        guardianId: true,
        status: true,
        offerSentAt: true,
        acceptedAt: true,
        noShowAt: true,
      },
    });

    const bucket = new Map<
      string,
      {
        date: Date;
        guardianId: string;
        jobsAssigned: number;
        jobsCompleted: number;
        noShowCount: number;
        responseMinutesTotal: number;
        responseMinutesCount: number;
      }
    >();

    for (const assignment of assignments) {
      const daySource = assignment.acceptedAt ?? assignment.noShowAt ?? assignment.offerSentAt;
      const date = new Date(daySource.toISOString().slice(0, 10));
      const key = `${date.toISOString()}|${assignment.guardianId}`;
      const item = bucket.get(key) ?? {
        date,
        guardianId: assignment.guardianId,
        jobsAssigned: 0,
        jobsCompleted: 0,
        noShowCount: 0,
        responseMinutesTotal: 0,
        responseMinutesCount: 0,
      };

      if (assignment.acceptedAt) item.jobsAssigned += 1;
      if (assignment.status === AssignmentStatus.COMPLETED) item.jobsCompleted += 1;
      if (assignment.status === AssignmentStatus.NO_SHOW) item.noShowCount += 1;
      if (assignment.acceptedAt) {
        item.responseMinutesTotal +=
          (assignment.acceptedAt.getTime() - assignment.offerSentAt.getTime()) / 60000;
        item.responseMinutesCount += 1;
      }
      bucket.set(key, item);
    }

    let rowsWritten = 0;
    for (const row of bucket.values()) {
      const completionRate =
        row.jobsAssigned > 0
          ? Number(((row.jobsCompleted / row.jobsAssigned) * 100).toFixed(2))
          : 0;
      const avgResponseMinutes =
        row.responseMinutesCount > 0
          ? Number((row.responseMinutesTotal / row.responseMinutesCount).toFixed(2))
          : null;
      await this.prisma.guardianPerformanceDaily.upsert({
        where: {
          date_guardianId: { date: row.date, guardianId: row.guardianId },
        },
        create: {
          date: row.date,
          guardianId: row.guardianId,
          jobsAssigned: row.jobsAssigned,
          jobsCompleted: row.jobsCompleted,
          noShowCount: row.noShowCount,
          completionRate,
          avgResponseMinutes,
        },
        update: {
          jobsAssigned: row.jobsAssigned,
          jobsCompleted: row.jobsCompleted,
          noShowCount: row.noShowCount,
          completionRate,
          avgResponseMinutes,
          computedAt: new Date(),
        },
      });
      rowsWritten += 1;
    }
    return rowsWritten;
  }

  private percentile(values: number[], p: number): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const rank = Math.ceil((p / 100) * sorted.length) - 1;
    const idx = Math.max(0, Math.min(sorted.length - 1, rank));
    return Number(sorted[idx].toFixed(2));
  }
}
