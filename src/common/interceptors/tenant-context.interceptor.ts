import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from, switchMap } from 'rxjs';
import { AuthUserPayload } from '../../auth/interfaces/auth-user.interface';
import { PrismaSessionService } from '../../prisma/prisma-session.service';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly session: PrismaSessionService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ user?: AuthUserPayload }>();
    const user = req.user;
    const orgId = user?.activeOrgId ?? user?.orgId;
    if (!orgId) {
      return next.handle();
    }
    return from(
      this.session.withTenantContext(orgId, user!.activeRole, () =>
        new Promise<unknown>((resolve, reject) => {
          next.handle().subscribe({ next: resolve, error: reject });
        }),
      ),
    ).pipe(switchMap((value) => from(Promise.resolve(value))));
  }
}
