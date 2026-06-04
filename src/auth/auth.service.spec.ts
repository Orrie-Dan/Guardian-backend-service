import {
  BadRequestException,
  GoneException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GuardianStatus, RoleCode, UserStatus } from '@prisma/client';
import { AuditService } from '../common/services/audit.service';
import { PrimaryLocationSetupPolicy } from '../common/policies/primary-location-setup.policy';
import { PrismaService } from '../prisma/prisma.service';
import { loadAuthUserPayload } from './auth-user.loader';
import { EmailNotificationService } from '../notifications/email-notification.service';
import { ShiftStateService } from '../guardians/shift-state.service';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

jest.mock('./auth-user.loader', () => ({
  loadAuthUserPayload: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  const otp = { requestOtp: jest.fn(), verifyOtp: jest.fn() };
  const tokens = {
    issueTokens: jest.fn(),
    issueSetupToken: jest.fn(),
    verifySetupToken: jest.fn(),
    tryResolveAccessUserId: jest.fn(),
    revokeAllRefreshTokensForUser: jest.fn(),
  };
  const passwords = {
    hash: jest.fn().mockResolvedValue('hashed'),
    verify: jest.fn(),
    assertMatch: jest.fn(),
  };
  const locationSetup = {
    getBookingEligibility: jest.fn().mockResolvedValue({
      canBookJobs: false,
      needsSiteSetup: false,
      primaryLocationId: null,
    }),
  };
  const emails = {
    sendToUser: jest.fn().mockResolvedValue({ sent: true }),
    sendToOrgOwners: jest.fn().mockResolvedValue([]),
    sendToGuardianUser: jest.fn().mockResolvedValue({ sent: true }),
    sendBestEffort: jest.fn().mockResolvedValue({ sent: true }),
  };
  const shiftState = { autoStartOnLogin: jest.fn() };
  const prisma = {
    user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    guardian: { findUnique: jest.fn() },
    role: { findUnique: jest.fn() },
    organizationUser: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const audit = { log: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: OtpService, useValue: otp },
        { provide: TokenService, useValue: tokens },
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: PasswordService, useValue: passwords },
        { provide: PrimaryLocationSetupPolicy, useValue: locationSetup },
        { provide: EmailNotificationService, useValue: emails },
        { provide: ShiftStateService, useValue: shiftState },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('registerApplication is deprecated', async () => {
    await expect(service.registerApplication({} as never)).rejects.toBeInstanceOf(
      GoneException,
    );
  });

  it('deprecatedOtpRequest returns 410', () => {
    expect(() => service.deprecatedOtpRequest()).toThrow(GoneException);
  });

  it('passwordResetRequest sends OTP with password_reset purpose', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      phoneNumber: '+250788123456',
      passwordHash: 'hash',
      status: UserStatus.ACTIVE,
      userRoles: [],
    });
    otp.requestOtp.mockResolvedValue({ otpId: 'o1', expiresAt: new Date() });

    await service.passwordResetRequest('+250788123456');

    expect(otp.requestOtp).toHaveBeenCalledWith(
      '+250788123456',
      undefined,
      undefined,
      { purpose: 'password_reset' },
    );
    expect(emails.sendToUser).not.toHaveBeenCalled();
  });

  it('passwordResetRequest rejects account without password', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      phoneNumber: '+250788123456',
      passwordHash: null,
      status: UserStatus.ACTIVE,
      userRoles: [],
    });

    await expect(service.passwordResetRequest('+250788123456')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('passwordResetConfirm updates password and revokes sessions', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      phoneNumber: '+250788123456',
      passwordHash: 'old',
      passwordSetAt: new Date(),
      status: UserStatus.ACTIVE,
      onboardingCompletedAt: new Date(),
      isPhoneVerified: true,
      userRoles: [{ role: { code: RoleCode.CLIENT_OWNER } }],
    });
    otp.verifyOtp.mockResolvedValue('+250788123456');
    prisma.user.update.mockResolvedValue({});
    prisma.organizationUser.findMany.mockResolvedValue([]);
    (loadAuthUserPayload as jest.Mock).mockResolvedValue({
      sub: 'u1',
      roles: ['CLIENT_OWNER'],
      activeRole: 'CLIENT_OWNER',
      organizationIds: [],
    });
    tokens.issueTokens.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: '15m',
    });
    prisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'u1',
        phoneNumber: '+250788123456',
        passwordHash: 'old',
        passwordSetAt: new Date(),
        status: UserStatus.ACTIVE,
        onboardingCompletedAt: new Date(),
        isPhoneVerified: true,
        userRoles: [{ role: { code: RoleCode.CLIENT_OWNER } }],
      })
      .mockResolvedValueOnce({
        id: 'u1',
        phoneNumber: '+250788123456',
        fullName: 'Test',
        passwordSetAt: new Date(),
      });

    const result = await service.passwordResetConfirm({
      login: '+250788123456',
      code: '123456',
      password: 'newpass1',
      confirmPassword: 'newpass1',
    });

    expect(tokens.revokeAllRefreshTokensForUser).toHaveBeenCalledWith('u1');
    expect(result).toMatchObject({ accessToken: 'a' });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PASSWORD_RESET' }),
    );
  });

  it('signInWithPassword rejects incomplete onboarding', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      passwordHash: 'hash',
      status: UserStatus.PENDING_VERIFICATION,
      onboardingCompletedAt: null,
      isPhoneVerified: true,
      userRoles: [{ role: { code: RoleCode.CLIENT_OWNER } }],
    });
    passwords.verify.mockResolvedValue(true);

    await expect(
      service.signInWithPassword('+250788123456', 'password'),
    ).rejects.toMatchObject({
      response: { code: 'ONBOARDING_INCOMPLETE' },
    });
  });

  it('signInWithPassword succeeds after onboarding complete', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      passwordHash: 'hash',
      passwordSetAt: new Date(),
      status: UserStatus.ACTIVE,
      onboardingCompletedAt: new Date(),
      isPhoneVerified: true,
      userRoles: [{ role: { code: RoleCode.CLIENT_OWNER } }],
    });
    passwords.verify.mockResolvedValue(true);
    prisma.user.update.mockResolvedValue({});
    prisma.organizationUser.findMany.mockResolvedValue([]);
    (loadAuthUserPayload as jest.Mock).mockResolvedValue({
      sub: 'u1',
      roles: ['CLIENT_OWNER'],
      activeRole: 'CLIENT_OWNER',
      organizationIds: [],
    });
    tokens.issueTokens.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: '15m',
    });
    prisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'u1',
        passwordHash: 'hash',
        passwordSetAt: new Date(),
        status: UserStatus.ACTIVE,
        onboardingCompletedAt: new Date(),
        isPhoneVerified: true,
        userRoles: [{ role: { code: RoleCode.CLIENT_OWNER } }],
      })
      .mockResolvedValueOnce({
        id: 'u1',
        phoneNumber: '+250788123456',
        fullName: 'Test',
        passwordSetAt: new Date(),
      });

    const result = await service.signInWithPassword('+250788123456', 'password');
    expect(result).toMatchObject({ accessToken: 'a', refreshToken: 'r' });
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { phoneNumber: '+250788123456' },
      }),
    );
  });

  it('signInWithPassword looks up user by email', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-admin',
      passwordHash: 'hash',
      passwordSetAt: new Date(),
      status: UserStatus.ACTIVE,
      isPhoneVerified: true,
      userRoles: [{ role: { code: RoleCode.OPS_ADMIN } }],
    });
    passwords.verify.mockResolvedValue(true);
    prisma.user.update.mockResolvedValue({});
    prisma.organizationUser.findMany.mockResolvedValue([]);
    (loadAuthUserPayload as jest.Mock).mockResolvedValue({
      sub: 'u-admin',
      roles: ['OPS_ADMIN'],
      activeRole: 'OPS_ADMIN',
      organizationIds: [],
    });
    tokens.issueTokens.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: '15m',
    });
    prisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'u-admin',
        passwordHash: 'hash',
        passwordSetAt: new Date(),
        status: UserStatus.ACTIVE,
        isPhoneVerified: true,
        userRoles: [{ role: { code: RoleCode.OPS_ADMIN } }],
      })
      .mockResolvedValueOnce({
        id: 'u-admin',
        phoneNumber: '+250788000099',
        fullName: 'Ops',
        passwordSetAt: new Date(),
      });

    await service.signInWithPassword('Ops@Company.RW', 'password');

    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: 'ops@company.rw' },
      }),
    );
  });

  it('signInWithPassword returns setup token when password was never finalized', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      passwordHash: 'hash',
      passwordSetAt: null,
      status: UserStatus.ACTIVE,
      isPhoneVerified: true,
      onboardingCompletedAt: new Date(),
      userRoles: [{ role: { code: RoleCode.GUARDIAN } }],
    });
    passwords.verify.mockResolvedValue(true);
    prisma.user.update.mockResolvedValue({});
    prisma.organizationUser.findMany.mockResolvedValue([]);
    (loadAuthUserPayload as jest.Mock).mockResolvedValue({
      sub: 'u1',
      roles: ['GUARDIAN'],
      activeRole: 'GUARDIAN',
      organizationIds: [],
      guardianId: 'g1',
    });
    tokens.issueSetupToken.mockResolvedValue('setup-token');
    prisma.guardian.findUnique.mockResolvedValue({ id: 'g1', status: GuardianStatus.ACTIVE });
    prisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'u1',
        passwordHash: 'hash',
        passwordSetAt: null,
        status: UserStatus.ACTIVE,
        isPhoneVerified: true,
        onboardingCompletedAt: new Date(),
        userRoles: [{ role: { code: RoleCode.GUARDIAN } }],
      })
      .mockResolvedValueOnce({
        id: 'u1',
        phoneNumber: '+250788123456',
        fullName: 'Guardian One',
        passwordSetAt: null,
      });

    const result = await service.signInWithPassword('+250788123456', 'password');

    expect(result).toMatchObject({
      requiresPasswordSetup: true,
      setupToken: 'setup-token',
    });
    expect(tokens.issueTokens).not.toHaveBeenCalled();
  });

  it('signInWithPassword auto-starts guardian shift when off duty', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'g-user',
      passwordHash: 'hash',
      passwordSetAt: new Date(),
      status: UserStatus.ACTIVE,
      onboardingCompletedAt: new Date(),
      isPhoneVerified: true,
      userRoles: [{ role: { code: RoleCode.GUARDIAN } }],
    });
    passwords.verify.mockResolvedValue(true);
    prisma.user.update.mockResolvedValue({});
    prisma.organizationUser.findMany.mockResolvedValue([]);
    (loadAuthUserPayload as jest.Mock).mockResolvedValue({
      sub: 'g-user',
      roles: ['GUARDIAN'],
      activeRole: 'GUARDIAN',
      organizationIds: [],
      guardianId: 'g-1',
    });
    tokens.issueTokens.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: '15m',
    });
    prisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'g-user',
        passwordHash: 'hash',
        passwordSetAt: new Date(),
        status: UserStatus.ACTIVE,
        onboardingCompletedAt: new Date(),
        isPhoneVerified: true,
        userRoles: [{ role: { code: RoleCode.GUARDIAN } }],
      })
      .mockResolvedValueOnce({
        id: 'g-user',
        phoneNumber: '+250788123456',
        fullName: 'Guardian One',
        passwordSetAt: new Date(),
      });

    await service.signInWithPassword('+250788123456', 'password');

    expect(shiftState.autoStartOnLogin).toHaveBeenCalledWith('g-1');
  });
});
