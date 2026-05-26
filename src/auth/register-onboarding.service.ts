import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  CoordinatePrecision,
  MobileMoneyProvider,
  OnboardingStep,
  OrgMemberRole,
  OrgVerificationDocumentType,
  OrgType,
  RoleCode,
  UserStatus,
  VerificationStatus,
} from '@prisma/client';
import { Prisma } from '@prisma/client';
import { AuditService } from '../common/services/audit.service';
import { DocumentsService } from '../documents/documents.service';
import { resolveDistrictCoordinates } from '../regions/district-coordinates';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { PatchRegisterBusinessDto } from './dto/register-v2/patch-business.dto';
import { PatchRegisterLocationDto } from './dto/register-v2/patch-location.dto';
import { PatchRegisterPaymentDto } from './dto/register-v2/patch-payment.dto';
import { PatchRegisterProfileDto } from './dto/register-v2/patch-profile.dto';
import { RegisterResumeDto } from './dto/register-v2/register-resume.dto';
import {
  getRequiredDocumentOptions,
  hasSatisfyingVerificationDocument,
  isDocumentTypeAllowedForOrg,
} from './policies/org-verification-documents.policy';
import {
  OnboardingContext,
  requireOnboardingOrg,
  resolveOnboardingContext,
  toOnboardingActor,
} from './onboarding-token.util';
import { OtpService } from './otp.service';
import { normalizePhone } from './phone.util';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

@Injectable()
export class RegisterOnboardingService {
  constructor(
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly passwords: PasswordService,
    private readonly documents: DocumentsService,
    private readonly auth: AuthService,
  ) {}

  startRegistration(phone: string) {
    return this.otp.requestOtp(normalizePhone(phone));
  }

