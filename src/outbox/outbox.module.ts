import { Module, forwardRef } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { DispatchingModule } from '../dispatching/dispatching.module';
import { JobsModule } from '../jobs/jobs.module';
import { BillingConfirmationService } from '../billing/billing-confirmation.service';
import { OutboxService } from './outbox.service';
import { OutboxWorker } from './outbox.worker';

@Module({
  imports: [
    forwardRef(() => DispatchingModule),
    forwardRef(() => BillingModule),
    forwardRef(() => JobsModule),
  ],
  providers: [OutboxService, OutboxWorker, BillingConfirmationService],
  exports: [OutboxService],
})
export class OutboxModule {}
