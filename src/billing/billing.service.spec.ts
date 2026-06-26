import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BillingPolicyModel,
  InvoiceStatus,
  PricingModel,
  Prisma,
} from '@prisma/client';
import { AuthUserPayload } from '../auth/interfaces/auth-user.interface';
import { AuditService } from '../common/services/audit.service';
import { ResourceOwnerPolicy } from '../common/policies/resource-owner.policy';
import { EmailNotificationService } from '../notifications/email-notification.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { BillingCalculationService } from './billing-calculation.service';
import { InvoiceViewService } from './invoice-view.service';
import { GuardianPayrollService } from '../guardian-payroll/guardian-payroll.service';
import { ServicesService } from '../services/services.service';
import { BookingSettingsService } from '../services/booking-settings.service';
import { BillingService } from './billing.service';

describe('BillingService', () => {
  let service: BillingService;
  const prisma = {
    invoice: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    job: { findUnique: jest.fn() },
    jobAssignment: { findFirst: jest.fn(), findMany: jest.fn() },
    pricingRule: {
      findMany: jest.fn().mockResolvedValue([
        {
          organizationId: null,
          district: null,
          jobType: null,
          pricingModel: PricingModel.HOURLY,
          hourlyRate: new Prisma.Decimal(5000),
          flatFee: null,
          currency: 'RWF',
        },
      ]),
    },
  };
  const audit = { log: jest.fn() };
  const policy = { assertOrgMember: jest.fn() };
  const emails = { sendToOrgOwners: jest.fn() };
  const notifications = { notifyOrgOwnersInApp: jest.fn() };
  const outbox = { enqueue: jest.fn() };
  const calculation = {
    resolveBillingPolicy: jest.fn(),
    computeInvoiceAmounts: jest.fn(),
  };
  const invoiceView = {
    applyPendingConfirmationOnView: jest.fn((inv: { status: string }) => {
      if (inv.status === InvoiceStatus.DRAFT) {
        return { ...inv, status: InvoiceStatus.PENDING_CONFIRMATION };
      }
      return inv;
    }),
  };
  const guardianPayroll = {
    cancelEarningsForInvoice: jest.fn(),
    accrueForPaidInvoice: jest.fn(),
  };
  const servicesCatalog = {
    getHourlyRateForJobType: jest.fn().mockResolvedValue({
      hourlyRate: new Prisma.Decimal(5000),
      currency: 'RWF',
      serviceName: 'Standard Guardian',
    }),
  };
  const bookingSettings = {
    getPolicy: jest.fn().mockResolvedValue({
      minimumBookingHours: 2,
      nightSurchargeMinPct: 0.1,
      nightSurchargeMaxPct: 0.2,
      holidaySurchargeMinPct: 0.2,
      holidaySurchargeMaxPct: 0.3,
      guardianSharePct: 0.8,
      platformSharePct: 0.15,
      gatewaySharePct: 0.03,
      reserveSharePct: 0.02,
      vatRate: 0.18,
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: ResourceOwnerPolicy, useValue: policy },
        { provide: EmailNotificationService, useValue: emails },
        { provide: NotificationsService, useValue: notifications },
        { provide: OutboxService, useValue: outbox },
        { provide: BillingCalculationService, useValue: calculation },
        { provide: InvoiceViewService, useValue: invoiceView },
        { provide: GuardianPayrollService, useValue: guardianPayroll },
        { provide: ServicesService, useValue: servicesCatalog },
        { provide: BookingSettingsService, useValue: bookingSettings },
      ],
    }).compile();

    service = module.get(BillingService);
    jest.clearAllMocks();
  });

  describe('createDraftInvoiceForJob', () => {
    it('creates DRAFT invoice with breakdown and schedules auto-confirm', async () => {
      const job = {
        id: 'job-1',
        organizationId: 'org-1',
        referenceNumber: 'JOB-001',
        jobType: 'STANDARD_GUARDIAN',
        scheduledStart: new Date('2026-06-01T08:00:00.000Z'),
        scheduledEnd: new Date('2026-06-01T16:00:00.000Z'),
        requestedGuardianCount: 1,
        billingPolicyModel: BillingPolicyModel.MINIMUM_GUARANTEED,
        billingMinimumHours: new Prisma.Decimal(2),
        location: { district: 'Gasabo' },
      };
      prisma.invoice.findUnique.mockResolvedValue(null);
      prisma.jobAssignment.findMany.mockResolvedValue([
        {
          arrivedAt: new Date('2026-06-01T08:00:00.000Z'),
          completedAt: new Date('2026-06-01T11:00:00.000Z'),
        },
      ]);
      calculation.resolveBillingPolicy.mockResolvedValue({
        model: BillingPolicyModel.MINIMUM_GUARANTEED,
        minimumHours: new Prisma.Decimal(2),
      });
      calculation.computeInvoiceAmounts.mockReturnValue({
        scheduledHours: 8,
        actualHours: 3,
        billableHours: 3,
        billingBasis: BillingPolicyModel.MINIMUM_GUARANTEED,
        minimumHours: 2,
        subtotal: new Prisma.Decimal(15000),
        lineItems: [{ code: 'service', label: 'Guardian service (hourly)' }],
      });
      prisma.invoice.create.mockResolvedValue({
        id: 'inv-1',
        status: InvoiceStatus.DRAFT,
        total: new Prisma.Decimal(17700),
      });

      await service.createDraftInvoiceForJob(job as never, 'user-1');

      expect(prisma.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: InvoiceStatus.DRAFT,
            billableHours: new Prisma.Decimal(3),
            billingBasis: BillingPolicyModel.MINIMUM_GUARANTEED,
          }),
        }),
      );
      expect(outbox.enqueue).toHaveBeenCalled();
      expect(emails.sendToOrgOwners).toHaveBeenCalled();
      expect(notifications.notifyOrgOwnersInApp).toHaveBeenCalled();
    });
  });

  describe('issueIfDraft', () => {
    it('issues DRAFT invoice, audits, and emails org owners', async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        id: 'inv-1',
        status: InvoiceStatus.DRAFT,
        organizationId: 'org-1',
        jobId: 'job-1',
        total: { toString: () => '1000' },
        currency: 'RWF',
        job: { referenceNumber: 'JOB-001' },
      });
      prisma.invoice.update.mockResolvedValue({
        id: 'inv-1',
        status: InvoiceStatus.ISSUED,
      });

      const result = await service.issueIfDraft('inv-1', 'user-1');

      expect(result.status).toBe(InvoiceStatus.ISSUED);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: 'user-1',
          action: 'INVOICE_ISSUED',
          entityId: 'inv-1',
        }),
      );
      expect(emails.sendToOrgOwners).toHaveBeenCalled();
      expect(notifications.notifyOrgOwnersInApp).toHaveBeenCalled();
    });

    it('is idempotent when invoice is already ISSUED', async () => {
      const issued = {
        id: 'inv-1',
        status: InvoiceStatus.ISSUED,
        organizationId: 'org-1',
        jobId: 'job-1',
        job: { referenceNumber: 'JOB-001' },
      };
      prisma.invoice.findUnique.mockResolvedValue(issued);

      const result = await service.issueIfDraft('inv-1', 'user-1');

      expect(result).toBe(issued);
      expect(prisma.invoice.update).not.toHaveBeenCalled();
      expect(emails.sendToOrgOwners).not.toHaveBeenCalled();
    });

    it('issues PENDING_CONFIRMATION invoice', async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        id: 'inv-1',
        status: InvoiceStatus.PENDING_CONFIRMATION,
        organizationId: 'org-1',
        jobId: 'job-1',
        total: { toString: () => '1000' },
        currency: 'RWF',
        job: { referenceNumber: 'JOB-001' },
      });
      prisma.invoice.update.mockResolvedValue({
        id: 'inv-1',
        status: InvoiceStatus.ISSUED,
      });

      const result = await service.issueIfDraft('inv-1', 'user-1');
      expect(result.status).toBe(InvoiceStatus.ISSUED);
    });

    it('rejects issuing DISPUTED invoice', async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        id: 'inv-1',
        status: InvoiceStatus.DISPUTED,
        organizationId: 'org-1',
        jobId: 'job-1',
        job: { referenceNumber: 'JOB-001' },
      });

      await expect(service.issueIfDraft('inv-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getInvoice', () => {
    const actor = { sub: 'user-1' } as AuthUserPayload;

    it('moves DRAFT to PENDING_CONFIRMATION on first view', async () => {
      const draft = {
        id: 'inv-1',
        organizationId: 'org-1',
        jobId: 'job-1',
        status: InvoiceStatus.DRAFT,
        subtotal: new Prisma.Decimal(1000),
        taxAmount: new Prisma.Decimal(180),
        total: new Prisma.Decimal(1180),
        currency: 'RWF',
        lineItems: [],
        createdAt: new Date(),
        job: { referenceNumber: 'JOB-001', status: 'AWAITING_CONFIRMATION' },
      };
      prisma.invoice.findUnique.mockResolvedValue(draft);
      (invoiceView.applyPendingConfirmationOnView as jest.Mock).mockResolvedValue({
        ...draft,
        status: InvoiceStatus.PENDING_CONFIRMATION,
      });
      const result = await service.getInvoice('inv-1', actor);

      expect(result.status).toBe(InvoiceStatus.PENDING_CONFIRMATION);
      expect(result.scheduledWindow.hours).toBeDefined();
      expect(result.amounts.total).toBeDefined();
      expect(invoiceView.applyPendingConfirmationOnView).toHaveBeenCalled();
    });
  });

  describe('disputeInvoice', () => {
    const actor = { sub: 'user-1' } as AuthUserPayload;

    it('marks ISSUED invoice as DISPUTED', async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        id: 'inv-1',
        status: InvoiceStatus.ISSUED,
        organizationId: 'org-1',
        jobId: 'job-1',
        job: { referenceNumber: 'JOB-001' },
      });
      prisma.invoice.update.mockResolvedValue({
        id: 'inv-1',
        status: InvoiceStatus.DISPUTED,
      });

      const result = await service.disputeInvoice('inv-1', actor, {
        reason: 'Hours incorrect',
      });

      expect(result.status).toBe(InvoiceStatus.DISPUTED);
      expect(emails.sendToOrgOwners).toHaveBeenCalled();
      expect(notifications.notifyOrgOwnersInApp).toHaveBeenCalled();
    });
  });

  describe('voidInvoice', () => {
    const actor = { sub: 'user-1' } as AuthUserPayload;

    it('requires void reason and rejects PAID', async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        id: 'inv-1',
        status: InvoiceStatus.PAID,
        organizationId: 'org-1',
        jobId: 'job-1',
        job: { referenceNumber: 'JOB-001' },
      });

      await expect(
        service.voidInvoice('inv-1', actor, { voidReason: 'Duplicate' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
