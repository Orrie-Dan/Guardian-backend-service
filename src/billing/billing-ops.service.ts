import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AssignmentStatus } from '@prisma/client';
import { AuditService } from '../common/services/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  BILLING_ALERT_EARLY_COMPLETION,
  BILLING_ALERT_LATE_ARRIVAL,
  BILLING_OPS_ALERT_ENTITY_TYPE,
  BILLING_OPS_EARLY_COMPLETION_MINUTES,
  BILLING_OPS_LATE_ARRIVAL_MINUTES,
  BILLING_OPS_LOW_SAMPLE_THRESHOLD,
  BILLING_OPS_SCAN_LOOKBACK_HOURS,
} from './billing-ops.constants';

export type BillingReconciliationFilters = {
  from: Date;
  to: Date;
  organizationId?: string;
  guardianId?: string;
};

export type BillingReconciliationRow = {
  assignmentId: string;
  jobId: string;
  jobReference: string;
  organizationId: string;
  organizationName: string;
  guardianId: string;
  guardianCode: string;
  guardianName: string | null;
  scheduledStart: Date;
  scheduledEnd: Date;
  arrivedAt: Date | null;
  completedAt: Date | null;
  scheduledHours: number;
  actualHours: number | null;
  billableHours: number | null;
  billingBasis: string | null;
  invoiceStatus: string | null;
  invoiceTotal: string | null;
  earlyCompletion: boolean;
  lateArrival: boolean;
  earlyReleaseMinutes: number | null;
  lateArrivalMinutes: number | null;
};

function hoursBetween(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) / 3_600_000);
}

function decimalToNumber(value: { toNumber(): number } | null | undefined): number | null {
  if (value == null) {
    return null;
  }
  return value.toNumber();
}

