import { BadRequestException } from '@nestjs/common';
import { AssignmentStatus } from '@prisma/client';

export const REPLACEMENT_PIPELINE_STATUSES = new Set<AssignmentStatus>([
  AssignmentStatus.OFFERED,
  AssignmentStatus.ACCEPTED,
  AssignmentStatus.EN_ROUTE,
]);

/** Invariant while job is SEEKING_REPLACEMENT: departing must be AWAITING_RELIEF; substitute optional. */
export function assertSeekingReplacementState(
  departing: { status: AssignmentStatus } | null,
  substitute: { status: AssignmentStatus } | null,
): void {
  if (!departing || departing.status !== AssignmentStatus.AWAITING_RELIEF) {
    throw new BadRequestException('Departing assignment must be AWAITING_RELIEF');
  }
  if (substitute && !REPLACEMENT_PIPELINE_STATUSES.has(substitute.status)) {
    throw new BadRequestException('Substitute assignment is in an invalid status');
  }
}
