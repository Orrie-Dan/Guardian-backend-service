import { Test, TestingModule } from '@nestjs/testing';
import { PayPolicyModel } from '@prisma/client';
import { AuditService } from '../common/services/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminPayPoliciesService } from './admin-pay-policies.service';

describe('AdminPayPoliciesService', () => {
  let service: AdminPayPoliciesService;

  const prisma = {
    payPolicy: {
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const audit = { log: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminPayPoliciesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(AdminPayPoliciesService);
    jest.clearAllMocks();
  });

  it('creates a pay policy and audits', async () => {
    prisma.payPolicy.create.mockResolvedValue({
      id: 'policy-1',
      model: PayPolicyModel.MINIMUM_GUARANTEED,
      priority: 1,
      jobType: null,
      employmentType: null,
      minimumHours: { toString: () => '1' },
    });

    await service.create(
      { priority: 1, model: PayPolicyModel.MINIMUM_GUARANTEED },
      'ops-1',
    );

    expect(prisma.payPolicy.create).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PAY_POLICY_CREATED' }),
    );
  });
});
