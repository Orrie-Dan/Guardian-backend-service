import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CoordinatePrecision,
  OrgMemberRole,
  Prisma,
  RoleCode,
  VerificationStatus,
} from '@prisma/client';
import { AuthUserPayload } from '../auth/interfaces/auth-user.interface';
import { PermissionResolverService } from '../auth/permission-resolver.service';
import { AuditService } from '../common/services/audit.service';
import { ResourceOwnerPolicy } from '../common/policies/resource-owner.policy';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { CompleteSiteDto } from './dto/complete-site.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: ResourceOwnerPolicy,
    private readonly audit: AuditService,
    private readonly permissionResolver: PermissionResolverService,
  ) {}

  async createOrganization(dto: CreateOrganizationDto, actor: AuthUserPayload) {
    const ownerRole = await this.prisma.role.findUnique({
      where: { code: RoleCode.CLIENT_OWNER },
    });
    if (!ownerRole) {
      throw new BadRequestException('CLIENT_OWNER role not seeded');
    }

    const org = await this.prisma.$transaction(async (tx) => {
      await tx.userRoleAssignment.upsert({
        where: {
          userId_roleId: { userId: actor.sub, roleId: ownerRole.id },
        },
        create: { userId: actor.sub, roleId: ownerRole.id },
        update: {},
      });

      const owner = await tx.user.findUnique({
        where: { id: actor.sub },
        select: { phoneNumber: true },
      });

      return tx.organization.create({
        data: {
          legalName: dto.legalName,
          tradingName: dto.tradingName,
          tinNumber: dto.tinNumber,
          orgType: dto.orgType,
          mobileMoneyProvider: 'MOMO_MTN',
          mobileMoneyPhone: owner?.phoneNumber ?? '+250700000000',
          users: {
            create: {
              userId: actor.sub,
              role: OrgMemberRole.CLIENT_OWNER,
            },
          },
        },
        include: { locations: true },
      });
    });
    await this.audit.log({
      actorUserId: actor.sub,
      action: 'ORG_CREATED',
      entityType: 'customer.organizations',
      entityId: org.id,
    });
    return org;
  }

  async listForUser(actor: AuthUserPayload) {
    const memberships = await this.prisma.organizationUser.findMany({
      where: { userId: actor.sub },
      include: { organization: { include: { locations: true } } },
    });
    return memberships.map((m) => m.organization);
  }

  async getOrganization(id: string, actor: AuthUserPayload) {
    await this.policy.assertOrgMember(id, actor);
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: { locations: true },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    return org;
  }

  async updateOrganization(
    id: string,
    dto: UpdateOrganizationDto,
    actor: AuthUserPayload,
  ) {
    await this.assertOwnerOrOps(id, actor);
    const org = await this.prisma.organization.update({
      where: { id },
      data: dto,
    });
    await this.audit.log({
      actorUserId: actor.sub,
      action: 'ORG_UPDATED',
      entityType: 'customer.organizations',
      entityId: id,
    });
    return org;
  }

  async listLocations(orgId: string, actor: AuthUserPayload) {
    await this.policy.assertOrgMember(orgId, actor);
    return this.prisma.location.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addLocation(orgId: string, dto: CreateLocationDto, actor: AuthUserPayload) {
    await this.assertOwnerOrOps(orgId, actor);
    const loc = await this.prisma.location.create({
      data: {
        organizationId: orgId,
        name: dto.name,
        district: dto.district,
        sector: dto.sector,
        cell: dto.cell,
        village: dto.village,
        address: dto.address,
        latitude: dto.latitude,
        longitude: dto.longitude,
        coordinatePrecision: CoordinatePrecision.USER_PINNED,
        siteSetupCompletedAt: new Date(),
        operatingHours: dto.operatingHours as Prisma.InputJsonValue | undefined,
      },
    });
    await this.audit.log({
      actorUserId: actor.sub,
      action: 'LOCATION_CREATED',
      entityType: 'customer.locations',
      entityId: loc.id,
    });
    return loc;
  }

  async updateLocation(
    orgId: string,
    locationId: string,
    dto: UpdateLocationDto,
    actor: AuthUserPayload,
  ) {
    await this.assertOwnerOrOps(orgId, actor);
    const loc = await this.prisma.location.findFirst({
      where: { id: locationId, organizationId: orgId },
    });
    if (!loc) {
      throw new NotFoundException('Location not found');
    }
    return this.prisma.location.update({
      where: { id: locationId },
      data: dto,
    });
  }

  async completePrimarySite(
    orgId: string,
    dto: CompleteSiteDto,
    actor: AuthUserPayload,
  ) {
    await this.assertOwnerOrOps(orgId, actor);

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { verificationStatus: true },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    if (org.verificationStatus !== VerificationStatus.VERIFIED) {
      throw new ForbiddenException({
        code: 'ORG_PENDING_VERIFICATION',
        message:
          'Organization must be verified before completing site setup',
      });
    }

    const primary = await this.prisma.location.findFirst({
      where: { organizationId: orgId, isPrimary: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!primary) {
      throw new NotFoundException('Primary location not found');
    }

    const updated = await this.prisma.location.update({
      where: { id: primary.id },
      data: {
        latitude: dto.latitude,
        longitude: dto.longitude,
        coordinatePrecision: CoordinatePrecision.USER_PINNED,
        siteSetupCompletedAt: new Date(),
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.address ? { address: dto.address } : {}),
      },
    });

    await this.audit.log({
      actorUserId: actor.sub,
      action: 'PRIMARY_LOCATION_SITE_SETUP_COMPLETED',
      entityType: 'customer.locations',
      entityId: primary.id,
      afterState: {
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
    });

    return updated;
  }

  async listMembers(orgId: string, actor: AuthUserPayload) {
    await this.assertOwnerOrOps(orgId, actor);
    return this.prisma.organizationUser.findMany({
      where: { organizationId: orgId },
      include: { user: true },
    });
  }

  async inviteMember(orgId: string, dto: InviteMemberDto, actor: AuthUserPayload) {
    await this.assertOwnerOrOps(orgId, actor);

    let user = await this.prisma.user.findUnique({
      where: { phoneNumber: dto.phoneNumber },
    });

    if (!user) {
      const staffRole = await this.prisma.role.findUnique({
        where: { code: RoleCode.CLIENT_STAFF },
      });
      if (!staffRole) {
        throw new BadRequestException('CLIENT_STAFF role not seeded');
      }
      user = await this.prisma.user.create({
        data: {
          phoneNumber: dto.phoneNumber,
          email: dto.email,
          userRoles: { create: { roleId: staffRole.id } },
        },
      });
    }

    const membership = await this.prisma.organizationUser.upsert({
      where: {
        organizationId_userId: { organizationId: orgId, userId: user.id },
      },
      create: {
        organizationId: orgId,
        userId: user.id,
        role: dto.role,
        invitedBy: actor.sub,
      },
      update: { role: dto.role },
      include: { user: true },
    });

    await this.audit.log({
      actorUserId: actor.sub,
      action: 'MEMBER_INVITED',
      entityType: 'customer.organization_users',
      entityId: user.id,
      afterState: { orgId, role: dto.role },
    });

    await this.permissionResolver.invalidateUser(user.id);
    await this.permissionResolver.invalidateUser(actor.sub);

    return membership;
  }

  async removeMember(orgId: string, userId: string, actor: AuthUserPayload) {
    await this.assertOwnerOrOps(orgId, actor);
    if (userId === actor.sub) {
      throw new BadRequestException('Cannot remove yourself');
    }
    await this.prisma.organizationUser.delete({
      where: {
        organizationId_userId: { organizationId: orgId, userId },
      },
    });
    await this.audit.log({
      actorUserId: actor.sub,
      action: 'MEMBER_REMOVED',
      entityType: 'customer.organization_users',
      entityId: userId,
    });
    await this.permissionResolver.invalidateUser(userId);
    return { removed: true };
  }

  private async assertOwnerOrOps(orgId: string, actor: AuthUserPayload) {
    if (this.policy.isOps(actor)) {
      return;
    }
    const membership = await this.prisma.organizationUser.findUnique({
      where: {
        organizationId_userId: { organizationId: orgId, userId: actor.sub },
      },
    });
    if (!membership || membership.role !== OrgMemberRole.CLIENT_OWNER) {
      throw new ForbiddenException('Client owner access required');
    }
  }
}
