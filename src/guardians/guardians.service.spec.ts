import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RoleCode } from '@prisma/client';
import { AuditService } from '../common/services/audit.service';
import { ResourceOwnerPolicy } from '../common/policies/resource-owner.policy';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectivityService } from './connectivity.service';
import { GuardianLocationService } from './guardian-location.service';
import { GuardiansService } from './guardians.service';
import { ShiftStateService } from './shift-state.service';

describe('GuardiansService', () => {
  let service: GuardiansService;
  const prisma = {
    job: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

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

  it('listMyJobs returns paginated jobs with full detail include', async () => {
    prisma.job.findMany.mockResolvedValue([]);
    prisma.job.count.mockResolvedValue(0);

    const actor = {
      sub: 'u1',
      guardianId: 'guardian-1',
      roles: [RoleCode.GUARDIAN],
    } as never;

    await service.listMyJobs(actor, { page: 1, limit: 20 } as never);

    expect(prisma.job.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { assignments: { some: { guardianId: 'guardian-1' } } },
        include: expect.objectContaining({
          location: true,
          organization: true,
          assignments: expect.objectContaining({
            where: { guardianId: 'guardian-1' },
          }),
          statusHistory: expect.any(Object),
        }),
      }),
    );
  });

  it('listMyJobs rejects non-guardian actors', async () => {
    await expect(
      service.listMyJobs(
        {
          sub: 'u1',
          roles: [RoleCode.CLIENT_OWNER],
        } as never,
        { page: 1, limit: 20 } as never,
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
