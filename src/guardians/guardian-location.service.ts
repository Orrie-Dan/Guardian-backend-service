import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  PaginationQueryDto,
  buildPaginatedMeta,
  paginationSkipTake,
} from '../common/dto/pagination-query.dto';
import { PresenceService } from '../redis/presence.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  LatestHistoryRow,
  resolveGuardianCurrentLocation,
} from './guardian-location.util';
export type {
  GuardianCurrentLocation,
  GuardianLocationHistoryPoint,
  GuardianLocationSource,
} from './guardian-location.types';
import {
  GuardianCurrentLocation,
  GuardianLocationHistoryPoint,
} from './guardian-location.types';

function decimalToString(
  value: Prisma.Decimal | null | undefined,
): string | null {
  if (value == null) {
    return null;
  }
  return value.toString();
}

export function mapHistoryRow(row: {
  id: string;
  latitude: Prisma.Decimal;
  longitude: Prisma.Decimal;
  speed: Prisma.Decimal | null;
  batteryLevel: number | null;
  recordedAt: Date;
}): GuardianLocationHistoryPoint {
  return {
    id: row.id,
    latitude: row.latitude.toString(),
    longitude: row.longitude.toString(),
    speed: decimalToString(row.speed),
    batteryLevel: row.batteryLevel,
    recordedAt: row.recordedAt.toISOString(),
  };
}

@Injectable()
export class GuardianLocationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
  ) {}

  async getCurrent(guardianId: string): Promise<GuardianCurrentLocation> {
    await this.assertGuardianExists(guardianId);

    const presence = await this.presence.getPresence(guardianId);
    const latest = presence
      ? null
      : await this.prisma.locationHistory.findFirst({
          where: { guardianId },
          orderBy: { recordedAt: 'desc' },
        });

    return resolveGuardianCurrentLocation(
      guardianId,
      presence,
      latest
        ? {
            guardianId,
            latitude: latest.latitude,
            longitude: latest.longitude,
            speed: latest.speed,
            batteryLevel: latest.batteryLevel,
            recordedAt: latest.recordedAt,
          }
        : null,
    );
  }

  listAllPresences() {
    return this.presence.listAllPresences();
  }

  async getLatestHistoryByGuardianIds(
    guardianIds: string[],
  ): Promise<Map<string, LatestHistoryRow>> {
    const map = new Map<string, LatestHistoryRow>();
    if (guardianIds.length === 0) {
      return map;
    }

    const rows = await this.prisma.$queryRaw<
      Array<{
        guardian_id: string;
        latitude: Prisma.Decimal;
        longitude: Prisma.Decimal;
        speed: Prisma.Decimal | null;
        battery_level: number | null;
        recorded_at: Date;
      }>
    >`
      SELECT DISTINCT ON (guardian_id)
        guardian_id,
        latitude,
        longitude,
        speed,
        battery_level,
        recorded_at
      FROM guardian.location_history
      WHERE guardian_id IN (${Prisma.join(
        guardianIds.map((id) => Prisma.sql`${id}::uuid`),
      )})
      ORDER BY guardian_id, recorded_at DESC
    `;

    for (const row of rows) {
      map.set(row.guardian_id, {
        guardianId: row.guardian_id,
        latitude: row.latitude,
        longitude: row.longitude,
        speed: row.speed,
        batteryLevel: row.battery_level,
        recordedAt: row.recorded_at,
      });
    }
    return map;
  }

  async getHistory(
    guardianId: string,
    query: PaginationQueryDto,
    since?: Date,
  ) {
    await this.assertGuardianExists(guardianId);

    const where = {
      guardianId,
      ...(since ? { recordedAt: { gte: since } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.locationHistory.findMany({
        where,
        orderBy: { recordedAt: 'desc' },
        ...paginationSkipTake(query),
      }),
      this.prisma.locationHistory.count({ where }),
    ]);

    return {
      guardianId,
      items: items.map(mapHistoryRow),
      meta: buildPaginatedMeta(query.page, query.limit, total),
    };
  }

  private async assertGuardianExists(guardianId: string): Promise<void> {
    const exists = await this.prisma.guardian.findUnique({
      where: { id: guardianId },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('Guardian not found');
    }
  }
}
