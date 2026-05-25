import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  CertificationVerificationStatus,
  GuardianVerificationStatus,
  GuardianStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GuardianEligibilityService {
  constructor(private readonly prisma: PrismaService) {}

  async assertDispatchEligible(guardianId: string): Promise<void> {
    const guardian = await this.prisma.guardian.findUnique({
      where: { id: guardianId },
      include: { certifications: true },
    });
    if (!guardian) {
      throw new ForbiddenException({ code: 'GUARDIAN_NOT_FOUND', message: 'Guardian not found' });
    }
    this.assertProfileEligible(guardian);
  }

  assertProfileEligible(guardian: {
    status: GuardianStatus;
    verificationStatus: GuardianVerificationStatus;
    certifications: {
      verificationStatus: CertificationVerificationStatus;
      expiryDate: Date | null;
    }[];
  }): void {
    if (guardian.status !== GuardianStatus.ACTIVE) {
      throw new ForbiddenException({
        code: 'GUARDIAN_NOT_ACTIVE',
        message: 'Guardian account is not active',
      });
    }
    if (guardian.verificationStatus !== GuardianVerificationStatus.VERIFIED) {
      throw new ForbiddenException({
        code: 'GUARDIAN_NOT_VERIFIED',
        message: 'Guardian identity is not verified',
      });
    }

    const now = new Date();
    const hasValidCert = guardian.certifications.some((cert) => {
      if (cert.verificationStatus !== CertificationVerificationStatus.VERIFIED) {
        return false;
      }
      if (cert.expiryDate && cert.expiryDate < now) {
        return false;
      }
      return true;
    });

    if (!hasValidCert) {
      throw new ForbiddenException({
        code: 'CERTIFICATION_REQUIRED',
        message: 'At least one verified, non-expired certification is required',
      });
    }
  }
}
