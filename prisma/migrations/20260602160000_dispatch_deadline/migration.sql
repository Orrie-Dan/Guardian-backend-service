-- Dispatch window: fail jobs that cannot find a guardian within the deadline.
ALTER TABLE job.jobs
  ADD COLUMN dispatch_deadline_at TIMESTAMPTZ;

-- Backfill active dispatch searches so existing rows are not stuck indefinitely.
UPDATE job.jobs
SET dispatch_deadline_at = created_at + INTERVAL '10 minutes'
WHERE status IN ('PENDING', 'DISPATCHING')
  AND dispatch_deadline_at IS NULL;

CREATE INDEX jobs_status_dispatch_deadline_idx
  ON job.jobs (status, dispatch_deadline_at);
