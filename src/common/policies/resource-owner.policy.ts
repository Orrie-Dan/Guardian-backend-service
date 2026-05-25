import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { AuthUserPayload } from '../../auth/interfaces/auth-user.interface';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ResourceOwnerPolicy {
  constructor(private readonly prisma: PrismaService) {}

  isOps(actor: AuthUserPayload): boolean {
    return (
      actor.roles.includes(RoleCode.SUPER_ADMIN) ||
      actor.roles.includes(RoleCode.OPS_ADMIN)
    );
  }

  async assertOrgMember(orgId: string, actor: AuthUserPayload): Promise<void> {
    if (this.isOps(actor)) {
      return;
    }
    const active = actor.activeOrgId ?? actor.orgId;
    if (active === orgId || actor.organizationIds.includes(orgId)) {
      const membership = await this.prisma.organizationUser.findUnique({
        where: {
          organizationId_userId: { organizationId: orgId, userId: actor.sub },
        },
      });
      if (membership) {
        return;
      }
    }
    throw new ForbiddenException('No access to this organization');
  }

  async assertGuardianSelf(guardianId: string, actor: AuthUserPayload): Promise<void> {
    if (this.isOps(actor)) {
      return;
    }
    if (actor.guardianId !== guardianId) {
      throw new ForbiddenException('Guardian scope mismatch');
    }
  }

  async assertJobAccess(jobId: string, actor: AuthUserPayload) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    if (this.isOps(actor)) {
      return job;
    }
    if (actor.guardianId) {
      const assignment = await this.prisma.jobAssignment.findFirst({
        where: { jobId, guardianId: actor.guardianId },
      });
      if (assignment) {
        return job;
      }
    }
    await this.assertOrgMember(job.organizationId, actor);
    return job;
  }
}