@Injectable()
export class BillingOpsService {
  private readonly logger = new Logger(BillingOpsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async scanBillingAnomalies(): Promise<{ earlyCompletion: number; lateArrival: number }> {
    const lookbackStart = new Date(
      Date.now() - BILLING_OPS_SCAN_LOOKBACK_HOURS * 60 * 60 * 1000,
    );
    let earlyCount = 0;
    let lateCount = 0;

    const completed = await this.prisma.jobAssignment.findMany({
      where: {
        status: AssignmentStatus.COMPLETED,
        completedAt: { gte: lookbackStart },
        arrivedAt: { not: null },
      },
      include: {
        job: {
          select: {
            id: true,
            referenceNumber: true,
            organizationId: true,
            scheduledStart: true,
            scheduledEnd: true,
          },
        },
      },
    });

    for (const assignment of completed) {
      const early = this.detectEarlyCompletion(assignment);
      if (early) {
        const logged = await this.recordAlertIfNew({
          action: BILLING_ALERT_EARLY_COMPLETION,
          assignmentId: assignment.id,
          jobId: assignment.job.id,
          jobReference: assignment.job.referenceNumber,
          organizationId: assignment.job.organizationId,
          detail: early,
        });
        if (logged) {
          earlyCount += 1;
        }
      }
    }

    const arrived = await this.prisma.jobAssignment.findMany({
      where: {
        arrivedAt: { gte: lookbackStart, not: null },
      },
      include: {
        job: {
          select: {
            id: true,
            referenceNumber: true,
            organizationId: true,
            scheduledStart: true,
            scheduledEnd: true,
          },
        },
      },
    });

    for (const assignment of arrived) {
      if (!assignment.arrivedAt) {
        continue;
      }
      const late = this.detectLateArrival(assignment);
      if (late) {
        const logged = await this.recordAlertIfNew({
          action: BILLING_ALERT_LATE_ARRIVAL,
          assignmentId: assignment.id,
          jobId: assignment.job.id,
          jobReference: assignment.job.referenceNumber,
          organizationId: assignment.job.organizationId,
          detail: late,
        });
        if (logged) {
          lateCount += 1;
        }
      }
    }

    if (earlyCount > 0 || lateCount > 0) {
      this.logger.log(
        `Billing ops scan: ${earlyCount} early completion, ${lateCount} late arrival alert(s)`,
      );
    }

    return { earlyCompletion: earlyCount, lateArrival: lateCount };
  }

  async getReconciliation(filters: BillingReconciliationFilters) {
    if (filters.from > filters.to) {
      throw new BadRequestException('from must be before to');
    }

    const assignments = await this.prisma.jobAssignment.findMany({
      where: {
        status: AssignmentStatus.COMPLETED,
        completedAt: { gte: filters.from, lte: filters.to },
        ...(filters.organizationId
          ? { job: { organizationId: filters.organizationId } }
          : {}),
        ...(filters.guardianId ? { guardianId: filters.guardianId } : {}),
      },
      include: {
        job: {
          include: {
            organization: {
              select: { id: true, legalName: true, tradingName: true },
            },
            invoice: true,
          },
        },
        guardian: {
          include: { user: { select: { fullName: true } } },
        },
      },
      orderBy: { completedAt: 'desc' },
    });

    const items: BillingReconciliationRow[] = assignments.map((assignment) => {
      const job = assignment.job;
      const invoice = job.invoice;
      const scheduledHours = hoursBetween(job.scheduledStart, job.scheduledEnd);
      const actualHours =
        assignment.arrivedAt && assignment.completedAt
          ? hoursBetween(assignment.arrivedAt, assignment.completedAt)
          : null;
      const early = this.detectEarlyCompletion(assignment);
      const late = assignment.arrivedAt ? this.detectLateArrival(assignment) : null;

      return {
        assignmentId: assignment.id,
        jobId: job.id,
        jobReference: job.referenceNumber,
        organizationId: job.organizationId,
        organizationName:
          job.organization.tradingName ?? job.organization.legalName,
        guardianId: assignment.guardianId,
        guardianCode: assignment.guardian.guardianCode,
        guardianName: assignment.guardian.user.fullName,
        scheduledStart: job.scheduledStart,
        scheduledEnd: job.scheduledEnd,
        arrivedAt: assignment.arrivedAt,
        completedAt: assignment.completedAt,
        scheduledHours,
        actualHours,
        billableHours: decimalToNumber(invoice?.billableHours) ?? actualHours,
        billingBasis: invoice?.billingBasis ?? null,
        invoiceStatus: invoice?.status ?? null,
        invoiceTotal: invoice?.total?.toString() ?? null,
        earlyCompletion: early != null,
        lateArrival: late != null,
        earlyReleaseMinutes: early?.minutesEarly ?? null,
        lateArrivalMinutes: late?.minutesLate ?? null,
      };
    });

    const summary = {
      jobCount: items.length,
      earlyCompletionCount: items.filter((r) => r.earlyCompletion).length,
      lateArrivalCount: items.filter((r) => r.lateArrival).length,
      totalScheduledHours: items.reduce((s, r) => s + r.scheduledHours, 0),
      totalActualHours: items.reduce((s, r) => s + (r.actualHours ?? 0), 0),
      totalBillableHours: items.reduce((s, r) => s + (r.billableHours ?? 0), 0),
    };

    return {
      items,
      summary,
      meta: {
        from: filters.from.toISOString(),
        to: filters.to.toISOString(),
        total: items.length,
        lowSampleSize: items.length < BILLING_OPS_LOW_SAMPLE_THRESHOLD,
        thresholds: {
          earlyCompletionMinutes: BILLING_OPS_EARLY_COMPLETION_MINUTES,
          lateArrivalMinutes: BILLING_OPS_LATE_ARRIVAL_MINUTES,
        },
      },
    };
  }

  detectEarlyCompletion(assignment: {
    completedAt: Date | null;
    job: { scheduledEnd: Date };
  }): { minutesEarly: number } | null {
    if (!assignment.completedAt) {
      return null;
    }
    const thresholdMs = BILLING_OPS_EARLY_COMPLETION_MINUTES * 60_000;
    const earlyByMs =
      assignment.job.scheduledEnd.getTime() -
      assignment.completedAt.getTime() -
      thresholdMs;
    if (earlyByMs <= 0) {
      return null;
    }
    return { minutesEarly: Math.round(earlyByMs / 60_000) };
  }

  detectLateArrival(assignment: {
    arrivedAt: Date | null;
    job: { scheduledStart: Date };
  }): { minutesLate: number } | null {
    if (!assignment.arrivedAt) {
      return null;
    }
    const thresholdMs = BILLING_OPS_LATE_ARRIVAL_MINUTES * 60_000;
    const lateByMs =
      assignment.arrivedAt.getTime() -
      assignment.job.scheduledStart.getTime() -
      thresholdMs;
    if (lateByMs <= 0) {
      return null;
    }
    return { minutesLate: Math.round(lateByMs / 60_000) };
  }

  private async recordAlertIfNew(params: {
    action: string;
    assignmentId: string;
    jobId: string;
    jobReference: string;
    organizationId: string;
    detail: Record<string, number>;
  }): Promise<boolean> {
    const existing = await this.prisma.auditLog.findFirst({
      where: {
        action: params.action,
        entityType: BILLING_OPS_ALERT_ENTITY_TYPE,
        entityId: params.assignmentId,
      },
      select: { id: true },
    });
    if (existing) {
      return false;
    }

    await this.audit.log({
      action: params.action,
      entityType: BILLING_OPS_ALERT_ENTITY_TYPE,
      entityId: params.assignmentId,
      afterState: {
        jobId: params.jobId,
        jobReference: params.jobReference,
        organizationId: params.organizationId,
        ...params.detail,
      },
    });

    this.logger.warn(
      `${params.action} job=${params.jobReference} assignment=${params.assignmentId} ${JSON.stringify(params.detail)}`,
    );
    return true;
  }
}
