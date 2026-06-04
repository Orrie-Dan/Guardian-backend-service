import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AssignmentStatus } from '@prisma/client';
import { AuditService } from '../common/services/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  BILLING_ALERT_EARLY_COMPLETION,
  BILLING_ALERT_LATE_ARRIVAL,
  BILLING_OPS_ALERT_ENTITY_TYPE,
} from './billing-ops.constants';
import { BillingOpsService } from './billing-ops.service';

describe('BillingOpsService', () => {
  let service: BillingOpsService;
  const prisma = {
    jobAssignment: { findMany: jest.fn() },
    auditLog: { findFirst: jest.fn() },
  };
  const audit = { log: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingOpsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(BillingOpsService);
    jest.clearAllMocks();
  });

  describe('detectEarlyCompletion', () => {
    it('flags completion more than 30 minutes before scheduled end', () => {
      const result = service.detectEarlyCompletion({
        completedAt: new Date('2026-06-01T11:00:00.000Z'),
        job: { scheduledEnd: new Date('2026-06-01T16:00:00.000Z') },
      });
      expect(result).toEqual({ minutesEarly: 270 });
    });

    it('returns null when within threshold', () => {
      const result = service.detectEarlyCompletion({
        completedAt: new Date('2026-06-01T15:45:00.000Z'),
        job: { scheduledEnd: new Date('2026-06-01T16:00:00.000Z') },
      });
      expect(result).toBeNull();
    });
  });

  describe('detectLateArrival', () => {
    it('flags arrival more than 15 minutes after scheduled start', () => {
      const result = service.detectLateArrival({
        arrivedAt: new Date('2026-06-01T08:20:00.000Z'),
        job: { scheduledStart: new Date('2026-06-01T08:00:00.000Z') },
      });
      expect(result).toEqual({ minutesLate: 5 });
    });

    it('returns null when on time', () => {
      const result = service.detectLateArrival({
        arrivedAt: new Date('2026-06-01T08:10:00.000Z'),
        job: { scheduledStart: new Date('2026-06-01T08:00:00.000Z') },
      });
      expect(result).toBeNull();
    });
  });

  describe('scanBillingAnomalies', () => {
    it('records deduplicated audit alerts', async () => {
      prisma.jobAssignment.findMany
        .mockResolvedValueOnce([
          {
            id: 'a-1',
            completedAt: new Date('2026-06-01T11:00:00.000Z'),
            arrivedAt: new Date('2026-06-01T08:00:00.000Z'),
            job: {
              id: 'job-1',
              referenceNumber: 'JOB-001',
              organizationId: 'org-1',
              scheduledStart: new Date('2026-06-01T08:00:00.000Z'),
              scheduledEnd: new Date('2026-06-01T16:00:00.000Z'),
            },
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'a-2',
            arrivedAt: new Date('2026-06-01T08:25:00.000Z'),
            job: {
              id: 'job-2',
              referenceNumber: 'JOB-002',
              organizationId: 'org-1',
              scheduledStart: new Date('2026-06-01T08:00:00.000Z'),
              scheduledEnd: new Date('2026-06-01T16:00:00.000Z'),
            },
          },
        ]);
      prisma.auditLog.findFirst.mockResolvedValue(null);

      const result = await service.scanBillingAnomalies();

      expect(result).toEqual({ earlyCompletion: 1, lateArrival: 1 });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: BILLING_ALERT_EARLY_COMPLETION,
          entityType: BILLING_OPS_ALERT_ENTITY_TYPE,
          entityId: 'a-1',
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: BILLING_ALERT_LATE_ARRIVAL,
          entityId: 'a-2',
        }),
      );
    });

    it('skips alerts already logged', async () => {
      prisma.jobAssignment.findMany
        .mockResolvedValueOnce([
          {
            id: 'a-1',
            completedAt: new Date('2026-06-01T11:00:00.000Z'),
            arrivedAt: new Date('2026-06-01T08:00:00.000Z'),
            job: {
              id: 'job-1',
              referenceNumber: 'JOB-001',
              organizationId: 'org-1',
              scheduledStart: new Date('2026-06-01T08:00:00.000Z'),
              scheduledEnd: new Date('2026-06-01T16:00:00.000Z'),
            },
          },
        ])
        .mockResolvedValueOnce([]);
      prisma.auditLog.findFirst.mockResolvedValue({ id: 'existing' });

      const result = await service.scanBillingAnomalies();

      expect(result.earlyCompletion).toBe(0);
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  describe('getReconciliation', () => {
    it('returns rows with summary and low sample flag', async () => {
      prisma.jobAssignment.findMany.mockResolvedValue([
        {
          id: 'a-1',
          guardianId: 'g-1',
          arrivedAt: new Date('2026-06-01T08:25:00.000Z'),
          completedAt: new Date('2026-06-01T11:00:00.000Z'),
          job: {
            id: 'job-1',
            referenceNumber: 'JOB-001',
            organizationId: 'org-1',
            scheduledStart: new Date('2026-06-01T08:00:00.000Z'),
            scheduledEnd: new Date('2026-06-01T16:00:00.000Z'),
            organization: {
              id: 'org-1',
              legalName: 'Acme Ltd',
              tradingName: 'Acme',
            },
            invoice: {
              billableHours: { toNumber: () => 3 },
              billingBasis: 'MINIMUM_GUARANTEED',
              status: 'ISSUED',
              total: { toString: () => '15000' },
            },
          },
          guardian: {
            guardianCode: 'G-001',
            user: { fullName: 'Jean' },
          },
        },
      ]);

      const result = await service.getReconciliation({
        from: new Date('2026-06-01T00:00:00.000Z'),
        to: new Date('2026-06-02T00:00:00.000Z'),
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].earlyCompletion).toBe(true);
      expect(result.items[0].lateArrival).toBe(true);
      expect(result.summary.jobCount).toBe(1);
      expect(result.meta.lowSampleSize).toBe(true);
    });

    it('rejects inverted date range', async () => {
      await expect(
        service.getReconciliation({
          from: new Date('2026-06-02T00:00:00.000Z'),
          to: new Date('2026-06-01T00:00:00.000Z'),
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
