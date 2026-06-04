import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buildPaginatedMeta,
  paginationSkipTake,
} from '../common/dto/pagination-query.dto';
import { ListGuardianJobsQueryDto } from '../jobs/dto/list-guardian-jobs-query.dto';
import { guardianJobDetailInclude } from '../jobs/job-detail.include';
import { EmploymentType } from '@prisma/client';
import { AuthUserPayload } from '../auth/interfaces/auth-user.interface';
import { AuditService } from '../common/services/audit.service';
import { normalizeDistrict } from '../common/district.util';
import { ResourceOwnerPolicy } from '../common/policies/resource-owner.policy';
import { ConnectivityService } from './connectivity.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCertificationDto } from './dto/create-certification.dto';
import { LocationHistoryQueryDto } from './dto/location-history-query.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { UpdateGuardianDto } from './dto/update-guardian.dto';
import {
  CERTIFICATION_WITH_DOCUMENT_INCLUDE,
  mapCertificationForResponse,
} from '../common/certification-response.util';
import { GuardianLocationService } from './guardian-location.service';
import { ShiftStateService } from './shift-state.service';

@Injectable()
export class GuardiansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shiftState: ShiftStateService,
    private readonly connectivity: ConnectivityService,
    private readonly location: GuardianLocationService,
    private readonly policy: ResourceOwnerPolicy,
    private readonly audit: AuditService,
  ) {}

  async listMyJobs(actor: AuthUserPayload, query: ListGuardianJobsQueryDto) {
    if (!actor.guardianId) {
      throw new ForbiddenException('Not a guardian');
    }

    const { skip, take } = paginationSkipTake(query);
    const where: Record<string, unknown> = {
      assignments: { some: { guardianId: actor.guardianId } },
    };
    if (query.status) {
      where.status = query.status;
    }

    const [items, total] = await Promise.all([
      this.prisma.job.findMany({
        where,
        skip,
        take,
        orderBy: { updatedAt: query.order },
        include: guardianJobDetailInclude(actor.guardianId),
      }),
      this.prisma.job.count({ where }),
    ]);

    return {
      items,
      meta: buildPaginatedMeta(query.page, query.limit, total),
    };
  }

  async getMe(actor: AuthUserPayload) {
    if (!actor.guardianId) {
      throw new ForbiddenException('Not a guardian');
    }
    const guardian = await this.prisma.guardian.findUnique({
      where: { id: actor.guardianId },
      include: { shiftState: true, user: true, certifications: true },
    });
    if (!guardian) {
      throw new NotFoundException('Guardian profile not found');
    }
    return guardian;
  }

  async updateMe(actor: AuthUserPayload, dto: UpdateGuardianDto) {
    if (!actor.guardianId) {
      throw new ForbiddenException('Not a guardian');
    }
    const updated = await this.prisma.guardian.update({
      where: { id: actor.guardianId },
      data: {
        districtBase: dto.districtBase
          ? normalizeDistrict(dto.districtBase)
          : undefined,
        employmentType: dto.employmentType,
      },
    });
    await this.audit.log({
      actorUserId: actor.sub,
      action: 'GUARDIAN_PROFILE_UPDATED',
      entityType: 'guardian.guardians',
      entityId: actor.guardianId,
    });
    return updated;
  }

  async getById(id: string) {
    const guardian = await this.prisma.guardian.findUnique({
      where: { id },
      include: { shiftState: true, user: true },
    });
    if (!guardian) {
      throw new NotFoundException('Guardian not found');
    }
    return guardian;
  }

  startShift(actor: AuthUserPayload) {
    return this.shiftState.startShift(actor.guardianId!);
  }

  endShift(actor: AuthUserPayload) {
    return this.shiftState.endShift(actor.guardianId!);
  }

  heartbeat(actor: AuthUserPayload, dto: HeartbeatDto) {
    return this.connectivity.recordHeartbeat(
      actor.guardianId!,
      dto.latitude,
      dto.longitude,
      dto.speed,
      dto.battery,
    );
  }

  getMyLocation(actor: AuthUserPayload) {
    if (!actor.guardianId) {
      throw new ForbiddenException('Not a guardian');
    }
    return this.location.getCurrent(actor.guardianId);
  }

  getLocationById(id: string) {
    return this.location.getCurrent(id);
  }

  getMyLocationHistory(actor: AuthUserPayload, query: LocationHistoryQueryDto) {
    if (!actor.guardianId) {
      throw new ForbiddenException('Not a guardian');
    }
    return this.getLocationHistory(actor.guardianId, query);
  }

  getLocationHistory(guardianId: string, query: LocationHistoryQueryDto) {
    const since = query.since ? new Date(query.since) : undefined;
    return this.location.getHistory(guardianId, query, since);
  }

  async listCertifications(actor: AuthUserPayload) {
    if (!actor.guardianId) {
      throw new ForbiddenException('Not a guardian');
    }
    const rows = await this.prisma.certification.findMany({
      where: { guardianId: actor.guardianId },
      include: CERTIFICATION_WITH_DOCUMENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapCertificationForResponse);
  }

  async getMyCertification(actor: AuthUserPayload, certificationId: string) {
    if (!actor.guardianId) {
      throw new ForbiddenException('Not a guardian');
    }
    const cert = await this.prisma.certification.findFirst({
      where: { id: certificationId, guardianId: actor.guardianId },
      include: CERTIFICATION_WITH_DOCUMENT_INCLUDE,
    });
    if (!cert) {
      throw new NotFoundException('Certification not found');
    }
    return mapCertificationForResponse(cert);
  }

  addCertification() {
    throw new ForbiddenException(
      'Certifications must be added by G2Sentry administrators after vetting',
    );
  }
}
