import { Test, TestingModule } from '@nestjs/testing';
import { AssignmentStatus } from '@prisma/client';
import { PresenceService } from '../redis/presence.service';
import { PrismaService } from '../prisma/prisma.service';
import { GuardianDispatchEligibilityService } from './guardian-dispatch-eligibility.service';

describe('GuardianDispatchEligibilityService', () => {
  let service: GuardianDispatchEligibilityService;
  const prisma = {
    $queryRaw: jest.fn(),
    jobAssignment: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };
  const presence = {
    filterReachableGuardianIds: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuardianDispatchEligibilityService,
        { provide: PrismaService, useValue: prisma },
        { provide: PresenceService, useValue: presence },
      ],
    }).compile();

    service = module.get(GuardianDispatchEligibilityService);
    jest.clearAllMocks();
  });

  it('normalizes district strings', () => {
    expect(service.normalizeDistrict('  Gasabo ')).toBe('gasabo');
  });

  it('counts eligible guardians', async () => {
    prisma.$queryRaw.mockResolvedValue([{ count: BigInt(3) }]);
    const count = await service.countEligibleGuardians('Gasabo');
    expect(count).toBe(3);
  });

  it('returns tried guardian ids from terminal assignments', async () => {
    prisma.jobAssignment.findMany.mockResolvedValue([
      { guardianId: 'g-1' },
      { guardianId: 'g-2' },
    ]);
    const tried = await service.getTriedGuardianIds('job-1');
    expect(tried.has('g-1')).toBe(true);
    expect(tried.has('g-2')).toBe(true);
    expect(prisma.jobAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: {
            in: [
              AssignmentStatus.DECLINED,
              AssignmentStatus.EXPIRED,
              AssignmentStatus.CANCELLED,
            ],
          },
        }),
      }),
    );
  });
});
