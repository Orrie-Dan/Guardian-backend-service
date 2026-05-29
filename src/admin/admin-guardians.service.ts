import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CertificationVerificationStatus,
  GuardianStatus,
  GuardianVerificationStatus,
  Prisma,
  RoleCode,
  ShiftStatus,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PasswordService } from '../auth/password.service';
import { AuthUserPayload } from '../auth/interfaces/auth-user.interface';
import { normalizePhone } from '../auth/phone.util';
import { OtpService } from '../auth/otp.service';
import {
  buildPaginatedMeta,
  paginationSkipTake,
} from '../common/dto/pagination-query.dto';
import { AuditService } from '../common/services/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialDeliveryService } from '../notifications/credential-delivery.service';
import { EmailNotificationService } from '../notifications/email-notification.service';
import { EmailTemplateId } from '../notifications/email-template.ids';
import {
  DOCUMENT_METADATA_SELECT,
  mapDocumentMetadata,
  mapGuardianForAdmin,
} from './admin-response.util';
import { AdminCreateCertificationDto } from './dto/admin-create-certification.dto';
import { CreateGuardianDto } from './dto/create-guardian.dto';
import { CreateVettingDto } from './dto/create-vetting.dto';
import { ListGuardiansQueryDto } from './dto/list-guardians-query.dto';
import { UpdateGuardianDto } from './dto/update-guardian.dto';

