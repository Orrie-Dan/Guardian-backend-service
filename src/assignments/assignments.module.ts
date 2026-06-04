import { Module, forwardRef } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { GuardiansModule } from '../guardians/guardians.module';
import { JobsModule } from '../jobs/jobs.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OutboxModule } from '../outbox/outbox.module';
import { QueueModule } from '../queue/queue.module';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';
import { EarlyReleaseAutomationService } from './early-release-automation.service';
import { NoShowAutomationService } from './no-show-automation.service';

@Module({
  imports: [
    BillingModule,
    NotificationsModule,
    OutboxModule,
    QueueModule,
    GuardiansModule,
    forwardRef(() => JobsModule),
  ],

  controllers: [AssignmentsController],
  providers: [
    AssignmentsService,
    NoShowAutomationService,
    EarlyReleaseAutomationService,
  ],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}
