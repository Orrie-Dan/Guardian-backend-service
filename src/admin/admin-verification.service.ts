import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CertificationVerificationStatus,
  GuardianVerificationStatus,
  OrgMemberRole,
  VerificationStatus,
} from '@prisma/client';
import { AuditService } from '../common/services/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  listPendingOrganizations() {
    return this.prisma.organization.findMany({
      where: { verificationStatus: VerificationStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      include: {
        verificationDocuments: { include: { document: true } },
        users: {
          include: {
            user: { select: { phoneNumber: true, fullName: true, email: true } },
          },
        },
        locations: true,
      },
    });
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
        users: { include: { user: { select: { id: true } } } },
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

    if (status === VerificationStatus.VERIFIED) {
      for (const userId of ownerIds) {
        await this.notifications.createInApp(
          userId,
          'Business approved',
          'Your business is approved. Pin your site on the map to start booking.',
          { organizationId: id, action: 'COMPLETE_SITE_SETUP' },
        );
      }
    } else if (status === VerificationStatus.REJECTED) {
      for (const userId of ownerIds) {
        await this.notifications.createInApp(
          userId,
          'Application needs attention',
          reason ?? 'Your application was not approved.',
          { organizationId: id, action: 'VIEW_REJECTION' },
        );
      }
    }

    return org;
  }

  listPendingGuardians() {
    return this.prisma.guardian.findMany({
      where: { verificationStatus: GuardianVerificationStatus.PENDING },
      include: { user: true, certifications: true },
      orderBy: { joinedAt: 'asc' },
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
    return guardian;
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