@Injectable()
export class AdminGuardiansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly otp: OtpService,
    private readonly passwords: PasswordService,
    private readonly credentials: CredentialDeliveryService,
    private readonly emails: EmailNotificationService,
  ) {}

  async create(dto: CreateGuardianDto, actor: AuthUserPayload) {
    const phone = normalizePhone(dto.phone);
    const existing = await this.prisma.user.findUnique({
      where: { phoneNumber: phone },
    });
    if (existing) {
      throw new ConflictException('Phone number already registered');
    }

    const guardianRole = await this.prisma.role.findUnique({
      where: { code: RoleCode.GUARDIAN },
    });
    if (!guardianRole) {
      throw new Error('GUARDIAN role not seeded');
    }

    const nationalIdHash = await bcrypt.hash(dto.nationalId, 12);
    const reserveForceNumberHash = dto.reserveForceNumber
      ? await bcrypt.hash(dto.reserveForceNumber, 12)
      : undefined;
    const guardianCount = await this.prisma.guardian.count();
    const guardianCode = `G-${String(guardianCount + 1).padStart(5, '0')}`;
    const coverageDistricts =
      dto.coverageDistricts?.length ? dto.coverageDistricts : [dto.districtBase];
    const temporaryPassword = this.generateTemporaryPassword();
    const passwordHash = await this.passwords.hash(temporaryPassword);

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          phoneNumber: phone,
          fullName: dto.fullName,
          email: dto.email,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
          gender: dto.gender,
          status: UserStatus.PENDING_VERIFICATION,
          passwordHash,
          userRoles: { create: { roleId: guardianRole.id, assignedBy: actor.sub } },
          guardianProfile: {
            create: {
              guardianCode,
              nationalIdHash,
              reserveForceNumberHash,
              districtBase: dto.districtBase,
              sectorBase: dto.sectorBase,
              coverageDistricts,
              employmentType: dto.employmentType,
              yearsExperience: dto.yearsExperience,
              specializations: dto.specializations ?? [],
              preferredShift: dto.preferredShift,
              status: GuardianStatus.INACTIVE,
              verificationStatus: GuardianVerificationStatus.PENDING,
              shiftState: {
                create: {
                  shiftStatus: ShiftStatus.OFF_DUTY,
                  availableForJobs: false,
                },
              },
              vettingRecord: dto.rnpReferenceNumber
                ? {
                    create: {
                      vettedAt: new Date(),
                      vettedByUserId: actor.sub,
                      rnpReferenceNumber: dto.rnpReferenceNumber,
                      reserveForceVerified: !!dto.reserveForceNumber,
                      notes: dto.vettingNotes,
                    },
                  }
                : undefined,
            },
          },
        },
        include: {
          guardianProfile: {
            include: { shiftState: true, vettingRecord: true, certifications: true },
          },
        },
      });
      return user;
    });

    const credentialDelivery = await this.credentials.sendGuardianCredentials({
      fullName: dto.fullName,
      phoneNumber: phone,
      email: dto.email,
      temporaryPassword,
    });

    await this.audit.log({
      actorUserId: actor.sub,
      action: 'GUARDIAN_CREATED_BY_ADMIN',
      entityType: 'guardian.guardians',
      entityId: result.guardianProfile!.id,
      afterState: { phone, guardianCode },
    });
    await this.audit.log({
      actorUserId: actor.sub,
      action: 'GUARDIAN_CREDENTIALS_DISPATCHED',
      entityType: 'identity.users',
      entityId: result.id,
      afterState: {
        dispatched: credentialDelivery.dispatched,
        channel: credentialDelivery.channel,
      },
    });

    return {
      ...result.guardianProfile,
      credentialsDispatched: credentialDelivery.dispatched,
      credentialsChannel: credentialDelivery.channel,
    };
  }

  private generateTemporaryPassword(): string {
    const raw = randomBytes(9).toString('base64url');
    return `G2-${raw}`;
  }

  async list(query: ListGuardiansQueryDto) {
    const { skip, take } = paginationSkipTake(query);
    const where: Prisma.GuardianWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.verificationStatus) {
      where.verificationStatus = query.verificationStatus;
    }

    const [rows, total] = await Promise.all([
      this.prisma.guardian.findMany({
        where,
        skip,
        take,
        orderBy: { joinedAt: 'desc' },
        include: {
          user: { select: { id: true, phoneNumber: true, fullName: true, status: true } },
          shiftState: true,
        },
      }),
      this.prisma.guardian.count({ where }),
    ]);

    const items = rows.map((row) => mapGuardianForAdmin(row));
    return { items, meta: buildPaginatedMeta(query.page, query.limit, total) };
  }

  async getOne(id: string) {
    const guardian = await this.prisma.guardian.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            phoneNumber: true,
            fullName: true,
            email: true,
            status: true,
            dateOfBirth: true,
            gender: true,
            isPhoneVerified: true,
            isEmailVerified: true,
          },
        },
        shiftState: true,
        certifications: {
          include: { document: { select: DOCUMENT_METADATA_SELECT } },
        },
        vettingRecord: {
          include: {
            clearanceDocument: { select: DOCUMENT_METADATA_SELECT },
            vettedBy: { select: { id: true, fullName: true } },
          },
        },
      },
    });
    if (!guardian) {
      throw new NotFoundException('Guardian not found');
    }

    return {
      ...mapGuardianForAdmin(guardian),
      user: guardian.user,
      shiftState: guardian.shiftState,
      certifications: guardian.certifications.map((cert) => ({
        ...cert,
        document: cert.document ? mapDocumentMetadata(cert.document) : null,
      })),
      vettingRecord: guardian.vettingRecord
        ? {
            ...guardian.vettingRecord,
            clearanceDocument: guardian.vettingRecord.clearanceDocument
              ? mapDocumentMetadata(guardian.vettingRecord.clearanceDocument)
              : null,
          }
        : null,
    };
  }

  async update(id: string, dto: UpdateGuardianDto, actor: AuthUserPayload) {
    const guardian = await this.getOne(id);
    const userUpdate: Prisma.UserUpdateInput = {};
    if (dto.fullName !== undefined) userUpdate.fullName = dto.fullName;
    if (dto.email !== undefined) userUpdate.email = dto.email;
    if (dto.dateOfBirth !== undefined) {
      userUpdate.dateOfBirth = new Date(dto.dateOfBirth);
    }
    if (dto.gender !== undefined) userUpdate.gender = dto.gender;

    const guardianUpdate: Prisma.GuardianUpdateInput = {};
    if (dto.districtBase !== undefined) guardianUpdate.districtBase = dto.districtBase;
    if (dto.sectorBase !== undefined) guardianUpdate.sectorBase = dto.sectorBase;
    if (dto.coverageDistricts !== undefined) {
      guardianUpdate.coverageDistricts = dto.coverageDistricts;
    }
    if (dto.employmentType !== undefined) {
      guardianUpdate.employmentType = dto.employmentType;
    }
    if (dto.yearsExperience !== undefined) {
      guardianUpdate.yearsExperience = dto.yearsExperience;
    }
    if (dto.specializations !== undefined) {
      guardianUpdate.specializations = dto.specializations;
    }
    if (dto.preferredShift !== undefined) {
      guardianUpdate.preferredShift = dto.preferredShift;
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: guardian.userId },
        data: userUpdate,
      }),
      this.prisma.guardian.update({
        where: { id },
        data: guardianUpdate,
      }),
    ]);

    await this.audit.log({
      actorUserId: actor.sub,
      action: 'GUARDIAN_UPDATED_BY_ADMIN',
      entityType: 'guardian.guardians',
      entityId: id,
    });

    return this.getOne(id);
  }

  async upsertVetting(
    guardianId: string,
    dto: CreateVettingDto,
    actor: AuthUserPayload,
  ) {
    await this.getOne(guardianId);
    const record = await this.prisma.guardianVettingRecord.upsert({
      where: { guardianId },
      create: {
        guardianId,
        vettedAt: new Date(dto.vettedAt),
        vettedByUserId: actor.sub,
        rnpReferenceNumber: dto.rnpReferenceNumber,
        clearanceDocumentId: dto.clearanceDocumentId,
        reserveForceVerified: dto.reserveForceVerified ?? false,
        notes: dto.notes,
      },
      update: {
        vettedAt: new Date(dto.vettedAt),
        vettedByUserId: actor.sub,
        rnpReferenceNumber: dto.rnpReferenceNumber,
        clearanceDocumentId: dto.clearanceDocumentId,
        reserveForceVerified: dto.reserveForceVerified,
        notes: dto.notes,
      },
    });

    await this.audit.log({
      actorUserId: actor.sub,
      action: 'GUARDIAN_VETTING_RECORDED',
      entityType: 'guardian.guardian_vetting_records',
      entityId: record.id,
    });

    return record;
  }

  async addCertification(
    guardianId: string,
    dto: AdminCreateCertificationDto,
    actor: AuthUserPayload,
  ) {
    await this.getOne(guardianId);
    const cert = await this.prisma.certification.create({
      data: {
        guardianId,
        certificationType: dto.certificationType,
        issuer: dto.issuer,
        issueDate: new Date(dto.issueDate),
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
        documentId: dto.documentId,
        verificationStatus: CertificationVerificationStatus.PENDING,
      },
    });

    await this.audit.log({
      actorUserId: actor.sub,
      action: 'CERTIFICATION_ADDED_BY_ADMIN',
      entityType: 'guardian.certifications',
      entityId: cert.id,
    });

    return cert;
  }

  async activate(guardianId: string, actor: AuthUserPayload) {
    const guardian = await this.getOne(guardianId);
    if (guardian.verificationStatus !== GuardianVerificationStatus.VERIFIED) {
      throw new ConflictException(
        'Guardian identity must be VERIFIED before activation',
      );
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: guardian.userId },
        data: { status: UserStatus.ACTIVE },
      }),
      this.prisma.guardian.update({
        where: { id: guardianId },
        data: {
          status: GuardianStatus.ACTIVE,
          activatedAt: new Date(),
          activatedBy: actor.sub,
        },
      }),
    ]);

    const otpResult = await this.otp.requestOtp(
      guardian.user.phoneNumber,
      undefined,
      undefined,
      { purpose: 'guardian_activation' },
    );
    if (process.env.NODE_ENV !== 'production') {
      console.info(
        `[activation-otp] guardian=${guardianId} phone=${guardian.user.phoneNumber}`,
        otpResult,
      );
    }

    await this.audit.log({
      actorUserId: actor.sub,
      action: 'GUARDIAN_ACTIVATED',
      entityType: 'guardian.guardians',
      entityId: guardianId,
    });

    await this.emails.sendToUser(
      guardian.userId,
      EmailTemplateId.GUARDIAN_ACTIVATED,
      { fullName: guardian.user.fullName ?? undefined },
      { entityType: 'guardian.guardians', entityId: guardianId, userId: guardian.userId },
    );

    return {
      guardianId,
      status: GuardianStatus.ACTIVE,
      otpSent: true,
      ...(process.env.NODE_ENV !== 'production' && 'devCode' in otpResult
        ? { devCode: (otpResult as { devCode?: string }).devCode }
        : {}),
    };
  }

  async suspend(guardianId: string, actor: AuthUserPayload) {
    const guardian = await this.getOne(guardianId);

    await this.prisma.$transaction([
      this.prisma.guardian.update({
        where: { id: guardianId },
        data: { status: GuardianStatus.SUSPENDED },
      }),
      this.prisma.guardianShiftState.updateMany({
        where: { guardianId },
        data: {
          shiftStatus: ShiftStatus.OFF_DUTY,
          availableForJobs: false,
          shiftStartedAt: null,
          shiftEndsAt: null,
        },
      }),
    ]);

    await this.audit.log({
      actorUserId: actor.sub,
      action: 'GUARDIAN_SUSPENDED',
      entityType: 'guardian.guardians',
      entityId: guardianId,
    });

    await this.emails.sendToUser(
      guardian.userId,
      EmailTemplateId.GUARDIAN_SUSPENDED,
      { fullName: guardian.user.fullName ?? undefined },
      { entityType: 'guardian.guardians', entityId: guardianId, userId: guardian.userId },
    );

    return { guardianId, status: GuardianStatus.SUSPENDED };
  }
}
