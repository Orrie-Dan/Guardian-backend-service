import { Injectable } from '@nestjs/common';
import { AuditService } from '../common/services/audit.service';
import { BookingSettingsService } from '../services/booking-settings.service';
import { UpdateBookingSettingsDto } from '../services/dto/update-booking-settings.dto';
import { ServicesService } from '../services/services.service';

@Injectable()
export class AdminServicesService {
  constructor(
    private readonly services: ServicesService,
    private readonly bookingSettings: BookingSettingsService,
    private readonly audit: AuditService,
  ) {}

  listServices() {
    return this.services.listAll();
  }

  createService(
    dto: Parameters<ServicesService['create']>[0],
    actorUserId: string,
  ) {
    return this.services.create(dto, actorUserId);
  }

  updateService(
    id: string,
    dto: Parameters<ServicesService['update']>[1],
    actorUserId: string,
  ) {
    return this.services.update(id, dto, actorUserId);
  }

  deleteService(id: string, actorUserId: string) {
    return this.services.remove(id, actorUserId);
  }

  getBookingSettings() {
    return this.bookingSettings.getRaw();
  }

  async updateBookingSettings(
    dto: UpdateBookingSettingsDto,
    actorUserId: string,
  ) {
    const updated = await this.bookingSettings.update(dto);
    await this.audit.log({
      actorUserId,
      action: 'BOOKING_SETTINGS_UPDATED',
      entityType: 'billing.booking_settings',
      entityId: updated.id,
      afterState: dto as object,
    });
    return updated;
  }
}
