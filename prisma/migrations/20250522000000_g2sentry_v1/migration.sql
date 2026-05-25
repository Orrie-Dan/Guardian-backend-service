-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "analytics";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "audit";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "billing";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "customer";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "guardian";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "identity";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "job";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "system";

-- CreateEnum
CREATE TYPE "identity"."UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION', 'DELETED');

-- CreateEnum
CREATE TYPE "identity"."RoleCode" AS ENUM ('SUPER_ADMIN', 'OPS_ADMIN', 'CLIENT_OWNER', 'CLIENT_STAFF', 'GUARDIAN');

-- CreateEnum
CREATE TYPE "customer"."OrgType" AS ENUM ('BAR', 'HOTEL', 'EVENT_COMPANY', 'NGO', 'SCHOOL', 'RESTAURANT', 'INDIVIDUAL', 'COMPOUND', 'LOGISTICS', 'OTHER');

-- CreateEnum
CREATE TYPE "customer"."VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "customer"."OrgStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "customer"."OrgMemberRole" AS ENUM ('CLIENT_OWNER', 'CLIENT_STAFF');

-- CreateEnum
CREATE TYPE "guardian"."EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'RESERVE');

-- CreateEnum
CREATE TYPE "guardian"."GuardianStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "guardian"."ShiftStatus" AS ENUM ('AVAILABLE', 'BUSY', 'PAUSED', 'OFF_DUTY', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "guardian"."CertificationType" AS ENUM ('FIRST_AID', 'CROWD_CONTROL', 'FIREARM', 'RESERVE_FORCE');

-- CreateEnum
CREATE TYPE "guardian"."GuardianVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "job"."JobType" AS ENUM ('PATROL', 'ESCORT', 'EVENT_SECURITY', 'DOOR_SUPERVISION', 'VIP_PROTECTION', 'EMERGENCY_RESPONSE', 'COMPOUND_SECURITY', 'STATIC_POST');

