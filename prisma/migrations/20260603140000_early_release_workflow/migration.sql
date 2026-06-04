-- Early release workflow (phase 3)

CREATE TYPE "job"."EarlyReleaseResolution" AS ENUM ('APPROVED', 'REJECTED', 'AUTO_APPROVED');

ALTER TYPE "job"."AssignmentStatus" ADD VALUE 'EARLY_RELEASE_REQUESTED' AFTER 'ON_SITE';

ALTER TABLE "job"."job_assignments"
  ADD COLUMN "early_release_requested_at" TIMESTAMP(3),
  ADD COLUMN "early_release_reason" VARCHAR(500),
  ADD COLUMN "early_release_resolved_at" TIMESTAMP(3),
  ADD COLUMN "early_release_resolution" "job"."EarlyReleaseResolution",
  ADD COLUMN "early_release_auto_approve_at" TIMESTAMP(3);

CREATE INDEX "job_assignments_early_release_auto_approve_idx"
  ON "job"."job_assignments"("status", "early_release_auto_approve_at");

ALTER TABLE "job"."jobs"
  ADD COLUMN "billing_allow_early_release" BOOLEAN,
  ADD COLUMN "billing_proration_enabled" BOOLEAN,
  ADD COLUMN "billing_early_release_requires_client_approval" BOOLEAN,
  ADD COLUMN "billing_auto_approve_after_minutes" SMALLINT;
