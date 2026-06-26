import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { AssignmentsService } from '../../src/assignments/assignments.service';
import { AuditService } from '../../src/common/services/audit.service';
import { BillingService } from '../../src/billing/billing.service';
import { DispatchingService } from '../../src/dispatching/dispatching.service';
import { GuardianPayPolicyService } from '../../src/guardian-payroll/guardian-pay-policy.service';
import { ShiftStateService } from '../../src/guardians/shift-state.service';
import { JobLifecycleService } from '../../src/jobs/job-lifecycle.service';
import { JobStaffingService } from '../../src/jobs/job-staffing.service';
import { OutboxService } from '../../src/outbox/outbox.service';
import { QueueService } from '../../src/queue/queue.service';
import { ResourceOwnerPolicy } from '../../src/common/policies/resource-owner.policy';
import { EmailNotificationService } from '../../src/notifications/email-notification.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  AssignmentStatus,
  JobStatus,
} from '@prisma/client';
import { countStaffedGuardians } from '../../src/jobs/job-staffing.util';
import { createMultiGuardianJobFixture } from './helpers/multi-guardian-fixtures';

const runIntegration = process.env.RUN_INTEGRATION_TESTS === '1';
const describeIntegration = runIntegration ? describe : describe.skip;

describeIntegration('Multi-guardian accept concurrency (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let assignments: AssignmentsService;
  let fixtures: Awaited<ReturnType<typeof createMultiGuardianJobFixture>>[];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for integration tests');
    }

    prisma = new PrismaClient();
    await prisma.$connect();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: PrismaService, useValue: prisma },
        AssignmentsService,
        JobStaffingService,
        JobLifecycleService,
        GuardianPayPolicyService,
        {
          provide: AuditService,
          useValue: { log: jest.fn() },
        },
        {
          provide: BillingService,
          useValue: { createDraftInvoiceForJobId: jest.fn() },
        },
        {
          provide: ShiftStateService,
          useValue: { setAvailable: jest.fn() },
        },
        {
          provide: OutboxService,
          useValue: { enqueue: jest.fn(), enqueueInTransaction: jest.fn() },
        },
        {
          provide: QueueService,
          useValue: { cancelOfferExpiry: jest.fn() },
        },
        {
          provide: ResourceOwnerPolicy,
          useValue: {},
        },
        {
          provide: EmailNotificationService,
          useValue: { sendToGuardianUser: jest.fn(), sendToOrgOwners: jest.fn() },
        },
        {
          provide: NotificationsService,
          useValue: { notifyGuardianInApp: jest.fn(), notifyOrgOwnersInApp: jest.fn() },
        },
        {
          provide: DispatchingService,
          useValue: { isReplacementDispatchPaused: () => false },
        },
      ],
    }).compile();

    assignments = module.get(AssignmentsService);
    fixtures = [];
  });

  afterAll(async () => {
    for (const fixture of fixtures) {
      await fixture.cleanup();
    }
    await prisma?.$disconnect();
  });

  it('never overstaffs when more guardians accept concurrently than requested', async () => {
    const fixture = await createMultiGuardianJobFixture(prisma, {
      requestedGuardianCount: 2,
      offerCount: 4,
    });
    fixtures.push(fixture);

    const results = await Promise.allSettled(
      fixture.assignments.map((row) =>
        assignments.accept(row.id, row.guardianId),
      ),
    );

    const successes = results.filter((r) => r.status === 'fulfilled');
    const failures = results.filter((r) => r.status === 'rejected');

    expect(successes.length).toBeLessThanOrEqual(2);
    expect(successes.length + failures.length).toBe(4);

    const staffed = await countStaffedGuardians(prisma, fixture.jobId);
    expect(staffed).toBe(2);
    expect(successes).toHaveLength(2);

    const acceptedRows = await prisma.jobAssignment.findMany({
      where: {
        jobId: fixture.jobId,
        status: AssignmentStatus.ACCEPTED,
      },
    });
    expect(acceptedRows).toHaveLength(2);
    expect(new Set(acceptedRows.map((r) => r.guardianId)).size).toBe(2);

    const job = await prisma.job.findUniqueOrThrow({ where: { id: fixture.jobId } });
    expect(job.status).toBe(JobStatus.ASSIGNED);

    const cancelledOffers = await prisma.jobAssignment.count({
      where: {
        jobId: fixture.jobId,
        status: AssignmentStatus.CANCELLED,
      },
    });
    expect(cancelledOffers).toBe(2);
  });

  it('allows only one acceptance when the same offer is submitted twice concurrently', async () => {
    const fixture = await createMultiGuardianJobFixture(prisma, {
      requestedGuardianCount: 3,
      offerCount: 1,
    });
    fixtures.push(fixture);

    const target = fixture.assignments[0];
    const results = await Promise.allSettled([
      assignments.accept(target.id, target.guardianId),
      assignments.accept(target.id, target.guardianId),
    ]);

    const successes = results.filter((r) => r.status === 'fulfilled');
    const failures = results.filter((r) => r.status === 'rejected');
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    const rejected = (failures[0] as PromiseRejectedResult).reason;
    expect(
      rejected instanceof ConflictException || rejected instanceof BadRequestException,
    ).toBe(true);

    const row = await prisma.jobAssignment.findUniqueOrThrow({
      where: { id: target.id },
    });
    expect(row.status).toBe(AssignmentStatus.ACCEPTED);
    expect(row.versionNumber).toBe(2);
  });

  it('cancels excess offers inside the transaction that fills the final slot', async () => {
    const fixture = await createMultiGuardianJobFixture(prisma, {
      requestedGuardianCount: 1,
      offerCount: 3,
    });
    fixtures.push(fixture);

    await assignments.accept(fixture.assignments[0].id, fixture.assignments[0].guardianId);

    const statuses = await prisma.jobAssignment.findMany({
      where: { jobId: fixture.jobId },
      select: { id: true, status: true },
    });

    const accepted = statuses.filter((s) => s.status === AssignmentStatus.ACCEPTED);
    const cancelled = statuses.filter((s) => s.status === AssignmentStatus.CANCELLED);
    const offered = statuses.filter((s) => s.status === AssignmentStatus.OFFERED);

    expect(accepted).toHaveLength(1);
    expect(cancelled).toHaveLength(2);
    expect(offered).toHaveLength(0);
  });
});
