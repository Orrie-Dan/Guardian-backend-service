-- Optional: convert high-volume tables to monthly partitions (run manually after v1 migration).
-- Prisma models must keep canonical table names; use views or migrate in maintenance window.

-- Example for guardian.location_history:
-- ALTER TABLE guardian.location_history RENAME TO location_history_old;
-- CREATE TABLE guardian.location_history (...) PARTITION BY RANGE (recorded_at);
-- CREATE TABLE guardian.location_history_2025_05 PARTITION OF guardian.location_history
--   FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');
