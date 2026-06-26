import { Module, forwardRef } from '@nestjs/common';
import { GuardianPayrollModule } from '../guardian-payroll/guardian-payroll.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OutboxModule } from '../outbox/outbox.module';
import { ServicesModule } from '../services/services.module';
import { BillingCoreModule } from './billing-core.module';
import { BillingController } from './billing.controller';
import { BillingOpsAutomationService } from './billing-ops-automation.service';
import { BillingOpsService } from './billing-ops.service';
import { BillingService } from './billing.service';

@Module({
  imports: [
    BillingCoreModule,
    ServicesModule,
    GuardianPayrollModule,
    NotificationsModule,
    forwardRef(() => OutboxModule),
  ],
  controllers: [BillingController],
  providers: [BillingService, BillingOpsService, BillingOpsAutomationService],
  exports: [BillingService, BillingOpsService, BillingCoreModule],
})
export class BillingModule {}
