-- Billing policy + job confirmation gate + invoice breakdown

CREATE TYPE "billing"."BillingPolicyModel" AS ENUM ('BOOKED_BLOCK', 'ACTUAL_TIME', 'MINIMUM_GUARANTEED');

ALTER TYPE "job"."JobStatus" ADD VALUE 'AWAITING_CONFIRMATION' BEFORE 'COMPLETED';

CREATE TABLE "billing"."billing_policies" (
    "id" UUID NOT NULL,
    "priority" SMALLINT NOT NULL,
    "organization_id" UUID,
    "job_type" "job"."JobType",
    "valid_from" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" DATE,
    "model" "billing"."BillingPolicyModel" NOT NULL,
    "minimum_hours" DECIMAL(6,2) NOT NULL DEFAULT 2,
    "proration_enabled" BOOLEAN NOT NULL DEFAULT true,
    "allow_early_release" BOOLEAN NOT NULL DEFAULT false,
    "early_release_requires_client_approval" BOOLEAN NOT NULL DEFAULT true,
    "auto_approve_after_minutes" SMALLINT,

    CONSTRAINT "billing_policies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "billing_policies_priority_idx" ON "billing"."billing_policies"("priority" DESC);

ALTER TABLE "billing"."billing_policies" ADD CONSTRAINT "billing_policies_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "customer"."organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "job"."jobs" ADD COLUMN "billing_policy_model" "billing"."BillingPolicyModel",
    ADD COLUMN "billing_minimum_hours" DECIMAL(6,2),
    ADD COLUMN "billing_policy_resolved_at" TIMESTAMP(3);

ALTER TABLE "billing"."invoices" ADD COLUMN "scheduled_start_at" TIMESTAMP(3),
    ADD COLUMN "scheduled_end_at" TIMESTAMP(3),
    ADD COLUMN "arrived_at" TIMESTAMP(3),
    ADD COLUMN "completed_at" TIMESTAMP(3),
    ADD COLUMN "scheduled_hours" DECIMAL(8,4),
    ADD COLUMN "actual_hours" DECIMAL(8,4),
    ADD COLUMN "billable_hours" DECIMAL(8,4),
    ADD COLUMN "billing_basis" VARCHAR(40),
    ADD COLUMN "billing_policy_model" VARCHAR(40),
    ADD COLUMN "line_items" JSONB;

-- Platform default: MINIMUM_GUARANTEED, 2-hour minimum
INSERT INTO "billing"."billing_policies" (
    "id",
    "priority",
    "organization_id",
    "job_type",
    "valid_from",
    "model",
    "minimum_hours",
    "proration_enabled",
    "allow_early_release",
    "early_release_requires_client_approval"
) VALUES (
    '00000000-0000-4000-8000-000000000200',
    1,
    NULL,
    NULL,
    CURRENT_DATE,
    'MINIMUM_GUARANTEED',
    2,
    true,
    false,
    true
);
