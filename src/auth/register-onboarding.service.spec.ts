import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  OnboardingStep,
  OrgType,
  OrgVerificationDocumentType,
  RoleCode,
  UserStatus,
  VerificationStatus,
} from '@prisma/client';
import { AuditService } from '../common/services/audit.service';
import { DocumentsService } from '../documents/documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailNotificationService } from '../notifications/email-notification.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { PasswordService } from './password.service';
import { RegisterOnboardingService } from './register-onboarding.service';
import { TokenService } from './token.service';

describe('RegisterOnboardingService', () => {
  let service: RegisterOnboardingService;

  const otp = { requestOtp: jest.fn(), verifyOtp: jest.fn() };
  const tokens = {
    issueOnboardingToken: jest.fn().mockResolvedValue('onboarding-jwt'),
    verifyOnboardingToken: jest.fn(),
  };
  const passwords = {
    hash: jest.fn().mockResolvedValue('hashed'),
    verify: jest.fn(),
    assertMatch: jest.fn(),
  };
  const documents = { upload: jest.fn() };
  const auth = { issueFullAuthResponse: jest.fn().mockResolvedValue({ accessToken: 'a' }) };
  const audit = { log: jest.fn() };
  const emails = { sendToUser: jest.fn() };
  const notifications = { notifyUserInApp: jest.fn() };

  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    role: { findUnique: jest.fn() },
    organization: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    location: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    organizationVerificationDocument: {
      count: jest.fn(),
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegisterOnboardingService,
        { provide: OtpService, useValue: otp },
        { provide: TokenService, useValue: tokens },
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: PasswordService, useValue: passwords },
        { provide: DocumentsService, useValue: documents },
        { provide: AuthService, useValue: auth },
        { provide: EmailNotificationService, useValue: emails },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get(RegisterOnboardingService);
  });

  it('verifyRegistrationStart creates new user without org', async () => {
    otp.verifyOtp.mockResolvedValue('+250788123456');
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.role.findUnique.mockResolvedValue({ id: 1, code: RoleCode.CLIENT_OWNER });
    prisma.user.create.mockResolvedValue({
      id: 'user-1',
      phoneNumber: '+250788123456',
    });

    const result = await service.verifyRegistrationStart('+250788123456', '123456');

    expect(result.userId).toBe('user-1');
    expect(result.organizationId).toBeNull();
    expect(tokens.issueOnboardingToken).toHaveBeenCalledWith('user-1', undefined);
  });

  it('submit rejects without TIN', async () => {
    tokens.verifyOnboardingToken.mockResolvedValue({
      sub: 'user-1',
      orgId: 'org-1',
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      status: UserStatus.PENDING_VERIFICATION,
      isPhoneVerified: true,
      onboardingCompletedAt: null,
      fullName: 'Test',
      email: 't@test.com',
      passwordHash: 'hash',
      phoneNumber: '+250788123456',
      organizationUsers: [{ organizationId: 'org-1' }],
    });
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      legalName: 'Biz',
      orgType: OrgType.HOTEL,
      tinNumber: null,
      verificationDocuments: [
        { documentType: OrgVerificationDocumentType.TIN_CERTIFICATE },
      ],
      locations: [{ address: 'Street 1' }],
    });

    await expect(
      service.submitRegistration('Bearer onboarding-jwt'),
    ).rejects.toMatchObject({
      response: { code: 'TIN_REQUIRED' },
    });
  });

  it('patchLocation rejects invalid district', async () => {
    tokens.verifyOnboardingToken.mockResolvedValue({
      sub: 'user-1',
      orgId: 'org-1',
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      status: UserStatus.PENDING_VERIFICATION,
      onboardingCompletedAt: null,
      organizationUsers: [{ organizationId: 'org-1' }],
      phoneNumber: '+250788123456',
    });
    prisma.location.findFirst.mockResolvedValue(null);

    await expect(
      service.patchLocation('Bearer t', {
        name: 'HQ',
        district: 'NotADistrict',
        address: 'Main Rd',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resume with password reissues onboarding token', async () => {
    const draftUser = {
      id: 'user-1',
      status: UserStatus.PENDING_VERIFICATION,
      onboardingCompletedAt: null,
      passwordHash: 'hash',
      isPhoneVerified: true,
      onboardingStep: OnboardingStep.PHONE_VERIFIED,
      organizationUsers: [{ organizationId: 'org-1' }],
      phoneNumber: '+250788123456',
    };
    prisma.user.findUnique
      .mockResolvedValueOnce(draftUser)
      .mockResolvedValueOnce({
        id: 'user-1',
        status: UserStatus.PENDING_VERIFICATION,
        onboardingCompletedAt: null,
        organizationUsers: [{ organizationId: 'org-1' }],
        phoneNumber: '+250788123456',
      })
      .mockResolvedValueOnce({
        onboardingStep: OnboardingStep.PHONE_VERIFIED,
        onboardingCompletedAt: null,
        isPhoneVerified: true,
      });
    passwords.verify.mockResolvedValue(true);
    tokens.verifyOnboardingToken.mockResolvedValue({
      sub: 'user-1',
      orgId: 'org-1',
    });
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      orgType: OrgType.HOTEL,
      verificationStatus: VerificationStatus.PENDING,
      verificationRejectionReason: null,
      tinNumber: '123',
    });
    prisma.organizationVerificationDocument.findMany.mockResolvedValue([]);
    prisma.location.findFirst.mockResolvedValue(null);

    const result = await service.resumeRegistration({
      phone: '+250788123456',
      password: 'password1',
    });

    expect('onboardingToken' in result && result.onboardingToken).toBe(
      'onboarding-jwt',
    );
    expect(tokens.issueOnboardingToken).toHaveBeenCalledWith('user-1', 'org-1');
  });

  it('resume rejects completed registration', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      onboardingCompletedAt: new Date(),
    });

    await expect(
      service.resumeRegistration({ phone: '+250788123456', password: 'x' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
