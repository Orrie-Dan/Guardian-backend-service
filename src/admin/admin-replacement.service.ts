import { Injectable } from '@nestjs/common';
import { AssignmentsService } from '../assignments/assignments.service';

@Injectable()
export class AdminReplacementService {
  constructor(private readonly assignments: AssignmentsService) {}

  listPendingRequests() {
    return this.assignments.listReplacementRequests();
  }

  approve(assignmentId: string, actorUserId: string) {
    return this.assignments.approveReplacement(assignmentId, actorUserId);
  }

  deny(assignmentId: string, actorUserId: string, note?: string) {
    return this.assignments.denyReplacement(assignmentId, actorUserId, note);
  }
}
