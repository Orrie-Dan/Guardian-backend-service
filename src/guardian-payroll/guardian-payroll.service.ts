import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignmentStatus,
  GuardianEarningStatus,
  GuardianPayoutStatus,
  InvoiceStatus,
  Prisma,
} from '@prisma/client';
import {
  buildPaginatedMeta,
  paginationSkipTake,
  PaginationQueryDto,
} from '../common/dto/pagination-query.dto';
import { AuditService } from '../common/services/audit.service';
import { EmailNotificationService } from '../notifications/email-notification.service';
import { EmailTemplateId } from '../notifications/email-template.ids';
import { InAppNotificationAction } from '../notifications/in-app-notification.actions';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { computePayableHours } from './guardian-payroll-calculation.util';
import { CreateGuardianPayoutDto } from './dto/create-guardian-payout.dto';
import { ListEarningsQueryDto } from './dto/list-earnings-query.dto';

@Injectable()
export class GuardianPayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly emails: EmailNotificationService,
    private readonly notifications: NotificationsService,
  ) {}

  async accrueForPaidInvoice(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        job: true,
      },
    });
    if (!invoice || invoice.status !== InvoiceStatus.PAID) {
      return [];
    }

    const completedAssignments = await this.prisma.jobAssignment.findMany({
      where: {
        jobId: invoice.jobId,
        status: AssignmentStatus.COMPLETED,
        arrivedAt: { not: null },
        completedAt: { not: null },
      },
      include: {
        guardian: true,
      },
      orderBy: { arrivedAt: 'asc' },
    });

    const created: string[] = [];
    for (const assignment of completedAssignments) {
      const existing = await this.prisma.guardianEarning.findUnique({
        where: { assignmentId: assignment.id },
      });
      if (existing) {
        continue;
      }

      const payableHours = computePayableHours(
        invoice.job.scheduledStart,
        invoice.job.scheduledEnd,
        assignment.arrivedAt!,
        assignment.completedAt!,
      );
      const hourlyPayRate = assignment.guardian.hourlyPayRate;
      const currency = assignment.guardian.payCurrency ?? invoice.currency;
      const blocked = hourlyPayRate == null;
      const amount = blocked
        ? new Prisma.Decimal(0)
        : new Prisma.Decimal(payableHours).mul(hourlyPayRate);

      const earning = await this.prisma.guardianEarning.create({
        data: {
          guardianId: assignment.guardianId,
          assignmentId: assignment.id,
          jobId: invoice.jobId,
          invoiceId: invoice.id,
          payableHours: new Prisma.Decimal(payableHours),
          hourlyPayRate,
          amount,
          currency,
          status: blocked
            ? GuardianEarningStatus.BLOCKED
            : GuardianEarningStatus.PENDING_PAYOUT,
        },
      });
      created.push(earning.id);

      await this.audit.log({
        action: blocked ? 'GUARDIAN_EARNING_BLOCKED' : 'GUARDIAN_EARNING_ACCRUED',
        entityType: 'billing.guardian_earnings',
        entityId: earning.id,
        afterState: {
          guardianId: assignment.guardianId,
          assignmentId: assignment.id,
          payableHours,
          amount: amount.toString(),
          currency,
        },
      });
    }

    return created;
  }

  async cancelEarningsForInvoice(invoiceId: string) {
    const pending = await this.prisma.guardianEarning.findMany({
      where: {
        invoiceId,
        status: GuardianEarningStatus.PENDING_PAYOUT,
      },
    });
    if (!pending.length) {
      const paid = await this.prisma.guardianEarning.count({
        where: { invoiceId, status: GuardianEarningStatus.PAID },
      });
      if (paid > 0) {
        await this.audit.log({
          action: 'GUARDIAN_EARNING_CANCEL_SKIPPED_PAID',
          entityType: 'billing.invoices',
          entityId: invoiceId,
          afterState: { paidCount: paid },
        });
      }
      return { cancelled: 0 };
    }

    await this.prisma.guardianEarning.updateMany({
      where: {
        invoiceId,
        status: GuardianEarningStatus.PENDING_PAYOUT,
      },
      data: { status: GuardianEarningStatus.CANCELLED },
    });

    await this.audit.log({
      action: 'GUARDIAN_EARNINGS_CANCELLED',
      entityType: 'billing.invoices',
      entityId: invoiceId,
      afterState: { count: pending.length },
    });

    return { cancelled: pending.length };
  }

  private earningsDateFilter(query: ListEarningsQueryDto) {
    if (!query.from && !query.to) {
      return undefined;
    }
    return {
      ...(query.from ? { gte: new Date(query.from) } : {}),
      ...(query.to ? { lte: new Date(query.to) } : {}),
    };
  }

  async getSummary(guardianId: string, query: ListEarningsQueryDto) {
    const accruedAt = this.earningsDateFilter(query);
    const where: Prisma.GuardianEarningWhereInput = {
      guardianId,
      ...(accruedAt ? { accruedAt } : {}),
    };

    const [pending, paid, blocked, cancelled, guardian] = await Promise.all([
      this.prisma.guardianEarning.aggregate({
        where: { ...where, status: GuardianEarningStatus.PENDING_PAYOUT },
        _sum: { amount: true },
      }),
      this.prisma.guardianEarning.aggregate({
        where: { ...where, status: GuardianEarningStatus.PAID },
        _sum: { amount: true },
      }),
      this.prisma.guardianEarning.aggregate({
        where: { ...where, status: GuardianEarningStatus.BLOCKED },
        _sum: { amount: true },
      }),
      this.prisma.guardianEarning.aggregate({
        where: { ...where, status: GuardianEarningStatus.CANCELLED },
        _sum: { amount: true },
      }),
      this.prisma.guardian.findUnique({
        where: { id: guardianId },
        select: { payCurrency: true },
      }),
    ]);

    return {
      currency: guardian?.payCurrency ?? 'RWF',
      pendingPayout: pending._sum.amount?.toString() ?? '0',
      paidTotal: paid._sum.amount?.toString() ?? '0',
      blockedTotal: blocked._sum.amount?.toString() ?? '0',
      cancelledTotal: cancelled._sum.amount?.toString() ?? '0',
      ...(query.from || query.to
        ? {
            period: {
              from: query.from ?? null,
              to: query.to ?? null,
            },
          }
        : {}),
    };
  }

  async getLedger(guardianId: string, query: ListEarningsQueryDto) {
    const { skip, take } = paginationSkipTake(query);
    const accruedAt = this.earningsDateFilter(query);
    const where: Prisma.GuardianEarningWhereInput = {
      guardianId,
      ...(query.status ? { status: query.status } : {}),
      ...(accruedAt ? { accruedAt } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.guardianEarning.findMany({
        where,
        skip,
        take,
        orderBy: { accruedAt: query.order },
        include: {
          job: { select: { referenceNumber: true } },
        },
      }),
      this.prisma.guardianEarning.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        jobId: row.jobId,
        jobReference: row.job.referenceNumber,
        assignmentId: row.assignmentId,
        payableHours: row.payableHours.toString(),
        hourlyPayRate: row.hourlyPayRate?.toString() ?? null,
        amount: row.amount.toString(),
        currency: row.currency,
        status: row.status,
        accruedAt: row.accruedAt,
        paidAt: row.paidAt,
        payoutId: row.payoutId,
      })),
      meta: buildPaginatedMeta(query.page, query.limit, total),
    };
  }

  async listPayouts(guardianId: string, query: PaginationQueryDto) {
    const { skip, take } = paginationSkipTake(query);
    const where = { guardianId };
    const [items, total] = await Promise.all([
      this.prisma.guardianPayout.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: query.order },
      }),
      this.prisma.guardianPayout.count({ where }),
    ]);

    return {
      items: items.map((p) => ({
        id: p.id,
        amount: p.amount.toString(),
        currency: p.currency,
        provider: p.provider,
        status: p.status,
        externalTxnId: p.externalTxnId,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
      })),
      meta: buildPaginatedMeta(query.page, query.limit, total),
    };
  }

  async listAdminPayouts(query: PaginationQueryDto, guardianId?: string) {
    const { skip, take } = paginationSkipTake(query);
    const where = guardianId ? { guardianId } : {};
    const [items, total] = await Promise.all([
      this.prisma.guardianPayout.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: query.order },
        include: {
          guardian: {
            select: { guardianCode: true, user: { select: { fullName: true } } },
          },
        },
      }),
      this.prisma.guardianPayout.count({ where }),
    ]);

    return {
      items: items.map((p) => ({
        id: p.id,
        guardianId: p.guardianId,
        guardianCode: p.guardian.guardianCode,
        guardianName: p.guardian.user.fullName,
        amount: p.amount.toString(),
        currency: p.currency,
        provider: p.provider,
        status: p.status,
        externalTxnId: p.externalTxnId,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
      })),
      meta: buildPaginatedMeta(query.page, query.limit, total),
    };
  }

  async createPayout(
    guardianId: string,
    dto: CreateGuardianPayoutDto,
    actorUserId: string,
  ) {
    const existing = await this.prisma.guardianPayout.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existing) {
      return existing;
    }

    const earnings = await this.prisma.guardianEarning.findMany({
      where: {
        id: { in: dto.earningIds },
        guardianId,
        status: GuardianEarningStatus.PENDING_PAYOUT,
      },
    });
    if (earnings.length !== dto.earningIds.length) {
      throw new BadRequestException(
        'All earnings must belong to the guardian and be pending payout',
      );
    }

    const guardian = await this.prisma.guardian.findUnique({
      where: { id: guardianId },
    });
    if (!guardian) {
      throw new NotFoundException('Guardian not found');
    }

    const amount = earnings.reduce(
      (sum, e) => sum.add(e.amount),
      new Prisma.Decimal(0),
    );
    if (amount.lte(0)) {
      throw new BadRequestException('Payout amount must be greater than zero');
    }

    try {
      const payout = await this.prisma.$transaction(async (tx) => {
        const created = await tx.guardianPayout.create({
          data: {
            guardianId,
            amount,
            currency: guardian.payCurrency,
            provider: dto.provider,
            status: GuardianPayoutStatus.PENDING,
            externalTxnId: dto.externalTxnId,
            idempotencyKey: dto.idempotencyKey,
            createdByUserId: actorUserId,
          },
        });
        await tx.guardianEarning.updateMany({
          where: { id: { in: dto.earningIds } },
          data: { payoutId: created.id },
        });
        return created;
      });

      await this.audit.log({
        actorUserId,
        action: 'GUARDIAN_PAYOUT_CREATED',
        entityType: 'billing.guardian_payouts',
        entityId: payout.id,
        afterState: {
          guardianId,
          amount: amount.toString(),
          earningIds: dto.earningIds,
        },
      });

      return payout;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const dup = await this.prisma.guardianPayout.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
        });
        if (dup) {
          return dup;
        }
        throw new ConflictException('Duplicate payout');
      }
      throw err;
    }
  }

  async confirmPayout(payoutId: string, externalTxnId?: string) {
    const payout = await this.prisma.guardianPayout.findUnique({
      where: { id: payoutId },
      include: { guardian: { include: { user: true } } },
    });
    if (!payout) {
      throw new NotFoundException('Payout not found');
    }
    if (payout.status === GuardianPayoutStatus.COMPLETED) {
      return payout;
    }

    const paidAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const p = await tx.guardianPayout.update({
        where: { id: payoutId },
        data: {
          status: GuardianPayoutStatus.COMPLETED,
          paidAt,
          externalTxnId: externalTxnId ?? payout.externalTxnId,
        },
      });
      await tx.guardianEarning.updateMany({
        where: { payoutId },
        data: {
          status: GuardianEarningStatus.PAID,
          paidAt,
        },
      });
      return p;
    });

    await this.audit.log({
      action: 'GUARDIAN_PAYOUT_CONFIRMED',
      entityType: 'billing.guardian_payouts',
      entityId: payoutId,
    });

    await this.emails.sendToUser(
      payout.guardian.userId,
      EmailTemplateId.GUARDIAN_PAYOUT_CONFIRMED,
      {
        amount: payout.amount.toString(),
        currency: payout.currency,
      },
      { entityType: 'billing.guardian_payouts', entityId: payoutId },
    );
    await this.notifications.notifyGuardianInApp(
      payout.guardianId,
      'Payout confirmed',
      `${payout.currency} ${payout.amount.toString()} has been sent.`,
      { action: InAppNotificationAction.VIEW_EARNINGS },
    );

    return updated;
  }
}
