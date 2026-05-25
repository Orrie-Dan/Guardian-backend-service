import { Module, forwardRef } from '@nestjs/common';
import { DispatchingModule } from '../dispatching/dispatching.module';
import { OutboxService } from './outbox.service';
import { OutboxWorker } from './outbox.worker';

@Module({
  imports: [forwardRef(() => DispatchingModule)],
  providers: [OutboxService, OutboxWorker],
  exports: [OutboxService],
})
export class OutboxModule {}
