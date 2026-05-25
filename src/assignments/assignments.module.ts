import { Module } from '@nestjs/common';
import { GuardiansModule } from '../guardians/guardians.module';
import { OutboxModule } from '../outbox/outbox.module';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';

@Module({
  imports: [OutboxModule, GuardiansModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}
