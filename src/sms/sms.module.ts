import { Module } from '@nestjs/common';
import { PindoSmsService } from './pindo-sms.service';

@Module({
  providers: [PindoSmsService],
  exports: [PindoSmsService],
})
export class SmsModule {}
