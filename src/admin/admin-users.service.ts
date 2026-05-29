import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignmentStatus,
  GuardianStatus,
  JobStatus,
  RoleCode,
  ShiftStatus,
  UserStatus,
} from '@prisma/client';
import { AuditService } from '../common/services/audit.service';
import { AuthUserPayload } from '../auth/interfaces/auth-user.interface';
import { PrismaService } from '../prisma/prisma.service';

export type UserDeletionMode = 'soft' | 'hard';

export interface UserDeletePreview {
  userId: string;
  email: string | null;
  phoneNumber: string;
  fullName: string | null;
  status: UserStatus;
  roles: RoleCode[];
  guardianId: string | null;
  canSoftDelete: boolean;
  canHardDelete: boolean;
  blockers: string[];
}

export interface UserDeleteResult {
  userId: string;
  mode: UserDeletionMode;
  guardianId?: string;
  anonymized?: boolean;
  tokensRevoked: number;
  notificationsRemoved: number;
  hardDeleted?: boolean;
}

export interface BulkDeleteUsersResult {
  results: Array<{
    email: string;
    status: 'deleted' | 'not_found' | 'blocked' | 'already_deleted';
    userId?: string;
    mode?: UserDeletionMode;
    reason?: string;
  }>;
}

const ACTIVE_JOB_STATUSES: JobStatus[] = [
  JobStatus.PENDING,
  JobStatus.DISPATCHING,
  JobStatus.ASSIGNED,
  JobStatus.IN_PROGRESS,
];

