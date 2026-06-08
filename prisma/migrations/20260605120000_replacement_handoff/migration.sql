-- Replacement handoff workflow (Option A)

CREATE TYPE "job"."ReplacementResolution" AS ENUM ('APPROVED', 'DENIED');

ALTER TYPE "job"."AssignmentStatus" ADD VALUE 'REPLACEMENT_REQUESTED' AFTER 'EARLY_RELEASE_REQUESTED';

ALTER TYPE "job"."JobStatus" ADD VALUE 'SEEKING_REPLACEMENT' AFTER 'IN_PROGRESS';

ALTER TABLE "job"."job_assignments"
  ADD COLUMN "replacement_requested_at" TIMESTAMP(3),
  ADD COLUMN "replacement_reason" VARCHAR(500),
  ADD COLUMN "replacement_resolved_at" TIMESTAMP(3),
  ADD COLUMN "replacement_resolution" "job"."ReplacementResolution",
  ADD COLUMN "replacement_resolved_by_user_id" UUID,
  ADD COLUMN "replaces_assignment_id" UUID;

ALTER TABLE "job"."job_assignments"
  ADD CONSTRAINT "job_assignments_replaces_assignment_id_fkey"
  FOREIGN KEY ("replaces_assignment_id") REFERENCES "job"."job_assignments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "job_assignments_replacement_requested_idx"
  ON "job"."job_assignments"("status", "replacement_requested_at");

ALTER TABLE "job"."jobs"
  ADD COLUMN "replacement_departing_assignment_id" UUID;
