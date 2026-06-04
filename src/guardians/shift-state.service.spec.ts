import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ShiftStatus } from '@prisma/client';
import { GuardianEligibilityService } from './guardian-eligibility.service';
import { PrismaService } from '../prisma/prisma.service';
import { ShiftStateService } from './shift-state.service';

describe('ShiftStateService', () => {
  let service: ShiftStateService;
  const prisma = {
    guardianShiftState: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
  };
  const eligibility = { assertDispatchEligible: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShiftStateService,
        { provide: PrismaService, useValue: prisma },
        { provide: GuardianEligibilityService, useValue: eligibility },
      ],
    }).compile();

    service = module.get(ShiftStateService);
    jest.clearAllMocks();
  });

  describe('autoStartOnLogin', () => {
    it('starts shift when guardian is off duty', async () => {
      prisma.guardianShiftState.findUnique.mockResolvedValue({
        guardianId: 'g-1',
        shiftStatus: ShiftStatus.OFF_DUTY,
      });
      prisma.guardianShiftState.upsert.mockResolvedValue({
        guardianId: 'g-1',
        shiftStatus: ShiftStatus.AVAILABLE,
      });

      await service.autoStartOnLogin('g-1');

      expect(eligibility.assertDispatchEligible).toHaveBeenCalledWith('g-1');
      expect(prisma.guardianShiftState.upsert).toHaveBeenCalled();
    });

    it('does not start shift when guardian is busy', async () => {
      prisma.guardianShiftState.findUnique.mockResolvedValue({
        guardianId: 'g-1',
        shiftStatus: ShiftStatus.BUSY,
      });

      await service.autoStartOnLogin('g-1');

      expect(eligibility.assertDispatchEligible).not.toHaveBeenCalled();
      expect(prisma.guardianShiftState.upsert).not.toHaveBeenCalled();
    });

    it('does not fail login when eligibility check fails', async () => {
      prisma.guardianShiftState.findUnique.mockResolvedValue({
        guardianId: 'g-1',
        shiftStatus: ShiftStatus.OFF_DUTY,
      });
      eligibility.assertDispatchEligible.mockRejectedValue(
        new ForbiddenException('Guardian identity is not verified'),
      );

      await expect(service.autoStartOnLogin('g-1')).resolves.toBeUndefined();
      expect(prisma.guardianShiftState.upsert).not.toHaveBeenCalled();
    });
  });
});
