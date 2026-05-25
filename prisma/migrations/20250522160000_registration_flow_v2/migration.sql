-- Registration flow v2: onboarding progress, org rejection, location precision

CREATE TYPE "identity"."OnboardingStep" AS ENUM (
  'PHONE_VERIFIED',
  'PROFILE_COMPLETE',
  'DOCUMENTS_UPLOADED',
  'PAYMENT_COMPLETE',
  'SUBMITTED'
);

ALTER TABLE "identity"."users"
  ADD COLUMN "onboarding_step" "identity"."OnboardingStep",
  ADD COLUMN "onboarding_completed_at" TIMESTAMP(3);

ALTER TABLE "customer"."organizations"
  ADD COLUMN "verification_rejection_reason" VARCHAR(500),
  ADD COLUMN "application_submitted_at" TIMESTAMP(3);

CREATE TYPE "customer"."CoordinatePrecision" AS ENUM ('DISTRICT_APPROX', 'USER_PINNED');

ALTER TABLE "customer"."locations"
  ADD COLUMN "coordinate_precision" "customer"."CoordinatePrecision" NOT NULL DEFAULT 'DISTRICT_APPROX',
  ADD COLUMN "is_primary" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "site_setup_completed_at" TIMESTAMP(3);

-- Legacy locations treated as site setup complete
UPDATE "customer"."locations"
SET
  "coordinate_precision" = 'USER_PINNED',
  "site_setup_completed_at" = COALESCE("site_setup_completed_at", "created_at")
WHERE "coordinate_precision" = 'DISTRICT_APPROX';
