import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleCode } from '@prisma/client';
import { PermissionsGuard } from './permissions.guard';
import { PermissionResolverService } from '../permission-resolver.service';
import { AuditService } from '../../common/services/audit.service';

describe('PermissionsGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const resolver = { resolve: jest.fn() };
  const audit = { log: jest.fn() };

  let guard: PermissionsGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new PermissionsGuard(
      reflector as unknown as Reflector,
      resolver as unknown as PermissionResolverService,
      audit as unknown as AuditService,
    );
  });

  const ctx = (user?: object): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    }) as ExecutionContext;

  it('allows public routes', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === 'isPublic') return true;
      return undefined;
    });
    await expect(guard.canActivate(ctx())).resolves.toBe(true);
  });

  it('allows when no permissions metadata', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    await expect(
      guard.canActivate(
        ctx({
          sub: 'u1',
          roles: [RoleCode.CLIENT_OWNER],
          activeRole: RoleCode.CLIENT_OWNER,
        }),
      ),
    ).resolves.toBe(true);
  });

  it('denies when permission missing', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === 'isPublic') return false;
      if (key === 'permissions') {
        return { permissions: ['jobs:cancel'], mode: 'all' };
      }
      return undefined;
    });
    resolver.resolve.mockResolvedValue(['jobs:read']);
    await expect(
      guard.canActivate(
        ctx({
          sub: 'u1',
          roles: [RoleCode.CLIENT_STAFF],
          activeRole: RoleCode.CLIENT_STAFF,
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows when permission present', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === 'isPublic') return false;
      if (key === 'permissions') {
        return { permissions: ['jobs:read'], mode: 'all' };
      }
      return undefined;
    });
    resolver.resolve.mockResolvedValue(['jobs:read', 'jobs:create']);
    await expect(
      guard.canActivate(
        ctx({
          sub: 'u1',
          roles: [RoleCode.CLIENT_STAFF],
          activeRole: RoleCode.CLIENT_STAFF,
        }),
      ),
    ).resolves.toBe(true);
  });
});
