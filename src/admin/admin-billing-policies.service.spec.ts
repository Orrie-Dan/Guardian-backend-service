import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BillingPolicyModel } from '@prisma/client';
import { AuditService } from '../common/services/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminBillingPoliciesService } from './admin-billing-policies.service';

describe('AdminBillingPoliciesService', () => {
  let service: AdminBillingPoliciesService;
  const prisma = {
    billingPolicy: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const audit = { log: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminBillingPoliciesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(AdminBillingPoliciesService);
    jest.clearAllMocks();
  });

  it('lists policies by priority desc', async () => {
    prisma.billingPolicy.findMany.mockResolvedValue([]);

    await service.list();

    expect(prisma.billingPolicy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { priority: 'desc' } }),
    );
  });

  it('creates policy and audits', async () => {
    prisma.billingPolicy.create.mockResolvedValue({
      id: 'pol-1',
      model: BillingPolicyModel.MINIMUM_GUARANTEED,
      priority: 10,
      organizationId: null,
      jobType: null,
    });

    await service.create(
      {
        priority: 10,
        model: BillingPolicyModel.MINIMUM_GUARANTEED,
        minimumHours: 2,
      },
      'user-1',
    );

    expect(prisma.billingPolicy.create).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'BILLING_POLICY_CREATED' }),
    );
  });

  it('updates policy when found', async () => {
    prisma.billingPolicy.findUnique.mockResolvedValue({
      id: 'pol-1',
      model: BillingPolicyModel.MINIMUM_GUARANTEED,
      priority: 1,
    });
    prisma.billingPolicy.update.mockResolvedValue({
      id: 'pol-1',
      model: BillingPolicyModel.BOOKED_BLOCK,
      priority: 50,
    });

    await service.update('pol-1', { model: BillingPolicyModel.BOOKED_BLOCK, priority: 50 }, 'user-1');

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'BILLING_POLICY_UPDATED' }),
    );
  });

  it('throws when updating missing policy', async () => {
    prisma.billingPolicy.findUnique.mockResolvedValue(null);

    await expect(
      service.update('missing', { priority: 1 }, 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
