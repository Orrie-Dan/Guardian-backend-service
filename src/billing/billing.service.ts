import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignmentStatus,
  InvoiceStatus,
  Job,
  JobType,
  Location,
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
import { InAppNotificationAction } from '../notifications/in-app-notification.actions';
import { EmailNotificationService } from '../notifications/email-notification.service';
import { EmailTemplateId } from '../notifications/email-template.ids';
import { NotificationsService } from '../notifications/notifications.service';
import { OutboxService } from '../outbox/outbox.service';
import { BillingCalculationService } from './billing-calculation.service';
import {
  BILLING_AUTO_CONFIRM_MS,
  OUTBOX_EVENT_JOB_BILLING_AUTO_CONFIRM,
} from './billing.constants';
import { DisputeInvoiceDto } from './dto/dispute-invoice.dto';
import {
  DisputeResolutionAction,
  ResolveDisputeDto,
} from './dto/resolve-dispute.dto';
import { VoidInvoiceDto } from './dto/void-invoice.dto';
import {
  isDisputableStatus,
  isIssuableStatus,
} from './invoice-status.util';
import {
  toClientInvoiceDetail,
  toClientInvoiceSummary,
} from './invoice-detail.presenter';
import { InvoiceViewService } from './invoice-view.service';
import { GuardianPayrollService } from '../guardian-payroll/guardian-payroll.service';

