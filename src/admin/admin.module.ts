import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { DocumentsModule } from '../documents/documents.module';
import { GuardiansModule } from '../guardians/guardians.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminController } from './admin.controller';
import { AdminMapService } from './admin-map.service';
import { AdminGuardiansService } from './admin-guardians.service';
import { AdminUsersService } from './admin-users.service';
import { AdminPricingService } from './admin-pricing.service';
import { AdminVerificationService } from './admin-verification.service';

@Module({
  imports: [
    BillingModule,
    AuthModule,
    DocumentsModule,
    GuardiansModule,
    NotificationsModule,
  ],
  controllers: [AdminController],
  providers: [
    AdminMapService,
    AdminGuardiansService,
    AdminUsersService,
    AdminVerificationService,
    AdminPricingService,
    AdminAuditService,
    AdminAnalyticsService,
  ],
})
export class AdminModule {}
