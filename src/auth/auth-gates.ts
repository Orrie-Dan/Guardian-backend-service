import { ForbiddenException } from '@nestjs/common';
import {
  GuardianStatus,
  RoleCode,
  User,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export class AuthGateError extends ForbiddenException {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super({ code, message });
  }
}

export async function assertUserCanSignIn(
  prisma: PrismaService,
  user: User & { userRoles: { role: { code: RoleCode } }[] },
): Promise<void> {
  if (user.status === UserStatus.DELETED) {
    throw new AuthGateError('ACCOUNT_DELETED', 'Account has been deleted');
  }
  if (user.status === UserStatus.SUSPENDED) {
    throw new AuthGateError('ACCOUNT_SUSPENDED', 'Account is suspended');
  }
  if (
    user.status === UserStatus.PENDING_VERIFICATION &&
    !user.onboardingCompletedAt
  ) {
    throw new AuthGateError(
      'ONBOARDING_INCOMPLETE',
      'Complete registration before signing in. Use POST /auth/register/resume',
    );
  }
  if (user.status === UserStatus.PENDING_VERIFICATION) {
    throw new AuthGateError('PENDING_VERIFICATION', 'Account is pending verification');
  }
  if (user.status !== UserStatus.ACTIVE) {
    throw new AuthGateError('ACCOUNT_INACTIVE', 'Account is not active');
  }

  const roles = user.userRoles.map((r) => r.role.code);

  if (roles.includes(RoleCode.GUARDIAN)) {
    const guardian = await prisma.guardian.findUnique({
      where: { userId: user.id },
    });
    if (!guardian) {
      throw new AuthGateError('GUARDIAN_PROFILE_MISSING', 'Guardian profile not found');
    }
    if (guardian.status === GuardianStatus.SUSPENDED) {
      throw new AuthGateError('GUARDIAN_SUSPENDED', 'Guardian account is suspended');
    }
    if (guardian.status === GuardianStatus.INACTIVE) {
      throw new AuthGateError('GUARDIAN_NOT_ACTIVATED', 'Guardian account is not activated');
    }
    if (guardian.status !== GuardianStatus.ACTIVE) {
      throw new AuthGateError('GUARDIAN_NOT_ACTIVATED', 'Guardian account is not active');
    }
    return;
  }

  const isClient =
    roles.includes(RoleCode.CLIENT_OWNER) ||
    roles.includes(RoleCode.CLIENT_STAFF);
  const isOps =
    roles.includes(RoleCode.SUPER_ADMIN) ||
    roles.includes(RoleCode.OPS_ADMIN);

  if (!isClient && !isOps) {
    throw new AuthGateError('NO_APP_ACCESS', 'No application access for this account');
  }

  if (isClient && !user.isPhoneVerified) {
    throw new AuthGateError(
      'PHONE_NOT_VERIFIED',
      'Complete phone verification to sign in',
    );
  }
}
