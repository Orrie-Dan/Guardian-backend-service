import { AssignmentStatus } from '@prisma/client';
import { GuardianCurrentLocation } from '../guardians/guardian-location.types';

export const TRACKABLE_ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  AssignmentStatus.ACCEPTED,
  AssignmentStatus.EN_ROUTE,
  AssignmentStatus.ON_SITE,
];

export type JobTrackingDestination = {
  locationId: string;
  name: string;
  address: string | null;
  latitude: string;
  longitude: string;
};

export type JobTrackingGuardian = {
  id: string;
  displayName: string | null;
};

export type JobTrackingResponse = {
  jobId: string;
  jobStatus: string;
  assignment: {
    id: string;
    status: AssignmentStatus;
    acceptedAt: string | null;
    arrivedAt: string | null;
  };
  guardian: JobTrackingGuardian;
  location: GuardianCurrentLocation;
  destination: JobTrackingDestination;
  distanceMeters: number | null;
  etaMinutes: number | null;
};
