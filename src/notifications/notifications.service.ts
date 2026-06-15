import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationChannel, OrgMemberRole, Prisma, RoleCode } from '@prisma/client';
import { AuthUserPayload } from '../auth/interfaces/auth-user.interface';
import {
  buildPaginatedMeta,
  paginationSkipTake,
  PaginationQueryDto,
} from '../common/dto/pagination-query.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createInApp(
    userId: string,
    title: string,
    body: string,
    payload?: Record<string, unknown>,
  ) {
    return this.prisma.notification.create({
      data: {
        userId,
        channel: NotificationChannel.IN_APP,
        title,
        body,
        payload: payload as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async notifyUserInApp(
    userId: string,
    title: string,
    body: string,
    payload?: Record<string, unknown>,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      return 0;
    }
    await this.createInApp(userId, title, body, payload);
    return 1;
  }

  async notifyOrgOwnersInApp(
    organizationId: string,
    title: string,
    body: string,
    payload?: Record<string, unknown>,
  ) {
    const owners = await this.prisma.organizationUser.findMany({
      where: { organizationId, role: OrgMemberRole.CLIENT_OWNER },
      select: { userId: true },
    });
    for (const owner of owners) {
      await this.createInApp(owner.userId, title, body, payload);
    }
    return owners.length;
  }

  async notifyOpsAdminsInApp(
    title: string,
    body: string,
    payload?: Record<string, unknown>,
  ) {
    const opsUsers = await this.prisma.user.findMany({
      where: {
        userRoles: {
          some: {
            role: { code: { in: [RoleCode.OPS_ADMIN, RoleCode.SUPER_ADMIN] } },
          },
        },
      },
      select: { id: true },
    });
    for (const user of opsUsers) {
      await this.createInApp(user.id, title, body, payload);
    }
    return opsUsers.length;
  }

  async notifyGuardianInApp(
    guardianId: string,
    title: string,
    body: string,
    payload?: Record<string, unknown>,
  ) {
    const guardian = await this.prisma.guardian.findUnique({
      where: { id: guardianId },
      select: { userId: true },
    });
    if (!guardian) {
      return 0;
    }
    await this.createInApp(guardian.userId, title, body, payload);
    return 1;
  }

  async list(actor: AuthUserPayload, query: PaginationQueryDto) {
    const { skip, take } = paginationSkipTake(query);
    const where = { userId: actor.sub };
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { items, meta: buildPaginatedMeta(query.page, query.limit, total) };
  }

  async markRead(actor: AuthUserPayload, id: string) {
    const n = await this.prisma.notification.findFirst({
      where: { id, userId: actor.sub },
    });
    if (!n) {
      throw new NotFoundException('Notification not found');
    }
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(actor: AuthUserPayload) {
    await this.prisma.notification.updateMany({
      where: { userId: actor.sub, readAt: null },
      data: { readAt: new Date() },
    });
    return { readAll: true };
  }
}
