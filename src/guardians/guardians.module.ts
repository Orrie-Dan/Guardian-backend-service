import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { ConnectivityService } from './connectivity.service';
import { GuardiansController } from './guardians.controller';
import { GuardianEligibilityService } from './guardian-eligibility.service';
import { GuardianLocationService } from './guardian-location.service';
import { GuardiansService } from './guardians.service';
import { ShiftStateService } from './shift-state.service';

@Module({
  imports: [RedisModule],
  controllers: [GuardiansController],
  providers: [
    GuardiansService,
    ShiftStateService,
    ConnectivityService,
    GuardianLocationService,
    GuardianEligibilityService,
  ],
  exports: [
    GuardiansService,
    ShiftStateService,
    ConnectivityService,
    GuardianLocationService,
    GuardianEligibilityService,
  ],
})
export class GuardiansModule {}
