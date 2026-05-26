import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { loadAuthUserPayload } from './auth-user.loader';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuthUserPayload } from './interfaces/auth-user.interface';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async issueTokens(
    payload: AuthUserPayload,
    existingFamilyId?: string,
  ): Promise<TokenPair> {
    const jti = randomUUID();
    const familyId = existingFamilyId ?? randomUUID();
    const refreshExpiresIn = this.config.get<string>(
      'JWT_REFRESH_EXPIRES_IN',
      '7d',
    );
    const accessExpiresIn = this.config.get<string>('JWT_EXPIRES_IN', '15m');

    const accessToken = await this.jwt.signAsync(
      { ...payload },
      {
        secret: this.config.get('JWT_SECRET'),
        expiresIn: accessExpiresIn as `${number}${'s' | 'm' | 'h' | 'd'}`,
      },
    );

    const refreshToken = await this.jwt.signAsync(
      { sub: payload.sub, jti, familyId },
      {
        secret: this.config.get('JWT_REFRESH_SECRET'),
        expiresIn: refreshExpiresIn as `${number}${'s' | 'm' | 'h' | 'd'}`,
      },
    );

    const expiresAt = this.parseExpiry(refreshExpiresIn);
    await this.prisma.refreshToken.create({
      data: {
        userId: payload.sub,
        jti,
        familyId,
        expiresAt,
      },
    });

    return { accessToken, refreshToken, expiresIn: accessExpiresIn };
  }

  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    let decoded: { sub: string; jti: string; familyId: string };
    try {
      decoded = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (await this.redis.isRefreshTokenRevoked(decoded.jti)) {
      throw new UnauthorizedException('Refresh token revoked');
    }

    const stored = await this.prisma.refreshToken.findUnique({
      where: { jti: decoded.jti },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token revoked');
    }

    await this.revokeRefreshToken(decoded.jti, stored.expiresAt);

    const payload = await loadAuthUserPayload(this.prisma, decoded.sub);
    if (!payload) {
      throw new UnauthorizedException('User not found');
    }

    return this.issueTokens(payload, stored.familyId);
  }

  async issueOnboardingToken(
    userId: string,
    organizationId?: string,
  ): Promise<string> {
    return this.jwt.signAsync(
      {
        sub: userId,
        orgId: organizationId,
        purpose: 'onboarding',
      },
      {
        secret: this.config.get('JWT_SECRET'),
        expiresIn: '7d',
      },
    );
  }

  async verifyOnboardingToken(authorizationHeader?: string): Promise<{
    sub: string;
    orgId?: string;
  }> {
    if (!authorizationHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        code: 'ONBOARDING_TOKEN_INVALID',
        message: 'Onboarding token required',
      });
    }
    try {
      const decoded = await this.jwt.verifyAsync<{
        sub: string;
        orgId?: string;
        purpose?: string;
      }>(authorizationHeader.slice(7), {
        secret: this.config.get('JWT_SECRET'),
      });
      if (decoded.purpose !== 'onboarding') {
        throw new UnauthorizedException({
          code: 'ONBOARDING_TOKEN_INVALID',
          message: 'Invalid onboarding token',
        });
      }
      return { sub: decoded.sub, orgId: decoded.orgId };
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      throw new UnauthorizedException({
        code: 'ONBOARDING_TOKEN_INVALID',
        message: 'Invalid or expired onboarding token',
      });
    }
  }

  async issueSetupToken(userId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, purpose: 'password_setup' },
      {
        secret: this.config.get('JWT_SECRET'),
        expiresIn: '15m',
      },
    );
  }

  async tryResolveAccessUserId(authorizationHeader?: string): Promise<string | undefined> {
    if (!authorizationHeader?.startsWith('Bearer ')) {
      return undefined;
    }
    try {
      const decoded = await this.jwt.verifyAsync<AuthUserPayload & { purpose?: string }>(
        authorizationHeader.slice(7),
        { secret: this.config.get('JWT_SECRET') },
      );
      if (
        decoded.purpose === 'password_setup' ||
        decoded.purpose === 'onboarding'
      ) {
        return undefined;
      }
      return decoded.sub;
    } catch {
      return undefined;
    }
  }

  async verifySetupToken(token: string): Promise<string> {
    try {
      const decoded = await this.jwt.verifyAsync<{
        sub: string;
        purpose?: string;
      }>(token, {
        secret: this.config.get('JWT_SECRET'),
      });
      if (decoded.purpose !== 'password_setup') {
        throw new UnauthorizedException('Invalid setup token');
      }
      return decoded.sub;
    } catch {
      throw new UnauthorizedException('Invalid or expired setup token');
    }
  }

  async revokeAllRefreshTokensForUser(userId: string): Promise<void> {
    const active = await this.prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    await Promise.all(
      active.map(async (stored) => {
        await this.revokeRefreshToken(stored.jti, stored.expiresAt);
        await this.prisma.refreshToken.update({
          where: { jti: stored.jti },
          data: { revokedAt: new Date() },
        });
      }),
    );
  }

  async logout(refreshToken: string): Promise<void> {
    try {
      const decoded = await this.jwt.verifyAsync<{ jti: string }>(
        refreshToken,
        { secret: this.config.get('JWT_REFRESH_SECRET') },
      );
      const stored = await this.prisma.refreshToken.findUnique({
        where: { jti: decoded.jti },
      });
      if (stored) {
        await this.revokeRefreshToken(decoded.jti, stored.expiresAt);
        await this.prisma.refreshToken.update({
          where: { jti: decoded.jti },
          data: { revokedAt: new Date() },
        });
      }
    } catch {
      // Idempotent logout
    }
  }

  private async revokeRefreshToken(jti: string, expiresAt: Date): Promise<void> {
    const ttlSeconds = Math.max(
      1,
      Math.floor((expiresAt.getTime() - Date.now()) / 1000),
    );
    await this.redis.revokeRefreshToken(jti, ttlSeconds);
  }

  private parseExpiry(value: string): Date {
    const match = /^(\d+)([smhd])$/.exec(value);
    if (!match) {
      return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }
    const amount = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    return new Date(Date.now() + amount * multipliers[unit]);
  }
}
