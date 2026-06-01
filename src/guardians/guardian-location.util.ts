import { Prisma } from '@prisma/client';
import { GuardianPresence } from '../redis/presence.service';
import { GuardianCurrentLocation } from './guardian-location.types';

export type LatestHistoryRow = {
  guardianId: string;
  latitude: Prisma.Decimal;
  longitude: Prisma.Decimal;
  speed: Prisma.Decimal | null;
  batteryLevel: number | null;
  recordedAt: Date;
};

function decimalToString(
  value: Prisma.Decimal | null | undefined,
): string | null {
  if (value == null) {
    return null;
  }
  return value.toString();
}

export function resolveGuardianCurrentLocation(
  guardianId: string,
  presence: GuardianPresence | null | undefined,
  latest: LatestHistoryRow | null | undefined,
): GuardianCurrentLocation {
  if (presence) {
    return {
      guardianId,
      latitude: String(presence.lat),
      longitude: String(presence.lng),
      speed: presence.speed != null ? String(presence.speed) : null,
      batteryLevel: presence.battery ?? null,
      recordedAt: presence.updatedAt,
      source: 'presence',
      connected: true,
      reachable: presence.available,
    };
  }

  if (latest) {
    return {
      guardianId,
      latitude: latest.latitude.toString(),
      longitude: latest.longitude.toString(),
      speed: decimalToString(latest.speed),
      batteryLevel: latest.batteryLevel,
      recordedAt: latest.recordedAt.toISOString(),
      source: 'history',
      connected: false,
      reachable: false,
    };
  }

  return {
    guardianId,
    latitude: null,
    longitude: null,
    speed: null,
    batteryLevel: null,
    recordedAt: null,
    source: null,
    connected: false,
    reachable: false,
  };
}
