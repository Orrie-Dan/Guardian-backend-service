-- Service catalog, booking settings, and revised job types

CREATE TYPE "job"."JobType_new" AS ENUM (
  'STANDARD_GUARDIAN',
  'CORPORATE_GUARDIAN',
  'EVENT_GUARDIAN',
  'CHILD_ESCORT_GUARDIAN',
  'MEDICAL_ESCORT_GUARDIAN',
  'EXECUTIVE_VIP_GUARDIAN',
  'ARMED_GUARDIAN'
);

CREATE TYPE "guardian"."GuardianSpecialization_new" AS ENUM (
  'STANDARD_GUARDIAN',
  'CORPORATE_GUARDIAN',
  'EVENT_GUARDIAN',
  'CHILD_ESCORT_GUARDIAN',
  'MEDICAL_ESCORT_GUARDIAN',
  'EXECUTIVE_VIP_GUARDIAN',
  'ARMED_GUARDIAN'
);

CREATE OR REPLACE FUNCTION "job"."map_job_type"(old_value text) RETURNS text AS $$
BEGIN
  RETURN CASE old_value
    WHEN 'PATROL' THEN 'STANDARD_GUARDIAN'
    WHEN 'ESCORT' THEN 'CHILD_ESCORT_GUARDIAN'
    WHEN 'EVENT_SECURITY' THEN 'EVENT_GUARDIAN'
    WHEN 'DOOR_SUPERVISION' THEN 'CORPORATE_GUARDIAN'
    WHEN 'VIP_PROTECTION' THEN 'EXECUTIVE_VIP_GUARDIAN'
    WHEN 'EMERGENCY_RESPONSE' THEN 'MEDICAL_ESCORT_GUARDIAN'
    WHEN 'COMPOUND_SECURITY' THEN 'CORPORATE_GUARDIAN'
    WHEN 'STATIC_POST' THEN 'STANDARD_GUARDIAN'
    ELSE old_value
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION "guardian"."migrate_specializations"(
  old_specs "guardian"."GuardianSpecialization"[]
) RETURNS "guardian"."GuardianSpecialization_new"[] AS $$
DECLARE
  result "guardian"."GuardianSpecialization_new"[] := ARRAY[]::"guardian"."GuardianSpecialization_new"[];
  elem text;
BEGIN
  IF old_specs IS NULL THEN
    RETURN NULL;
  END IF;
  FOREACH elem IN ARRAY old_specs::text[]
  LOOP
    result := array_append(
      result,
      ("job"."map_job_type"(elem))::"guardian"."GuardianSpecialization_new"
    );
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

ALTER TABLE "job"."jobs"
  ALTER COLUMN "job_type" TYPE "job"."JobType_new"
  USING ("job"."map_job_type"("job_type"::text))::"job"."JobType_new";

ALTER TABLE "billing"."billing_policies"
  ALTER COLUMN "job_type" TYPE "job"."JobType_new"
  USING (
    CASE WHEN "job_type" IS NULL THEN NULL
    ELSE ("job"."map_job_type"("job_type"::text))::"job"."JobType_new"
    END
  );

ALTER TABLE "billing"."pay_policies"
  ALTER COLUMN "job_type" TYPE "job"."JobType_new"
  USING (
    CASE WHEN "job_type" IS NULL THEN NULL
    ELSE ("job"."map_job_type"("job_type"::text))::"job"."JobType_new"
    END
  );

ALTER TABLE "billing"."pricing_rules"
  ALTER COLUMN "job_type" TYPE "job"."JobType_new"
  USING (
    CASE WHEN "job_type" IS NULL THEN NULL
    ELSE ("job"."map_job_type"("job_type"::text))::"job"."JobType_new"
    END
  );

ALTER TABLE "analytics"."job_facts_daily"
  ALTER COLUMN "job_type" TYPE "job"."JobType_new"
  USING ("job"."map_job_type"("job_type"::text))::"job"."JobType_new";

ALTER TABLE "guardian"."guardians"
  ALTER COLUMN "specializations" DROP DEFAULT;

