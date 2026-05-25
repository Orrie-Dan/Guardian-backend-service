import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleCode } from '@prisma/client';
import { ORG_SCOPE_KEY, OrgScopeParam, SKIP_ORG_SCOPE_KEY } from '../decorators/org-scope.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthUserPayload } from '../interfaces/auth-user.interface';

@Injectable()
export class OrgScopeGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_ORG_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) {
      return true;
    }

    const paramName = this.reflector.getAllAndOverride<OrgScopeParam | undefined>(
      ORG_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!paramName) {
      return true;
    }

    const req = context.switchToHttp().getRequest<{
      user?: AuthUserPayload;
      params?: Record<string, string>;
      body?: Record<string, string>;
    }>();
    const user = req.user;
    if (!user) {
      return true;
    }

    if (
      user.roles.includes(RoleCode.SUPER_ADMIN) ||
      user.roles.includes(RoleCode.OPS_ADMIN)
    ) {
      return true;
    }

    const orgId =
      req.params?.[paramName] ??
      req.body?.[paramName] ??
      req.params?.id;

    if (!orgId) {
      return true;
    }

    const active = user.activeOrgId ?? user.orgId;
    if (active && orgId !== active && !user.organizationIds.includes(orgId)) {
      throw new ForbiddenException('Organization scope mismatch');
    }
    if (active && orgId !== active) {
      throw new ForbiddenException('Organization scope mismatch');
    }

    return true;
  }
}
