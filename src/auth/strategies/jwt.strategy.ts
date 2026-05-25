import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { loadAuthUserPayload } from '../auth-user.loader';
import { AuthUserPayload } from '../interfaces/auth-user.interface';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET', 'change-me'),
    });
  }

  async validate(payload: AuthUserPayload): Promise<AuthUserPayload> {
    const preferredOrg = payload.activeOrgId ?? payload.orgId;
    const fresh = await loadAuthUserPayload(
      this.prisma,
      payload.sub,
      preferredOrg,
    );
    if (!fresh) {
      throw new UnauthorizedException();
    }
    return fresh;
  }
}
