import { Test, TestingModule } from '@nestjs/testing';
import { AssignmentStatus, JobPriority, JobStatus } from '@prisma/client';
import { AuditService } from '../common/services/audit.service';
import { BillingService } from '../billing/billing.service';
import { GuardianDispatchEligibilityService } from '../guardians/guardian-dispatch-eligibility.service';
import { ShiftStateService } from '../guardians/shift-state.service';
import { JobLifecycleService } from '../jobs/job-lifecycle.service';
import { JobStaffingService } from '../jobs/job-staffing.service';
import { EmailNotificationService } from '../notifications/email-notification.service';
import { NotificationsService } from '../notifications/notifications.service';
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
      count: jest.fn().mockResolvedValue(0),
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
    transitionToPartiallyAssigned: jest.fn(),
    confirmBilling: jest.fn(),
    completeExplicit: jest.fn(),
  };
  const staffing = {
    applyAcceptStaffingUpdate: jest.fn(),
    applyUnfilledSlotRedispatch: jest.fn(),
  };
  const emails = {
    sendToGuardianUser: jest.fn(),
    sendToOrgOwners: jest.fn(),
    sendToOpsAdmins: jest.fn(),
  };
  const notifications = {
    notifyGuardianInApp: jest.fn(),
    notifyOpsAdminsInApp: jest.fn(),
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
        { provide: JobStaffingService, useValue: staffing },
        { provide: BillingService, useValue: billing },
        { provide: EmailNotificationService, useValue: emails },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get(DispatchingService);
    jest.clearAllMocks();
    prisma.dispatchAuditLog.create.mockResolvedValue({});
    prisma.job.update.mockResolvedValue({});
    prisma.job.updateMany.mockResolvedValue({ count: 0 });
    eligibility.hasActiveOffer.mockResolvedValue(false);
    eligibility.countEligibleGuardians.mockResolvedValue(0);
    eligibility.listEligibleGuardianIds.mockResolvedValue([]);
    eligibility.getTriedGuardianIds.mockResolvedValue(new Set());
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
      requestedGuardianCount: 1,
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
    expect(eligibility.pickParallelReachableGuardians).not.toHaveBeenCalled();
    expect(eligibility.pickNextReachableGuardian).not.toHaveBeenCalled();
  });

  it('uses parallel dispatch for STANDARD jobs', async () => {
    prisma.job.findUnique.mockResolvedValue({
      id: 'job-1',
      status: JobStatus.PENDING,
      offersSentCount: 0,
      dispatchDeadlineAt: new Date(Date.now() + 600_000),
      dispatchStartedAt: new Date(),
      unreachableSince: null,
      priority: JobPriority.STANDARD,
      requestedGuardianCount: 1,
      location: { district: 'gasabo' },
    });
    eligibility.getTriedGuardianIds.mockResolvedValue(new Set());
    eligibility.pickParallelReachableGuardians.mockResolvedValue({
      guardians: [],
      excludedCount: 0,
      candidateCount: 0,
      reachableCount: 0,
      eligibleIds: [],
      reachableIds: [],
    });
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) =>
      fn(prisma),
    );

    await service.processDispatch('job-1');

    expect(eligibility.pickParallelReachableGuardians).toHaveBeenCalled();
    expect(eligibility.pickNextReachableGuardian).not.toHaveBeenCalled();
  });

  it('offers reachable guardians in parallel for STANDARD job', async () => {
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
      .mockResolvedValue({ referenceNumber: 'REF-1' });
    eligibility.getTriedGuardianIds.mockResolvedValue(new Set(['g-1']));
    eligibility.pickParallelReachableGuardians.mockResolvedValue({
      guardians: [{ id: 'g-2' }, { id: 'g-3' }],
      excludedCount: 1,
      candidateCount: 2,
      reachableCount: 2,
      eligibleIds: ['g-2', 'g-3'],
      reachableIds: ['g-2', 'g-3'],
    });
    prisma.jobAssignment.count.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    prisma.jobAssignment.create
      .mockResolvedValueOnce({
        id: 'a-2',
        guardianId: 'g-2',
        expiresAt: new Date(Date.now() + 90_000),
      })
      .mockResolvedValueOnce({
        id: 'a-3',
        guardianId: 'g-3',
        expiresAt: new Date(Date.now() + 90_000),
      });
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) =>
      fn(prisma),
    );

    await service.processDispatch('job-1');

    expect(prisma.jobAssignment.create).toHaveBeenCalledTimes(2);
    expect(outbox.enqueue).not.toHaveBeenCalledWith(
      expect.objectContaining({ scheduledAt: expect.any(Date) }),
    );
  });

  it('re-queues with backoff on first pass when eligible but unreachable', async () => {
    prisma.job.findUnique
      .mockResolvedValueOnce({
        id: 'job-1',
        status: JobStatus.PENDING,
        offersSentCount: 0,
        dispatchDeadlineAt: new Date(Date.now() + 600_000),
        dispatchStartedAt: new Date(),
        unreachableSince: null,
        priority: JobPriority.STANDARD,
        location: { district: 'gasabo' },
      })
      .mockResolvedValueOnce({
        id: 'job-1',
        offersSentCount: 0,
        location: { district: 'gasabo' },
      });
    eligibility.getTriedGuardianIds.mockResolvedValue(new Set());
    eligibility.pickParallelReachableGuardians.mockResolvedValue({
      guardians: [],
      excludedCount: 0,
      candidateCount: 3,
      reachableCount: 0,
      eligibleIds: ['g-1', 'g-2', 'g-3'],
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
        scheduledAt: expect.any(Date),
      }),
    );
    expect(prisma.job.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: JobStatus.FAILED },
      }),
    );
  });

  it('re-queues replacement dispatch when eligible but unreachable on first pass', async () => {
    prisma.job.findUnique.mockImplementation(async () => ({
      id: 'job-1',
      status: JobStatus.SEEKING_REPLACEMENT,
      offersSentCount: 0,
      dispatchDeadlineAt: new Date(Date.now() + 600_000),
      dispatchStartedAt: new Date(),
      unreachableSince: null,
      replacementDepartingAssignmentId: 'a-departing',
      location: { district: 'gasabo' },
    }));
    eligibility.getTriedGuardianIds.mockResolvedValue(new Set());
    eligibility.pickNextReachableGuardian.mockResolvedValue({
      guardian: null,
      excludedCount: 0,
      poolCount: 3,
      candidateCount: 3,
      reachableCount: 0,
      eligibleIds: ['g-1', 'g-2', 'g-3'],
      reachableIds: [],
    });
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) =>
      fn(prisma),
    );

    await service.processDispatch('job-1');

    expect(eligibility.pickNextReachableGuardian).toHaveBeenCalled();
    expect(eligibility.pickParallelReachableGuardians).not.toHaveBeenCalled();
    expect(outbox.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'JOB_DISPATCH_REQUESTED',
        payload: { jobId: 'job-1', replacement: true },
        scheduledAt: expect.any(Date),
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
      requestedGuardianCount: 1,
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
      job: { id: 'job-1', status: JobStatus.DISPATCHING },
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
        payload: { jobId: 'job-1', replacement: false },
      }),
    );
    const call = outbox.enqueue.mock.calls[0][0];
    expect(call.scheduledAt).toBeUndefined();
  });

  it('pauses replacement dispatch when offer cap is reached', async () => {
    prisma.job.findUnique.mockResolvedValue({
      id: 'job-1',
      referenceNumber: 'JOB-001',
      status: JobStatus.SEEKING_REPLACEMENT,
      offersSentCount: 5,
      dispatchDeadlineAt: new Date(Date.now() + 600_000),
      dispatchStartedAt: new Date(),
      dispatchFailureReason: null,
      unreachableSince: null,
      replacementDepartingAssignmentId: 'a-departing',
      location: { district: 'gasabo' },
    });
    prisma.jobAssignment.count.mockResolvedValue(10);

    await service.processDispatch('job-1');

    expect(prisma.job.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { dispatchFailureReason: 'replacement_dispatch_exhausted' },
      }),
    );
    expect(emails.sendToOpsAdmins).toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it('resumeReplacementDispatch clears pause and re-queues dispatch', async () => {
    prisma.job.findUnique
      .mockResolvedValueOnce({
        id: 'job-1',
        status: JobStatus.SEEKING_REPLACEMENT,
        replacementDepartingAssignmentId: 'a-departing',
      })
      .mockResolvedValueOnce({
        id: 'job-1',
        status: JobStatus.SEEKING_REPLACEMENT,
      });
    prisma.jobAssignment.findUnique.mockResolvedValue({
      id: 'a-departing',
      status: AssignmentStatus.AWAITING_RELIEF,
    });

    const result = await service.resumeReplacementDispatch('job-1', 'admin-1');

    expect(prisma.job.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dispatchFailureReason: null }),
      }),
    );
    expect(outbox.enqueue).toHaveBeenCalled();
    expect(result.queued).toBe(true);
  });
});
