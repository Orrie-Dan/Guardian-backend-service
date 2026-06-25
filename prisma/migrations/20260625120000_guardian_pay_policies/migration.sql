-- Guardian pay policies + assignment snapshots + earning breakdown

CREATE TYPE "billing"."PayPolicyModel" AS ENUM ('ACTUAL_TIME', 'MINIMUM_GUARANTEED');

CREATE TABLE "billing"."pay_policies" (
    "id" UUID NOT NULL,
    "priority" SMALLINT NOT NULL,
    "job_type" "job"."JobType",
    "employment_type" "guardian"."EmploymentType",
    "valid_from" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" DATE,
    "model" "billing"."PayPolicyModel" NOT NULL,
    "minimum_hours" DECIMAL(6,2) NOT NULL DEFAULT 1,
    "apply_on_early_release" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "pay_policies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pay_policies_priority_idx" ON "billing"."pay_policies"("priority" DESC);

ALTER TABLE "job"."job_assignments"
    ADD COLUMN "pay_policy_model" "billing"."PayPolicyModel",
    ADD COLUMN "pay_minimum_hours" DECIMAL(6,2),
    ADD COLUMN "pay_policy_resolved_at" TIMESTAMP(3),
    ADD COLUMN "hourly_pay_rate_at_commit" DECIMAL(10,2),
    ADD COLUMN "pay_apply_on_early_release" BOOLEAN;

ALTER TABLE "billing"."guardian_earnings"
    ADD COLUMN "actual_hours" DECIMAL(8,4),
    ADD COLUMN "scheduled_hours" DECIMAL(8,4),
    ADD COLUMN "pay_minimum_hours" DECIMAL(6,2),
    ADD COLUMN "pay_policy_model" "billing"."PayPolicyModel",
    ADD COLUMN "pay_basis" VARCHAR(40);

-- Platform default: MINIMUM_GUARANTEED, 1-hour minimum pay floor
INSERT INTO "billing"."pay_policies" (
    "id",
    "priority",
    "job_type",
    "employment_type",
    "model",
    "minimum_hours",
    "apply_on_early_release"
) VALUES (
    '00000000-0000-4000-8000-000000000300',
    1,
    NULL,
    NULL,
    'MINIMUM_GUARANTEED',
    1,
    true
);
