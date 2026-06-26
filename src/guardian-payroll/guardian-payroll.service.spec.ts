import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AssignmentStatus,
  GuardianEarningStatus,
  GuardianPayoutStatus,
  InvoiceStatus,
  PayPolicyModel,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../common/services/audit.service';
import { EmailNotificationService } from '../notifications/email-notification.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { GuardianPayrollService } from './guardian-payroll.service';
import { GuardianPayPolicyService } from './guardian-pay-policy.service';

describe('GuardianPayrollService', () => {
  let service: GuardianPayrollService;

  const prisma = {
    invoice: { findUnique: jest.fn() },
    jobAssignment: { findMany: jest.fn() },
    guardianEarning: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    guardian: { findUnique: jest.fn() },
    guardianPayout: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const audit = { log: jest.fn() };
  const emails = { sendToUser: jest.fn() };
  const notifications = { notifyGuardianInApp: jest.fn() };
  const payPolicy = { resolvePayPolicy: jest.fn(), fallbackPayPolicy: jest.fn() };

  const scheduledStart = new Date('2026-06-01T08:00:00.000Z');
  const scheduledEnd = new Date('2026-06-01T16:00:00.000Z');

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuardianPayrollService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: EmailNotificationService, useValue: emails },
        { provide: NotificationsService, useValue: notifications },
        { provide: GuardianPayPolicyService, useValue: payPolicy },
      ],
    }).compile();

    service = module.get(GuardianPayrollService);
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn(prisma),
    );
  });

  describe('accrueForPaidInvoice', () => {
    it('creates one earning per completed assignment with hourly rate', async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        id: 'inv-1',
        jobId: 'job-1',
        status: InvoiceStatus.PAID,
        currency: 'RWF',
        job: { scheduledStart, scheduledEnd, jobType: 'PATROL' },
      });
      prisma.jobAssignment.findMany.mockResolvedValue([
        {
          id: 'asg-1',
          guardianId: 'g-1',
          arrivedAt: new Date('2026-06-01T08:00:00.000Z'),
          completedAt: new Date('2026-06-01T11:00:00.000Z'),
          payPolicyModel: PayPolicyModel.MINIMUM_GUARANTEED,
          payMinimumHours: new Prisma.Decimal(1),
          payApplyOnEarlyRelease: true,
          earlyReleaseResolution: null,
          hourlyPayRateAtCommit: new Prisma.Decimal(5000),
          acceptedAt: new Date('2026-06-01T07:00:00.000Z'),
          guardian: {
            hourlyPayRate: new Prisma.Decimal(5000),
            payCurrency: 'RWF',
            employmentType: 'PART_TIME',
          },
        },
      ]);
      prisma.guardianEarning.findUnique.mockResolvedValue(null);
      prisma.guardianEarning.create.mockResolvedValue({ id: 'earn-1' });

      const ids = await service.accrueForPaidInvoice('inv-1');

      expect(ids).toEqual(['earn-1']);
      expect(prisma.guardianEarning.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            guardianId: 'g-1',
            status: GuardianEarningStatus.PENDING_PAYOUT,
            amount: new Prisma.Decimal(15000),
          }),
        }),
      );
    });

    it('applies minimum guaranteed pay from assignment snapshot', async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        id: 'inv-1',
        jobId: 'job-1',
        status: InvoiceStatus.PAID,
        currency: 'RWF',
        job: { scheduledStart, scheduledEnd, jobType: 'PATROL' },
      });
      prisma.jobAssignment.findMany.mockResolvedValue([
        {
          id: 'asg-1',
          guardianId: 'g-1',
          arrivedAt: new Date('2026-06-01T08:00:00.000Z'),
          completedAt: new Date('2026-06-01T08:30:00.000Z'),
          payPolicyModel: PayPolicyModel.MINIMUM_GUARANTEED,
          payMinimumHours: new Prisma.Decimal(1),
          payApplyOnEarlyRelease: true,
          earlyReleaseResolution: null,
          hourlyPayRateAtCommit: new Prisma.Decimal(5000),
          acceptedAt: new Date('2026-06-01T07:00:00.000Z'),
          guardian: {
            hourlyPayRate: new Prisma.Decimal(5000),
            payCurrency: 'RWF',
            employmentType: 'PART_TIME',
          },
        },
      ]);
      prisma.guardianEarning.findUnique.mockResolvedValue(null);
      prisma.guardianEarning.create.mockResolvedValue({ id: 'earn-1' });

      await service.accrueForPaidInvoice('inv-1');

      expect(prisma.guardianEarning.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            payableHours: new Prisma.Decimal(1),
            actualHours: new Prisma.Decimal(0.5),
            amount: new Prisma.Decimal(5000),
            payBasis: 'MINIMUM_GUARANTEED',
          }),
        }),
      );
    });

    it('creates BLOCKED earning when guardian has no hourly rate', async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        id: 'inv-1',
        jobId: 'job-1',
        status: InvoiceStatus.PAID,
        currency: 'RWF',
        job: { scheduledStart, scheduledEnd, jobType: 'PATROL' },
      });
      prisma.jobAssignment.findMany.mockResolvedValue([
        {
          id: 'asg-1',
          guardianId: 'g-1',
          arrivedAt: new Date('2026-06-01T08:00:00.000Z'),
          completedAt: new Date('2026-06-01T10:00:00.000Z'),
          payPolicyModel: PayPolicyModel.MINIMUM_GUARANTEED,
          payMinimumHours: new Prisma.Decimal(1),
          payApplyOnEarlyRelease: true,
          earlyReleaseResolution: null,
          hourlyPayRateAtCommit: null,
          acceptedAt: new Date('2026-06-01T07:00:00.000Z'),
          guardian: { hourlyPayRate: null, payCurrency: 'RWF', employmentType: 'PART_TIME' },
        },
      ]);
      prisma.guardianEarning.findUnique.mockResolvedValue(null);
      prisma.guardianEarning.create.mockResolvedValue({ id: 'earn-1' });

      await service.accrueForPaidInvoice('inv-1');

      expect(prisma.guardianEarning.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: GuardianEarningStatus.BLOCKED,
            amount: new Prisma.Decimal(0),
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'GUARDIAN_EARNING_BLOCKED' }),
      );
    });

    it('creates one earning per guardian for a multi-guardian job', async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        id: 'inv-1',
        jobId: 'job-1',
        status: InvoiceStatus.PAID,
        currency: 'RWF',
        job: { scheduledStart, scheduledEnd, jobType: 'PATROL' },
      });
      prisma.jobAssignment.findMany.mockResolvedValue([
        {
          id: 'asg-1',
          guardianId: 'g-1',
          arrivedAt: new Date('2026-06-01T08:00:00.000Z'),
          completedAt: new Date('2026-06-01T11:00:00.000Z'),
          payPolicyModel: PayPolicyModel.MINIMUM_GUARANTEED,
          payMinimumHours: new Prisma.Decimal(1),
          payApplyOnEarlyRelease: true,
          earlyReleaseResolution: null,
          hourlyPayRateAtCommit: new Prisma.Decimal(5000),
          acceptedAt: new Date('2026-06-01T07:00:00.000Z'),
          guardian: {
            hourlyPayRate: new Prisma.Decimal(5000),
            payCurrency: 'RWF',
            employmentType: 'PART_TIME',
          },
        },
        {
          id: 'asg-2',
          guardianId: 'g-2',
          arrivedAt: new Date('2026-06-01T08:05:00.000Z'),
          completedAt: new Date('2026-06-01T12:00:00.000Z'),
          payPolicyModel: PayPolicyModel.MINIMUM_GUARANTEED,
          payMinimumHours: new Prisma.Decimal(1),
          payApplyOnEarlyRelease: true,
          earlyReleaseResolution: null,
          hourlyPayRateAtCommit: new Prisma.Decimal(6000),
          acceptedAt: new Date('2026-06-01T07:05:00.000Z'),
          guardian: {
            hourlyPayRate: new Prisma.Decimal(6000),
            payCurrency: 'RWF',
            employmentType: 'PART_TIME',
          },
        },
      ]);
      prisma.guardianEarning.findUnique.mockResolvedValue(null);
      prisma.guardianEarning.create
        .mockResolvedValueOnce({ id: 'earn-1' })
        .mockResolvedValueOnce({ id: 'earn-2' });

      const ids = await service.accrueForPaidInvoice('inv-1');

      expect(ids).toEqual(['earn-1', 'earn-2']);
      expect(prisma.guardianEarning.create).toHaveBeenCalledTimes(2);
      expect(prisma.guardianEarning.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ guardianId: 'g-1', assignmentId: 'asg-1' }),
        }),
      );
      expect(prisma.guardianEarning.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ guardianId: 'g-2', assignmentId: 'asg-2' }),
        }),
      );
    });

    it('is idempotent per assignment', async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        id: 'inv-1',
        jobId: 'job-1',
        status: InvoiceStatus.PAID,
        currency: 'RWF',
        job: { scheduledStart, scheduledEnd, jobType: 'PATROL' },
      });
      prisma.jobAssignment.findMany.mockResolvedValue([
        {
          id: 'asg-1',
          guardianId: 'g-1',
          arrivedAt: new Date('2026-06-01T08:00:00.000Z'),
          completedAt: new Date('2026-06-01T10:00:00.000Z'),
          payPolicyModel: PayPolicyModel.MINIMUM_GUARANTEED,
          payMinimumHours: new Prisma.Decimal(1),
          payApplyOnEarlyRelease: true,
          earlyReleaseResolution: null,
          hourlyPayRateAtCommit: new Prisma.Decimal(5000),
          acceptedAt: new Date('2026-06-01T07:00:00.000Z'),
          guardian: {
            hourlyPayRate: new Prisma.Decimal(5000),
            payCurrency: 'RWF',
            employmentType: 'PART_TIME',
          },
        },
      ]);
      prisma.guardianEarning.findUnique.mockResolvedValue({ id: 'earn-existing' });

      const ids = await service.accrueForPaidInvoice('inv-1');

      expect(ids).toEqual([]);
      expect(prisma.guardianEarning.create).not.toHaveBeenCalled();
    });
  });

  describe('createPayout', () => {
    it('bundles pending earnings into a payout', async () => {
      prisma.guardianPayout.findUnique.mockResolvedValue(null);
      prisma.guardianEarning.findMany.mockResolvedValue([
        {
          id: 'earn-1',
          amount: new Prisma.Decimal(10000),
          guardianId: 'g-1',
          status: GuardianEarningStatus.PENDING_PAYOUT,
        },
      ]);
      prisma.guardian.findUnique.mockResolvedValue({
        id: 'g-1',
        payCurrency: 'RWF',
      });
      prisma.guardianPayout.create.mockResolvedValue({ id: 'pay-1' });

      const result = await service.createPayout(
        'g-1',
        {
          earningIds: ['earn-1'],
          provider: 'MOMO_MTN',
          idempotencyKey: 'key-1',
        },
        'ops-1',
      );

      expect(result).toEqual({ id: 'pay-1' });
      expect(prisma.guardianPayout.create).toHaveBeenCalled();
      expect(prisma.guardianEarning.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['earn-1'] } },
        data: { payoutId: 'pay-1' },
      });
    });

    it('rejects earnings not pending payout', async () => {
      prisma.guardianPayout.findUnique.mockResolvedValue(null);
      prisma.guardianEarning.findMany.mockResolvedValue([]);

      await expect(
        service.createPayout(
          'g-1',
          {
            earningIds: ['earn-1'],
            provider: 'MOMO_MTN',
            idempotencyKey: 'key-1',
          },
          'ops-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('confirmPayout', () => {
    it('marks payout and linked earnings as paid', async () => {
      prisma.guardianPayout.findUnique.mockResolvedValue({
        id: 'pay-1',
        status: GuardianPayoutStatus.PENDING,
        guardianId: 'g-1',
        amount: new Prisma.Decimal(10000),
        currency: 'RWF',
        externalTxnId: null,
        guardian: { userId: 'u-1', user: {} },
      });
      prisma.guardianPayout.update.mockResolvedValue({
        id: 'pay-1',
        status: GuardianPayoutStatus.COMPLETED,
      });

      await service.confirmPayout('pay-1', 'momo-txn-1');

      expect(prisma.guardianEarning.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { payoutId: 'pay-1' },
          data: expect.objectContaining({
            status: GuardianEarningStatus.PAID,
          }),
        }),
      );
      expect(notifications.notifyGuardianInApp).toHaveBeenCalled();
    });
  });
});
