import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { DocumentsModule } from '../documents/documents.module';
import { DispatchingModule } from '../dispatching/dispatching.module';
import { GuardianPayrollModule } from '../guardian-payroll/guardian-payroll.module';
import { GuardiansModule } from '../guardians/guardians.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminController } from './admin.controller';
import { AdminMapService } from './admin-map.service';
import { AdminGuardiansService } from './admin-guardians.service';
import { AdminUsersService } from './admin-users.service';
import { AdminBillingPoliciesService } from './admin-billing-policies.service';
import { AdminPricingService } from './admin-pricing.service';
import { AdminVerificationService } from './admin-verification.service';
import { AdminReplacementService } from './admin-replacement.service';
import { AssignmentsModule } from '../assignments/assignments.module';

@Module({
  imports: [
    BillingModule,
    AuthModule,
    DocumentsModule,
    GuardianPayrollModule,
    GuardiansModule,
    NotificationsModule,
    AnalyticsModule,
    DispatchingModule,
    forwardRef(() => AssignmentsModule),
  ],
  controllers: [AdminController],
  providers: [
    AdminMapService,
    AdminGuardiansService,
    AdminUsersService,
    AdminVerificationService,
    AdminPricingService,
    AdminBillingPoliciesService,
    AdminAuditService,
    AdminAnalyticsService,
    AdminReplacementService,
  ],
})
export class AdminModule {}
