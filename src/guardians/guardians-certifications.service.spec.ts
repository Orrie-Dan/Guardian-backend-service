import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../common/services/audit.service';
import { ResourceOwnerPolicy } from '../common/policies/resource-owner.policy';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectivityService } from './connectivity.service';
import { GuardianLocationService } from './guardian-location.service';
import { GuardiansService } from './guardians.service';
import { ShiftStateService } from './shift-state.service';

describe('GuardiansService certifications', () => {
  let service: GuardiansService;
  const prisma = { certification: { findMany: jest.fn(), findFirst: jest.fn() } };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuardiansService,
        { provide: PrismaService, useValue: prisma },
        { provide: ShiftStateService, useValue: {} },
        { provide: ConnectivityService, useValue: {} },
        { provide: GuardianLocationService, useValue: {} },
        { provide: ResourceOwnerPolicy, useValue: {} },
        { provide: AuditService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get(GuardiansService);
    jest.clearAllMocks();
  });

  it('getMyCertification rejects non-guardian actors', async () => {
    await expect(
      service.getMyCertification({ sub: 'u-1', roles: [] } as never, 'c-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('getMyCertification returns 404 when not owned', async () => {
    prisma.certification.findFirst.mockResolvedValue(null);
    await expect(
      service.getMyCertification(
        { sub: 'u-1', guardianId: 'g-1', roles: [] } as never,
        'c-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
