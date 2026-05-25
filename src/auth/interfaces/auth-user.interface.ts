import { RoleCode } from '@prisma/client';

export interface AuthUserPayload {
  sub: string;
  phone: string;
  roles: RoleCode[];
  activeRole: RoleCode;
  /** Active organization for tenant RLS and scoping */
  activeOrgId?: string;
  /** @deprecated Use activeOrgId */
  orgId?: string;
  organizationIds: string[];
  guardianId?: string;
  /** Resolved per request; not stored in JWT */
  permissions?: string[];
}
