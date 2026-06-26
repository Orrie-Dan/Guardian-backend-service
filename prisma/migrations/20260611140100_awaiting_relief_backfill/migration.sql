-- Backfill departing guardians to AWAITING_RELIEF (separate migration: enum must commit first).

UPDATE "job"."job_assignments"
SET status = 'AWAITING_RELIEF'
WHERE status = 'ON_SITE'
  AND replacement_resolution = 'APPROVED'
  AND job_id IN (SELECT id FROM "job"."jobs" WHERE status = 'SEEKING_REPLACEMENT');
