import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JobStatus } from '@prisma/client';
import { OutboxService } from '../outbox/outbox.service';
import { JobLifecycleService } from './job-lifecycle.service';
import { JobStaffingService } from './job-staffing.service';

jest.mock('./job-staffing.util', () => ({
  ...jest.requireActual('./job-staffing.util'),
  lockJobForStaffingUpdate: jest.fn(),
  countStaffedGuardians: jest.fn(),
  computeJobStaffingProgress: jest.fn(),
}));

import {
  computeJobStaffingProgress,
  countStaffedGuardians,
} from './job-staffing.util';

describe('JobStaffingService', () => {
  let service: JobStaffingService;
  const lifecycle = {
    transitionToAssigned: jest.fn(),
    transitionToPartiallyAssigned: jest.fn(),
    redispatchAfterNoShowInTransaction: jest.fn(),
  };
  const outbox = { enqueueInTransaction: jest.fn() };
  const tx = {
    jobAssignment: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn(),
    },
    $executeRaw: jest.fn(),
  } as never;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobStaffingService,
        { provide: JobLifecycleService, useValue: lifecycle },
        { provide: OutboxService, useValue: outbox },
      ],
    }).compile();

    service = module.get(JobStaffingService);
    jest.clearAllMocks();
  });

  it('transitions to PARTIALLY_ASSIGNED when one of three guardians accepts', async () => {
    (countStaffedGuardians as jest.Mock).mockResolvedValue(1);
    (computeJobStaffingProgress as jest.Mock).mockResolvedValue({
      requestedGuardianCount: 3,
      acceptedGuardianCount: 1,
      remainingGuardianSlots: 2,
      pendingOfferCount: 1,
      isFullyStaffed: false,
    });

    const result = await service.applyAcceptStaffingUpdate(tx, 'job-1', {
      status: JobStatus.DISPATCHING,
      requestedGuardianCount: 3,
    });

    expect(lifecycle.transitionToPartiallyAssigned).toHaveBeenCalledWith(
      tx,
      'job-1',
      undefined,
    );
    expect(lifecycle.transitionToAssigned).not.toHaveBeenCalled();
    expect(result.shouldContinueDispatch).toBe(true);
    expect(result.excessOffers).toEqual([]);
  });

  it('transitions to ASSIGNED when fully staffed', async () => {
    (countStaffedGuardians as jest.Mock).mockResolvedValue(2);
    (computeJobStaffingProgress as jest.Mock).mockResolvedValue({
      requestedGuardianCount: 2,
      acceptedGuardianCount: 2,
      remainingGuardianSlots: 0,
      pendingOfferCount: 1,
      isFullyStaffed: true,
    });

    const result = await service.applyAcceptStaffingUpdate(tx, 'job-1', {
      status: JobStatus.PARTIALLY_ASSIGNED,
      requestedGuardianCount: 2,
    });

    expect(lifecycle.transitionToAssigned).toHaveBeenCalled();
    expect(result.shouldContinueDispatch).toBe(false);
  });

  it('does not regress IN_PROGRESS to PARTIALLY_ASSIGNED when refilling a slot', async () => {
    (computeJobStaffingProgress as jest.Mock).mockResolvedValue({
      requestedGuardianCount: 3,
      acceptedGuardianCount: 2,
      remainingGuardianSlots: 1,
      pendingOfferCount: 0,
      isFullyStaffed: false,
    });

    await service.applyUnfilledSlotRedispatch(
      tx,
      'job-1',
      { status: JobStatus.IN_PROGRESS, requestedGuardianCount: 3 },
      'ops-1',
      'guardian_no_show',
    );

    expect(lifecycle.transitionToPartiallyAssigned).not.toHaveBeenCalled();
    expect(lifecycle.redispatchAfterNoShowInTransaction).not.toHaveBeenCalled();
    expect(outbox.enqueueInTransaction).toHaveBeenCalled();
  });

  it('rejects over-assignment when staffed exceeds requested', async () => {
    (countStaffedGuardians as jest.Mock).mockResolvedValue(3);

    await expect(
      service.applyAcceptStaffingUpdate(tx, 'job-1', {
        status: JobStatus.PARTIALLY_ASSIGNED,
        requestedGuardianCount: 2,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refills one slot during IN_PROGRESS without disturbing other guardians', async () => {
    (computeJobStaffingProgress as jest.Mock).mockResolvedValue({
      requestedGuardianCount: 3,
      acceptedGuardianCount: 2,
      remainingGuardianSlots: 1,
      pendingOfferCount: 0,
      isFullyStaffed: false,
    });

    await service.applyUnfilledSlotRedispatch(
      tx,
      'job-1',
      { status: JobStatus.IN_PROGRESS, requestedGuardianCount: 3 },
      'ops-1',
      'guardian_no_show',
    );

    expect(lifecycle.redispatchAfterNoShowInTransaction).not.toHaveBeenCalled();
    expect(outbox.enqueueInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        eventType: 'JOB_DISPATCH_REQUESTED',
        payload: { jobId: 'job-1', refill: true },
      }),
    );
  });
});
