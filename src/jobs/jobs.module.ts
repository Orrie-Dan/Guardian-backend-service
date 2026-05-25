import { Module, forwardRef } from '@nestjs/common';
import { DispatchingModule } from '../dispatching/dispatching.module';
import { OutboxModule } from '../outbox/outbox.module';
import { JobReferenceService } from './job-reference.service';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [OutboxModule, forwardRef(() => DispatchingModule)],
  controllers: [JobsController],
  providers: [JobsService, JobReferenceService],
  exports: [JobsService],
})
export class JobsModule {}
