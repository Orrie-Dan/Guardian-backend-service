import { Test, TestingModule } from '@nestjs/testing';
import {
  BillingPolicyModel,
  EarlyReleaseResolution,
  PricingModel,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingCalculationService } from './billing-calculation.service';

describe('BillingCalculationService', () => {
  let service: BillingCalculationService;
  const prisma = {
    billingPolicy: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingCalculationService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(BillingCalculationService);
    jest.clearAllMocks();
  });

  describe('computeBillableDuration', () => {
    const scheduledStart = new Date('2026-06-01T08:00:00.000Z');
    const scheduledEnd = new Date('2026-06-01T16:00:00.000Z');
    const arrivedAt = new Date('2026-06-01T08:05:00.000Z');
    const completedEarly = new Date('2026-06-01T11:00:00.000Z');
    const completedFull = new Date('2026-06-01T16:00:00.000Z');

    it('MINIMUM_GUARANTEED bills max(minimum, min(scheduled, actual)) on early leave', () => {
      const result = service.computeBillableDuration(
        BillingPolicyModel.MINIMUM_GUARANTEED,
        2,
        scheduledStart,
        scheduledEnd,
        arrivedAt,
        completedEarly,
      );
      expect(result.scheduledHours).toBe(8);
      expect(result.actualHours).toBeCloseTo(2.92, 1);
      expect(result.billableHours).toBeCloseTo(2.92, 1);
    });

    it('MINIMUM_GUARANTEED applies minimum floor when actual is shorter', () => {
      const completedVeryEarly = new Date('2026-06-01T08:30:00.000Z');
      const result = service.computeBillableDuration(
        BillingPolicyModel.MINIMUM_GUARANTEED,
        2,
        scheduledStart,
        scheduledEnd,
        arrivedAt,
        completedVeryEarly,
      );
      expect(result.billableHours).toBe(2);
    });

    it('BOOKED_BLOCK bills full scheduled window', () => {
      const result = service.computeBillableDuration(
        BillingPolicyModel.BOOKED_BLOCK,
        2,
        scheduledStart,
        scheduledEnd,
        arrivedAt,
        completedEarly,
      );
      expect(result.billableHours).toBe(8);
    });

    it('ACTUAL_TIME caps at scheduled hours', () => {
      const completedLate = new Date('2026-06-01T18:00:00.000Z');
      const result = service.computeBillableDuration(
        BillingPolicyModel.ACTUAL_TIME,
        2,
        scheduledStart,
        scheduledEnd,
        arrivedAt,
        completedLate,
      );
      expect(result.billableHours).toBe(8);
    });

    it('ACTUAL_TIME uses actual when under scheduled', () => {
      const result = service.computeBillableDuration(
        BillingPolicyModel.ACTUAL_TIME,
        2,
        scheduledStart,
        scheduledEnd,
        arrivedAt,
        completedEarly,
      );
      expect(result.billableHours).toBeCloseTo(2.92, 1);
    });
  });

  describe('computeInvoiceAmounts', () => {
    it('prorates BOOKED_BLOCK to actual hours when early release approved', () => {
      const result = service.computeInvoiceAmounts({
        job: {
          scheduledStart: new Date('2026-06-01T08:00:00.000Z'),
          scheduledEnd: new Date('2026-06-01T16:00:00.000Z'),
          requestedGuardianCount: 1,
          billingPolicyModel: BillingPolicyModel.BOOKED_BLOCK,
          billingMinimumHours: new Prisma.Decimal(2),
          billingProrationEnabled: true,
        },
        assignment: {
          arrivedAt: new Date('2026-06-01T08:00:00.000Z'),
          completedAt: new Date('2026-06-01T11:00:00.000Z'),
          earlyReleaseResolution: EarlyReleaseResolution.APPROVED,
        },
        policy: {
          model: BillingPolicyModel.BOOKED_BLOCK,
          minimumHours: new Prisma.Decimal(2),
          prorationEnabled: true,
        },
        pricingModel: PricingModel.HOURLY,
        hourlyRate: new Prisma.Decimal(5000),
        flatFee: null,
      });

      expect(result.billableHours).toBe(3);
      expect(result.subtotal.toString()).toBe('15000');
    });

    it('computes hourly subtotal from billable hours', () => {
      const result = service.computeInvoiceAmounts({
        job: {
          scheduledStart: new Date('2026-06-01T08:00:00.000Z'),
          scheduledEnd: new Date('2026-06-01T16:00:00.000Z'),
          requestedGuardianCount: 2,
          billingPolicyModel: BillingPolicyModel.MINIMUM_GUARANTEED,
          billingMinimumHours: new Prisma.Decimal(2),
          billingProrationEnabled: true,
        },
        assignment: {
          arrivedAt: new Date('2026-06-01T08:00:00.000Z'),
          completedAt: new Date('2026-06-01T11:00:00.000Z'),
          earlyReleaseResolution: null,
        },
        policy: {
          model: BillingPolicyModel.MINIMUM_GUARANTEED,
          minimumHours: new Prisma.Decimal(2),
          prorationEnabled: true,
        },
        pricingModel: PricingModel.HOURLY,
        hourlyRate: new Prisma.Decimal(5000),
        flatFee: null,
      });

      expect(result.billableHours).toBe(3);
      expect(result.subtotal.toString()).toBe('30000');
      expect(result.lineItems.some((i) => i.code === 'service')).toBe(true);
    });
  });

  describe('resolveBillingPolicy', () => {
    it('picks highest priority matching policy', async () => {
      prisma.billingPolicy.findMany.mockResolvedValue([
        {
          id: 'high',
          priority: 100,
          organizationId: 'org-1',
          jobType: null,
          model: BillingPolicyModel.BOOKED_BLOCK,
          minimumHours: new Prisma.Decimal(2),
        },
        {
          id: 'low',
          priority: 1,
          organizationId: null,
          jobType: null,
          model: BillingPolicyModel.MINIMUM_GUARANTEED,
          minimumHours: new Prisma.Decimal(2),
        },
      ]);

      const result = await service.resolveBillingPolicy(
        'org-1',
        'PATROL' as never,
        new Date('2026-06-01T10:00:00.000Z'),
      );

      expect(result.id).toBe('high');
    });
  });
});
