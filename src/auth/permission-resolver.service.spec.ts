import { ConfigService } from '@nestjs/config';
import { OrgMemberRole, RoleCode } from '@prisma/client';
import { PermissionResolverService } from './permission-resolver.service';
import { AuthUserPayload } from './interfaces/auth-user.interface';

describe('PermissionResolverService', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    orgMemberRolePermission: { findMany: jest.fn() },
  };
  const redis = {
    cacheGet: jest.fn(),
    cacheSet: jest.fn(),
    cacheDelByPrefix: jest.fn(),
  };
  const config = {
    get: jest.fn((key: string, def?: number) =>
      key === 'PERMISSION_CACHE_TTL_SECONDS' ? 600 : def,
    ),
  } as unknown as ConfigService;

  let service: PermissionResolverService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PermissionResolverService(
      prisma as never,
      redis as never,
      config,
    );
  });

  it('cacheKey uses platform when no activeOrgId', () => {
    expect(service.cacheKey('u1', RoleCode.CLIENT_OWNER, undefined)).toBe(
      'perms:u1:CLIENT_OWNER:platform',
    );
  });

  it('returns cached permissions on hit', async () => {
    redis.cacheGet.mockResolvedValue(JSON.stringify(['jobs:read']));
    const actor: AuthUserPayload = {
      sub: 'u1',
      phone: '+250788000001',
      roles: [RoleCode.CLIENT_OWNER],
      activeRole: RoleCode.CLIENT_OWNER,
      activeOrgId: 'org-1',
      organizationIds: ['org-1'],
    };
    const result = await service.resolve(actor);
    expect(result).toEqual(['jobs:read']);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('merges platform and org member permissions on miss', async () => {
    redis.cacheGet.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      userRoles: [
        {
          role: {
            rolePermissions: [
              { permission: { code: 'admin:analytics:read' } },
            ],
          },
        },
      ],
      organizationUsers: [{ role: OrgMemberRole.CLIENT_STAFF }],
    });
    prisma.orgMemberRolePermission.findMany.mockResolvedValue([
      { permission: { code: 'jobs:read' } },
      { permission: { code: 'jobs:create' } },
    ]);

    const actor: AuthUserPayload = {
      sub: 'u1',
      phone: '+250788000001',
      roles: [RoleCode.OPS_ADMIN],
      activeRole: RoleCode.OPS_ADMIN,
      activeOrgId: 'org-1',
      organizationIds: ['org-1'],
    };

    const result = await service.resolve(actor);
    expect(result).toContain('admin:analytics:read');
    expect(result).toContain('jobs:read');
    expect(result).toContain('jobs:create');
    expect(redis.cacheSet).toHaveBeenCalled();
  });

  it('invalidateUser clears prefix', async () => {
    await service.invalidateUser('u1');
    expect(redis.cacheDelByPrefix).toHaveBeenCalledWith('perms:u1:');
  });
});
