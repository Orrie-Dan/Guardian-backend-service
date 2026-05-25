import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  PERMISSIONS_KEY,
  RequirePermissionsMeta,
} from '../decorators/require-permissions.decorator';
import { AuthUserPayload } from '../interfaces/auth-user.interface';
import { PermissionResolverService } from '../permission-resolver.service';
import { AuditService } from '../../common/services/audit.service';

const SENSITIVE_PREFIXES = ['admin:', 'payments:', 'organizations:verify'];

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly resolver: PermissionResolverService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const meta = this.reflector.getAllAndOverride<RequirePermissionsMeta>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!meta?.permissions?.length) {
      return true;
    }

    const req = context.switchToHttp().getRequest<{ user: AuthUserPayload }>();
    const user = req.user;
    if (!user?.sub) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }

    const permissions = await this.resolver.resolve(user);
    user.permissions = permissions;

    const { mode } = meta;
    const allowed =
      mode === 'any'
        ? meta.permissions.some((p) => permissions.includes(p))
        : meta.permissions.every((p) => permissions.includes(p));

    if (!allowed) {
      const missing = meta.permissions.find((p) => !permissions.includes(p));
      if (
        missing &&
        SENSITIVE_PREFIXES.some((prefix) => missing.startsWith(prefix))
      ) {
        await this.audit.log({
          actorUserId: user.sub,
          action: 'PERMISSION_DENIED',
          entityType: 'identity.users',
          entityId: user.sub,
          afterState: { permission: missing, required: meta.permissions },
        });
      }
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: `Missing permission: ${missing ?? meta.permissions.join(', ')}`,
        permission: missing,
      });
    }

    return true;
  }
}
