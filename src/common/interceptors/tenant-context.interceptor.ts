import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { Observable, from, switchMap } from 'rxjs';
import { AuthUserPayload } from '../../auth/interfaces/auth-user.interface';
import { PrismaSessionService } from '../../prisma/prisma-session.service';

function resolvePlatformAdminRole(roles: RoleCode[] | undefined): RoleCode | null {
  if (!roles?.length) {
    return null;
  }
  if (roles.includes(RoleCode.SUPER_ADMIN)) {
    return RoleCode.SUPER_ADMIN;
  }
  if (roles.includes(RoleCode.OPS_ADMIN)) {
    return RoleCode.OPS_ADMIN;
  }
  return null;
}

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly session: PrismaSessionService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ user?: AuthUserPayload }>();
    const user = req.user;
    const orgId = user?.activeOrgId ?? user?.orgId;

    if (orgId) {
      return from(
        this.session.withTenantContext(orgId, user!.activeRole, () =>
          this.runHandler(next),
        ),
      ).pipe(switchMap((value) => from(Promise.resolve(value))));
    }

    const platformRole = resolvePlatformAdminRole(user?.roles);
    if (platformRole) {
      return from(
        this.session.withPlatformAdminContext(platformRole, () => this.runHandler(next)),
      ).pipe(switchMap((value) => from(Promise.resolve(value))));
    }

    return next.handle();
  }

  private runHandler(next: CallHandler): Promise<unknown> {
    return new Promise((resolve, reject) => {
      next.handle().subscribe({ next: resolve, error: reject });
    });
  }
}
