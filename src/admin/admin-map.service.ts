import { Injectable } from '@nestjs/common';
import {
  GuardianStatus,
  Prisma,
  ShiftStatus,
} from '@prisma/client';
import { GuardianLocationService } from '../guardians/guardian-location.service';
import { resolveGuardianCurrentLocation } from '../guardians/guardian-location.util';
import { PrismaService } from '../prisma/prisma.service';
import { mapLocation } from './admin-response.util';
import { MapGuardiansQueryDto } from './dto/map-guardians-query.dto';
import { MapSitesQueryDto } from './dto/map-sites-query.dto';

const ON_DUTY_SHIFT_STATUSES: ShiftStatus[] = [
  ShiftStatus.AVAILABLE,
  ShiftStatus.BUSY,
];

export type AdminMapGuardianMarker = {
  guardianId: string;
  guardianCode: string;
  fullName: string | null;
  status: GuardianStatus;
  shiftStatus: ShiftStatus | null;
  availableForJobs: boolean | null;
  latitude: string | null;
  longitude: string | null;
  speed: string | null;
  batteryLevel: number | null;
  recordedAt: string | null;
  source: 'presence' | 'history' | null;
  connected: boolean;
  reachable: boolean;
};

export type AdminMapSiteMarker = {
  locationId: string;
  organizationId: string;
  organizationName: string;
  tradingName: string | null;
  verificationStatus: string;
  name: string;
  district: string;
  address: string | null;
  latitude: string;
  longitude: string;
  coordinatePrecision: string;
  isPrimary: boolean;
  locationStatus: string;
};

@Injectable()
export class AdminMapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guardianLocation: GuardianLocationService,
  ) {}

  async listGuardianMarkers(
    query: MapGuardiansQueryDto,
  ): Promise<{ items: AdminMapGuardianMarker[]; generatedAt: string }> {
    const where: Prisma.GuardianWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.verificationStatus) {
      where.verificationStatus = query.verificationStatus;
    }
    if (query.onDutyOnly) {
      where.shiftState = {
        shiftStatus: { in: ON_DUTY_SHIFT_STATUSES },
      };
    }

    const guardians = await this.prisma.guardian.findMany({
      where,
      include: {
        user: { select: { fullName: true } },
        shiftState: true,
      },
      orderBy: { guardianCode: 'asc' },
    });

    const guardianIds = guardians.map((g) => g.id);
    const presenceByGuardian = await this.guardianLocation.listAllPresences();
    const idsNeedingHistory = guardianIds.filter(
      (id) => !presenceByGuardian.has(id),
    );
    const historyByGuardian =
      await this.guardianLocation.getLatestHistoryByGuardianIds(
        idsNeedingHistory,
      );

    const items: AdminMapGuardianMarker[] = [];

    for (const guardian of guardians) {
      const presence = presenceByGuardian.get(guardian.id);
      const needsHistory = !presence;
      const latest = needsHistory
        ? historyByGuardian.get(guardian.id)
        : undefined;
      const location = resolveGuardianCurrentLocation(
        guardian.id,
        presence,
        latest,
      );

      if (query.connectedOnly && !location.connected) {
        continue;
      }
      if (
        query.withLocationOnly &&
        (location.latitude == null || location.longitude == null)
      ) {
        continue;
      }

      items.push({
        guardianId: guardian.id,
        guardianCode: guardian.guardianCode,
        fullName: guardian.user.fullName,
        status: guardian.status,
        shiftStatus: guardian.shiftState?.shiftStatus ?? null,
        availableForJobs: guardian.shiftState?.availableForJobs ?? null,
        latitude: location.latitude,
        longitude: location.longitude,
        speed: location.speed,
        batteryLevel: location.batteryLevel,
        recordedAt: location.recordedAt,
        source: location.source,
        connected: location.connected,
        reachable: location.reachable,
      });
    }

    return { items, generatedAt: new Date().toISOString() };
  }

  async listSiteMarkers(
    query: MapSitesQueryDto,
  ): Promise<{ items: AdminMapSiteMarker[]; generatedAt: string }> {
    const where: Prisma.LocationWhereInput = {
      status: query.locationStatus ?? 'ACTIVE',
    };

    if (query.coordinatePrecision) {
      where.coordinatePrecision = query.coordinatePrecision;
    }
    if (query.primaryOnly) {
      where.isPrimary = true;
    }
    if (query.organizationStatus || query.verificationStatus) {
      where.organization = {
        ...(query.organizationStatus
          ? { status: query.organizationStatus }
          : {}),
        ...(query.verificationStatus
          ? { verificationStatus: query.verificationStatus }
          : {}),
      };
    }

    const locations = await this.prisma.location.findMany({
      where,
      include: {
        organization: {
          select: {
            id: true,
            legalName: true,
            tradingName: true,
            verificationStatus: true,
          },
        },
      },
      orderBy: [{ organizationId: 'asc' }, { isPrimary: 'desc' }, { name: 'asc' }],
    });

    const items: AdminMapSiteMarker[] = locations.map((loc) => {
      const mapped = mapLocation(loc);
      return {
        locationId: loc.id,
        organizationId: loc.organizationId,
        organizationName: loc.organization.legalName,
        tradingName: loc.organization.tradingName,
        verificationStatus: loc.organization.verificationStatus,
        name: loc.name,
        district: loc.district,
        address: loc.address,
        latitude: mapped.latitude,
        longitude: mapped.longitude,
        coordinatePrecision: loc.coordinatePrecision,
        isPrimary: loc.isPrimary,
        locationStatus: loc.status,
      };
    });

    return { items, generatedAt: new Date().toISOString() };
  }
}
