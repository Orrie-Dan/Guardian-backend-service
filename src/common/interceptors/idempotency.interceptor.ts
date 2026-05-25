import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { IDEMPOTENT_KEY } from '../decorators/idempotent.decorator';

/** Attaches Idempotency-Key header to request body when handler is marked @Idempotent */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const enabled = this.reflector.getAllAndOverride<boolean>(IDEMPOTENT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!enabled) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      body?: Record<string, unknown>;
    }>();
    const key = req.headers['idempotency-key'];
    if (typeof key === 'string' && req.body && !req.body.idempotencyKey) {
      req.body.idempotencyKey = key;
    }

    return next.handle();
  }
}
