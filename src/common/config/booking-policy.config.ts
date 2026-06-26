import { BookingSettings, Prisma } from '@prisma/client';

export type BookingPolicySnapshot = {
  minimumBookingHours: number;
  nightSurchargeMinPct: number;
  nightSurchargeMaxPct: number;
  holidaySurchargeMinPct: number;
  holidaySurchargeMaxPct: number;
  guardianSharePct: number;
  platformSharePct: number;
  gatewaySharePct: number;
  reserveSharePct: number;
  vatRate: number;
};

export const BOOKING_SETTINGS_ID = '00000000-0000-4000-8000-000000000001';

export function bookingSettingsToSnapshot(
  settings: BookingSettings,
): BookingPolicySnapshot {
  return {
    minimumBookingHours: Number(settings.minimumBookingHours),
    nightSurchargeMinPct: Number(settings.nightSurchargeMinPct),
    nightSurchargeMaxPct: Number(settings.nightSurchargeMaxPct),
    holidaySurchargeMinPct: Number(settings.holidaySurchargeMinPct),
    holidaySurchargeMaxPct: Number(settings.holidaySurchargeMaxPct),
    guardianSharePct: Number(settings.guardianSharePct),
    platformSharePct: Number(settings.platformSharePct),
    gatewaySharePct: Number(settings.gatewaySharePct),
    reserveSharePct: Number(settings.reserveSharePct),
    vatRate: Number(settings.vatRate),
  };
}

/** Night shift window: 22:00–06:00 local (UTC for server; refine per timezone later). */
export function isNightShift(start: Date, end: Date): boolean {
  const nightStartHour = 22;
  const nightEndHour = 6;
  const cursor = new Date(start);
  while (cursor < end) {
    const hour = cursor.getUTCHours();
    if (hour >= nightStartHour || hour < nightEndHour) {
      return true;
    }
    cursor.setUTCHours(cursor.getUTCHours() + 1);
  }
  return false;
}

export function computeSurchargeMultiplier(
  scheduledStart: Date,
  scheduledEnd: Date,
  policy: BookingPolicySnapshot,
  isPublicHoliday = false,
): { multiplier: Prisma.Decimal; reasons: string[] } {
  const reasons: string[] = [];
  let additive = 0;

  if (isNightShift(scheduledStart, scheduledEnd)) {
    additive += policy.nightSurchargeMinPct;
    reasons.push('night_shift');
  }
  if (isPublicHoliday) {
    additive += policy.holidaySurchargeMinPct;
    reasons.push('public_holiday');
  }

  return {
    multiplier: new Prisma.Decimal(1).add(additive),
    reasons,
  };
}

export type RevenueSplit = {
  guardian: Prisma.Decimal;
  platform: Prisma.Decimal;
  gateway: Prisma.Decimal;
  reserve: Prisma.Decimal;
};

export function computeRevenueSplit(
  grossAmount: Prisma.Decimal,
  policy: BookingPolicySnapshot,
): RevenueSplit {
  return {
    guardian: grossAmount.mul(policy.guardianSharePct),
    platform: grossAmount.mul(policy.platformSharePct),
    gateway: grossAmount.mul(policy.gatewaySharePct),
    reserve: grossAmount.mul(policy.reserveSharePct),
  };
}
