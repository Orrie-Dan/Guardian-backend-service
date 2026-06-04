import { Injectable, NotFoundException } from '@nestjs/common';
import { AssignmentStatus, JobStatus, Prisma } from '@prisma/client';
import { AuditService } from '../common/services/audit.service';
import { PresenceService } from '../redis/presence.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { ShiftStateService } from './shift-state.service';

@Injectable()
export class ConnectivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly presence: PresenceService,
    private readonly shiftState: ShiftStateService,
    private readonly queue: QueueService,
  ) {}

  async recordHeartbeat(
    guardianId: string,
    latitude?: number,
    longitude?: number,
    speed?: number,
    battery?: number,
  ) {
    const guardian = await this.prisma.guardian.findUnique({
      where: { id: guardianId },
      include: { shiftState: true },
    });
    if (!guardian) {
      throw new NotFoundException('Guardian not found');
    }

    const now = new Date();
    const available =
      guardian.shiftState?.availableForJobs === true &&
      guardian.shiftState?.shiftStatus === 'AVAILABLE';

    if (latitude !== undefined && longitude !== undefined) {
      await this.presence.setPresence(guardianId, {
        lat: latitude,
        lng: longitude,
        speed,
        battery,
        available,
      });

      await this.prisma.locationHistory.create({
        data: {
          guardianId,
          latitude,
          longitude,
          speed,
          batteryLevel: battery,
          recordedAt: now,
        },
      });
    }

    const reachable = await this.presence.isReachable(guardianId);
    await this.queue.enqueueConnectivityCheck(guardianId);

    return { guardianId, recordedAt: now, reachable };
  }

  async evaluateStaleGuardian(guardianId: string): Promise<void> {
    const reachable = await this.presence.isReachable(guardianId);
    if (reachable) {
      return;
    }

    const activeAssignment = await this.prisma.jobAssignment.findFirst({
      where: {
        guardianId,
        status: {
          in: [
            AssignmentStatus.ACCEPTED,
            AssignmentStatus.ON_SITE,
            AssignmentStatus.EN_ROUTE,
            AssignmentStatus.OFFERED,
          ],
        },
      },
      include: { job: true },
    });

    if (
      activeAssignment &&
      activeAssignment.job.status === JobStatus.IN_PROGRESS
    ) {
      await this.audit.log({
        action: 'CONNECTIVITY_ESCALATION',
        entityType: 'guardian.guardians',
        entityId: guardianId,
        afterState: {
          jobId: activeAssignment.jobId,
          assignmentId: activeAssignment.id,
        } as Prisma.InputJsonValue,
      });
    }
  }
}
