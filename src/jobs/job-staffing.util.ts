import { AssignmentStatus, Prisma } from '@prisma/client';

/** Assignment statuses that consume a guardian staffing slot on the job. */
export const STAFFED_ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  AssignmentStatus.ACCEPTED,
  AssignmentStatus.EN_ROUTE,
  AssignmentStatus.ON_SITE,
  AssignmentStatus.EARLY_RELEASE_REQUESTED,
  AssignmentStatus.REPLACEMENT_REQUESTED,
  AssignmentStatus.AWAITING_RELIEF,
  AssignmentStatus.COMPLETED,
];

/** Assignments still actively working the job (not yet completed). */
export const ACTIVE_STAFFED_ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  AssignmentStatus.ACCEPTED,
  AssignmentStatus.EN_ROUTE,
  AssignmentStatus.ON_SITE,
  AssignmentStatus.EARLY_RELEASE_REQUESTED,
  AssignmentStatus.REPLACEMENT_REQUESTED,
  AssignmentStatus.AWAITING_RELIEF,
];

export type JobStaffingProgress = {
  requestedGuardianCount: number;
  acceptedGuardianCount: number;
  remainingGuardianSlots: number;
  pendingOfferCount: number;
  isFullyStaffed: boolean;
};

type StaffingDb = {
  jobAssignment: {
    count: (args: Prisma.JobAssignmentCountArgs) => Promise<number>;
  };
};

const initialStaffingAssignmentWhere = {
  replacesAssignmentId: null,
  status: { in: STAFFED_ASSIGNMENT_STATUSES },
} as const;

export async function countStaffedGuardians(
  db: StaffingDb,
  jobId: string,
): Promise<number> {
  return db.jobAssignment.count({
    where: { jobId, ...initialStaffingAssignmentWhere },
  });
}

export async function countActiveStaffedGuardians(
  db: StaffingDb,
  jobId: string,
): Promise<number> {
  return db.jobAssignment.count({
    where: {
      jobId,
      replacesAssignmentId: null,
      status: { in: ACTIVE_STAFFED_ASSIGNMENT_STATUSES },
    },
  });
}

export async function countPendingOffers(
  db: StaffingDb,
  jobId: string,
): Promise<number> {
  return db.jobAssignment.count({
    where: {
      jobId,
      replacesAssignmentId: null,
      status: AssignmentStatus.OFFERED,
    },
  });
}

export async function computeJobStaffingProgress(
  db: StaffingDb,
  jobId: string,
  requestedGuardianCount: number,
): Promise<JobStaffingProgress> {
  const [acceptedGuardianCount, pendingOfferCount] = await Promise.all([
    countStaffedGuardians(db, jobId),
    countPendingOffers(db, jobId),
  ]);
  const remainingGuardianSlots = Math.max(
    0,
    requestedGuardianCount - acceptedGuardianCount,
  );

  return {
    requestedGuardianCount,
    acceptedGuardianCount,
    remainingGuardianSlots,
    pendingOfferCount,
    isFullyStaffed: remainingGuardianSlots === 0,
  };
}

export function buildStaffingProgress(
  requestedGuardianCount: number,
  acceptedGuardianCount: number,
  pendingOfferCount: number,
): JobStaffingProgress {
  const remainingGuardianSlots = Math.max(
    0,
    requestedGuardianCount - acceptedGuardianCount,
  );
  return {
    requestedGuardianCount,
    acceptedGuardianCount,
    remainingGuardianSlots,
    pendingOfferCount,
    isFullyStaffed: remainingGuardianSlots === 0,
  };
}

export async function lockJobForStaffingUpdate(
  tx: Prisma.TransactionClient,
  jobId: string,
): Promise<void> {
  await tx.$executeRaw`
    SELECT id FROM "job"."jobs" WHERE id = ${jobId}::uuid FOR UPDATE
  `;
}