type JobWithLocation = Job & { location: Location };

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly policy: ResourceOwnerPolicy,
    private readonly emails: EmailNotificationService,
    private readonly notifications: NotificationsService,
    private readonly calculation: BillingCalculationService,
    private readonly outbox: OutboxService,
    private readonly invoiceView: InvoiceViewService,
    private readonly guardianPayroll: GuardianPayrollService,
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

  async createDraftInvoiceForJobId(jobId: string, actorUserId: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { location: true },
    });
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    return this.createDraftInvoiceForJob(job, actorUserId);
  }

  async createDraftInvoiceForJob(job: JobWithLocation, actorUserId: string) {
    const existing = await this.prisma.invoice.findUnique({
      where: { jobId: job.id },
    });
    if (existing) {
      return existing;
    }

    const completedAssignments = await this.prisma.jobAssignment.findMany({
      where: {
        jobId: job.id,
        status: AssignmentStatus.COMPLETED,
        arrivedAt: { not: null },
        completedAt: { not: null },
      },
      orderBy: { arrivedAt: 'asc' },
    });
    if (!completedAssignments.length) {
      throw new NotFoundException('No completed assignment for job');
    }

    const primaryAssignment = completedAssignments[completedAssignments.length - 1];
    const coverageArrivedAt = completedAssignments[0].arrivedAt!;
    const coverageCompletedAt = primaryAssignment.completedAt!;
    const replacementHandoff = completedAssignments.length > 1;

    const rule = await this.resolvePrice(
      job.organizationId,
      job.location.district,
      job.jobType,
      job.scheduledStart,
    );

    const billingPolicy = await this.calculation.resolveBillingPolicy(
      job.organizationId,
      job.jobType,
      job.scheduledStart,
    );

    const amounts = this.calculation.computeInvoiceAmounts({
      job,
      assignment: {
        ...primaryAssignment,
        arrivedAt: coverageArrivedAt,
        completedAt: coverageCompletedAt,
      },
      policy: billingPolicy,
      pricingModel: rule.pricingModel,
      hourlyRate: rule.hourlyRate,
      flatFee: rule.flatFee,
      replacementHandoff,
    });

    const taxAmount = amounts.subtotal.mul(0.18);
    const total = amounts.subtotal.add(taxAmount);

    const invoice = await this.prisma.invoice.create({
      data: {
        organizationId: job.organizationId,
        jobId: job.id,
        subtotal: amounts.subtotal,
        taxAmount,
        total,
        currency: rule.currency,
        status: InvoiceStatus.DRAFT,
        scheduledStartAt: job.scheduledStart,
        scheduledEndAt: job.scheduledEnd,
        arrivedAt: coverageArrivedAt,
        completedAt: coverageCompletedAt,
        scheduledHours: new Prisma.Decimal(amounts.scheduledHours),
        actualHours: new Prisma.Decimal(amounts.actualHours),
        billableHours: new Prisma.Decimal(amounts.billableHours),
        billingBasis: amounts.billingBasis,
        billingPolicyModel: amounts.billingBasis,
        lineItems: amounts.lineItems as Prisma.InputJsonValue,
      },
    });

    await this.audit.log({
      actorUserId,
      action: 'INVOICE_DRAFT_CREATED',
      entityType: 'billing.invoices',
      entityId: invoice.id,
      afterState: {
        billableHours: amounts.billableHours,
        billingBasis: amounts.billingBasis,
      },
    });

    await this.outbox.enqueue({
      aggregateType: 'job',
      aggregateId: job.id,
      eventType: OUTBOX_EVENT_JOB_BILLING_AUTO_CONFIRM,
      payload: { jobId: job.id },
      scheduledAt: new Date(Date.now() + BILLING_AUTO_CONFIRM_MS),
    });

    await this.emails.sendToOrgOwners(
      job.organizationId,
      EmailTemplateId.BILLING_INVOICE_AWAITING_CONFIRMATION,
      {
        jobReference: job.referenceNumber,
        jobId: job.id,
        amount: total.toString(),
        currency: rule.currency,
        billableHours: amounts.billableHours.toFixed(2),
        scheduledHours: amounts.scheduledHours.toFixed(2),
        actualHours: amounts.actualHours.toFixed(2),
        billingBasis: amounts.billingBasis,
      },
      { entityType: 'billing.invoices', entityId: invoice.id },
    );
    await this.notifications.notifyOrgOwnersInApp(
      job.organizationId,
      'Invoice awaiting confirmation',
      `Job ${job.referenceNumber}: ${rule.currency} ${total.toString()} (${amounts.billableHours.toFixed(2)} billable hours).`,
      {
        invoiceId: invoice.id,
        jobId: job.id,
        action: InAppNotificationAction.REVIEW_INVOICE,
      },
    );

    return invoice;
  }

  /** @deprecated Use createDraftInvoiceForJobId; kept for callers during transition. */
  async createAndIssueInvoiceForJobId(jobId: string, actorUserId: string) {
    const invoice = await this.createDraftInvoiceForJobId(jobId, actorUserId);
    return this.issueIfDraft(invoice.id, actorUserId);
  }

  async createAndIssueInvoiceForJob(job: JobWithLocation, actorUserId: string) {
    const invoice = await this.createDraftInvoiceForJob(job, actorUserId);
    return this.issueIfDraft(invoice.id, actorUserId);
  }

  async listForOrganization(organizationId: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: { organizationId },
      include: {
        job: { select: { referenceNumber: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return invoices.map(toClientInvoiceSummary);
  }

  async getInvoice(id: string, actor: AuthUserPayload) {
    let invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { payments: true, ebmReceipt: true, job: true },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    await this.policy.assertOrgMember(invoice.organizationId, actor);

    const viewed = await this.invoiceView.applyPendingConfirmationOnView(
      invoice,
      actor.sub,
    );
    return toClientInvoiceDetail(viewed);
  }

  async issueDraftForJobId(jobId: string, actorUserId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { jobId },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found for job');
    }
    return this.issueIfDraft(invoice.id, actorUserId);
  }

  /** Issues a DRAFT or PENDING_CONFIRMATION invoice; no-op if already issued or paid. */
  async issueIfDraft(invoiceId: string, actorUserId?: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { job: { select: { referenceNumber: true } } },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    if (invoice.status === InvoiceStatus.DISPUTED) {
      throw new BadRequestException('Cannot issue a disputed invoice');
    }
    if (!isIssuableStatus(invoice.status)) {
      return invoice;
    }

    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.ISSUED,
        issuedAt: new Date(),
        dueAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });
    await this.audit.log({
      actorUserId,
      action: 'INVOICE_ISSUED',
      entityType: 'billing.invoices',
      entityId: invoiceId,
    });
    await this.emails.sendToOrgOwners(
      invoice.organizationId,
      EmailTemplateId.BILLING_INVOICE_ISSUED,
      {
        jobReference: invoice.job?.referenceNumber ?? invoice.jobId,
        jobId: invoice.jobId,
        amount: invoice.total.toString(),
        currency: invoice.currency,
        billableHours: invoice.billableHours?.toString(),
        billingBasis: invoice.billingBasis ?? undefined,
      },
      { entityType: 'billing.invoices', entityId: invoiceId },
    );
    const jobReference = invoice.job?.referenceNumber ?? invoice.jobId;
    await this.notifications.notifyOrgOwnersInApp(
      invoice.organizationId,
      'Invoice issued',
      `Job ${jobReference}: ${invoice.currency} ${invoice.total.toString()} is ready to pay.`,
      {
        invoiceId,
        jobId: invoice.jobId,
        action: InAppNotificationAction.VIEW_INVOICE,
      },
    );
    return updated;
  }

  async issue(id: string, actor: AuthUserPayload) {
    return this.issueIfDraft(id, actor.sub);
  }

  async voidInvoice(id: string, actor: AuthUserPayload, body: VoidInvoiceDto) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { job: { select: { referenceNumber: true } } },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    if (invoice.status === InvoiceStatus.VOID) {
      return invoice;
    }
    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Cannot void a paid invoice');
    }

    if (body.replacementInvoiceId) {
      await this.assertReplacementInvoice(
        body.replacementInvoiceId,
        invoice.organizationId,
        id,
      );
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        status: InvoiceStatus.VOID,
        voidReason: body.voidReason,
        replacementInvoiceId: body.replacementInvoiceId ?? null,
        disputeResolvedAt:
          invoice.status === InvoiceStatus.DISPUTED ? new Date() : undefined,
        disputeResolvedBy:
          invoice.status === InvoiceStatus.DISPUTED ? actor.sub : undefined,
        disputeResolutionNote:
          invoice.status === InvoiceStatus.DISPUTED
            ? body.voidReason
            : undefined,
      },
    });
    await this.audit.log({
      actorUserId: actor.sub,
      action: 'INVOICE_VOIDED',
      entityType: 'billing.invoices',
      entityId: id,
      afterState: {
        voidReason: body.voidReason,
        replacementInvoiceId: body.replacementInvoiceId,
      },
    });
    await this.emails.sendToOrgOwners(
      invoice.organizationId,
      EmailTemplateId.BILLING_INVOICE_VOIDED,
      {
        jobReference: invoice.job?.referenceNumber ?? invoice.jobId,
        jobId: invoice.jobId,
        reason: body.voidReason,
      },
      { entityType: 'billing.invoices', entityId: id },
    );
    const voidJobReference = invoice.job?.referenceNumber ?? invoice.jobId;
    await this.notifications.notifyOrgOwnersInApp(
      invoice.organizationId,
      'Invoice voided',
      `Job ${voidJobReference}: ${body.voidReason}`,
      {
        invoiceId: id,
        jobId: invoice.jobId,
        action: InAppNotificationAction.VIEW_INVOICE,
      },
    );
    await this.guardianPayroll.cancelEarningsForInvoice(id);
    return updated;
  }

  async disputeInvoice(
    id: string,
    actor: AuthUserPayload,
    body: DisputeInvoiceDto,
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { job: { select: { referenceNumber: true } } },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    await this.policy.assertOrgMember(invoice.organizationId, actor);

    if (invoice.status === InvoiceStatus.DISPUTED) {
      return invoice;
    }
    if (!isDisputableStatus(invoice.status)) {
      throw new BadRequestException(
        `Invoice in status ${invoice.status} cannot be disputed`,
      );
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        status: InvoiceStatus.DISPUTED,
        disputeReason: body.reason,
        disputedAt: new Date(),
        disputedBy: actor.sub,
        statusBeforeDispute: invoice.status,
      },
    });

    await this.audit.log({
      actorUserId: actor.sub,
      action: 'INVOICE_DISPUTED',
      entityType: 'billing.invoices',
      entityId: id,
      beforeState: { status: invoice.status },
      afterState: { status: InvoiceStatus.DISPUTED, reason: body.reason },
    });

    await this.emails.sendToOrgOwners(
      invoice.organizationId,
      EmailTemplateId.BILLING_INVOICE_DISPUTED,
      {
        jobReference: invoice.job?.referenceNumber ?? invoice.jobId,
        jobId: invoice.jobId,
        reason: body.reason,
      },
      { entityType: 'billing.invoices', entityId: id },
    );
    const disputedJobReference = invoice.job?.referenceNumber ?? invoice.jobId;
    await this.notifications.notifyOrgOwnersInApp(
      invoice.organizationId,
      'Invoice disputed',
      `Job ${disputedJobReference}: ${body.reason}`,
      {
        invoiceId: id,
        jobId: invoice.jobId,
        action: InAppNotificationAction.VIEW_INVOICE,
      },
    );

    return updated;
  }

  async resolveDispute(
    id: string,
    actorUserId: string,
    body: ResolveDisputeDto,
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { job: { select: { referenceNumber: true } } },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    if (invoice.status !== InvoiceStatus.DISPUTED) {
      throw new BadRequestException('Invoice is not disputed');
    }

    if (body.action === DisputeResolutionAction.VOID) {
      if (!body.voidReason) {
        throw new BadRequestException('voidReason is required when voiding');
      }
      return this.voidInvoice(
        id,
        { sub: actorUserId } as AuthUserPayload,
        {
          voidReason: body.voidReason,
          replacementInvoiceId: body.replacementInvoiceId,
        },
      );
    }

    const restoreStatus =
      (invoice.statusBeforeDispute as InvoiceStatus | null) ??
      InvoiceStatus.PENDING_CONFIRMATION;

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        status: restoreStatus,
        disputeResolvedAt: new Date(),
        disputeResolvedBy: actorUserId,
        disputeResolutionNote: body.note ?? null,
      },
    });

    await this.audit.log({
      actorUserId,
      action: 'INVOICE_DISPUTE_CLEARED',
      entityType: 'billing.invoices',
      entityId: id,
      afterState: { status: restoreStatus, note: body.note },
    });

    await this.emails.sendToOrgOwners(
      invoice.organizationId,
      EmailTemplateId.BILLING_INVOICE_DISPUTE_RESOLVED,
      {
        jobReference: invoice.job?.referenceNumber ?? invoice.jobId,
        jobId: invoice.jobId,
        reason: body.note ?? 'Dispute cleared',
      },
      { entityType: 'billing.invoices', entityId: id },
    );
    const resolvedJobReference = invoice.job?.referenceNumber ?? invoice.jobId;
    await this.notifications.notifyOrgOwnersInApp(
      invoice.organizationId,
      'Invoice dispute resolved',
      `Job ${resolvedJobReference}: ${body.note ?? 'Dispute cleared'}`,
      {
        invoiceId: id,
        jobId: invoice.jobId,
        action: InAppNotificationAction.VIEW_INVOICE,
      },
    );

    return updated;
  }

  private async assertReplacementInvoice(
    replacementInvoiceId: string,
    organizationId: string,
    voidedInvoiceId: string,
  ) {
    if (replacementInvoiceId === voidedInvoiceId) {
      throw new BadRequestException(
        'Replacement invoice cannot be the same invoice',
      );
    }
    const replacement = await this.prisma.invoice.findUnique({
      where: { id: replacementInvoiceId },
      select: { id: true, organizationId: true, status: true },
    });
    if (!replacement) {
      throw new NotFoundException('Replacement invoice not found');
    }
    if (replacement.organizationId !== organizationId) {
      throw new BadRequestException(
        'Replacement invoice must belong to the same organization',
      );
    }
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
