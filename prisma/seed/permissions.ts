/**
 * Permission matrix source of truth (idempotent upsert).
 * Do not maintain a separate markdown matrix — derive docs from this file.
 */
import { OrgMemberRole, PrismaClient, RoleCode } from '@prisma/client';

export type PermissionDef = {
  code: string;
  resource: string;
  action: string;
  description?: string;
};

function parseCode(code: string): { resource: string; action: string } {
  const i = code.indexOf(':');
  return { resource: code.slice(0, i), action: code.slice(i + 1) };
}

/** Frozen CLIENT_STAFF org permissions (from current @Roles behavior). */
export const CLIENT_STAFF_PERMISSIONS: readonly string[] = [
  'jobs:read',
  'jobs:create',
  'jobs:dispatch',
  'jobs:read_invoice',
  'organizations:read',
  'organizations:read_locations',
  'organizations:read_invoices',
  'billing:read',
  'notifications:read',
  'notifications:write',
  'users:read_self',
  'users:update_self',
  'documents:read',
  'documents:write',
] as const;

export const CLIENT_OWNER_EXTRA_PERMISSIONS: readonly string[] = [
  'jobs:cancel',
  'jobs:complete',
  'assignments:early_release_approve',
  'assignments:early_release_reject',
  'payments:create',
  'payments:confirm',
  'organizations:update',
  'organizations:manage_locations',
  'organizations:read_members',
  'organizations:invite_member',
  'organizations:remove_member',
  'organizations:create',
  'billing:dispute',
] as const;

export const GUARDIAN_PERMISSIONS: readonly string[] = [
  'guardians:read_self',
  'guardians:update_self',
  'guardians:shift',
  'guardians:heartbeat',
  'guardians:read_certifications',
  'assignments:read',
  'assignments:accept',
  'assignments:decline',
  'assignments:en_route',
  'assignments:on_site',
  'assignments:complete',
  'assignments:early_release',
  'jobs:read',
  'jobs:create_incident',
  'users:read_self',
  'users:update_self',
  'notifications:read',
  'notifications:write',
  'documents:read',
  'documents:write',
] as const;

export const OPS_ADMIN_PERMISSIONS: readonly string[] = [
  'admin:guardians:read',
  'admin:guardians:write',
  'admin:guardians:activate',
  'admin:guardians:suspend',
  'admin:users:delete',
  'admin:verification:read',
  'admin:verification:write',
  'admin:pricing:read',
  'admin:pricing:write',
  'admin:billing:read',
  'admin:billing:write',
  'admin:audit:read',
  'admin:analytics:read',
  'admin:invoices:read',
  'admin:invoices:resolve_dispute',
  'admin:payments:read',
  'billing:dispute',
  'jobs:read',
  'jobs:create',
  'jobs:dispatch',
  'jobs:cancel',
  'jobs:complete',
  'jobs:read_invoice',
  'assignments:no_show',
  'assignments:early_release_approve',
  'assignments:early_release_reject',
  'billing:read',
  'billing:issue',
  'billing:void',
  'payments:create',
  'payments:confirm',
  'organizations:read',
  'organizations:read_locations',
  'organizations:read_invoices',
  'organizations:update',
  'organizations:manage_locations',
  'organizations:read_members',
  'organizations:create',
  'guardians:read',
  'users:read_self',
  'users:update_self',
  'notifications:read',
  'notifications:write',
  'documents:read',
  'documents:write',
] as const;

function uniqueCodes(...lists: readonly string[][]): string[] {
  return [...new Set(lists.flat())];
}

const ALL_CODES = uniqueCodes(
  CLIENT_STAFF_PERMISSIONS as unknown as string[],
  CLIENT_OWNER_EXTRA_PERMISSIONS as unknown as string[],
  GUARDIAN_PERMISSIONS as unknown as string[],
  OPS_ADMIN_PERMISSIONS as unknown as string[],
);

const PERMISSION_DEFS_BY_CODE = new Map<string, PermissionDef>();
for (const code of ALL_CODES) {
  const { resource, action } = parseCode(code);
  PERMISSION_DEFS_BY_CODE.set(code, { code, resource, action });
}

export async function seedPermissions(prisma: PrismaClient): Promise<void> {
  const permissionIds = new Map<string, number>();

  for (const def of PERMISSION_DEFS_BY_CODE.values()) {
    const row = await prisma.permission.upsert({
      where: { code: def.code },
      create: {
        code: def.code,
        resource: def.resource,
        action: def.action,
        description: def.description,
      },
      update: {
        resource: def.resource,
        action: def.action,
        description: def.description,
      },
    });
    permissionIds.set(def.code, row.id);
  }

  const roles = await prisma.role.findMany();
  const roleByCode = Object.fromEntries(roles.map((r) => [r.code, r.id])) as Record<
    RoleCode,
    number
  >;

  async function seedRolePerms(role: RoleCode, codes: readonly string[]) {
    const roleId = roleByCode[role];
    if (!roleId) return;
    for (const code of codes) {
      const permissionId = permissionIds.get(code);
      if (!permissionId) continue;
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId, permissionId },
        },
        create: { roleId, permissionId },
        update: {},
      });
    }
  }

  const clientOwnerCodes = uniqueCodes(
    CLIENT_STAFF_PERMISSIONS as unknown as string[],
    CLIENT_OWNER_EXTRA_PERMISSIONS as unknown as string[],
  );

  await seedRolePerms(RoleCode.GUARDIAN, GUARDIAN_PERMISSIONS);
  await seedRolePerms(RoleCode.OPS_ADMIN, OPS_ADMIN_PERMISSIONS);
  await seedRolePerms(RoleCode.SUPER_ADMIN, ALL_CODES);

  async function seedOrgMemberPerms(role: OrgMemberRole, codes: readonly string[]) {
    for (const code of codes) {
      const permissionId = permissionIds.get(code);
      if (!permissionId) continue;
      await prisma.orgMemberRolePermission.upsert({
        where: {
          orgMemberRole_permissionId: { orgMemberRole: role, permissionId },
        },
        create: { orgMemberRole: role, permissionId },
        update: {},
      });
    }
  }

  await seedOrgMemberPerms(OrgMemberRole.CLIENT_STAFF, CLIENT_STAFF_PERMISSIONS);
  await seedOrgMemberPerms(OrgMemberRole.CLIENT_OWNER, clientOwnerCodes);
}
