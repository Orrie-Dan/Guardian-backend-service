import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ShiftStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GuardianEligibilityService } from './guardian-eligibility.service';

@Injectable()
export class ShiftStateService {
  private readonly logger = new Logger(ShiftStateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eligibility: GuardianEligibilityService,
  ) {}

  /** Best-effort: on login, go available unless the guardian chose offline (shift/end). */
  async autoStartOnLogin(guardianId: string): Promise<void> {
    const state = await this.prisma.guardianShiftState.findUnique({
      where: { guardianId },
    });
    if (state && state.shiftStatus !== ShiftStatus.OFF_DUTY) {
      return;
    }

    try {
      await this.startShift(guardianId);
      this.logger.log(`Guardian ${guardianId} auto-started shift on login`);
    } catch (err) {
      this.logger.debug(
        `Guardian ${guardianId} not auto-started on login: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async startShift(guardianId: string, shiftEndsAt?: Date) {
    await this.eligibility.assertDispatchEligible(guardianId);

    return this.prisma.guardianShiftState.upsert({
      where: { guardianId },
      create: {
        guardianId,
        shiftStatus: ShiftStatus.AVAILABLE,
        availableForJobs: true,
        shiftStartedAt: new Date(),
        shiftEndsAt,
      },
      update: {
        shiftStatus: ShiftStatus.AVAILABLE,
        availableForJobs: true,
        shiftStartedAt: new Date(),
        shiftEndsAt,
      },
    });
  }

  async endShift(guardianId: string) {
    return this.prisma.guardianShiftState.update({
      where: { guardianId },
      data: {
        shiftStatus: ShiftStatus.OFF_DUTY,
        availableForJobs: false,
        shiftStartedAt: null,
        shiftEndsAt: null,
      },
    });
  }

  async setBusy(guardianId: string) {
    return this.prisma.guardianShiftState.update({
      where: { guardianId },
      data: {
        shiftStatus: ShiftStatus.BUSY,
        availableForJobs: false,
      },
    });
  }

  async setAvailable(guardianId: string) {
    const state = await this.prisma.guardianShiftState.findUnique({
      where: { guardianId },
    });
    if (!state) {
      throw new NotFoundException('Shift state not found');
    }
    if (state.shiftStatus === ShiftStatus.OFF_DUTY) {
      return state;
    }
    return this.prisma.guardianShiftState.update({
      where: { guardianId },
      data: {
        shiftStatus: ShiftStatus.AVAILABLE,
        availableForJobs: true,
      },
    });
  }
}
