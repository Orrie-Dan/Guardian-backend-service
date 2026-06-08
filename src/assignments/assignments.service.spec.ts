import { Test, TestingModule } from '@nestjs/testing';
import { AssignmentStatus, JobStatus, ReplacementResolution } from '@prisma/client';
import { BillingService } from '../billing/billing.service';
import { AuditService } from '../common/services/audit.service';
import { ResourceOwnerPolicy } from '../common/policies/resource-owner.policy';
import { ShiftStateService } from '../guardians/shift-state.service';
import { DispatchingService } from '../dispatching/dispatching.service';
import { EmailNotificationService } from '../notifications/email-notification.service';
import { NotificationsService } from '../notifications/notifications.service';
import { JobLifecycleService } from '../jobs/job-lifecycle.service';
import { OutboxService } from '../outbox/outbox.service';
import { QueueService } from '../queue/queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { AssignmentsService } from './assignments.service';
import { NoShowReasonCode } from './dto/no-show.dto';

describe('AssignmentsService', () => {
  let service: AssignmentsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: Record<string, any> = {
    $transaction: jest.fn(),
    jobAssignment: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    guardianShiftState: { update: jest.fn() },
    guardianPerformanceDaily: {
      upsert: jest.fn(),
    },
    user: { findMany: jest.fn() },
    guardian: { findUnique: jest.fn() },
    organizationUser: { findMany: jest.fn() },
    job: { update: jest.fn() },
  };
  const audit = { log: jest.fn() };
  const billing = { createDraftInvoiceForJobId: jest.fn() };
  const shiftState = { setAvailable: jest.fn() };
  const queue = { cancelOfferExpiry: jest.fn() };
  const lifecycle = {
    transitionToAssigned: jest.fn(),
    transitionToInProgress: jest.fn(),
    completeFromAssignment: jest.fn(),
    redispatchAfterNoShow: jest.fn(),
    redispatchAfterNoShowInTransaction: jest.fn(),
    transitionToSeekingReplacement: jest.fn(),
    transitionFromSeekingReplacementToInProgress: jest.fn(),
  };
  const outbox = { enqueue: jest.fn() };
  const policy = { assertOrgMember: jest.fn() };
  const emails = { sendToOrgOwners: jest.fn(), sendToOpsAdmins: jest.fn() };
  const notifications = { createInApp: jest.fn() };
  const dispatching = { requestReplacementDispatch: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssignmentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: BillingService, useValue: billing },
        { provide: ShiftStateService, useValue: shiftState },
        { provide: JobLifecycleService, useValue: lifecycle },
        { provide: OutboxService, useValue: outbox },
        { provide: QueueService, useValue: queue },
        { provide: ResourceOwnerPolicy, useValue: policy },
        { provide: EmailNotificationService, useValue: emails },
        { provide: NotificationsService, useValue: notifications },
        { provide: DispatchingService, useValue: dispatching },
      ],
    }).compile();

    service = module.get(AssignmentsService);
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) =>
      fn(prisma),
    );
    jest.clearAllMocks();
  });

  it('accept releases competing urgent offers back to available', async () => {
    prisma.jobAssignment.findUnique.mockResolvedValue({
      id: 'a-1',
      jobId: 'job-1',
      guardianId: 'g-1',
      status: AssignmentStatus.OFFERED,
      versionNumber: 1,
      expiresAt: new Date(Date.now() + 60_000),
      job: { id: 'job-1', status: JobStatus.DISPATCHING },
    });
    prisma.jobAssignment.findMany.mockResolvedValue([
      { id: 'a-2', guardianId: 'g-2' },
      { id: 'a-3', guardianId: 'g-3' },
    ]);
    prisma.jobAssignment.updateMany.mockResolvedValue({ count: 2 });
    prisma.jobAssignment.findUniqueOrThrow = jest.fn().mockResolvedValue({
      id: 'a-1',
      status: AssignmentStatus.ACCEPTED,
    });

    await service.accept('a-1', 'g-1');

    expect(queue.cancelOfferExpiry).toHaveBeenCalledWith('a-2');
    expect(queue.cancelOfferExpiry).toHaveBeenCalledWith('a-3');
    expect(shiftState.setAvailable).toHaveBeenCalledWith('g-2');
    expect(shiftState.setAvailable).toHaveBeenCalledWith('g-3');
    expect(shiftState.setAvailable).not.toHaveBeenCalledWith('g-1');
  });

  it('completes assignment and then completes job lifecycle', async () => {
    prisma.jobAssignment.findUnique.mockResolvedValue({
      id: 'a-1',
      jobId: 'job-1',
      guardianId: 'g-1',
      status: AssignmentStatus.ON_SITE,
      versionNumber: 1,
      replacesAssignmentId: null,
      job: { status: JobStatus.IN_PROGRESS },
    });
    prisma.jobAssignment.updateMany.mockResolvedValue({ count: 1 });
    prisma.jobAssignment.findUniqueOrThrow.mockResolvedValue({
      id: 'a-1',
      jobId: 'job-1',
      status: AssignmentStatus.COMPLETED,
    });

    await service.complete('a-1', 'g-1', 'user-1');

    expect(lifecycle.completeFromAssignment).toHaveBeenCalledWith('job-1', 'user-1');
    expect(billing.createDraftInvoiceForJobId).toHaveBeenCalledWith(
      'job-1',
      'user-1',
    );
    expect(shiftState.setAvailable).toHaveBeenCalledWith('g-1');
  });

  it('marks assignment no-show and redispatches job', async () => {
    prisma.jobAssignment.findUnique.mockResolvedValue({
      id: 'a-1',
      jobId: 'job-1',
      guardianId: 'g-1',
      status: AssignmentStatus.ACCEPTED,
      versionNumber: 1,
    });
    prisma.jobAssignment.updateMany.mockResolvedValue({ count: 1 });
    prisma.jobAssignment.findUniqueOrThrow.mockResolvedValue({
      id: 'a-1',
      jobId: 'job-1',
      status: AssignmentStatus.NO_SHOW,
    });

    await service.noShow('a-1', {
      reasonCode: NoShowReasonCode.CLIENT_NOT_PRESENT,
      reasonNote: 'guardian_absent',
      actorUserId: 'user-1',
      actorRole: 'OPS_ADMIN' as never,
    });

    expect(lifecycle.redispatchAfterNoShowInTransaction).toHaveBeenCalledWith(
      prisma,
      'job-1',
      'user-1',
      NoShowReasonCode.CLIENT_NOT_PRESENT,
    );
  });

  it('returns idempotent result when assignment is already no-show', async () => {
    prisma.jobAssignment.findUnique.mockResolvedValue({
      id: 'a-1',
      status: AssignmentStatus.NO_SHOW,
      versionNumber: 3,
    });

    const result = await service.noShow('a-1', {
      reasonCode: NoShowReasonCode.OTHER,
      actorUserId: 'user-1',
      actorRole: 'OPS_ADMIN' as never,
    });

    expect(result).toEqual({
      assignmentId: 'a-1',
      status: AssignmentStatus.NO_SHOW,
      idempotent: true,
    });
    expect(prisma.jobAssignment.updateMany).not.toHaveBeenCalled();
  });

  it('requests replacement while on site and notifies ops', async () => {
    prisma.jobAssignment.findUnique.mockResolvedValue({
      id: 'a-1',
      guardianId: 'g-1',
      status: AssignmentStatus.ON_SITE,
      versionNumber: 2,
      replacementRequestedAt: null,
      replacementResolution: null,
      job: { id: 'job-1', referenceNumber: 'JOB-001', status: JobStatus.IN_PROGRESS },
    });
    prisma.jobAssignment.update.mockResolvedValue({ id: 'a-1' });
    prisma.user.findMany.mockResolvedValue([{ id: 'ops-1' }]);

    await service.requestReplacement('a-1', 'g-1', 'Medical issue');

    expect(emails.sendToOpsAdmins).toHaveBeenCalled();
    expect(notifications.createInApp).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'REPLACEMENT_REQUESTED' }),
    );
  });

  it('approves replacement and queues replacement dispatch', async () => {
    prisma.jobAssignment.findUnique.mockResolvedValue({
      id: 'a-1',
      guardianId: 'g-1',
      jobId: 'job-1',
      status: AssignmentStatus.REPLACEMENT_REQUESTED,
      versionNumber: 3,
      job: { id: 'job-1', status: JobStatus.IN_PROGRESS },
    });

    const result = await service.approveReplacement('a-1', 'admin-1');

    expect(lifecycle.transitionToSeekingReplacement).toHaveBeenCalled();
    expect(dispatching.requestReplacementDispatch).toHaveBeenCalledWith('job-1');
    expect(result.jobId).toBe('job-1');
  });
});
