import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  CoordinatePrecision,
  VerificationStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PrimaryLocationSetupPolicy {
  constructor(private readonly prisma: PrismaService) {}

  async getPrimaryLocation(organizationId: string) {
    return this.prisma.location.findFirst({
      where: { organizationId, isPrimary: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getBookingEligibility(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { verificationStatus: true },
    });
    const primary = await this.getPrimaryLocation(organizationId);
    const orgVerified = org?.verificationStatus === VerificationStatus.VERIFIED;
    const primaryPinned =
      primary?.coordinatePrecision === CoordinatePrecision.USER_PINNED;

    return {
      canBookJobs: !!orgVerified && !!primaryPinned,
      needsSiteSetup: !!orgVerified && !primaryPinned,
      primaryLocationId: primary?.id ?? null,
    };
  }

  async assertCanBookJobs(organizationId: string): Promise<void> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { verificationStatus: true },
    });
    if (!org) {
      throw new ForbiddenException('Organization not found');
    }
    if (org.verificationStatus !== VerificationStatus.VERIFIED) {
      throw new ForbiddenException({
        code: 'ORG_PENDING_VERIFICATION',
        message:
          'Organization is pending verification. You can view your profile but cannot book jobs yet.',
      });
    }

    const primary = await this.getPrimaryLocation(organizationId);
    if (
      !primary ||
      primary.coordinatePrecision !== CoordinatePrecision.USER_PINNED
    ) {
      throw new ForbiddenException({
        code: 'PRIMARY_LOCATION_SETUP_REQUIRED',
        message:
          'Complete your site on the map before booking.',
      });
    }
  }
}
