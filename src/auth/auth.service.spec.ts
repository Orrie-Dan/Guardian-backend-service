import {
  GoneException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RoleCode, UserStatus } from '@prisma/client';
import { AuditService } from '../common/services/audit.service';
import { PrimaryLocationSetupPolicy } from '../common/policies/primary-location-setup.policy';
import { PrismaService } from '../prisma/prisma.service';
import { loadAuthUserPayload } from './auth-user.loader';
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
  const prisma = {
    user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
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
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('registerApplication is deprecated', async () => {
    await expect(service.registerApplication({} as never)).rejects.toBeInstanceOf(
      GoneException,
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
  });
});
