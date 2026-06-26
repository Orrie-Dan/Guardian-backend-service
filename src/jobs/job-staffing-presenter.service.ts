import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ACTIVE_STAFFED_ASSIGNMENT_STATUSES,
  computeJobStaffingProgress,
  JobStaffingProgress,
  STAFFED_ASSIGNMENT_STATUSES,
} from './job-staffing.util';

@Injectable()
export class JobStaffingPresenterService {
  async buildStaffingProgress(
    db: { jobAssignment: Prisma.TransactionClient['jobAssignment'] },
    jobId: string,
    requestedGuardianCount: number,
  ): Promise<JobStaffingProgress> {
    return computeJobStaffingProgress(db, jobId, requestedGuardianCount);
  }

  staffedAssignmentsInclude() {
    return {
      where: {
        replacesAssignmentId: null,
        status: { in: STAFFED_ASSIGNMENT_STATUSES },
      },
      include: { guardian: { include: { user: true } } },
      orderBy: { acceptedAt: 'asc' as const },
    };
  }

  activeStaffedAssignmentsInclude() {
    return {
      where: {
        replacesAssignmentId: null,
        status: { in: ACTIVE_STAFFED_ASSIGNMENT_STATUSES },
      },
      include: { guardian: { include: { user: true } } },
      orderBy: { acceptedAt: 'asc' as const },
    };
  }
}
