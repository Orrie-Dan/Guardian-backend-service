import { Prisma } from '@prisma/client';

/** Full job payload for guardian job history and job detail views. */
export function guardianJobDetailInclude(
  guardianId: string,
): Prisma.JobInclude {
  return {
    location: true,
    organization: true,
    assignments: {
      where: { guardianId },
      orderBy: { offerSentAt: 'desc' },
      include: {
        incidents: { orderBy: { createdAt: 'desc' } },
      },
    },
    statusHistory: { orderBy: { changedAt: 'desc' }, take: 20 },
  };
}
