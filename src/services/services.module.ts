import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { BookingSettingsService } from './booking-settings.service';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';

@Module({
  imports: [CommonModule],
  controllers: [ServicesController],
  providers: [ServicesService, BookingSettingsService],
  exports: [ServicesService, BookingSettingsService],
})
export class ServicesModule {}
