import { Test, TestingModule } from '@nestjs/testing';
import { AssignmentStatus, JobStatus } from '@prisma/client';
import { AuditService } from '../common/services/audit.service';
import { BillingService } from '../billing/billing.service';
import { ShiftStateService } from '../guardians/shift-state.service';
import { OutboxService } from '../outbox/outbox.service';
import { PresenceService } from '../redis/presence.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { DispatchingService } from './dispatching.service';

describe('DispatchingService', () => {
  let service: DispatchingService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: Record<string, any> = {
    job: { findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
    jobAssignment: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    guardianShiftState: { update: jest.fn() },
    jobStatusHistory: { create: jest.fn() },
  };
  const queue = {
    registerOfferExpiryHandler: jest.fn(),
    scheduleOfferExpiry: jest.fn(),
    cancelOfferExpiry: jest.fn(),
  };
  const audit = { log: jest.fn() };
  const presence = { filterReachableGuardianIds: jest.fn().mockResolvedValue([]) };
  const shiftState = { setAvailable: jest.fn() };
  const outbox = { enqueue: jest.fn() };
  const billing = { createInvoiceForJob: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DispatchingService,
        { provide: PrismaService, useValue: prisma },
        { provide: QueueService, useValue: queue },
        { provide: AuditService, useValue: audit },
        { provide: PresenceService, useValue: presence },
        { provide: ShiftStateService, useValue: shiftState },
        { provide: OutboxService, useValue: outbox },
        { provide: BillingService, useValue: billing },
      ],
    }).compile();

    service = module.get(DispatchingService);
    jest.clearAllMocks();
  });

  it('queues dispatch via outbox', async () => {
    prisma.job.findUnique.mockResolvedValue({
      id: 'job-1',
      status: JobStatus.PENDING,
    });
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) =>
      fn(prisma),
    );

    const result = await service.requestDispatch('job-1');

    expect(result.queued).toBe(true);
    expect(outbox.enqueue).toHaveBeenCalled();
  });

  it('expires offer and re-queues dispatch when DISPATCHING', async () => {
    prisma.jobAssignment.findUnique.mockResolvedValue({
      id: 'a-1',
      jobId: 'job-1',
      guardianId: 'g-1',
      status: AssignmentStatus.OFFERED,
      versionNumber: 1,
      expiresAt: new Date(Date.now() - 1000),
      job: { status: JobStatus.DISPATCHING },
    });
    prisma.jobAssignment.updateMany.mockResolvedValue({ count: 1 });
    prisma.jobAssignment.findUniqueOrThrow = jest.fn().mockResolvedValue({
      id: 'a-1',
      status: AssignmentStatus.EXPIRED,
    });
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) =>
      fn(prisma),
    );
    prisma.job.findUnique.mockResolvedValue({
      id: 'job-1',
      status: JobStatus.DISPATCHING,
    });

    await service.expireOffer('a-1');

    expect(outbox.enqueue).toHaveBeenCalled();
  });

  it('expires offer and re-queues dispatch when PENDING (auto-create path)', async () => {
    prisma.jobAssignment.findUnique.mockResolvedValue({
      id: 'a-1',
      jobId: 'job-1',
      guardianId: 'g-1',
      status: AssignmentStatus.OFFERED,
      versionNumber: 1,
      expiresAt: new Date(Date.now() - 1000),
      job: { status: JobStatus.PENDING },
    });
    prisma.jobAssignment.updateMany.mockResolvedValue({ count: 1 });
    prisma.jobAssignment.findUniqueOrThrow = jest.fn().mockResolvedValue({
      id: 'a-1',
      status: AssignmentStatus.EXPIRED,
    });
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) =>
      fn(prisma),
    );
    prisma.job.findUnique.mockResolvedValue({
      id: 'job-1',
      status: JobStatus.PENDING,
    });

    await service.expireOffer('a-1');

    expect(outbox.enqueue).toHaveBeenCalled();
  });

  it('does not re-queue dispatch when job is CANCELLED', async () => {
    prisma.jobAssignment.findUnique.mockResolvedValue({
      id: 'a-1',
      jobId: 'job-1',
      guardianId: 'g-1',
      status: AssignmentStatus.OFFERED,
      versionNumber: 1,
      expiresAt: new Date(Date.now() - 1000),
      job: { status: JobStatus.CANCELLED },
    });

    await service.expireOffer('a-1');

    expect(outbox.enqueue).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('fails job when dispatch attempts exhausted at processDispatch', async () => {
    prisma.job.findUnique.mockResolvedValue({
      id: 'job-1',
      status: JobStatus.DISPATCHING,
      dispatchAttempts: 3,
      maxDispatchAttempts: 3,
      location: { district: 'Kigali' },
    });
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) =>
      fn(prisma),
    );

    await service.processDispatch('job-1');

    expect(prisma.job.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-1' },
        data: { status: JobStatus.FAILED },
      }),
    );
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it('releaseInFlightOffersForJob cancels offers and releases guardians', async () => {
    prisma.jobAssignment.findMany.mockResolvedValue([
      { id: 'a-1', guardianId: 'g-1' },
    ]);
    prisma.jobAssignment.updateMany.mockResolvedValue({ count: 1 });

    await service.releaseInFlightOffersForJob('job-1');

    expect(queue.cancelOfferExpiry).toHaveBeenCalledWith('a-1');
    expect(prisma.jobAssignment.updateMany).toHaveBeenCalledWith({
      where: { jobId: 'job-1', status: AssignmentStatus.OFFERED },
      data: { status: AssignmentStatus.CANCELLED },
    });
    expect(shiftState.setAvailable).toHaveBeenCalledWith('g-1');
  });
});
