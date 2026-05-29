import { Module, forwardRef } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { GuardiansModule } from '../guardians/guardians.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OutboxModule } from '../outbox/outbox.module';
import { RedisModule } from '../redis/redis.module';
import { DispatchingService } from './dispatching.service';

@Module({
  imports: [
    forwardRef(() => OutboxModule),
    BillingModule,
    GuardiansModule,
    NotificationsModule,
    RedisModule,
  ],
  providers: [DispatchingService],
  exports: [DispatchingService],
})
export class DispatchingModule {}
