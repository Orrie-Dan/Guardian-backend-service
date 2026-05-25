-- Guardian onboarding and auth schema changes

CREATE TYPE "identity"."Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');

ALTER TABLE "identity"."users"
  ADD COLUMN "full_name" VARCHAR(200),
  ADD COLUMN "date_of_birth" DATE,
  ADD COLUMN "gender" "identity"."Gender",
  ADD COLUMN "profile_photo_document_id" UUID,
  ADD COLUMN "password_set_at" TIMESTAMP(3);

ALTER TABLE "identity"."users"
  ADD CONSTRAINT "users_profile_photo_document_id_fkey"
  FOREIGN KEY ("profile_photo_document_id") REFERENCES "system"."document_storage"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TYPE "guardian"."CertificationVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED');
CREATE TYPE "guardian"."PreferredShift" AS ENUM ('DAY', 'NIGHT', 'BOTH');
CREATE TYPE "guardian"."GuardianSpecialization" AS ENUM (
  'PATROL', 'ESCORT', 'EVENT_SECURITY', 'DOOR_SUPERVISION',
  'VIP_PROTECTION', 'EMERGENCY_RESPONSE', 'COMPOUND_SECURITY', 'STATIC_POST'
);

ALTER TYPE "guardian"."CertificationType" ADD VALUE IF NOT EXISTS 'RNP_SECURITY_LICENSE';

ALTER TABLE "guardian"."guardians"
  ADD COLUMN "sector_base" VARCHAR(100),
  ADD COLUMN "coverage_districts" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "years_experience" SMALLINT,
  ADD COLUMN "previous_employers" JSONB,
  ADD COLUMN "specializations" "guardian"."GuardianSpecialization"[] NOT NULL DEFAULT ARRAY[]::"guardian"."GuardianSpecialization"[],
  ADD COLUMN "preferred_shift" "guardian"."PreferredShift",
  ADD COLUMN "reserve_force_number_hash" TEXT,
  ADD COLUMN "activated_at" TIMESTAMP(3),
  ADD COLUMN "activated_by" UUID;

ALTER TABLE "guardian"."guardians" ALTER COLUMN "status" SET DEFAULT 'INACTIVE';

ALTER TABLE "guardian"."guardians"
  ADD CONSTRAINT "guardians_activated_by_fkey"
  FOREIGN KEY ("activated_by") REFERENCES "identity"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "guardian"."guardian_vetting_records" (
  "id" UUID NOT NULL,
  "guardian_id" UUID NOT NULL,
  "vetted_at" TIMESTAMP(3) NOT NULL,
  "vetted_by_user_id" UUID NOT NULL,
  "rnp_reference_number" VARCHAR(100),
  "clearance_document_id" UUID,
  "reserve_force_verified" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "guardian_vetting_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guardian_vetting_records_guardian_id_key" ON "guardian"."guardian_vetting_records"("guardian_id");

ALTER TABLE "guardian"."guardian_vetting_records"
  ADD CONSTRAINT "guardian_vetting_records_guardian_id_fkey"
  FOREIGN KEY ("guardian_id") REFERENCES "guardian"."guardians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "guardian"."guardian_vetting_records"
  ADD CONSTRAINT "guardian_vetting_records_vetted_by_user_id_fkey"
  FOREIGN KEY ("vetted_by_user_id") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "guardian"."guardian_vetting_records"
  ADD CONSTRAINT "guardian_vetting_records_clearance_document_id_fkey"
  FOREIGN KEY ("clearance_document_id") REFERENCES "system"."document_storage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Migrate certification verification status to new enum
ALTER TABLE "guardian"."certifications"
  ALTER COLUMN "verification_status" DROP DEFAULT;

ALTER TABLE "guardian"."certifications"
  ALTER COLUMN "verification_status" TYPE "guardian"."CertificationVerificationStatus"
  USING ("verification_status"::text::"guardian"."CertificationVerificationStatus");

ALTER TABLE "guardian"."certifications"
  ALTER COLUMN "verification_status" SET DEFAULT 'PENDING';
