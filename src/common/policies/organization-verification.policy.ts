import { ForbiddenException, Injectable } from '@nestjs/common';
import { VerificationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OrganizationVerificationPolicy {
  constructor(private readonly prisma: PrismaService) {}

  async assertOrgVerifiedForMutations(organizationId: string): Promise<void> {
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
  }

  async getOrgVerificationStatus(
    organizationId: string,
  ): Promise<VerificationStatus | null> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { verificationStatus: true },
    });
    return org?.verificationStatus ?? null;
  }
}
