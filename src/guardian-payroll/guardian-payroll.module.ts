import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { GuardianPayPolicyService } from './guardian-pay-policy.service';
import { GuardianPayrollService } from './guardian-payroll.service';

@Module({
  imports: [NotificationsModule],
  providers: [GuardianPayrollService, GuardianPayPolicyService],
  exports: [GuardianPayrollService, GuardianPayPolicyService],
})
export class GuardianPayrollModule {}
