import { RoleCode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUserPayload } from './interfaces/auth-user.interface';

export async function loadAuthUserPayload(
  prisma: PrismaService,
  userId: string,
  preferredOrgId?: string,
): Promise<AuthUserPayload | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userRoles: { include: { role: true } },
      organizationUsers: true,
      guardianProfile: true,
    },
  });

  if (!user || user.status === 'DELETED') {
    return null;
  }

  const roles = user.userRoles.map((ur) => ur.role.code);
  if (!roles.length) {
    return null;
  }

  const activeRole =
    roles.find((r) => r === RoleCode.GUARDIAN) ??
    roles.find((r) => r === RoleCode.CLIENT_OWNER || r === RoleCode.CLIENT_STAFF) ??
    roles[0];

  const organizationIds = user.organizationUsers.map((m) => m.organizationId);
  let activeOrgId: string | undefined;
  if (preferredOrgId && organizationIds.includes(preferredOrgId)) {
    activeOrgId = preferredOrgId;
  } else if (organizationIds.length > 0) {
    activeOrgId = organizationIds[0];
  }

  return {
    sub: user.id,
    phone: user.phoneNumber,
    roles,
    activeRole,
    activeOrgId,
    orgId: activeOrgId,
    organizationIds,
    guardianId: user.guardianProfile?.id,
  };
}
