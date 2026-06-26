import { AssignmentStatus, Prisma } from '@prisma/client';

/** Row-locks an assignment for accept / decline transitions. */
export async function lockAssignmentRow(
  tx: Prisma.TransactionClient,
  assignmentId: string,
): Promise<void> {
  await tx.$executeRaw`
    SELECT id FROM "job"."job_assignments" WHERE id = ${assignmentId}::uuid FOR UPDATE
  `;
}

/**
 * Atomically transitions OFFERED -> target status.
 * Requires status=OFFERED in the WHERE clause so cancelled/expired offers cannot be accepted.
 */
export async function transitionOfferedAssignment(
  tx: Prisma.TransactionClient,
  assignmentId: string,
  versionNumber: number,
  data: {
    status: AssignmentStatus;
    acceptedAt?: Date;
    payPolicyModel?: Prisma.JobAssignmentUpdateInput['payPolicyModel'];
    payMinimumHours?: Prisma.Decimal;
    payPolicyResolvedAt?: Date;
    hourlyPayRateAtCommit?: Prisma.Decimal | null;
    payApplyOnEarlyRelease?: boolean;
  },
): Promise<number> {
  const result = await tx.jobAssignment.updateMany({
    where: {
      id: assignmentId,
      versionNumber,
      status: AssignmentStatus.OFFERED,
    },
    data: {
      status: data.status,
      acceptedAt: data.acceptedAt,
      payPolicyModel: data.payPolicyModel,
      payMinimumHours: data.payMinimumHours,
      payPolicyResolvedAt: data.payPolicyResolvedAt,
      hourlyPayRateAtCommit: data.hourlyPayRateAtCommit,
      payApplyOnEarlyRelease: data.payApplyOnEarlyRelease,
      versionNumber: { increment: 1 },
    },
  });
  return result.count;
}
