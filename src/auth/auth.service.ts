import {
  BadRequestException,
  GoneException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { AuditService } from '../common/services/audit.service';
import { PrimaryLocationSetupPolicy } from '../common/policies/primary-location-setup.policy';
import { PrismaService } from '../prisma/prisma.service';
import { assertUserCanSignIn } from './auth-gates';
import { loadAuthUserPayload } from './auth-user.loader';
import { RegisterClientApplicationDto } from './dto/register-client-application.dto';
import { PasswordResetConfirmDto } from './dto/password-reset-confirm.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { parseLoginIdentifier } from './login.util';
import { OtpService } from './otp.service';
import { normalizePhone } from './phone.util';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { EmailNotificationService } from '../notifications/email-notification.service';
import { EmailTemplateId } from '../notifications/email-template.ids';

@Injectable()
export class AuthService {
  constructor(
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly passwords: PasswordService,
    private readonly locationSetup: PrimaryLocationSetupPolicy,
    private readonly emails: EmailNotificationService,
  ) {}

  /** @deprecated Use POST /auth/sign-in/otp/request */
  deprecatedOtpRequest() {
    throw new GoneException({
      code: 'ENDPOINT_DEPRECATED',
      message: 'Use POST /auth/sign-in/otp/request',
    });
  }

  /** @deprecated Use POST /auth/sign-in/otp/verify */
  deprecatedOtpVerify() {
    throw new GoneException({
      code: 'ENDPOINT_DEPRECATED',
      message: 'Use POST /auth/sign-in/otp/verify',
    });
  }

  async signInRequestOtp(
    phone: string,
    ipAddress?: string,
    deviceFingerprint?: string,
  ) {
    const normalized = normalizePhone(phone);
    const user = await this.prisma.user.findUnique({
      where: { phoneNumber: normalized },
    });
    if (!user || user.status === UserStatus.DELETED) {
      throw new NotFoundException({
        code: 'USER_NOT_REGISTERED',
        message: 'No account found for this phone number',
      });
    }
    return this.otp.requestOtp(normalized, ipAddress, deviceFingerprint, {
      purpose: 'sign_in',
    });
  }

  async signInVerifyOtp(phone: string, code: string) {
    const normalized = await this.otp.verifyOtp(phone, code);
    const user = await this.prisma.user.findUnique({
      where: { phoneNumber: normalized },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_REGISTERED',
        message: 'No account found for this phone number',
      });
    }

    await assertUserCanSignIn(this.prisma, user);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { isPhoneVerified: true, lastLoginAt: new Date() },
    });

    return this.buildAuthResponse(user.id, user.passwordSetAt === null);
  }

  async signInWithPassword(login: string, password: string) {
    const identifier = parseLoginIdentifier(login);
    const user = await this.prisma.user.findUnique({
      where:
        identifier.type === 'email'
          ? { email: identifier.value }
          : { phoneNumber: identifier.value },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid login or password',
      });
    }

    const valid = await this.passwords.verify(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid login or password',
      });
    }

    await assertUserCanSignIn(this.prisma, user);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.buildAuthResponse(user.id, !user.passwordSetAt);
  }

  issueFullAuthResponse(userId: string) {
    return this.buildAuthResponse(userId, false);
  }

  /** @deprecated Removed — use register onboarding v2 */
  registerClientRequestOtp() {
    throw new GoneException({
      code: 'ENDPOINT_DEPRECATED',
      message: 'Use POST /auth/register/start',
    });
  }

  /** @deprecated Removed — use register onboarding v2 */
  registerClientVerify() {
    throw new GoneException({
      code: 'ENDPOINT_DEPRECATED',
      message: 'Use POST /auth/register/start/verify',
    });
  }

  /** @deprecated Removed — use register onboarding v2 */
  async registerApplication(_dto: RegisterClientApplicationDto) {
    throw new GoneException({
      code: 'ENDPOINT_DEPRECATED',
      message: 'Use phone-first registration: POST /auth/register/start',
    });
  }

  async passwordResetRequest(login: string) {
    const user = await this.findUserForPasswordReset(login);
    return this.otp.requestOtp(user.phoneNumber, undefined, undefined, {
      purpose: 'password_reset',
    });
  }

  async passwordResetConfirm(dto: PasswordResetConfirmDto) {
    this.passwords.assertMatch(dto.password, dto.confirmPassword);

    const user = await this.findUserForPasswordReset(dto.login);
    await this.otp.verifyOtp(user.phoneNumber, dto.code);
    await assertUserCanSignIn(this.prisma, user);

    const hash = await this.passwords.hash(dto.password);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hash, passwordSetAt: new Date() },
    });

    await this.tokens.revokeAllRefreshTokensForUser(user.id);

    await this.audit.log({
      actorUserId: user.id,
      action: 'PASSWORD_RESET',
      entityType: 'identity.users',
      entityId: user.id,
    });

    await this.emails.sendToUser(
      user.id,
      EmailTemplateId.SECURITY_PASSWORD_RESET_COMPLETED,
      {},
      { entityType: 'identity.users', entityId: user.id },
    );

    return this.buildAuthResponse(user.id, false);
  }

  async setPassword(dto: SetPasswordDto, authenticatedUserId?: string) {
    this.passwords.assertMatch(dto.password, dto.confirmPassword);

    let userId = authenticatedUserId;
    if (dto.setupToken) {
      userId = await this.tokens.verifySetupToken(dto.setupToken);
    }
    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    const hash = await this.passwords.hash(dto.password);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hash, passwordSetAt: new Date() },
    });

    await this.audit.log({
      actorUserId: userId,
      action: 'PASSWORD_SET',
      entityType: 'identity.users',
      entityId: userId,
    });

    await this.emails.sendToUser(
      userId,
      EmailTemplateId.SECURITY_PASSWORD_SET,
      {},
      { entityType: 'identity.users', entityId: userId },
    );

    return this.buildAuthResponse(userId, false);
  }

  private async findUserForPasswordReset(login: string) {
    const identifier = parseLoginIdentifier(login);
    const user = await this.prisma.user.findUnique({
      where:
        identifier.type === 'email'
          ? { email: identifier.value }
          : { phoneNumber: identifier.value },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user || user.status === UserStatus.DELETED) {
      throw new NotFoundException({
        code: 'USER_NOT_REGISTERED',
        message: 'No account found for this login',
      });
    }

    if (!user.passwordHash) {
      throw new BadRequestException({
        code: 'PASSWORD_NOT_SET',
        message:
          'No password on this account. Sign in with OTP and use POST /auth/password/set',
      });
    }

    return user;
  }

  private async buildAuthResponse(userId: string, requiresPasswordSetup: boolean) {
    const payload = await loadAuthUserPayload(this.prisma, userId);
    if (!payload) {
      throw new Error('Failed to load user after auth');
    }

    const memberships = await this.prisma.organizationUser.findMany({
      where: { userId },
      include: {
        organization: {
          select: {
            id: true,
            legalName: true,
            tradingName: true,
            verificationStatus: true,
          },
        },
      },
    });

    const userRecord = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phoneNumber: true,
        fullName: true,
        passwordSetAt: true,
      },
    });

    const userSummary = {
      id: userRecord!.id,
      phone: userRecord!.phoneNumber,
      fullName: userRecord!.fullName,
      roles: payload.roles,
      activeRole: payload.activeRole,
      activeOrgId: payload.activeOrgId,
      organizationIds: payload.organizationIds,
      guardianId: payload.guardianId,
    };

    const organizations = await Promise.all(
      memberships.map(async (m) => {
        const booking = await this.locationSetup.getBookingEligibility(
          m.organization.id,
        );
        return {
          id: m.organization.id,
          legalName: m.organization.legalName,
          tradingName: m.organization.tradingName,
          role: m.role,
          verificationStatus: m.organization.verificationStatus,
          canBookJobs: booking.canBookJobs,
          needsSiteSetup: booking.needsSiteSetup,
          primaryLocationId: booking.primaryLocationId,
        };
      }),
    );

    if (requiresPasswordSetup || !userRecord!.passwordSetAt) {
      const setupToken = await this.tokens.issueSetupToken(userId);
      return {
        requiresPasswordSetup: true,
        setupToken,
        user: userSummary,
        organizations,
      };
    }

    const tokenPair = await this.tokens.issueTokens(payload);

    await this.audit.log({
      actorUserId: userId,
      action: 'LOGIN',
      entityType: 'identity.users',
      entityId: userId,
      afterState: { roles: payload.roles },
    });

    return {
      requiresPasswordSetup: false,
      user: userSummary,
      organizations,
      ...tokenPair,
    };
  }

  async setContext(userId: string, organizationId: string) {
    const membership = await this.prisma.organizationUser.findUnique({
      where: {
        organizationId_userId: { organizationId, userId },
      },
    });
    if (!membership) {
      throw new ForbiddenException('Not a member of this organization');
    }

    const payload = await loadAuthUserPayload(this.prisma, userId, organizationId);
    if (!payload) {
      throw new NotFoundException('User not found');
    }

    const tokenPair = await this.tokens.issueTokens(payload);

    await this.audit.log({
      actorUserId: userId,
      action: 'ORG_CONTEXT_SWITCH',
      entityType: 'customer.organizations',
      entityId: organizationId,
    });

    return {
      activeOrgId: organizationId,
      ...tokenPair,
    };
  }

  refresh(refreshToken: string) {
    return this.tokens.refreshTokens(refreshToken);
  }

  async logout(refreshToken: string, userId?: string) {
    await this.tokens.logout(refreshToken);
    if (userId) {
      await this.audit.log({
        actorUserId: userId,
        action: 'LOGOUT',
        entityType: 'identity.users',
        entityId: userId,
      });
    }
    return { loggedOut: true };
  }
}
