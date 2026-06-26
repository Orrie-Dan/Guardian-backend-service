-- Multi-guardian staffing: job is partially staffed while dispatch continues.
ALTER TYPE "job"."JobStatus" ADD VALUE 'PARTIALLY_ASSIGNED' AFTER 'DISPATCHING';
