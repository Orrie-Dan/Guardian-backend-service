import { AssignmentStatus, Prisma } from '@prisma/client';
import { ShiftStateService } from '../guardians/shift-state.service';
import { QueueService } from '../queue/queue.service';

export type CompetingOffer = { id: string; guardianId: string };

/** Marks sibling OFFERED assignments CANCELLED; returns losers for post-tx cleanup. */
export async function cancelCompetingOffersInTransaction(
  tx: Prisma.TransactionClient,
  jobId: string,
  winningAssignmentId: string,
): Promise<CompetingOffer[]> {
  const competing = await tx.jobAssignment.findMany({
    where: {
      jobId,
      id: { not: winningAssignmentId },
      status: AssignmentStatus.OFFERED,
    },
    select: { id: true, guardianId: true },
  });

  if (!competing.length) {
    return [];
  }

  await tx.jobAssignment.updateMany({
    where: {
      jobId,
      id: { not: winningAssignmentId },
      status: AssignmentStatus.OFFERED,
    },
    data: { status: AssignmentStatus.CANCELLED },
  });

  return competing;
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
