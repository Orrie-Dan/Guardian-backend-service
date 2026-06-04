import { AssignmentStatus } from '@prisma/client';

/** Allowed assignment status transitions (production guard). */
export const ALLOWED_ASSIGNMENT_TRANSITIONS: Record<
  AssignmentStatus,
  AssignmentStatus[]
> = {
  [AssignmentStatus.OFFERED]: [
    AssignmentStatus.ACCEPTED,
    AssignmentStatus.DECLINED,
    AssignmentStatus.EXPIRED,
    AssignmentStatus.CANCELLED,
  ],
  [AssignmentStatus.ACCEPTED]: [
    AssignmentStatus.EN_ROUTE,
    AssignmentStatus.NO_SHOW,
    AssignmentStatus.CANCELLED,
  ],
  [AssignmentStatus.EN_ROUTE]: [
    AssignmentStatus.ON_SITE,
    AssignmentStatus.NO_SHOW,
    AssignmentStatus.CANCELLED,
  ],
  [AssignmentStatus.ON_SITE]: [
    AssignmentStatus.COMPLETED,
    AssignmentStatus.EARLY_RELEASE_REQUESTED,
    AssignmentStatus.CANCELLED,
  ],
  [AssignmentStatus.EARLY_RELEASE_REQUESTED]: [
    AssignmentStatus.COMPLETED,
    AssignmentStatus.ON_SITE,
    AssignmentStatus.CANCELLED,
  ],
  [AssignmentStatus.COMPLETED]: [],
  [AssignmentStatus.DECLINED]: [],
  [AssignmentStatus.EXPIRED]: [],
  [AssignmentStatus.NO_SHOW]: [],
  [AssignmentStatus.CANCELLED]: [],
};

export function assertAssignmentTransitionAllowed(
  from: AssignmentStatus,
  to: AssignmentStatus,
): void {
  const allowed = ALLOWED_ASSIGNMENT_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(`Transition ${from} -> ${to} is not allowed`);
  }
}
