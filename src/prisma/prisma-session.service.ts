import { Injectable } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaSessionService {
  constructor(private readonly prisma: PrismaService) {}

  async withTenantContext<T>(
    orgId: string | undefined,
    activeRole: RoleCode,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (!orgId) {
      return fn();
    }
    await this.prisma.$executeRaw`SELECT set_config('app.current_org', ${orgId}, true)`;
    await this.prisma.$executeRaw`SELECT set_config('app.role', ${activeRole}, true)`;
    try {
      return await fn();
    } finally {
      await this.clearSessionContext();
    }
  }

  /** Sets RLS session for platform admins without an active organization. */
  async withPlatformAdminContext<T>(activeRole: RoleCode, fn: () => Promise<T>): Promise<T> {
    await this.prisma.$executeRaw`SELECT set_config('app.current_org', '', true)`;
    await this.prisma.$executeRaw`SELECT set_config('app.role', ${activeRole}, true)`;
    try {
      return await fn();
    } finally {
      await this.clearSessionContext();
    }
  }

  private async clearSessionContext(): Promise<void> {
    await this.prisma.$executeRaw`SELECT set_config('app.current_org', '', true)`;
    await this.prisma.$executeRaw`SELECT set_config('app.role', '', true)`;
  }
}
