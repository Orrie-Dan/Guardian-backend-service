import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { GuardianPayrollService } from './guardian-payroll.service';

@Module({
  imports: [NotificationsModule],
  providers: [GuardianPayrollService],
  exports: [GuardianPayrollService],
})
export class GuardianPayrollModule {}
