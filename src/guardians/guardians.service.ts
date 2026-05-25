import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EmploymentType } from '@prisma/client';
import { AuthUserPayload } from '../auth/interfaces/auth-user.interface';
import { AuditService } from '../common/services/audit.service';
import { ResourceOwnerPolicy } from '../common/policies/resource-owner.policy';
import { ConnectivityService } from './connectivity.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCertificationDto } from './dto/create-certification.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { UpdateGuardianDto } from './dto/update-guardian.dto';
import { ShiftStateService } from './shift-state.service';

@Injectable()
export class GuardiansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shiftState: ShiftStateService,
    private readonly connectivity: ConnectivityService,
    private readonly policy: ResourceOwnerPolicy,
    private readonly audit: AuditService,
  ) {}

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
        districtBase: dto.districtBase,
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

  listCertifications(actor: AuthUserPayload) {
    return this.prisma.certification.findMany({
      where: { guardianId: actor.guardianId! },
      orderBy: { createdAt: 'desc' },
    });
  }

  addCertification() {
    throw new ForbiddenException(
      'Certifications must be added by G2Sentry administrators after vetting',
    );
  }
}
