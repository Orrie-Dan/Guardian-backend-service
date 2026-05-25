import { SetMetadata } from '@nestjs/common';

export const ORG_SCOPE_KEY = 'orgScope';
export type OrgScopeParam = 'id' | 'organizationId' | 'orgId';

/** Enforce route/body org param matches user.activeOrgId unless ops/admin */
export const OrgScope = (param: OrgScopeParam = 'id') =>
  SetMetadata(ORG_SCOPE_KEY, param);

export const SKIP_ORG_SCOPE_KEY = 'skipOrgScope';
export const SkipOrgScope = () => SetMetadata(SKIP_ORG_SCOPE_KEY, true);
