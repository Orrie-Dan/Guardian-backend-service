import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

export type PermissionMode = 'all' | 'any';

export type RequirePermissionsMeta = {
  permissions: string[];
  mode: PermissionMode;
};

export function RequirePermissions(
  permission: string,
  options?: { mode?: PermissionMode },
): ReturnType<typeof SetMetadata>;
export function RequirePermissions(
  ...permissions: string[]
): ReturnType<typeof SetMetadata>;
export function RequirePermissions(
  first: string,
  second?: string | { mode?: PermissionMode },
  ...rest: string[]
): ReturnType<typeof SetMetadata> {
  let permissions: string[];
  let mode: PermissionMode = 'all';

  if (
    typeof second === 'object' &&
    second !== null &&
    'mode' in second &&
    rest.length === 0
  ) {
    permissions = [first];
    mode = second.mode ?? 'all';
  } else {
    permissions = [first];
    if (typeof second === 'string') {
      permissions.push(second, ...rest);
    }
  }

  return SetMetadata(PERMISSIONS_KEY, { permissions, mode });
}
