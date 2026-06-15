import { Module } from '@nestjs/common';
import { GuardianPayrollModule } from '../guardian-payroll/guardian-payroll.module';
import { GuardianReviewsModule } from '../guardian-reviews/guardian-reviews.module';
import { RedisModule } from '../redis/redis.module';
import { ConnectivityService } from './connectivity.service';
import { GuardiansController } from './guardians.controller';
import { GuardianDispatchEligibilityService } from './guardian-dispatch-eligibility.service';
import { GuardianEligibilityService } from './guardian-eligibility.service';
import { GuardianLocationService } from './guardian-location.service';
import { GuardiansService } from './guardians.service';
import { ShiftStateService } from './shift-state.service';

@Module({
  imports: [RedisModule, GuardianPayrollModule, GuardianReviewsModule],
  controllers: [GuardiansController],
  providers: [
    GuardiansService,
    ShiftStateService,
    ConnectivityService,
    GuardianLocationService,
    GuardianEligibilityService,
    GuardianDispatchEligibilityService,
  ],
  exports: [
    GuardiansService,
    ShiftStateService,
    ConnectivityService,
    GuardianLocationService,
    GuardianEligibilityService,
    GuardianDispatchEligibilityService,
  ],
})
export class GuardiansModule {}