const ACTIVE_ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  AssignmentStatus.OFFERED,
  AssignmentStatus.ACCEPTED,
  AssignmentStatus.EN_ROUTE,
  AssignmentStatus.ON_SITE,
];

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async previewDelete(userId: string): Promise<UserDeletePreview> {
    const user = await this.loadUserForDeletion(userId);
    const blockers = await this.collectBlockers(user.id, user.userRoles, false);
    const hardBlockers = await this.collectBlockers(user.id, user.userRoles, true);

    return {
      userId: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
      fullName: user.fullName,
      status: user.status,
      roles: user.userRoles.map((r) => r.role.code),
      guardianId: user.guardianProfile?.id ?? null,
      canSoftDelete: blockers.length === 0 && user.status !== UserStatus.DELETED,
      canHardDelete:
        hardBlockers.length === 0 && user.status !== UserStatus.DELETED,
      blockers: [...new Set([...blockers, ...hardBlockers])],
    };
  }

  async deleteUser(
    userId: string,
    actor: AuthUserPayload,
    mode: UserDeletionMode = 'soft',
  ): Promise<UserDeleteResult> {
    if (mode === 'hard' && !this.isHardDeleteAllowed()) {
      throw new ForbiddenException(
        'Hard user deletion is disabled. Set ALLOW_HARD_USER_DELETE=true or use non-production NODE_ENV.',
      );
    }

    const user = await this.loadUserForDeletion(userId);

    if (user.status === UserStatus.DELETED && mode === 'soft') {
      return {
        userId: user.id,
        mode,
        guardianId: user.guardianProfile?.id,
        anonymized: true,
        tokensRevoked: 0,
        notificationsRemoved: 0,
      };
    }

    if (actor.sub === userId) {
      throw new BadRequestException('Cannot delete your own account');
    }

    const blockers = await this.collectBlockers(
      user.id,
      user.userRoles,
      mode === 'hard',
    );
    if (blockers.length) {
      throw new ConflictException({
        code: 'USER_DELETE_BLOCKED',
        message: 'User cannot be deleted',
        blockers,
      });
    }

    if (mode === 'hard') {
      return this.hardDeleteUser(user.id, user.guardianProfile?.id, actor);
    }

    return this.softDeleteUser(user, actor);
  }

  async bulkDeleteByEmail(
    emails: string[],
    actor: AuthUserPayload,
    mode: UserDeletionMode = 'soft',
  ): Promise<BulkDeleteUsersResult> {
    const normalized = [...new Set(emails.map((e) => e.trim().toLowerCase()))];
    const results: BulkDeleteUsersResult['results'] = [];

    for (const email of normalized) {
      const user = await this.prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        select: { id: true, status: true },
      });

      if (!user) {
        results.push({ email, status: 'not_found' });
        continue;
      }

      if (user.status === UserStatus.DELETED && mode === 'soft') {
        results.push({
          email,
          status: 'already_deleted',
          userId: user.id,
          mode,
        });
        continue;
      }

      try {
        const deleted = await this.deleteUser(user.id, actor, mode);
        results.push({
          email,
          status: 'deleted',
          userId: deleted.userId,
          mode: deleted.mode,
        });
      } catch (err) {
        const reason =
          err instanceof ConflictException
            ? ((err.getResponse() as { blockers?: string[] }).blockers?.join('; ') ??
              err.message)
            : err instanceof Error
              ? err.message
              : String(err);
        results.push({
          email,
          status: 'blocked',
          userId: user.id,
          reason,
        });
      }
    }

    return { results };
  }

  private isHardDeleteAllowed(): boolean {
    return (
      process.env.NODE_ENV !== 'production' ||
      process.env.ALLOW_HARD_USER_DELETE === 'true'
    );
  }

  private async loadUserForDeletion(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: { include: { role: true } },
        guardianProfile: { select: { id: true } },
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private async collectBlockers(
    userId: string,
    userRoles: { role: { code: RoleCode } }[],
    forHardDelete: boolean,
  ): Promise<string[]> {
    const blockers: string[] = [];
    const roles = userRoles.map((r) => r.role.code);

    if (roles.includes(RoleCode.SUPER_ADMIN)) {
      const activeSuperAdmins = await this.prisma.userRoleAssignment.count({
        where: {
          role: { code: RoleCode.SUPER_ADMIN },
          user: { status: { not: UserStatus.DELETED } },
        },
      });
      if (activeSuperAdmins <= 1) {
        blockers.push('LAST_SUPER_ADMIN');
      }
    }

    const activeJobs = await this.prisma.job.count({
      where: {
        createdBy: userId,
        status: { in: ACTIVE_JOB_STATUSES },
      },
    });
    if (activeJobs > 0) {
      blockers.push(`ACTIVE_JOBS_CREATED:${activeJobs}`);
    }

    const guardian = await this.prisma.guardian.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (guardian) {
      const activeAssignments = await this.prisma.jobAssignment.count({
        where: {
          guardianId: guardian.id,
          status: { in: ACTIVE_ASSIGNMENT_STATUSES },
        },
      });
      if (activeAssignments > 0) {
        blockers.push(`ACTIVE_GUARDIAN_ASSIGNMENTS:${activeAssignments}`);
      }
    }

    if (forHardDelete) {
      const jobsCreated = await this.prisma.job.count({
        where: { createdBy: userId },
      });
      if (jobsCreated > 0) {
        blockers.push(`JOBS_REFERENCE_USER:${jobsCreated}`);
      }

      const incidentsReported = await this.prisma.fieldIncident.count({
        where: { createdBy: userId },
      });
      if (incidentsReported > 0) {
        blockers.push(`FIELD_INCIDENTS_REFERENCE_USER:${incidentsReported}`);
      }

      const vettingRecords = await this.prisma.guardianVettingRecord.count({
        where: { vettedByUserId: userId },
      });
      if (vettingRecords > 0) {
        blockers.push(`VETTING_RECORDS_REFERENCE_USER:${vettingRecords}`);
      }
    }

    return blockers;
  }

  private async softDeleteUser(
    user: {
      id: string;
      email: string | null;
      phoneNumber: string;
      guardianProfile: { id: string } | null;
    },
    actor: AuthUserPayload,
  ): Promise<UserDeleteResult> {
    const deletedEmail = `deleted+${user.id}@deleted.invalid`;
    const deletedPhone = `+9${user.id.replace(/-/g, '').slice(0, 18)}`;

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.guardian.updateMany({
        where: { activatedBy: user.id },
        data: { activatedBy: null },
      });

      if (user.guardianProfile) {
        await tx.guardian.update({
          where: { id: user.guardianProfile.id },
          data: { status: GuardianStatus.INACTIVE },
        });
        await tx.guardianShiftState.updateMany({
          where: { guardianId: user.guardianProfile.id },
          data: {
            shiftStatus: ShiftStatus.OFF_DUTY,
            availableForJobs: false,
            shiftStartedAt: null,
            shiftEndsAt: null,
          },
        });
      }

      const tokensRevoked = await tx.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      const notificationsRemoved = await tx.notification.deleteMany({
        where: { userId: user.id },
      });

      await tx.user.update({
        where: { id: user.id },
        data: {
          status: UserStatus.DELETED,
          email: deletedEmail,
          phoneNumber: deletedPhone,
          fullName: null,
          passwordHash: null,
          passwordSetAt: null,
          profilePhotoDocumentId: null,
          isEmailVerified: false,
          onboardingStep: null,
          onboardingCompletedAt: null,
        },
      });

      return {
        tokensRevoked: tokensRevoked.count,
        notificationsRemoved: notificationsRemoved.count,
      };
    });

    await this.audit.log({
      actorUserId: actor.sub,
      action: 'USER_SOFT_DELETED',
      entityType: 'identity.users',
      entityId: user.id,
      beforeState: {
        email: user.email,
        phoneNumber: user.phoneNumber,
      },
      afterState: {
        mode: 'soft',
        guardianId: user.guardianProfile?.id,
      },
    });

    return {
      userId: user.id,
      mode: 'soft',
      guardianId: user.guardianProfile?.id,
      anonymized: true,
      tokensRevoked: result.tokensRevoked,
      notificationsRemoved: result.notificationsRemoved,
    };
  }

  private async hardDeleteUser(
    userId: string,
    guardianId: string | undefined,
    actor: AuthUserPayload,
  ): Promise<UserDeleteResult> {
    const counts = await this.prisma.$transaction(async (tx) => {
      let notificationsRemoved = 0;
      let tokensRevoked = 0;

      if (guardianId) {
        const assignmentIds = (
          await tx.jobAssignment.findMany({
            where: { guardianId },
            select: { id: true },
          })
        ).map((a) => a.id);

        if (assignmentIds.length) {
          await tx.fieldIncident.deleteMany({
            where: { assignmentId: { in: assignmentIds } },
          });
          await tx.jobAssignment.deleteMany({
            where: { guardianId },
          });
        }

        await tx.guardianPerformanceDaily.deleteMany({
          where: { guardianId },
        });
        await tx.locationHistory.deleteMany({ where: { guardianId } });
        await tx.certification.deleteMany({ where: { guardianId } });

        await tx.guardian.updateMany({
          where: { activatedBy: userId },
          data: { activatedBy: null },
        });

        await tx.guardian.delete({ where: { id: guardianId } });
      }

      const notifications = await tx.notification.deleteMany({
        where: { userId },
      });
      notificationsRemoved = notifications.count;

      const tokens = await tx.refreshToken.deleteMany({ where: { userId } });
      tokensRevoked = tokens.count;

      await tx.user.delete({ where: { id: userId } });

      return { notificationsRemoved, tokensRevoked };
    });

    await this.audit.log({
      actorUserId: actor.sub,
      action: 'USER_HARD_DELETED',
      entityType: 'identity.users',
      entityId: userId,
      afterState: { mode: 'hard', guardianId },
    });

    return {
      userId,
      mode: 'hard',
      guardianId,
      hardDeleted: true,
      tokensRevoked: counts.tokensRevoked,
      notificationsRemoved: counts.notificationsRemoved,
    };
  }
}
