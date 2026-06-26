import { Test, TestingModule } from '@nestjs/testing';
import { EmploymentType, JobType, PayPolicyModel, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GuardianPayPolicyService } from './guardian-pay-policy.service';

describe('GuardianPayPolicyService', () => {
  let service: GuardianPayPolicyService;

  const prisma = {
    payPolicy: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuardianPayPolicyService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(GuardianPayPolicyService);
    jest.clearAllMocks();
  });

  it('resolves highest-priority matching policy', async () => {
    prisma.payPolicy.findMany.mockResolvedValue([
      {
        priority: 100,
        jobType: JobType.STANDARD_GUARDIAN,
        employmentType: null,
        model: PayPolicyModel.ACTUAL_TIME,
        minimumHours: new Prisma.Decimal(0),
        applyOnEarlyRelease: true,
      },
      {
        priority: 1,
        jobType: null,
        employmentType: null,
        model: PayPolicyModel.MINIMUM_GUARANTEED,
        minimumHours: new Prisma.Decimal(1),
        applyOnEarlyRelease: true,
      },
    ]);

    const result = await service.resolvePayPolicy(
      JobType.STANDARD_GUARDIAN,
      EmploymentType.PART_TIME,
      new Date('2026-06-01T08:00:00.000Z'),
    );

    expect(result.model).toBe(PayPolicyModel.ACTUAL_TIME);
  });

  it('returns env-based fallback policy', () => {
    const fallback = service.fallbackPayPolicy();
    expect(fallback.model).toBe(PayPolicyModel.MINIMUM_GUARANTEED);
    expect(Number(fallback.minimumHours)).toBe(1);
  });
});
