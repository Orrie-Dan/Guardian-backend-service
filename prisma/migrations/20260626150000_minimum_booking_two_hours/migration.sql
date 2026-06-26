-- Restore 2-hour minimum booking for clients and platform billing

UPDATE "billing"."booking_settings"
SET "minimum_booking_hours" = 2
WHERE "minimum_booking_hours" < 2;

UPDATE "billing"."billing_policies"
SET "minimum_hours" = 2
WHERE "organization_id" IS NULL AND "job_type" IS NULL AND "minimum_hours" < 2;

ALTER TABLE "billing"."booking_settings"
  ALTER COLUMN "minimum_booking_hours" SET DEFAULT 2;
