import { Test, TestingModule } from '@nestjs/testing';
import { AssignmentStatus, JobStatus, NoShowTriggerType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: Record<string, any> = {
    job: {
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    jobAssignment: {
      count: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    jobFactsDaily: {
      upsert: jest.fn(),
    },
    guardianPerformanceDaily: {
      upsert: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get(AnalyticsService);
    jest.clearAllMocks();
  });

  it('computes KPI rates and latency percentiles', async () => {
    prisma.job.count
      .mockResolvedValueOnce(10) // jobsCreated
      .mockResolvedValueOnce(2); // jobsFailed
    prisma.jobAssignment.count
      .mockResolvedValueOnce(20) // total offers
      .mockResolvedValueOnce(8) // accepted offers
      .mockResolvedValueOnce(5); // expired offers
    prisma.jobAssignment.groupBy.mockResolvedValue([
      { noShowTriggerType: NoShowTriggerType.MANUAL, _count: { _all: 2 } },
      { noShowTriggerType: NoShowTriggerType.SYSTEM, _count: { _all: 1 } },
    ]);
    prisma.jobAssignment.findMany.mockImplementation((args: { distinct?: string[] }) => {
      if (args?.distinct?.includes('jobId')) {
        return Promise.resolve([
          { jobId: 'job-1' },
          { jobId: 'job-2' },
          { jobId: 'job-3' },
          { jobId: 'job-4' },
        ]);
      }
      return Promise.resolve([
        {
          offerSentAt: new Date('2026-06-01T10:00:00.000Z'),
          acceptedAt: new Date('2026-06-01T10:05:00.000Z'),
          arrivedAt: new Date('2026-06-01T10:25:00.000Z'),
          completedAt: new Date('2026-06-01T11:05:00.000Z'),
        },
        {
          offerSentAt: new Date('2026-06-01T12:00:00.000Z'),
          acceptedAt: new Date('2026-06-01T12:15:00.000Z'),
          arrivedAt: new Date('2026-06-01T12:35:00.000Z'),
          completedAt: new Date('2026-06-01T13:20:00.000Z'),
        },
      ]);
    });
    prisma.job.groupBy.mockResolvedValue([
      { dispatchFailureReason: 'dispatch_timeout', _count: { _all: 1 } },
      { dispatchFailureReason: 'dispatch_pool_exhausted', _count: { _all: 1 } },
    ]);
    prisma.job.findMany.mockResolvedValue([
      {
        createdAt: new Date('2026-06-01T09:50:00.000Z'),
        assignments: [{ offerSentAt: new Date('2026-06-01T10:00:00.000Z') }],
      },
      {
        createdAt: new Date('2026-06-01T11:45:00.000Z'),
        assignments: [{ offerSentAt: new Date('2026-06-01T12:00:00.000Z') }],
      },
    ]);

    const result = await service.kpiSummary({
      from: new Date('2026-06-01T00:00:00.000Z'),
      to: new Date('2026-06-02T00:00:00.000Z'),
    });

    expect(result.dispatchConversionRate).toBe(0.4);
    expect(result.offerAcceptanceRate).toBe(0.4);
    expect(result.offerExpiryRate).toBe(0.25);
    expect(result.noShowRate).toBe(0.375);
    expect(result.dispatchFailureRate).toBe(0.2);
    expect(result.noShowManual).toBe(2);
    expect(result.noShowSystem).toBe(1);
    expect(result.latencyMinutes.p50TimeToAccept).toBe(5);
    expect(result.latencyMinutes.p95TimeToAccept).toBe(15);
  });

  it('materializes daily facts with idempotent upserts', async () => {
    prisma.job.findMany.mockResolvedValue([
      {
        createdAt: new Date('2026-06-01T10:00:00.000Z'),
        jobType: 'STANDARD_GUARDIAN',
        status: JobStatus.COMPLETED,
        assignments: [
          {
            offerSentAt: new Date('2026-06-01T10:01:00.000Z'),
            acceptedAt: new Date('2026-06-01T10:06:00.000Z'),
          },
        ],
        location: { district: 'Gasabo' },
        invoice: { total: 1000 },
      },
    ]);
    prisma.jobAssignment.findMany.mockResolvedValue([
      {
        guardianId: 'g-1',
        status: AssignmentStatus.COMPLETED,
        offerSentAt: new Date('2026-06-01T10:01:00.000Z'),
        acceptedAt: new Date('2026-06-01T10:06:00.000Z'),
        noShowAt: null,
      },
    ]);
    prisma.jobFactsDaily.upsert.mockResolvedValue({});
    prisma.guardianPerformanceDaily.upsert.mockResolvedValue({});

    const result = await service.backfillWindow({
      from: new Date('2026-06-01T00:00:00.000Z'),
      to: new Date('2026-06-02T00:00:00.000Z'),
    });

    expect(result.skipped).toBe(false);
    expect(result.jobRowsWritten).toBe(1);
    expect(result.guardianRowsWritten).toBe(1);
    expect(prisma.jobFactsDaily.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.guardianPerformanceDaily.upsert).toHaveBeenCalledTimes(1);
  });
});
