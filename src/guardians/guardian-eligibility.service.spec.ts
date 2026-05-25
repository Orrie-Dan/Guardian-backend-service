import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CertificationVerificationStatus,
  GuardianStatus,
  GuardianVerificationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GuardianEligibilityService } from './guardian-eligibility.service';

describe('GuardianEligibilityService', () => {
  let service: GuardianEligibilityService;
  const prisma = { guardian: { findUnique: jest.fn() } };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuardianEligibilityService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(GuardianEligibilityService);
    jest.clearAllMocks();
  });

  it('rejects unverified guardian', async () => {
    prisma.guardian.findUnique.mockResolvedValue({
      status: GuardianStatus.ACTIVE,
      verificationStatus: GuardianVerificationStatus.PENDING,
      certifications: [
        {
          verificationStatus: CertificationVerificationStatus.VERIFIED,
          expiryDate: null,
        },
      ],
    });

    await expect(service.assertDispatchEligible('g-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects guardian without valid cert', async () => {
    prisma.guardian.findUnique.mockResolvedValue({
      status: GuardianStatus.ACTIVE,
      verificationStatus: GuardianVerificationStatus.VERIFIED,
      certifications: [
        {
          verificationStatus: CertificationVerificationStatus.PENDING,
          expiryDate: null,
        },
      ],
    });

    await expect(service.assertDispatchEligible('g-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
