import { Injectable } from '@nestjs/common';
import {
  buildPaginatedMeta,
  paginationSkipTake,
  PaginationQueryDto,
} from '../common/dto/pagination-query.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    query: PaginationQueryDto,
    filters?: {
      actorUserId?: string;
      entityType?: string;
      from?: Date;
      to?: Date;
    },
  ) {
    const { skip, take } = paginationSkipTake(query);
    const where: Record<string, unknown> = {};
    if (filters?.actorUserId) {
      where.actorUserId = filters.actorUserId;
    }
    if (filters?.entityType) {
      where.entityType = filters.entityType;
    }
    if (filters?.from || filters?.to) {
      where.createdAt = {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { actor: true },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, meta: buildPaginatedMeta(query.page, query.limit, total) };
  }
}
