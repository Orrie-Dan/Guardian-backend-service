import { Test, TestingModule } from '@nestjs/testing';
import { AssignmentStatus, JobPriority, JobStatus } from '@prisma/client';
import { AuditService } from '../common/services/audit.service';
import { BillingService } from '../billing/billing.service';
import { GuardianDispatchEligibilityService } from '../guardians/guardian-dispatch-eligibility.service';
import { ShiftStateService } from '../guardians/shift-state.service';
import { JobLifecycleService } from '../jobs/job-lifecycle.service';
import { EmailNotificationService } from '../notifications/email-notification.service';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { DispatchingService } from './dispatching.service';

describe('DispatchingService', () => {
  let service: DispatchingService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: Record<string, any> = {
    job: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
    jobAssignment: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    guardianShiftState: { update: jest.fn() },
    jobStatusHistory: { create: jest.fn() },
    dispatchAuditLog: { create: jest.fn() },
  };
  const queue = {
    registerOfferExpiryHandler: jest.fn(),
    scheduleOfferExpiry: jest.fn(),
    cancelOfferExpiry: jest.fn(),
  };
  const audit = { log: jest.fn() };
  const eligibility = {
    pickNextReachableGuardian: jest.fn(),
    pickParallelReachableGuardians: jest.fn(),
    countEligibleGuardians: jest.fn(),
    listEligibleGuardianIds: jest.fn(),
    getTriedGuardianIds: jest.fn(),
    getExcludedGuardianIds: jest.fn(),
    hasActiveOffer: jest.fn(),
    normalizeDistrict: jest.fn((d: string) => d.toLowerCase()),
    defaultPoolLimit: jest.fn().mockReturnValue(50),
    filterReachable: jest.fn(),
  };
  const shiftState = { setAvailable: jest.fn() };
  const outbox = { enqueue: jest.fn() };
  const billing = { issueDraftForJobId: jest.fn() };
  const lifecycle = {
    transitionToAssigned: jest.fn(),
    confirmBilling: jest.fn(),
    completeExplicit: jest.fn(),
  };
  const emails = {
    sendToGuardianUser: jest.fn(),
    sendToOrgOwners: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DispatchingService,
        { provide: PrismaService, useValue: prisma },
        { provide: QueueService, useValue: queue },
        { provide: AuditService, useValue: audit },
        { provide: GuardianDispatchEligibilityService, useValue: eligibility },
        { provide: ShiftStateService, useValue: shiftState },
        { provide: OutboxService, useValue: outbox },
        { provide: JobLifecycleService, useValue: lifecycle },
        { provide: BillingService, useValue: billing },
        { provide: EmailNotificationService, useValue: emails },
      ],
    }).compile();

    service = module.get(DispatchingService);
    jest.clearAllMocks();
    prisma.dispatchAuditLog.create.mockResolvedValue({});
    prisma.job.update.mockResolvedValue({});
  });

  it('queues dispatch via outbox', async () => {
    prisma.job.findUnique.mockResolvedValue({
      id: 'job-1',
      status: JobStatus.PENDING,
      dispatchDeadlineAt: new Date(Date.now() + 600_000),
      dispatchStartedAt: new Date(),
    });
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) =>
      fn(prisma),
    );

    const result = await service.requestDispatch('job-1');

    expect(result.queued).toBe(true);
    expect(outbox.enqueue).toHaveBeenCalled();
  });

  it('fails job when dispatch deadline passed at processDispatch', async () => {
    prisma.job.findUnique.mockResolvedValue({
      id: 'job-1',
      status: JobStatus.DISPATCHING,
      offersSentCount: 0,
      dispatchDeadlineAt: new Date(Date.now() - 60_000),
      dispatchStartedAt: new Date(),
      unreachableSince: null,
      priority: JobPriority.STANDARD,
      location: { district: 'gasabo' },
    });
    prisma.jobAssignment.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) =>
      fn(prisma),
    );

    await service.processDispatch('job-1');

    expect(prisma.job.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-1' },
        data: expect.objectContaining({
          status: JobStatus.FAILED,
          dispatchFailureReason: 'dispatch_timeout',
        }),
      }),
    );
    expect(eligibility.pickNextReachableGuardian).not.toHaveBeenCalled();
  });

  it('offers second guardian after first is excluded without incrementing fake attempts on empty pass', async () => {
    prisma.job.findUnique
      .mockResolvedValueOnce({
        id: 'job-1',
        status: JobStatus.DISPATCHING,
        offersSentCount: 1,
        dispatchDeadlineAt: new Date(Date.now() + 600_000),
        dispatchStartedAt: new Date(),
        unreachableSince: null,
        priority: JobPriority.STANDARD,
        location: { district: 'gasabo' },
      })
      .mockResolvedValueOnce({ referenceNumber: 'REF-1' });
    eligibility.hasActiveOffer.mockResolvedValue(false);
    eligibility.countEligibleGuardians.mockResolvedValue(3);
    eligibility.listEligibleGuardianIds.mockResolvedValue([
      { id: 'g-1' },
      { id: 'g-2' },
      { id: 'g-3' },
    ]);
    eligibility.getTriedGuardianIds.mockResolvedValue(new Set(['g-1']));
    eligibility.pickNextReachableGuardian.mockResolvedValue({
      guardian: { id: 'g-2' },
      excludedCount: 1,
      poolCount: 3,
      candidateCount: 2,
      reachableCount: 1,
      eligibleIds: ['g-2', 'g-3'],
      reachableIds: ['g-2'],
    });
    prisma.jobAssignment.count.mockResolvedValue(1);
    prisma.jobAssignment.create.mockResolvedValue({
      id: 'a-2',
      guardianId: 'g-2',
      expiresAt: new Date(Date.now() + 90_000),
    });
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) =>
      fn(prisma),
    );

    await service.processDispatch('job-1');

    expect(prisma.jobAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ guardianId: 'g-2' }),
      }),
    );
    expect(outbox.enqueue).not.toHaveBeenCalledWith(
      expect.objectContaining({ scheduledAt: expect.any(Date) }),
    );
  });

  it('re-queues with backoff on no reachable candidates without failing immediately', async () => {
    prisma.job.findUnique.mockResolvedValue({
      id: 'job-1',
      status: JobStatus.DISPATCHING,
      offersSentCount: 1,
      dispatchDeadlineAt: new Date(Date.now() + 600_000),
      dispatchStartedAt: new Date(),
      unreachableSince: null,
      priority: JobPriority.STANDARD,
      location: { district: 'gasabo' },
    });
    eligibility.hasActiveOffer.mockResolvedValue(false);
    eligibility.countEligibleGuardians.mockResolvedValue(2);
    eligibility.listEligibleGuardianIds.mockResolvedValue([{ id: 'g-2' }]);
    eligibility.getTriedGuardianIds.mockResolvedValue(new Set(['g-1']));
    eligibility.pickNextReachableGuardian.mockResolvedValue({
      guardian: null,
      excludedCount: 1,
      poolCount: 2,
      candidateCount: 1,
      reachableCount: 0,
      eligibleIds: ['g-2'],
      reachableIds: [],
    });
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) =>
      fn(prisma),
    );

    await service.processDispatch('job-1');

    expect(outbox.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'JOB_DISPATCH_REQUESTED',
        payload: { jobId: 'job-1' },
      }),
    );
    expect(prisma.job.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: JobStatus.FAILED },
      }),
    );
  });

  it('fails when all eligible guardians have been tried', async () => {
    prisma.job.findUnique.mockResolvedValue({
      id: 'job-1',
      status: JobStatus.DISPATCHING,
      offersSentCount: 3,
      dispatchDeadlineAt: new Date(Date.now() + 600_000),
      dispatchStartedAt: new Date(),
      unreachableSince: null,
      priority: JobPriority.STANDARD,
      location: { district: 'gasabo' },
    });
    eligibility.hasActiveOffer.mockResolvedValue(false);
    eligibility.countEligibleGuardians.mockResolvedValue(2);
    eligibility.listEligibleGuardianIds.mockResolvedValue([{ id: 'g-1' }, { id: 'g-2' }]);
    eligibility.getTriedGuardianIds.mockResolvedValue(new Set(['g-1', 'g-2']));
    prisma.jobAssignment.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) =>
      fn(prisma),
    );

    const failed = await service.failDispatchPoolExhaustedIfApplicable('job-1');

    expect(failed).toBe(true);
    expect(prisma.job.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: JobStatus.FAILED,
          dispatchFailureReason: 'dispatch_pool_exhausted',
        }),
      }),
    );
  });

  it('rejectOffer re-queues dispatch immediately', async () => {
    prisma.jobAssignment.findUnique.mockResolvedValue({
      id: 'a-1',
      jobId: 'job-1',
      guardianId: 'g-1',
      status: AssignmentStatus.OFFERED,
      versionNumber: 1,
    });
    prisma.jobAssignment.updateMany.mockResolvedValue({ count: 1 });
    prisma.jobAssignment.findUniqueOrThrow = jest.fn().mockResolvedValue({
      id: 'a-1',
      status: AssignmentStatus.DECLINED,
    });
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) =>
      fn(prisma),
    );

    await service.rejectOffer('a-1', 'g-1');

    expect(outbox.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'JOB_DISPATCH_REQUESTED',
        payload: { jobId: 'job-1' },
      }),
    );
    const call = outbox.enqueue.mock.calls[0][0];
    expect(call.scheduledAt).toBeUndefined();
  });
});
