import { GuardianReview, Organization, Job } from '@prisma/client';

export type GuardianReviewRow = GuardianReview & {
  organization: Pick<Organization, 'id' | 'tradingName' | 'legalName'>;
  job: Pick<Job, 'id' | 'referenceNumber'>;
};

export function mapGuardianReviewForResponse(
  review: GuardianReviewRow,
  options?: { includeReviewerId?: boolean },
) {
  return {
    id: review.id,
    jobId: review.jobId,
    assignmentId: review.assignmentId,
    guardianId: review.guardianId,
    organizationId: review.organizationId,
    organizationName:
      review.organization.tradingName ?? review.organization.legalName,
    jobReferenceNumber: review.job.referenceNumber,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt.toISOString(),
    updatedAt: review.updatedAt.toISOString(),
    ...(options?.includeReviewerId
      ? { reviewerUserId: review.reviewerUserId }
      : {}),
  };
}
