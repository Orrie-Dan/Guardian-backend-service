import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CertificationVerificationStatus,
  GuardianVerificationStatus,
  OrgMemberRole,
  Prisma,
  VerificationStatus,
} from '@prisma/client';
import {
  PaginationQueryDto,
  buildPaginatedMeta,
  paginationSkipTake,
} from '../common/dto/pagination-query.dto';
import { AuditService } from '../common/services/audit.service';
import { EmailNotificationService } from '../notifications/email-notification.service';
import { EmailTemplateId } from '../notifications/email-template.ids';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  DOCUMENT_METADATA_SELECT,
  mapDocumentMetadata,
  mapGuardianForAdmin,
  mapLocation,
} from './admin-response.util';

@Injectable()
export class AdminVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly emails: EmailNotificationService,
  ) {}

  async listOrganizations(
    query: PaginationQueryDto,
    filters?: { status?: VerificationStatus; search?: string },
  ) {
    const trimmedSearch = filters?.search?.trim();
    const where: Prisma.OrganizationWhereInput = {
      ...(filters?.status ? { verificationStatus: filters.status } : {}),
      ...(trimmedSearch
        ? {
            OR: [
              { legalName: { contains: trimmedSearch, mode: 'insensitive' } },
              { tradingName: { contains: trimmedSearch, mode: 'insensitive' } },
              { tinNumber: { contains: trimmedSearch, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.organization.findMany({
        where,
        ...paginationSkipTake(query),
        orderBy: { createdAt: 'desc' },
        include: {
          verificationDocuments: {
            include: {
              document: { select: DOCUMENT_METADATA_SELECT },
            },
          },
          users: {
            include: {
              user: { select: { phoneNumber: true, fullName: true, email: true } },
            },
          },
          locations: true,
        },
      }),
      this.prisma.organization.count({ where }),
    ]);

    const items = rows.map((org) => ({
      ...org,
      locations: org.locations.map(mapLocation),
      verificationDocuments: org.verificationDocuments.map((row) => ({
        ...row,
        document: mapDocumentMetadata(row.document),
      })),
    }));

    return {
      items,
      meta: buildPaginatedMeta(query.page, query.limit, total),
    };
  }

  async listPendingOrganizations() {
    const rows = await this.prisma.organization.findMany({
      where: { verificationStatus: VerificationStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      include: {
        verificationDocuments: {
          include: {
            document: { select: DOCUMENT_METADATA_SELECT },
          },
        },
        users: {
          include: {
            user: { select: { phoneNumber: true, fullName: true, email: true } },
          },
        },
        locations: true,
      },
    });

    return rows.map((org) => ({
      ...org,
      locations: org.locations.map(mapLocation),
      verificationDocuments: org.verificationDocuments.map((row) => ({
        ...row,
        document: mapDocumentMetadata(row.document),
      })),
    }));
  }

  async reviewOrganization(
    id: string,
    status: VerificationStatus,
    actorUserId: string,
    reason?: string,
  ) {
    if (status === VerificationStatus.REJECTED && !reason?.trim()) {
      throw new BadRequestException({
        code: 'REJECTION_REASON_REQUIRED',
        message: 'Provide a reason when rejecting an organization',
      });
    }

    const org = await this.prisma.organization.update({
      where: { id },
      data: {
        verificationStatus: status,
        verificationRejectionReason:
          status === VerificationStatus.REJECTED ? reason?.trim() : null,
      },
      include: {
        users: {
          include: {
            user: { select: { id: true, email: true, fullName: true } },
          },
        },
      },
    });

    await this.audit.log({
      actorUserId,
      action: 'ORG_VERIFICATION_REVIEW',
      entityType: 'customer.organizations',
      entityId: id,
      afterState: { status, reason: reason ?? null },
    });

    const ownerIds = org.users
      .filter((u) => u.role === OrgMemberRole.CLIENT_OWNER)
      .map((u) => u.user.id);

    const orgName = org.tradingName ?? org.legalName ?? 'your organization';

    if (status === VerificationStatus.VERIFIED) {
      for (const userId of ownerIds) {
        await this.notifications.createInApp(
          userId,
          'Business approved',
          'Your business is approved. Pin your site on the map to start booking.',
          { organizationId: id, action: 'COMPLETE_SITE_SETUP' },
        );
      }
      await this.emails.sendToOrgOwners(
        id,
        EmailTemplateId.VERIFICATION_ORG_APPROVED,
        { organizationName: orgName },
        { entityType: 'customer.organizations', entityId: id },
      );
    } else if (status === VerificationStatus.REJECTED) {
      for (const userId of ownerIds) {
        await this.notifications.createInApp(
          userId,
          'Application needs attention',
          reason ?? 'Your application was not approved.',
          { organizationId: id, action: 'VIEW_REJECTION' },
        );
      }
      await this.emails.sendToOrgOwners(
        id,
        EmailTemplateId.VERIFICATION_ORG_REJECTED,
        { organizationName: orgName, reason: reason ?? 'Not approved' },
        { entityType: 'customer.organizations', entityId: id },
      );
    }

    return org;
  }

  async listPendingGuardians() {
    const rows = await this.prisma.guardian.findMany({
      where: { verificationStatus: GuardianVerificationStatus.PENDING },
      include: {
        user: {
          select: {
            id: true,
            phoneNumber: true,
            fullName: true,
            email: true,
            status: true,
          },
        },
        certifications: {
          include: {
            document: { select: DOCUMENT_METADATA_SELECT },
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    return rows.map((guardian) => {
      const mapped = mapGuardianForAdmin(guardian);
      return {
        ...mapped,
        certifications: guardian.certifications.map((cert) => ({
          ...cert,
          document: cert.document ? mapDocumentMetadata(cert.document) : null,
        })),
      };
    });
  }

  async reviewGuardian(
    id: string,
    status: GuardianVerificationStatus,
    actorUserId: string,
  ) {
    const guardian = await this.prisma.guardian.update({
      where: { id },
      data: { verificationStatus: status },
    });
    await this.audit.log({
      actorUserId,
      action: 'GUARDIAN_VERIFICATION_REVIEW',
      entityType: 'guardian.guardians',
      entityId: id,
      afterState: { status },
    });
    return mapGuardianForAdmin(guardian);
  }

  async reviewCertification(
    id: string,
    status: CertificationVerificationStatus,
    actorUserId: string,
  ) {
    const cert = await this.prisma.certification.findUnique({
      where: { id },
    });
    if (!cert) {
      throw new NotFoundException('Certification not found');
    }
    const updated = await this.prisma.certification.update({
      where: { id },
      data: { verificationStatus: status },
    });
    await this.audit.log({
      actorUserId,
      action: 'CERTIFICATION_VERIFICATION_REVIEW',
      entityType: 'guardian.guardian_certifications',
      entityId: id,
      afterState: { status },
    });
    return updated;
  }
}
