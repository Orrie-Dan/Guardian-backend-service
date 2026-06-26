import { Injectable } from '@nestjs/common';
import {
  BOOKING_SETTINGS_ID,
  bookingSettingsToSnapshot,
  BookingPolicySnapshot,
} from '../common/config/booking-policy.config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BookingSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPolicy(): Promise<BookingPolicySnapshot> {
    const settings = await this.prisma.bookingSettings.upsert({
      where: { id: BOOKING_SETTINGS_ID },
      create: { id: BOOKING_SETTINGS_ID },
      update: {},
    });
    return bookingSettingsToSnapshot(settings);
  }

  getRaw() {
    return this.prisma.bookingSettings.findUnique({
      where: { id: BOOKING_SETTINGS_ID },
    });
  }

  update(data: {
    minimumBookingHours?: number;
    nightSurchargeMinPct?: number;
    nightSurchargeMaxPct?: number;
    holidaySurchargeMinPct?: number;
    holidaySurchargeMaxPct?: number;
    guardianSharePct?: number;
    platformSharePct?: number;
    gatewaySharePct?: number;
    reserveSharePct?: number;
    vatRate?: number;
  }) {
    return this.prisma.bookingSettings.update({
      where: { id: BOOKING_SETTINGS_ID },
      data,
    });
  }

  async getMinimumChargeFromServices(): Promise<number | null> {
    const lowest = await this.prisma.service.findFirst({
      where: { isActive: true },
      orderBy: { hourlyRate: 'asc' },
      select: { hourlyRate: true },
    });
    if (!lowest) {
      return null;
    }
    const policy = await this.getPolicy();
    return Number(lowest.hourlyRate) * policy.minimumBookingHours;
  }
}