-- CreateEnum
CREATE TYPE "job"."JobPriority" AS ENUM ('STANDARD', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "job"."JobStatus" AS ENUM ('PENDING', 'DISPATCHING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "job"."AssignmentStatus" AS ENUM ('OFFERED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'EN_ROUTE', 'ON_SITE', 'COMPLETED', 'NO_SHOW', 'CANCELLED');

-- CreateEnum
CREATE TYPE "job"."IncidentType" AS ENUM ('FIGHT', 'TRESPASSING', 'THEFT_ATTEMPT', 'PROPERTY_DAMAGE', 'CUSTOMER_DISPUTE', 'MEDICAL_ASSIST', 'SUSPICIOUS_ACTIVITY', 'OTHER');

-- CreateEnum
CREATE TYPE "job"."IncidentSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "billing"."PricingModel" AS ENUM ('HOURLY', 'FLAT', 'TIERED');

-- CreateEnum
CREATE TYPE "billing"."InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'VOID');

-- CreateEnum
CREATE TYPE "billing"."PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "billing"."PaymentProvider" AS ENUM ('MOMO_MTN', 'AIRTEL_MONEY', 'BANK_TRANSFER', 'CASH');

-- CreateEnum
CREATE TYPE "system"."OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "system"."NotificationChannel" AS ENUM ('PUSH', 'IN_APP', 'SMS', 'EMAIL');

-- CreateTable
CREATE TABLE "identity"."roles" (
    "id" SMALLSERIAL NOT NULL,
    "code" "identity"."RoleCode" NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."users" (
    "id" UUID NOT NULL,
    "phone_number" VARCHAR(20) NOT NULL,
    "email" VARCHAR(254),
    "password_hash" TEXT,
    "status" "identity"."UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_phone_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_email_verified" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" SMALLINT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by" UUID,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "identity"."otp_sessions" (
    "id" UUID NOT NULL,
    "phone_number" VARCHAR(20) NOT NULL,
    "otp_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" SMALLINT NOT NULL DEFAULT 0,
    "verified_at" TIMESTAMP(3),
    "ip_address" TEXT,
    "device_fingerprint" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "jti" TEXT NOT NULL,
    "family_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer"."organizations" (
    "id" UUID NOT NULL,
    "legal_name" VARCHAR(200) NOT NULL,
    "trading_name" VARCHAR(200),
    "tin_number" VARCHAR(20),
    "org_type" "customer"."OrgType" NOT NULL,
    "verification_status" "customer"."VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "status" "customer"."OrgStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer"."organization_users" (
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "customer"."OrgMemberRole" NOT NULL,
    "invited_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_users_pkey" PRIMARY KEY ("organization_id","user_id")
);

-- CreateTable
CREATE TABLE "customer"."locations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "district" VARCHAR(100) NOT NULL,
    "sector" VARCHAR(100),
    "cell" VARCHAR(100),
    "village" VARCHAR(100),
    "address" TEXT,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "operating_hours" JSONB,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardian"."guardians" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "guardian_code" VARCHAR(20) NOT NULL,
    "national_id_hash" TEXT NOT NULL,
    "verification_status" "guardian"."GuardianVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "employment_type" "guardian"."EmploymentType" NOT NULL DEFAULT 'PART_TIME',
    "status" "guardian"."GuardianStatus" NOT NULL DEFAULT 'ACTIVE',
    "rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "reliability_score" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "avg_response_minutes" DECIMAL(6,2),
    "district_base" VARCHAR(100) NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardian"."guardian_shift_state" (
    "guardian_id" UUID NOT NULL,
    "shift_status" "guardian"."ShiftStatus" NOT NULL DEFAULT 'OFF_DUTY',
    "available_for_jobs" BOOLEAN NOT NULL DEFAULT false,
    "shift_started_at" TIMESTAMP(3),
    "shift_ends_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guardian_shift_state_pkey" PRIMARY KEY ("guardian_id")
);

-- CreateTable
CREATE TABLE "guardian"."certifications" (
    "id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "certification_type" "guardian"."CertificationType" NOT NULL,
    "issuer" VARCHAR(200) NOT NULL,
    "issue_date" DATE NOT NULL,
    "expiry_date" DATE,
    "document_id" UUID,
    "verification_status" "guardian"."GuardianVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardian"."location_history" (
    "id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "speed" DECIMAL(6,2),
    "battery_level" SMALLINT,
    "recorded_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "location_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job"."jobs" (
    "id" UUID NOT NULL,
    "reference_number" VARCHAR(20) NOT NULL,
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "job_type" "job"."JobType" NOT NULL,
    "priority" "job"."JobPriority" NOT NULL DEFAULT 'STANDARD',
    "status" "job"."JobStatus" NOT NULL DEFAULT 'PENDING',
    "requested_guardian_count" SMALLINT NOT NULL DEFAULT 1,
    "scheduled_start" TIMESTAMP(3) NOT NULL,
    "scheduled_end" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "special_instructions" TEXT,
    "dispatch_attempts" INTEGER NOT NULL DEFAULT 0,
    "max_dispatch_attempts" INTEGER NOT NULL DEFAULT 3,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job"."job_assignments" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "assignment_round" SMALLINT NOT NULL DEFAULT 1,
    "status" "job"."AssignmentStatus" NOT NULL DEFAULT 'OFFERED',
    "version_number" INTEGER NOT NULL DEFAULT 1,
    "offer_sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "arrived_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "no_show_reason" TEXT,

    CONSTRAINT "job_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job"."job_status_history" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "old_status" "job"."JobStatus",
    "new_status" "job"."JobStatus" NOT NULL,
    "changed_by" UUID,
    "reason" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job"."field_incidents" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "incident_type" "job"."IncidentType" NOT NULL,
    "severity" "job"."IncidentSeverity" NOT NULL DEFAULT 'LOW',
    "description" TEXT NOT NULL,
    "media_ids" UUID[],
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing"."pricing_rules" (
    "id" UUID NOT NULL,
    "priority" SMALLINT NOT NULL,
    "organization_id" UUID,
    "district" VARCHAR(100),
    "job_type" "job"."JobType",
    "valid_from" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" DATE,
    "pricing_model" "billing"."PricingModel" NOT NULL,
    "hourly_rate" DECIMAL(10,2),
    "flat_fee" DECIMAL(10,2),
    "weekend_multiplier" DECIMAL(4,2) NOT NULL DEFAULT 1,
    "night_multiplier" DECIMAL(4,2) NOT NULL DEFAULT 1,
    "currency" CHAR(3) NOT NULL DEFAULT 'RWF',

    CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing"."invoices" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'RWF',
    "status" "billing"."InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issued_at" TIMESTAMP(3),
    "due_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing"."payments" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "provider" "billing"."PaymentProvider" NOT NULL,
    "external_txn_id" VARCHAR(200),
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'RWF',
    "status" "billing"."PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "idempotency_key" VARCHAR(100) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing"."ebm_receipts" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "receipt_number" VARCHAR(100) NOT NULL,
    "qr_payload" TEXT NOT NULL,
    "raw_response" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ebm_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit"."audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entity_type" VARCHAR(60) NOT NULL,
    "entity_id" UUID NOT NULL,
    "before_state" JSONB,
    "after_state" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics"."job_facts_daily" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "district" VARCHAR(100) NOT NULL,
    "job_type" "job"."JobType" NOT NULL,
    "hour_of_day" SMALLINT,
    "job_count" INTEGER NOT NULL DEFAULT 0,
    "completed_count" INTEGER NOT NULL DEFAULT 0,
    "cancelled_count" INTEGER NOT NULL DEFAULT 0,
    "avg_response_minutes" DECIMAL(8,2),
    "total_revenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_facts_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics"."guardian_performance_daily" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "guardian_id" UUID NOT NULL,
    "jobs_assigned" SMALLINT NOT NULL DEFAULT 0,
    "jobs_completed" SMALLINT NOT NULL DEFAULT 0,
    "no_show_count" SMALLINT NOT NULL DEFAULT 0,
    "completion_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "avg_response_minutes" DECIMAL(8,2),
    "avg_rating" DECIMAL(3,2),
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guardian_performance_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system"."outbox_events" (
    "id" UUID NOT NULL,
    "aggregate_type" VARCHAR(60) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "event_type" VARCHAR(80) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "system"."OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "retries" SMALLINT NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "scheduled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system"."document_storage" (
    "id" UUID NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "encrypted" BOOLEAN NOT NULL DEFAULT true,
    "uploaded_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_storage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system"."notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "channel" "system"."NotificationChannel" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "identity"."roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_number_key" ON "identity"."users"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "identity"."users"("email");

-- CreateIndex
CREATE INDEX "otp_sessions_phone_number_created_at_idx" ON "identity"."otp_sessions"("phone_number", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_jti_key" ON "identity"."refresh_tokens"("jti");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_revoked_at_idx" ON "identity"."refresh_tokens"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "identity"."refresh_tokens"("family_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_tin_number_key" ON "customer"."organizations"("tin_number");

-- CreateIndex
CREATE INDEX "locations_organization_id_idx" ON "customer"."locations"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "guardians_user_id_key" ON "guardian"."guardians"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "guardians_guardian_code_key" ON "guardian"."guardians"("guardian_code");

-- CreateIndex
CREATE INDEX "location_history_guardian_id_recorded_at_idx" ON "guardian"."location_history"("guardian_id", "recorded_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "jobs_reference_number_key" ON "job"."jobs"("reference_number");

-- CreateIndex
CREATE INDEX "jobs_status_created_at_idx" ON "job"."jobs"("status", "created_at");

-- CreateIndex
CREATE INDEX "jobs_organization_id_status_idx" ON "job"."jobs"("organization_id", "status");

-- CreateIndex
CREATE INDEX "job_assignments_job_id_status_idx" ON "job"."job_assignments"("job_id", "status");

-- CreateIndex
CREATE INDEX "job_assignments_guardian_id_status_idx" ON "job"."job_assignments"("guardian_id", "status");

-- CreateIndex
CREATE INDEX "job_assignments_status_expires_at_idx" ON "job"."job_assignments"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "job_assignments_job_id_guardian_id_assignment_round_key" ON "job"."job_assignments"("job_id", "guardian_id", "assignment_round");

-- CreateIndex
CREATE INDEX "job_status_history_job_id_changed_at_idx" ON "job"."job_status_history"("job_id", "changed_at" DESC);

-- CreateIndex
CREATE INDEX "pricing_rules_priority_idx" ON "billing"."pricing_rules"("priority" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_job_id_key" ON "billing"."invoices"("job_id");

-- CreateIndex
CREATE INDEX "invoices_organization_id_status_idx" ON "billing"."invoices"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "billing"."payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_status_created_at_idx" ON "billing"."payments"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ebm_receipts_invoice_id_key" ON "billing"."ebm_receipts"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "ebm_receipts_receipt_number_key" ON "billing"."ebm_receipts"("receipt_number");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit"."audit_logs"("actor_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit"."audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_facts_daily_date_district_job_type_hour_of_day_key" ON "analytics"."job_facts_daily"("date", "district", "job_type", "hour_of_day");

-- CreateIndex
CREATE UNIQUE INDEX "guardian_performance_daily_date_guardian_id_key" ON "analytics"."guardian_performance_daily"("date", "guardian_id");

-- CreateIndex
CREATE INDEX "outbox_events_status_scheduled_at_idx" ON "system"."outbox_events"("status", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "document_storage_storage_key_key" ON "system"."document_storage"("storage_key");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "system"."notifications"("user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "identity"."user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "identity"."roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."user_roles" ADD CONSTRAINT "user_roles_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "identity"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer"."organization_users" ADD CONSTRAINT "organization_users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "customer"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer"."organization_users" ADD CONSTRAINT "organization_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer"."organization_users" ADD CONSTRAINT "organization_users_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "identity"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer"."locations" ADD CONSTRAINT "locations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "customer"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian"."guardians" ADD CONSTRAINT "guardians_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian"."guardian_shift_state" ADD CONSTRAINT "guardian_shift_state_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardian"."guardians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian"."certifications" ADD CONSTRAINT "certifications_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardian"."guardians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian"."certifications" ADD CONSTRAINT "certifications_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "system"."document_storage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian"."location_history" ADD CONSTRAINT "location_history_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardian"."guardians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job"."jobs" ADD CONSTRAINT "jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "customer"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job"."jobs" ADD CONSTRAINT "jobs_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "customer"."locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job"."jobs" ADD CONSTRAINT "jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job"."job_assignments" ADD CONSTRAINT "job_assignments_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job"."jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job"."job_assignments" ADD CONSTRAINT "job_assignments_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardian"."guardians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job"."job_status_history" ADD CONSTRAINT "job_status_history_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job"."jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job"."field_incidents" ADD CONSTRAINT "field_incidents_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "job"."job_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job"."field_incidents" ADD CONSTRAINT "field_incidents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."pricing_rules" ADD CONSTRAINT "pricing_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "customer"."organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."invoices" ADD CONSTRAINT "invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "customer"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."invoices" ADD CONSTRAINT "invoices_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job"."jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "billing"."invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."ebm_receipts" ADD CONSTRAINT "ebm_receipts_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "billing"."invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit"."audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "identity"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics"."guardian_performance_daily" ADD CONSTRAINT "guardian_performance_daily_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardian"."guardians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system"."document_storage" ADD CONSTRAINT "document_storage_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "identity"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system"."notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- PostGIS coordinates on locations
ALTER TABLE "customer"."locations"
  ADD COLUMN IF NOT EXISTS "coordinates" geometry(Point, 4326);

UPDATE "customer"."locations"
SET "coordinates" = ST_SetSRID(ST_MakePoint("longitude"::float, "latitude"::float), 4326)
WHERE "coordinates" IS NULL;

CREATE INDEX IF NOT EXISTS "idx_locations_coordinates" ON "customer"."locations" USING GIST ("coordinates");

-- Payment idempotency partial unique
CREATE UNIQUE INDEX IF NOT EXISTS "payments_provider_external_txn_unique"
  ON "billing"."payments" ("provider", "external_txn_id")
  WHERE "external_txn_id" IS NOT NULL;

-- Outbox worker index
CREATE INDEX IF NOT EXISTS "idx_outbox_pending"
  ON "system"."outbox_events" ("status", "scheduled_at")
  WHERE "status" IN ('PENDING', 'FAILED');

-- RLS on customer.organizations
ALTER TABLE "customer"."organizations" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_tenant_isolation" ON "customer"."organizations"
  FOR ALL
  USING (
    id = NULLIF(current_setting('app.current_org', true), '')::uuid
    OR current_setting('app.role', true) IN ('SUPER_ADMIN', 'OPS_ADMIN')
  );

ALTER TABLE "customer"."locations" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "locations_tenant_isolation" ON "customer"."locations"
  FOR ALL
  USING (
    "organization_id" = NULLIF(current_setting('app.current_org', true), '')::uuid
    OR current_setting('app.role', true) IN ('SUPER_ADMIN', 'OPS_ADMIN')
  );

ALTER TABLE "customer"."organization_users" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_users_tenant_isolation" ON "customer"."organization_users"
  FOR ALL
  USING (
    "organization_id" = NULLIF(current_setting('app.current_org', true), '')::uuid
    OR current_setting('app.role', true) IN ('SUPER_ADMIN', 'OPS_ADMIN')
  );

-- Audit append-only (app role = current user; adjust in production)
REVOKE UPDATE, DELETE ON "audit"."audit_logs" FROM PUBLIC;

-- Monthly partitions: run prisma/migrations/partitioning.sql when volume requires it
