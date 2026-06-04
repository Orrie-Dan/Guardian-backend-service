import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AssignmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AssignmentsService } from './assignments.service';
import { NoShowReasonCode } from './dto/no-show.dto';

const NO_SHOW_AUTOMATION_INTERVAL_MS = 60_000;
const ACCEPTED_NO_SHOW_AFTER_MS = 20 * 60_000;
const EN_ROUTE_NO_SHOW_GRACE_AFTER_START_MS = 15 * 60_000;

@Injectable()
export class NoShowAutomationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NoShowAutomationService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly assignments: AssignmentsService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(
      () => void this.scanAndMarkNoShows(),
      NO_SHOW_AUTOMATION_INTERVAL_MS,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async scanAndMarkNoShows() {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const now = new Date();
      const acceptedThreshold = new Date(now.getTime() - ACCEPTED_NO_SHOW_AFTER_MS);
      const enRouteThreshold = new Date(
        now.getTime() - EN_ROUTE_NO_SHOW_GRACE_AFTER_START_MS,
      );
      const candidates = await this.prisma.jobAssignment.findMany({
        where: {
          OR: [
            {
              status: AssignmentStatus.ACCEPTED,
              acceptedAt: { lte: acceptedThreshold },
            },
            {
              status: AssignmentStatus.EN_ROUTE,
              arrivedAt: null,
              job: {
                scheduledStart: { lte: enRouteThreshold },
              },
            },
          ],
        },
        select: { id: true, status: true },
      });

      for (const candidate of candidates) {
        try {
          if (candidate.status === AssignmentStatus.ACCEPTED) {
            await this.assignments.autoNoShow(
              candidate.id,
              NoShowReasonCode.CLIENT_UNREACHABLE,
              'Auto no-show: accepted assignment exceeded 20m without en-route update',
            );
          } else if (candidate.status === AssignmentStatus.EN_ROUTE) {
            await this.assignments.autoNoShow(
              candidate.id,
              NoShowReasonCode.CLIENT_NOT_PRESENT,
              'Auto no-show: en-route assignment exceeded ETA + 15m without on-site update',
            );
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `Failed auto no-show for assignment ${candidate.id}: ${message}`,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}
