import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthUserPayload } from './interfaces/auth-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class PermissionResolverService {
  private readonly ttlSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {
    this.ttlSeconds = this.config.get<number>('PERMISSION_CACHE_TTL_SECONDS', 600);
  }

  cacheKey(userId: string, activeRole: string, activeOrgId?: string): string {
    return `perms:${userId}:${activeRole}:${activeOrgId ?? 'platform'}`;
  }

  async resolve(actor: AuthUserPayload): Promise<string[]> {
    const key = this.cacheKey(actor.sub, actor.activeRole, actor.activeOrgId);
    const cached = await this.redis.cacheGet(key);
    if (cached) {
      return JSON.parse(cached) as string[];
    }

    const permissions = await this.loadFromDb(actor);
    await this.redis.cacheSet(key, JSON.stringify(permissions), this.ttlSeconds);
    return permissions;
  }

  async invalidateUser(userId: string): Promise<void> {
    await this.redis.cacheDelByPrefix(`perms:${userId}:`);
  }

  private async loadFromDb(actor: AuthUserPayload): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.sub },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: { include: { permission: true } },
              },
            },
          },
        },
        organizationUsers: actor.activeOrgId
          ? { where: { organizationId: actor.activeOrgId } }
          : false,
      },
    });

    if (!user) {
      return [];
    }

    const codes = new Set<string>();

    for (const ur of user.userRoles) {
      for (const rp of ur.role.rolePermissions) {
        codes.add(rp.permission.code);
      }
    }

    if (actor.activeOrgId && Array.isArray(user.organizationUsers)) {
      const membership = user.organizationUsers[0];
      if (membership) {
        const orgPerms = await this.prisma.orgMemberRolePermission.findMany({
          where: { orgMemberRole: membership.role },
          include: { permission: true },
        });
        for (const op of orgPerms) {
          codes.add(op.permission.code);
        }
      }
    }

    return [...codes].sort();
  }
}
