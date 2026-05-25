import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../auth/auth.module';
import { OrgScopeGuard } from '../auth/guards/org-scope.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { IdempotencyInterceptor } from './interceptors/idempotency.interceptor';
import { ResponseEnvelopeInterceptor } from './interceptors/response-envelope.interceptor';
import { OrganizationVerificationPolicy } from './policies/organization-verification.policy';
import { PrimaryLocationSetupPolicy } from './policies/primary-location-setup.policy';
import { ResourceOwnerPolicy } from './policies/resource-owner.policy';
import { AuditService } from './services/audit.service';

@Global()
@Module({
  imports: [
    AuthModule,
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 100,
      },
    ]),
  ],
  providers: [
    AuditService,
    ResourceOwnerPolicy,
    OrganizationVerificationPolicy,
    PrimaryLocationSetupPolicy,
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseEnvelopeInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: IdempotencyInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
    {
      provide: APP_GUARD,
      useClass: OrgScopeGuard,
    },
  ],
  exports: [
    AuditService,
    ResourceOwnerPolicy,
    OrganizationVerificationPolicy,
    PrimaryLocationSetupPolicy,
  ],
})
export class CommonModule {}
