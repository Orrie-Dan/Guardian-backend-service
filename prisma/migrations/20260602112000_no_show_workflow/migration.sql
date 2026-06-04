-- CreateEnum
CREATE TYPE "job"."NoShowTriggerType" AS ENUM ('MANUAL', 'SYSTEM');

-- AlterTable
ALTER TABLE "job"."job_assignments"
ADD COLUMN "no_show_reason_code" VARCHAR(64),
ADD COLUMN "no_show_trigger_type" "job"."NoShowTriggerType",
ADD COLUMN "no_show_reported_by_user_id" UUID,
ADD COLUMN "no_show_reported_by_role" VARCHAR(40),
ADD COLUMN "no_show_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "job_assignments_status_accepted_at_idx"
ON "job"."job_assignments"("status", "accepted_at");

-- CreateIndex
CREATE INDEX "job_assignments_status_no_show_at_idx"
ON "job"."job_assignments"("status", "no_show_at");
