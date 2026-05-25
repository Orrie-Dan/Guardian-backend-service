import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthUserPayload } from '../auth/interfaces/auth-user.interface';
import { PermissionResolverService } from '../auth/permission-resolver.service';
import { PrimaryLocationSetupPolicy } from '../common/policies/primary-location-setup.policy';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionResolverService,
    private readonly locationSetup: PrimaryLocationSetupPolicy,
  ) {}

  async getMe(actor: AuthUserPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.sub },
      include: {
        userRoles: { include: { role: true } },
        organizationUsers: {
          include: {
            organization: {
              select: {
                id: true,
                legalName: true,
                tradingName: true,
                verificationStatus: true,
                verificationRejectionReason: true,
              },
            },
          },
        },
        guardianProfile: true,
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const permissionList = await this.permissions.resolve(actor);

    const organizations = await Promise.all(
      user.organizationUsers.map(async (m) => {
        const booking = await this.locationSetup.getBookingEligibility(
          m.organization.id,
        );
        return {
          id: m.organization.id,
          legalName: m.organization.legalName,
          tradingName: m.organization.tradingName,
          role: m.role,
          verificationStatus: m.organization.verificationStatus,
          rejectionReason: m.organization.verificationRejectionReason,
          canBookJobs: booking.canBookJobs,
          needsSiteSetup: booking.needsSiteSetup,
          primaryLocationId: booking.primaryLocationId,
        };
      }),
    );

    return {
      id: user.id,
      phone: user.phoneNumber,
      email: user.email,
      status: user.status,
      roles: user.userRoles.map((r) => r.role.code),
      permissions: permissionList,
      activeRole: actor.activeRole,
      activeOrgId: actor.activeOrgId,
      organizations,
      guardianId: user.guardianProfile?.id,
      onboarding: {
        completed: !!user.onboardingCompletedAt,
        step: user.onboardingStep,
      },
    };
  }

  async updateMe(actor: AuthUserPayload, data: { email?: string }) {
    return this.prisma.user.update({
      where: { id: actor.sub },
      data: { email: data.email },
      select: {
        id: true,
        phoneNumber: true,
        email: true,
        status: true,
      },
    });
  }
}
