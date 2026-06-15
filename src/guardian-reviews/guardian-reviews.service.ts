import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignmentStatus,
  JobStatus,
  Prisma,
} from '@prisma/client';
import { AuthUserPayload } from '../auth/interfaces/auth-user.interface';
import { AuditService } from '../common/services/audit.service';
import {
  buildPaginatedMeta,
  PaginationQueryDto,
  paginationSkipTake,
} from '../common/dto/pagination-query.dto';
import { ResourceOwnerPolicy } from '../common/policies/resource-owner.policy';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGuardianReviewDto } from './dto/create-guardian-review.dto';
import {
  mapGuardianReviewForResponse,
} from './guardian-review.presenter';

const REVIEW_INCLUDE = {
  organization: {
    select: { id: true, tradingName: true, legalName: true },
  },
  job: {
    select: { id: true, referenceNumber: true },
  },
} as const;

const RATEABLE_JOB_STATUSES: JobStatus[] = [
  JobStatus.AWAITING_CONFIRMATION,
  JobStatus.COMPLETED,
];

@Injectable()
export class GuardianReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: ResourceOwnerPolicy,
    private readonly audit: AuditService,
  ) {}

  async submitForJob(
    jobId: string,
    dto: CreateGuardianReviewDto,
    actor: AuthUserPayload,
  ) {
    const job = await this.policy.assertJobAccess(jobId, actor);
    if (!RATEABLE_JOB_STATUSES.includes(job.status)) {
      throw new BadRequestException(
        'Reviews are allowed after guardian completion (awaiting confirmation or completed)',
      );
    }

    const assignment = await this.resolveCompletedAssignment(jobId, dto.assignmentId);

    const existing = await this.prisma.guardianReview.findUnique({
      where: { assignmentId: assignment.id },
      include: REVIEW_INCLUDE,
    });
    if (existing) {
      return mapGuardianReviewForResponse(existing, { includeReviewerId: true });
    }

    const review = await this.prisma.$transaction(async (tx) => {
      const created = await tx.guardianReview.create({
        data: {
          jobId,
          assignmentId: assignment.id,
          guardianId: assignment.guardianId,
          organizationId: job.organizationId,
          reviewerUserId: actor.sub,
          rating: dto.rating,
          comment: dto.comment?.trim() || null,
        },
        include: REVIEW_INCLUDE,
      });

      await this.recomputeGuardianRating(tx, assignment.guardianId);
      return created;
    });

    await this.audit.log({
      actorUserId: actor.sub,
      action: 'GUARDIAN_REVIEW_SUBMITTED',
      entityType: 'job.guardian_reviews',
      entityId: review.id,
      afterState: {
        jobId,
        assignmentId: review.assignmentId,
        guardianId: review.guardianId,
        rating: review.rating,
      },
    });

    return mapGuardianReviewForResponse(review, { includeReviewerId: true });
  }

  async getForJob(jobId: string, actor: AuthUserPayload) {
    await this.policy.assertJobAccess(jobId, actor);
    const review = await this.prisma.guardianReview.findFirst({
      where: { jobId },
      include: REVIEW_INCLUDE,
    });
    if (!review) {
      return null;
    }
    return mapGuardianReviewForResponse(review, {
      includeReviewerId: this.canSeeReviewer(actor),
    });
  }

  async listForGuardian(
    guardianId: string,
    query: PaginationQueryDto,
    actor: AuthUserPayload,
  ) {
    await this.assertGuardianReviewListAccess(guardianId, actor);

    const { skip, take } = paginationSkipTake(query);
    const where = { guardianId };

    const [items, total, aggregate] = await Promise.all([
      this.prisma.guardianReview.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: REVIEW_INCLUDE,
      }),
      this.prisma.guardianReview.count({ where }),
      this.prisma.guardianReview.aggregate({
        where,
        _avg: { rating: true },
        _count: true,
      }),
    ]);

    return {
      items: items.map((review) =>
        mapGuardianReviewForResponse(review, {
          includeReviewerId: this.canSeeReviewer(actor),
        }),
      ),
      meta: buildPaginatedMeta(query.page, query.limit, total),
      summary: {
        reviewCount: aggregate._count,
        averageRating: aggregate._avg.rating?.toString() ?? '0',
      },
    };
  }

  private async assertGuardianReviewListAccess(
    guardianId: string,
    actor: AuthUserPayload,
  ): Promise<void> {
    if (this.policy.isOps(actor)) {
      return;
    }
    if (actor.guardianId === guardianId) {
      return;
    }
    throw new ForbiddenException('No access to this guardian reviews');
  }

  private canSeeReviewer(actor: AuthUserPayload): boolean {
    return this.policy.isOps(actor) || !actor.guardianId;
  }

  private async resolveCompletedAssignment(
    jobId: string,
    assignmentId?: string,
  ) {
    if (assignmentId) {
      const assignment = await this.prisma.jobAssignment.findFirst({
        where: { id: assignmentId, jobId },
      });
      if (!assignment) {
        throw new NotFoundException('Assignment not found for this job');
      }
      if (assignment.status !== AssignmentStatus.COMPLETED) {
        throw new BadRequestException(
          'Only completed assignments can be reviewed',
        );
      }
      return assignment;
    }

    const completed = await this.prisma.jobAssignment.findMany({
      where: { jobId, status: AssignmentStatus.COMPLETED },
      orderBy: { completedAt: 'desc' },
    });

    if (completed.length === 0) {
      throw new BadRequestException(
        'No completed assignment to review for this job',
      );
    }
    if (completed.length > 1) {
      throw new BadRequestException(
        'Multiple completed assignments — provide assignmentId',
      );
    }
    return completed[0];
  }

  private async recomputeGuardianRating(
    tx: Prisma.TransactionClient,
    guardianId: string,
  ): Promise<void> {
    const aggregate = await tx.guardianReview.aggregate({
      where: { guardianId },
      _avg: { rating: true },
    });
    const average = aggregate._avg.rating ?? 0;
    await tx.guardian.update({
      where: { id: guardianId },
      data: { rating: average },
    });
  }
}
