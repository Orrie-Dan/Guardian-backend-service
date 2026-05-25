import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationChannel, Prisma } from '@prisma/client';
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
