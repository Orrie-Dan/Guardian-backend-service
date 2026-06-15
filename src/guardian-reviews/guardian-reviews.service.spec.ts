import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AssignmentStatus, JobStatus } from '@prisma/client';
import { AuditService } from '../common/services/audit.service';
import { ResourceOwnerPolicy } from '../common/policies/resource-owner.policy';
import { PrismaService } from '../prisma/prisma.service';
import { GuardianReviewsService } from './guardian-reviews.service';

describe('GuardianReviewsService', () => {
  let service: GuardianReviewsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: Record<string, any> = {
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    guardianReview: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      create: jest.fn(),
    },
    jobAssignment: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    guardian: {
      update: jest.fn(),
    },
  };
  const policy = {
    assertJobAccess: jest.fn(),
    isOps: jest.fn().mockReturnValue(false),
  };
  const audit = { log: jest.fn() };

  const clientActor = {
    sub: 'user-1',
    roles: [],
    organizationIds: ['org-1'],
    activeOrgId: 'org-1',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuardianReviewsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ResourceOwnerPolicy, useValue: policy },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(GuardianReviewsService);
  });

  it('returns existing review idempotently', async () => {
    policy.assertJobAccess.mockResolvedValue({
      id: 'job-1',
      organizationId: 'org-1',
      status: JobStatus.AWAITING_CONFIRMATION,
    });
    prisma.jobAssignment.findMany.mockResolvedValue([
      {
        id: 'a-1',
        guardianId: 'g-1',
        status: AssignmentStatus.COMPLETED,
      },
    ]);
    prisma.guardianReview.findUnique.mockResolvedValue({
      id: 'review-1',
      jobId: 'job-1',
      assignmentId: 'a-1',
      guardianId: 'g-1',
      organizationId: 'org-1',
      reviewerUserId: 'user-1',
      rating: 5,
      comment: 'Great',
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      updatedAt: new Date('2026-06-01T00:00:00.000Z'),
      organization: { id: 'org-1', tradingName: 'Acme', legalName: 'Acme Ltd' },
      job: { id: 'job-1', referenceNumber: 'J-00001' },
    });

    const result = await service.submitForJob(
      'job-1',
      { rating: 4 },
      clientActor as never,
    );

    expect(result.id).toBe('review-1');
    expect(prisma.guardianReview.create).not.toHaveBeenCalled();
  });

  it('creates review and updates guardian aggregate rating', async () => {
    policy.assertJobAccess.mockResolvedValue({
      id: 'job-1',
      organizationId: 'org-1',
      status: JobStatus.COMPLETED,
    });
    prisma.guardianReview.findUnique.mockResolvedValue(null);
    prisma.jobAssignment.findMany.mockResolvedValue([
      {
        id: 'a-1',
        guardianId: 'g-1',
        status: AssignmentStatus.COMPLETED,
      },
    ]);
    prisma.guardianReview.create.mockResolvedValue({
      id: 'review-1',
      jobId: 'job-1',
      assignmentId: 'a-1',
      guardianId: 'g-1',
      organizationId: 'org-1',
      reviewerUserId: 'user-1',
      rating: 4,
      comment: null,
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      updatedAt: new Date('2026-06-01T00:00:00.000Z'),
      organization: { id: 'org-1', tradingName: null, legalName: 'Acme Ltd' },
      job: { id: 'job-1', referenceNumber: 'J-00001' },
    });
    prisma.guardianReview.aggregate.mockResolvedValue({
      _avg: { rating: 4 },
    });
    prisma.guardian.update.mockResolvedValue({});

    const result = await service.submitForJob(
      'job-1',
      { rating: 4 },
      clientActor as never,
    );

    expect(result.rating).toBe(4);
    expect(prisma.guardian.update).toHaveBeenCalledWith({
      where: { id: 'g-1' },
      data: { rating: 4 },
    });
    expect(audit.log).toHaveBeenCalled();
  });

  it('rejects review when job is not rateable', async () => {
    policy.assertJobAccess.mockResolvedValue({
      id: 'job-1',
      organizationId: 'org-1',
      status: JobStatus.IN_PROGRESS,
    });

    await expect(
      service.submitForJob('job-1', { rating: 5 }, clientActor as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires assignmentId when multiple completed assignments exist', async () => {
    policy.assertJobAccess.mockResolvedValue({
      id: 'job-1',
      organizationId: 'org-1',
      status: JobStatus.COMPLETED,
    });
    prisma.guardianReview.findUnique.mockResolvedValue(null);
    prisma.jobAssignment.findMany.mockResolvedValue([
      { id: 'a-1', status: AssignmentStatus.COMPLETED },
      { id: 'a-2', status: AssignmentStatus.COMPLETED },
    ]);

    await expect(
      service.submitForJob('job-1', { rating: 5 }, clientActor as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
