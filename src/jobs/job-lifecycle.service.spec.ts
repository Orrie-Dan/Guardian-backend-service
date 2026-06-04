import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AssignmentStatus, JobStatus } from '@prisma/client';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { JobLifecycleService } from './job-lifecycle.service';

describe('JobLifecycleService', () => {
  let service: JobLifecycleService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tx: Record<string, any> = {
    job: { findUnique: jest.fn(), update: jest.fn() },
    jobStatusHistory: { create: jest.fn() },
    outboxEvent: { create: jest.fn() },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: Record<string, any> = {
    $transaction: jest.fn(),
    job: { findUnique: jest.fn() },
    jobAssignment: { findFirst: jest.fn() },
  };
  const outbox = {
    enqueueInTransaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobLifecycleService,
        { provide: PrismaService, useValue: prisma },
        { provide: OutboxService, useValue: outbox },
      ],
    }).compile();

    service = module.get(JobLifecycleService);
    prisma.$transaction.mockImplementation(async (fn: (ctx: typeof tx) => unknown) =>
      fn(tx),
    );
    jest.clearAllMocks();
  });

  it('moves job to awaiting confirmation from assignment when in progress', async () => {
    tx.job.findUnique.mockResolvedValue({ id: 'job-1', status: JobStatus.IN_PROGRESS });

    await service.completeFromAssignment('job-1');

    expect(tx.job.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: { status: JobStatus.AWAITING_CONFIRMATION },
    });
    expect(tx.jobStatusHistory.create).toHaveBeenCalled();
  });

  it('confirms billing from awaiting confirmation to completed', async () => {
    tx.job.findUnique.mockResolvedValue({
      id: 'job-1',
      status: JobStatus.AWAITING_CONFIRMATION,
    });

    await service.confirmBilling('job-1', 'user-1');

    expect(tx.job.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: { status: JobStatus.COMPLETED },
    });
  });

  it('redispatches job after no-show and enqueues dispatch event', async () => {
    tx.job.findUnique.mockResolvedValue({ id: 'job-1', status: JobStatus.ASSIGNED });

    await service.redispatchAfterNoShow('job-1');

    expect(tx.job.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: { status: JobStatus.DISPATCHING },
    });
    expect(outbox.enqueueInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        aggregateId: 'job-1',
        eventType: 'JOB_DISPATCH_REQUESTED',
      }),
    );
  });

  it('rejects explicit completion when no completed assignment exists', async () => {
    prisma.jobAssignment.findFirst.mockResolvedValue(null);

    await expect(service.completeExplicit('job-1', 'user-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('allows explicit completion when a completed assignment exists', async () => {
    prisma.jobAssignment.findFirst.mockResolvedValue({ id: 'a-1' });
    prisma.job.findUnique.mockResolvedValue({
      id: 'job-1',
      status: JobStatus.AWAITING_CONFIRMATION,
    });
    tx.job.findUnique.mockResolvedValue({
      id: 'job-1',
      status: JobStatus.AWAITING_CONFIRMATION,
    });

    await service.completeExplicit('job-1', 'user-1');

    expect(tx.job.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: { status: JobStatus.COMPLETED },
    });
  });

  it('supports accepted assignment transitions from pending and dispatching', async () => {
    tx.job.findUnique
      .mockResolvedValueOnce({ id: 'job-1', status: JobStatus.PENDING })
      .mockResolvedValueOnce({ id: 'job-1', status: JobStatus.DISPATCHING });

    await service.transitionToAssigned(tx as never, 'job-1');
    await service.transitionToAssigned(tx as never, 'job-1');

    expect(tx.job.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'job-1' },
      data: { status: JobStatus.ASSIGNED },
    });
  });

  it('does not require transition when already awaiting confirmation', async () => {
    tx.job.findUnique.mockResolvedValue({
      id: 'job-1',
      status: JobStatus.AWAITING_CONFIRMATION,
    });

    await service.completeFromAssignment('job-1');

    expect(tx.job.update).not.toHaveBeenCalled();
  });

  it('honors completed assignment status enum in tests', async () => {
    expect(AssignmentStatus.COMPLETED).toBeDefined();
  });
});
