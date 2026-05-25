import { Injectable, NotFoundException } from '@nestjs/common';
import {
  InvoiceStatus,
  Job,
  JobType,
  Location,
  PricingModel,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../common/services/audit.service';
import {
  buildPaginatedMeta,
  paginationSkipTake,
  PaginationQueryDto,
} from '../common/dto/pagination-query.dto';
import { ResourceOwnerPolicy } from '../common/policies/resource-owner.policy';
import { AuthUserPayload } from '../auth/interfaces/auth-user.interface';
import { PrismaService } from '../prisma/prisma.service';

type JobWithLocation = Job & { location: Location };

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly policy: ResourceOwnerPolicy,
  ) {}

  async resolvePrice(
    organizationId: string,
    district: string,
    jobType: JobType,
    scheduledStart: Date,
  ) {
    const rules = await this.prisma.pricingRule.findMany({
      where: {
        AND: [
          { validFrom: { lte: scheduledStart } },
          {
            OR: [{ validUntil: null }, { validUntil: { gte: scheduledStart } }],
          },
        ],
      },
      orderBy: { priority: 'desc' },
    });

    const match = rules.find((rule) => {
      if (rule.organizationId && rule.organizationId !== organizationId) {
        return false;
      }
      if (rule.district && rule.district !== district) {
        return false;
      }
      if (rule.jobType && rule.jobType !== jobType) {
        return false;
      }
      return true;
    });

    if (!match) {
      throw new NotFoundException('No pricing rule matched');
    }

    return match;
  }

  async createInvoiceForJob(job: JobWithLocation) {
    const existing = await this.prisma.invoice.findUnique({
      where: { jobId: job.id },
    });
    if (existing) {
      return existing;
    }

    const rule = await this.resolvePrice(
      job.organizationId,
      job.location.district,
      job.jobType,
      job.scheduledStart,
    );

    const hours =
      (job.scheduledEnd.getTime() - job.scheduledStart.getTime()) /
      (1000 * 60 * 60);
    const guardians = job.requestedGuardianCount;

    let subtotal = new Prisma.Decimal(0);
    if (rule.pricingModel === PricingModel.HOURLY && rule.hourlyRate) {
      subtotal = rule.hourlyRate.mul(hours).mul(guardians);
    } else if (rule.pricingModel === PricingModel.FLAT && rule.flatFee) {
      subtotal = rule.flatFee.mul(guardians);
    } else {
      throw new NotFoundException('Pricing rule has no applicable rate');
    }

    const taxAmount = subtotal.mul(0.18);
    const total = subtotal.add(taxAmount);

    return this.prisma.invoice.create({
      data: {
        organizationId: job.organizationId,
        jobId: job.id,
        subtotal,
        taxAmount,
        total,
        currency: rule.currency,
        status: InvoiceStatus.DRAFT,
      },
    });
  }

  listForOrganization(organizationId: string) {
    return this.prisma.invoice.findMany({
      where: { organizationId },
      include: { payments: true, job: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getInvoice(id: string, actor: AuthUserPayload) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { payments: true, ebmReceipt: true, job: true },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    await this.policy.assertOrgMember(invoice.organizationId, actor);
    return invoice;
  }

  async issue(id: string, actor: AuthUserPayload) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        status: InvoiceStatus.ISSUED,
        issuedAt: new Date(),
        dueAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });
    await this.audit.log({
      actorUserId: actor.sub,
      action: 'INVOICE_ISSUED',
      entityType: 'billing.invoices',
      entityId: id,
    });
    return updated;
  }

  async voidInvoice(id: string, actor: AuthUserPayload) {
    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.VOID },
    });
    await this.audit.log({
      actorUserId: actor.sub,
      action: 'INVOICE_VOIDED',
      entityType: 'billing.invoices',
      entityId: id,
    });
    return updated;
  }

  async listAdmin(query: PaginationQueryDto, filters?: { status?: InvoiceStatus }) {
    const { skip, take } = paginationSkipTake(query);
    const where = filters?.status ? { status: filters.status } : {};
    const [items, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { organization: true, job: true },
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return { items, meta: buildPaginatedMeta(query.page, query.limit, total) };
  }
}
