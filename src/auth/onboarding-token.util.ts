import { UnauthorizedException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { AuthUserPayload } from './interfaces/auth-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from './token.service';

export interface OnboardingContext {
  userId: string;
  organizationId: string | null;
  phone: string;
}

export async function resolveOnboardingContext(
  tokens: TokenService,
  prisma: PrismaService,
  authorizationHeader?: string,
): Promise<OnboardingContext> {
  const decoded = await tokens.verifyOnboardingToken(authorizationHeader);
  const user = await prisma.user.findUnique({
    where: { id: decoded.sub },
    include: {
      organizationUsers: { take: 1, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!user) {
    throw new UnauthorizedException({
      code: 'ONBOARDING_TOKEN_INVALID',
      message: 'Onboarding session not found',
    });
  }
  if (user.onboardingCompletedAt) {
    throw new UnauthorizedException({
      code: 'ONBOARDING_ALREADY_COMPLETED',
      message: 'Registration already submitted. Sign in with your password.',
    });
  }
  if (user.status !== UserStatus.PENDING_VERIFICATION) {
    throw new UnauthorizedException({
      code: 'ONBOARDING_TOKEN_INVALID',
      message: 'Invalid onboarding session',
    });
  }

  const membership = user.organizationUsers[0];
  const orgId = decoded.orgId ?? membership?.organizationId ?? null;
  if (decoded.orgId && membership && membership.organizationId !== decoded.orgId) {
    throw new UnauthorizedException({
      code: 'ONBOARDING_TOKEN_INVALID',
      message: 'Organization mismatch',
    });
  }

  return {
    userId: user.id,
    organizationId: orgId,
    phone: user.phoneNumber,
  };
}

export function toOnboardingActor(ctx: OnboardingContext): AuthUserPayload {
  return {
    sub: ctx.userId,
    phone: ctx.phone,
    roles: [],
    activeRole: 'CLIENT_OWNER' as AuthUserPayload['activeRole'],
    activeOrgId: ctx.organizationId ?? undefined,
    orgId: ctx.organizationId ?? undefined,
    organizationIds: ctx.organizationId ? [ctx.organizationId] : [],
  };
}

export async function requireOnboardingOrg(
  ctx: OnboardingContext,
): Promise<OnboardingContext & { organizationId: string }> {
  if (!ctx.organizationId) {
    throw new UnauthorizedException({
      code: 'ONBOARDING_ORG_REQUIRED',
      message: 'Complete business details before this step',
    });
  }
  return ctx as OnboardingContext & { organizationId: string };
}
