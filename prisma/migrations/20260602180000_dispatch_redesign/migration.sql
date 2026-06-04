-- Production dispatch redesign: counters, failure reason, audit log, districts reference.

ALTER TABLE job.jobs
  ADD COLUMN dispatch_started_at TIMESTAMPTZ,
  ADD COLUMN offers_sent_count INT NOT NULL DEFAULT 0,
  ADD COLUMN dispatch_failure_reason VARCHAR(64),
  ADD COLUMN unreachable_since TIMESTAMPTZ;

UPDATE job.jobs
SET
  offers_sent_count = dispatch_attempts,
  dispatch_started_at = COALESCE(dispatch_started_at, created_at)
WHERE status IN ('PENDING', 'DISPATCHING');

CREATE TABLE job.dispatch_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES job.jobs(id) ON DELETE CASCADE,
  pass SMALLINT NOT NULL DEFAULT 0,
  event VARCHAR(80) NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX dispatch_audit_logs_job_id_created_at_idx
  ON job.dispatch_audit_logs (job_id, created_at DESC);

-- District reference (normalized codes for dispatch matching).
CREATE SCHEMA IF NOT EXISTS reference;

CREATE TABLE reference.districts (
  code VARCHAR(100) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}'
);

INSERT INTO reference.districts (code, name, aliases) VALUES
  ('gasabo', 'Gasabo', ARRAY['Gasabo', 'GASABO']),
  ('kicukiro', 'Kicukiro', ARRAY['Kicukiro', 'KICUKIRO']),
  ('nyarugenge', 'Nyarugenge', ARRAY['Nyarugenge', 'NYARUGENGE'])
ON CONFLICT (code) DO NOTHING;
