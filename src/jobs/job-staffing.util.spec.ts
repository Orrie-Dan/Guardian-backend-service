import { AssignmentStatus } from '@prisma/client';
import {
  buildStaffingProgress,
  STAFFED_ASSIGNMENT_STATUSES,
} from './job-staffing.util';

describe('job-staffing.util', () => {
  it('defines staffed statuses that include accepted through completed', () => {
    expect(STAFFED_ASSIGNMENT_STATUSES).toEqual(
      expect.arrayContaining([
        AssignmentStatus.ACCEPTED,
        AssignmentStatus.ON_SITE,
        AssignmentStatus.COMPLETED,
      ]),
    );
  });

  it('computes remaining slots from database-backed counts', () => {
    const progress = buildStaffingProgress(3, 1, 2);
    expect(progress).toEqual({
      requestedGuardianCount: 3,
      acceptedGuardianCount: 1,
      remainingGuardianSlots: 2,
      pendingOfferCount: 2,
      isFullyStaffed: false,
    });
  });

  it('marks job fully staffed when accepted equals requested', () => {
    const progress = buildStaffingProgress(2, 2, 1);
    expect(progress.remainingGuardianSlots).toBe(0);
    expect(progress.isFullyStaffed).toBe(true);
  });
});
