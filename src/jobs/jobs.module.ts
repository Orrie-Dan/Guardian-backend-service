import { Module, forwardRef } from '@nestjs/common';
import { BillingCoreModule } from '../billing/billing-core.module';
import { DispatchingModule } from '../dispatching/dispatching.module';
import { GuardianReviewsModule } from '../guardian-reviews/guardian-reviews.module';
import { GuardiansModule } from '../guardians/guardians.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OutboxModule } from '../outbox/outbox.module';
import { JobLifecycleService } from './job-lifecycle.service';
import { JobReferenceService } from './job-reference.service';
import { JobStatusReconciliationService } from './job-status-reconciliation.service';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [
    BillingCoreModule,
    GuardianReviewsModule,
    GuardiansModule,
    NotificationsModule,
    forwardRef(() => OutboxModule),
    forwardRef(() => DispatchingModule),
  ],
  controllers: [JobsController],
  providers: [
    JobsService,
    JobReferenceService,
    JobLifecycleService,
    JobStatusReconciliationService,
  ],
  exports: [JobsService, JobLifecycleService],
})
export class JobsModule {}