ALTER TABLE "guardian"."guardians"
  ALTER COLUMN "specializations" TYPE "guardian"."GuardianSpecialization_new"[]
  USING "guardian"."migrate_specializations"("specializations");

ALTER TABLE "guardian"."guardians"
  ALTER COLUMN "specializations" SET DEFAULT ARRAY[]::"guardian"."GuardianSpecialization_new"[];

DROP TYPE "job"."JobType";
ALTER TYPE "job"."JobType_new" RENAME TO "JobType";

DROP FUNCTION "guardian"."migrate_specializations"("guardian"."GuardianSpecialization"[]);
DROP TYPE "guardian"."GuardianSpecialization";
ALTER TYPE "guardian"."GuardianSpecialization_new" RENAME TO "GuardianSpecialization";

DROP FUNCTION "job"."map_job_type"(text);

CREATE TABLE IF NOT EXISTS "billing"."services" (
  "id" UUID NOT NULL,
  "code" "job"."JobType" NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" TEXT,
  "hourly_rate" DECIMAL(10,2) NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'RWF',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "requires_license" BOOLEAN NOT NULL DEFAULT false,
  "sort_order" SMALLINT NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "services_code_key" ON "billing"."services"("code");

CREATE TABLE IF NOT EXISTS "billing"."booking_settings" (
  "id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  "minimum_booking_hours" DECIMAL(6,2) NOT NULL DEFAULT 1,
  "night_surcharge_min_pct" DECIMAL(5,4) NOT NULL DEFAULT 0.10,
  "night_surcharge_max_pct" DECIMAL(5,4) NOT NULL DEFAULT 0.20,
  "holiday_surcharge_min_pct" DECIMAL(5,4) NOT NULL DEFAULT 0.20,
  "holiday_surcharge_max_pct" DECIMAL(5,4) NOT NULL DEFAULT 0.30,
  "guardian_share_pct" DECIMAL(5,4) NOT NULL DEFAULT 0.80,
  "platform_share_pct" DECIMAL(5,4) NOT NULL DEFAULT 0.15,
  "gateway_share_pct" DECIMAL(5,4) NOT NULL DEFAULT 0.03,
  "reserve_share_pct" DECIMAL(5,4) NOT NULL DEFAULT 0.02,
  "vat_rate" DECIMAL(5,4) NOT NULL DEFAULT 0.18,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "booking_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "billing"."booking_settings" ("id", "updated_at")
VALUES ('00000000-0000-4000-8000-000000000001', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "billing"."services" (
  "id", "code", "name", "description", "hourly_rate", "requires_license", "sort_order", "updated_at"
) VALUES
  ('00000000-0000-4000-8000-000000001001', 'STANDARD_GUARDIAN', 'Standard Guardian', 'General-purpose on-site security and patrol coverage.', 5000, false, 1, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000001002', 'CORPORATE_GUARDIAN', 'Corporate Guardian', 'Professional security for offices, compounds, and corporate sites.', 7500, false, 2, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000001003', 'EVENT_GUARDIAN', 'Event Guardian', 'Crowd and perimeter security for events and gatherings.', 8000, false, 3, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000001004', 'CHILD_ESCORT_GUARDIAN', 'Child Escort Guardian', 'Safe escort for children to and from school or activities.', 6000, false, 4, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000001005', 'MEDICAL_ESCORT_GUARDIAN', 'Medical Escort Guardian', 'Escort and standby support for medical appointments and transfers.', 7000, false, 5, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000001006', 'EXECUTIVE_VIP_GUARDIAN', 'Executive / VIP Guardian', 'Close protection and VIP escort services.', 12000, false, 6, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000001007', 'ARMED_GUARDIAN', 'Armed Guardian', 'Licensed armed security (RNP license required).', 15000, true, 7, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

UPDATE "billing"."billing_policies"
SET "minimum_hours" = 1
WHERE "minimum_hours" > 1 AND "organization_id" IS NULL AND "job_type" IS NULL;
