import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AdminModule } from './admin/admin.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AssignmentsModule } from './assignments/assignments.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { BillingModule } from './billing/billing.module';
import { CommonModule } from './common/common.module';
import { DocumentsModule } from './documents/documents.module';
import { TenantContextInterceptor } from './common/interceptors/tenant-context.interceptor';
import { DispatchingModule } from './dispatching/dispatching.module';
import { GuardiansModule } from './guardians/guardians.module';
import { JobsModule } from './jobs/jobs.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { OutboxModule } from './outbox/outbox.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { RedisModule } from './redis/redis.module';
import { RegionsModule } from './regions/regions.module';
import { UsersModule } from './users/users.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CommonModule,
    RedisModule,
    QueueModule,
    PrismaModule,
    OutboxModule,
    AuthModule,
    UsersModule,
    GuardiansModule,
    OrganizationsModule,
    JobsModule,
    AssignmentsModule,
    DispatchingModule,
    BillingModule,
    PaymentsModule,
    NotificationsModule,
    DocumentsModule,
    AdminModule,
    AnalyticsModule,
    RegionsModule,
    WebhooksModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantContextInterceptor,
    },
  ],
})
export class AppModule {}
