-- AWAITING_RELIEF: departing guardian stays on site waiting for substitute after ops approval.
--
-- Deploy runbook (run during low traffic):
-- 1) Dry run:
--    SELECT COUNT(*) FROM "job"."job_assignments"
--    WHERE status = 'ON_SITE'
--      AND replacement_resolution = 'APPROVED'
--      AND job_id IN (SELECT id FROM "job"."jobs" WHERE status = 'SEEKING_REPLACEMENT');
-- 2) Apply migration, then verify backfill count matches dry run.

ALTER TYPE "job"."AssignmentStatus" ADD VALUE 'AWAITING_RELIEF' AFTER 'REPLACEMENT_REQUESTED';

UPDATE "job"."job_assignments"
SET status = 'AWAITING_RELIEF'
WHERE status = 'ON_SITE'
  AND replacement_resolution = 'APPROVED'
  AND job_id IN (SELECT id FROM "job"."jobs" WHERE status = 'SEEKING_REPLACEMENT');
