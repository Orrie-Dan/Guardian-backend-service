import { AssignmentStatus, Prisma } from '@prisma/client';
import { ShiftStateService } from '../guardians/shift-state.service';
import { QueueService } from '../queue/queue.service';

export type CompetingOffer = { id: string; guardianId: string };

/** Cancels all pending offers when every guardian slot is filled. */
export async function cancelExcessOffersInTransaction(
  tx: Prisma.TransactionClient,
  jobId: string,
): Promise<CompetingOffer[]> {
  const pending = await tx.jobAssignment.findMany({
    where: {
      jobId,
      replacesAssignmentId: null,
      status: AssignmentStatus.OFFERED,
    },
    select: { id: true, guardianId: true },
  });

  if (!pending.length) {
    return [];
  }

  await tx.jobAssignment.updateMany({
    where: {
      jobId,
      replacesAssignmentId: null,
      status: AssignmentStatus.OFFERED,
    },
    data: { status: AssignmentStatus.CANCELLED },
  });

  return pending;
}

/** @deprecated Use cancelExcessOffersInTransaction when all slots are filled. */
export async function cancelCompetingOffersInTransaction(
  tx: Prisma.TransactionClient,
  jobId: string,
  _winningAssignmentId: string,
): Promise<CompetingOffer[]> {
  return cancelExcessOffersInTransaction(tx, jobId);
}

export async function releaseCompetingOffers(
  competing: CompetingOffer[],
  queue: QueueService,
  shiftState: ShiftStateService,
): Promise<void> {
  for (const offer of competing) {
    await queue.cancelOfferExpiry(offer.id);
    await shiftState.setAvailable(offer.guardianId);
  }
}