  async verifyRegistrationStart(phone: string, code: string) {
    const normalized = await this.otp.verifyOtp(phone, code);

    const existing = await this.prisma.user.findUnique({
      where: { phoneNumber: normalized },
      include: {
        organizationUsers: {
          take: 1,
          orderBy: { createdAt: 'asc' },
          include: { organization: true },
        },
      },
    });

    if (existing?.onboardingCompletedAt) {
      throw new ConflictException({
        code: 'PHONE_ALREADY_REGISTERED',
        message: 'Phone number is already registered. Sign in instead.',
      });
    }

    let userId: string;
    let organizationId: string | undefined;

    if (existing) {
      userId = existing.id;
      organizationId = existing.organizationUsers[0]?.organizationId;
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          isPhoneVerified: true,
          onboardingStep: OnboardingStep.PHONE_VERIFIED,
        },
      });
    } else {
      const ownerRole = await this.prisma.role.findUnique({
        where: { code: RoleCode.CLIENT_OWNER },
      });
      if (!ownerRole) {
        throw new Error('CLIENT_OWNER role not seeded');
      }

      const created = await this.prisma.user.create({
        data: {
          phoneNumber: normalized,
          isPhoneVerified: true,
          status: UserStatus.PENDING_VERIFICATION,
          onboardingStep: OnboardingStep.PHONE_VERIFIED,
          userRoles: { create: { roleId: ownerRole.id } },
        },
      });
      userId = created.id;
    }

    const onboardingToken = await this.tokens.issueOnboardingToken(
      userId,
      organizationId,
    );

    return {
      userId,
      organizationId: organizationId ?? null,
      onboardingToken,
      onboardingStep: OnboardingStep.PHONE_VERIFIED,
    };
  }

  async patchProfile(
    authorizationHeader: string | undefined,
    dto: PatchRegisterProfileDto,
  ) {
    this.passwords.assertMatch(dto.password, dto.confirmPassword);
    const ctx = await resolveOnboardingContext(
      this.tokens,
      this.prisma,
      authorizationHeader,
    );

    const passwordHash = await this.passwords.hash(dto.password);
    await this.prisma.user.update({
      where: { id: ctx.userId },
      data: {
        fullName: dto.fullName,
        email: dto.email,
        passwordHash,
        passwordSetAt: new Date(),
        onboardingStep: OnboardingStep.PROFILE_COMPLETE,
      },
    });

    return { onboardingStep: OnboardingStep.PROFILE_COMPLETE };
  }

  async patchBusiness(
    authorizationHeader: string | undefined,
    dto: PatchRegisterBusinessDto,
  ) {
    const ctx = await resolveOnboardingContext(
      this.tokens,
      this.prisma,
      authorizationHeader,
    );

    const user = await this.prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { phoneNumber: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    let organizationId = ctx.organizationId;

    if (!organizationId) {
      const org = await this.prisma.organization.create({
        data: {
          legalName: dto.legalName,
          tradingName: dto.tradingName,
          tinNumber: dto.tinNumber,
          orgType: dto.orgType,
          mobileMoneyProvider: MobileMoneyProvider.MOMO_MTN,
          mobileMoneyPhone: user.phoneNumber,
          verificationStatus: VerificationStatus.PENDING,
          users: {
            create: {
              userId: ctx.userId,
              role: OrgMemberRole.CLIENT_OWNER,
            },
          },
        },
      });
      organizationId = org.id;
    } else {
      await this.prisma.organization.update({
        where: { id: organizationId },
        data: {
          legalName: dto.legalName,
          tradingName: dto.tradingName,
          tinNumber: dto.tinNumber,
          orgType: dto.orgType,
        },
      });
    }

    await this.prisma.user.update({
      where: { id: ctx.userId },
      data: { onboardingStep: OnboardingStep.PROFILE_COMPLETE },
    });

    const onboardingToken = await this.tokens.issueOnboardingToken(
      ctx.userId,
      organizationId,
    );

    return {
      organizationId,
      onboardingToken,
      onboardingStep: OnboardingStep.PROFILE_COMPLETE,
      requiredDocuments: getRequiredDocumentOptions(dto.orgType),
    };
  }

  async patchPayment(
    authorizationHeader: string | undefined,
    dto: PatchRegisterPaymentDto,
  ) {
    const ctx = await requireOnboardingOrg(
      await resolveOnboardingContext(this.tokens, this.prisma, authorizationHeader),
    );

    const mobileMoneyPhone = normalizePhone(dto.mobileMoneyPhone);
    await this.prisma.organization.update({
      where: { id: ctx.organizationId },
      data: {
        mobileMoneyProvider: dto.mobileMoneyProvider,
        mobileMoneyPhone,
      },
    });

    const step = await this.advanceStepAfterPayment(ctx.userId);
    return { onboardingStep: step };
  }

  async patchLocation(
    authorizationHeader: string | undefined,
    dto: PatchRegisterLocationDto,
  ) {
    const ctx = await requireOnboardingOrg(
      await resolveOnboardingContext(this.tokens, this.prisma, authorizationHeader),
    );

    const coords = resolveDistrictCoordinates(dto.district);
    if (!coords) {
      throw new BadRequestException({
        code: 'INVALID_DISTRICT',
        message: 'District must be a valid Rwanda district',
      });
    }

    const existingPrimary = await this.prisma.location.findFirst({
      where: { organizationId: ctx.organizationId, isPrimary: true },
    });

    const locationData = {
      name: dto.name,
      district: coords.district,
      sector: dto.sector,
      cell: dto.cell,
      village: dto.village,
      address: dto.address,
      latitude: new Prisma.Decimal(coords.latitude),
      longitude: new Prisma.Decimal(coords.longitude),
      coordinatePrecision: CoordinatePrecision.DISTRICT_APPROX,
      isPrimary: true,
    };

    if (existingPrimary) {
      await this.prisma.location.update({
        where: { id: existingPrimary.id },
        data: locationData,
      });
    } else {
      await this.prisma.location.create({
        data: {
          organizationId: ctx.organizationId,
          ...locationData,
        },
      });
    }

    await this.prisma.user.update({
      where: { id: ctx.userId },
      data: { onboardingStep: OnboardingStep.PAYMENT_COMPLETE },
    });

    return {
      onboardingStep: OnboardingStep.PAYMENT_COMPLETE,
      district: coords.district,
      coordinatePrecision: CoordinatePrecision.DISTRICT_APPROX,
    };
  }

  async registerDocumentUpload(
    authorizationHeader: string | undefined,
    file: Express.Multer.File,
    documentType: OrgVerificationDocumentType,
  ) {
    const ctx = await requireOnboardingOrg(
      await resolveOnboardingContext(this.tokens, this.prisma, authorizationHeader),
    );

    const org = await this.prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { orgType: true },
    });
    if (
      org &&
      !isDocumentTypeAllowedForOrg(org.orgType, documentType)
    ) {
      throw new BadRequestException({
        code: 'DOCUMENT_TYPE_NOT_ALLOWED_FOR_ORG',
        message: `Document type ${documentType} is not accepted for this organization type`,
      });
    }

    const uploaded = await this.documents.upload(toOnboardingActor(ctx), {
      buffer: file.buffer,
      mimeType: file.mimetype,
    });

    const link = await this.prisma.organizationVerificationDocument.upsert({
      where: {
        organizationId_documentId: {
          organizationId: ctx.organizationId,
          documentId: uploaded.documentId,
        },
      },
      create: {
        organizationId: ctx.organizationId,
        documentId: uploaded.documentId,
        documentType,
      },
      update: { documentType },
    });

    await this.audit.log({
      actorUserId: ctx.userId,
      action: 'ORG_VERIFICATION_DOCUMENT_LINKED',
      entityType: 'customer.organization_verification_documents',
      entityId: link.id,
    });

    const docCount = await this.prisma.organizationVerificationDocument.count({
      where: { organizationId: ctx.organizationId },
    });
    if (docCount >= 1) {
      await this.prisma.user.update({
        where: { id: ctx.userId },
        data: { onboardingStep: OnboardingStep.DOCUMENTS_UPLOADED },
      });
    }

    return {
      documentId: uploaded.documentId,
      documentType,
      mimeType: uploaded.mimeType,
      sizeBytes: uploaded.sizeBytes,
      link,
      onboardingStep: OnboardingStep.DOCUMENTS_UPLOADED,
    };
  }

  async getRegistrationStatus(authorizationHeader?: string) {
    const ctx = await resolveOnboardingContext(
      this.tokens,
      this.prisma,
      authorizationHeader,
    );

    const user = await this.prisma.user.findUnique({
      where: { id: ctx.userId },
      select: {
        onboardingStep: true,
        onboardingCompletedAt: true,
        isPhoneVerified: true,
      },
    });

    let org: {
      id: string;
      orgType: OrgType;
      verificationStatus: VerificationStatus;
      verificationRejectionReason: string | null;
      tinNumber: string | null;
    } | null = null;
    let documents: { documentType: OrgVerificationDocumentType }[] = [];
    let primaryLocationId: string | null = null;

    if (ctx.organizationId) {
      org = await this.prisma.organization.findUnique({
        where: { id: ctx.organizationId },
        select: {
          id: true,
          orgType: true,
          verificationStatus: true,
          verificationRejectionReason: true,
          tinNumber: true,
        },
      });
      documents = await this.prisma.organizationVerificationDocument.findMany({
        where: { organizationId: ctx.organizationId },
        select: { documentType: true },
      });
      const primary = await this.prisma.location.findFirst({
        where: { organizationId: ctx.organizationId, isPrimary: true },
        select: { id: true },
      });
      primaryLocationId = primary?.id ?? null;
    }

    const submitted = !!user?.onboardingCompletedAt;
    const orgVerified =
      org?.verificationStatus === VerificationStatus.VERIFIED;
    const primary = ctx.organizationId
      ? await this.prisma.location.findFirst({
          where: { organizationId: ctx.organizationId, isPrimary: true },
        })
      : null;
    const primaryPinned =
      primary?.coordinatePrecision === CoordinatePrecision.USER_PINNED;

    return {
      onboardingStep: user?.onboardingStep ?? OnboardingStep.PHONE_VERIFIED,
      phoneVerified: user?.isPhoneVerified ?? false,
      submitted,
      organization: org
        ? {
            id: org.id,
            orgType: org.orgType,
            verificationStatus: org.verificationStatus,
            rejectionReason: org.verificationRejectionReason,
            tinNumber: org.tinNumber,
          }
        : null,
      documents,
      requiredDocuments: org
        ? getRequiredDocumentOptions(org.orgType)
        : [],
      primaryLocationId,
      canBookJobs: submitted && orgVerified && !!primaryPinned,
      needsSiteSetup: submitted && orgVerified && !primaryPinned,
      canSignIn: submitted,
    };
  }

  async submitRegistration(authorizationHeader?: string) {
    const ctx = await requireOnboardingOrg(
      await resolveOnboardingContext(this.tokens, this.prisma, authorizationHeader),
    );

    const user = await this.prisma.user.findUnique({
      where: { id: ctx.userId },
    });
    const org = await this.prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      include: {
        verificationDocuments: true,
        locations: { where: { isPrimary: true }, take: 1 },
      },
    });

    if (!user?.fullName || !user.email || !user.passwordHash) {
      throw new BadRequestException({
        code: 'INCOMPLETE_ONBOARDING',
        message: 'Complete your profile before submitting',
      });
    }
    if (!org?.legalName || !org.orgType) {
      throw new BadRequestException({
        code: 'INCOMPLETE_ONBOARDING',
        message: 'Complete business details before submitting',
      });
    }
    if (!org.tinNumber?.trim()) {
      throw new BadRequestException({
        code: 'TIN_REQUIRED',
        message: 'TIN number is required before submitting',
      });
    }
    if (!org.locations[0]?.address) {
      throw new BadRequestException({
        code: 'INCOMPLETE_ONBOARDING',
        message: 'Add your primary site location before submitting',
      });
    }
    if (!user.isPhoneVerified) {
      throw new BadRequestException({
        code: 'PHONE_NOT_VERIFIED',
        message: 'Verify your phone number first',
      });
    }

    const docTypes = org.verificationDocuments.map((d) => d.documentType);
    if (!hasSatisfyingVerificationDocument(org.orgType, docTypes)) {
      throw new BadRequestException({
        code: 'DOCUMENTS_REQUIRED',
        message: 'Upload at least one acceptable verification document',
      });
    }

    await this.prisma.user.update({
      where: { id: ctx.userId },
      data: {
        status: UserStatus.ACTIVE,
        onboardingStep: OnboardingStep.SUBMITTED,
        onboardingCompletedAt: new Date(),
      },
    });

    await this.prisma.organization.update({
      where: { id: ctx.organizationId },
      data: { applicationSubmittedAt: new Date() },
    });

    await this.audit.log({
      actorUserId: ctx.userId,
      action: 'CLIENT_APPLICATION_SUBMITTED',
      entityType: 'identity.users',
      entityId: ctx.userId,
      afterState: { orgId: ctx.organizationId },
    });

    return this.auth.issueFullAuthResponse(ctx.userId);
  }

  async resumeRegistration(dto: RegisterResumeDto) {
    const phone = normalizePhone(dto.phone);
    const user = await this.prisma.user.findUnique({
      where: { phoneNumber: phone },
      include: {
        organizationUsers: {
          take: 1,
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_REGISTERED',
        message: 'No registration found for this phone. Start with POST /auth/register/start',
      });
    }

    if (user.onboardingCompletedAt) {
      throw new ConflictException({
        code: 'PHONE_ALREADY_REGISTERED',
        message: 'Registration complete. Sign in with your password.',
      });
    }

    if (dto.password) {
      if (!user.passwordHash) {
        throw new UnauthorizedException({
          code: 'PASSWORD_NOT_SET',
          message: 'Set a password during registration first',
        });
      }
      const valid = await this.passwords.verify(dto.password, user.passwordHash);
      if (!valid) {
        throw new UnauthorizedException({
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid password',
        });
      }
    } else {
      await this.otp.requestOtp(phone);
      return {
        otpSent: true,
        message: 'OTP sent. Call POST /auth/register/start/verify to continue.',
      };
    }

    const organizationId = user.organizationUsers[0]?.organizationId;
    const onboardingToken = await this.tokens.issueOnboardingToken(
      user.id,
      organizationId,
    );

    const status = await this.getRegistrationStatus(
      `Bearer ${onboardingToken}`,
    );

    return { onboardingToken, ...status };
  }

  private async advanceStepAfterPayment(userId: string): Promise<OnboardingStep> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { onboardingStep: true },
    });
    if (
      user?.onboardingStep === OnboardingStep.DOCUMENTS_UPLOADED ||
      user?.onboardingStep === OnboardingStep.PAYMENT_COMPLETE
    ) {
      return OnboardingStep.PAYMENT_COMPLETE;
    }
    return user?.onboardingStep ?? OnboardingStep.PROFILE_COMPLETE;
  }
}
