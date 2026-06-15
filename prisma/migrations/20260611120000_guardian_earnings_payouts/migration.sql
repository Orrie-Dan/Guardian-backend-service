-- CreateEnum
CREATE TYPE "billing"."GuardianEarningStatus" AS ENUM ('PENDING_PAYOUT', 'PAID', 'BLOCKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "billing"."GuardianPayoutStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "guardian"."guardians" ADD COLUMN "hourly_pay_rate" DECIMAL(10,2),
ADD COLUMN "pay_currency" CHAR(3) NOT NULL DEFAULT 'RWF';

-- CreateTable
CREATE TABLE "billing"."guardian_earnings" (
    "id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "payable_hours" DECIMAL(8,4) NOT NULL,
    "hourly_pay_rate" DECIMAL(10,2),
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'RWF',
    "status" "billing"."GuardianEarningStatus" NOT NULL DEFAULT 'PENDING_PAYOUT',
    "payout_id" UUID,
    "accrued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMP(3),

    CONSTRAINT "guardian_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing"."guardian_payouts" (
    "id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'RWF',
    "provider" "billing"."PaymentProvider" NOT NULL,
    "status" "billing"."GuardianPayoutStatus" NOT NULL DEFAULT 'PENDING',
    "external_txn_id" VARCHAR(200),
    "idempotency_key" VARCHAR(100) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guardian_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guardian_earnings_assignment_id_key" ON "billing"."guardian_earnings"("assignment_id");

-- CreateIndex
CREATE INDEX "guardian_earnings_guardian_id_status_accrued_at_idx" ON "billing"."guardian_earnings"("guardian_id", "status", "accrued_at" DESC);

-- CreateIndex
CREATE INDEX "guardian_earnings_invoice_id_idx" ON "billing"."guardian_earnings"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "guardian_payouts_idempotency_key_key" ON "billing"."guardian_payouts"("idempotency_key");

-- CreateIndex
CREATE INDEX "guardian_payouts_guardian_id_created_at_idx" ON "billing"."guardian_payouts"("guardian_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "guardian_payouts_status_created_at_idx" ON "billing"."guardian_payouts"("status", "created_at");

-- AddForeignKey
ALTER TABLE "billing"."guardian_earnings" ADD CONSTRAINT "guardian_earnings_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardian"."guardians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."guardian_earnings" ADD CONSTRAINT "guardian_earnings_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "job"."job_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."guardian_earnings" ADD CONSTRAINT "guardian_earnings_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job"."jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."guardian_earnings" ADD CONSTRAINT "guardian_earnings_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "billing"."invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."guardian_earnings" ADD CONSTRAINT "guardian_earnings_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "billing"."guardian_payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."guardian_payouts" ADD CONSTRAINT "guardian_payouts_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardian"."guardians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."guardian_payouts" ADD CONSTRAINT "guardian_payouts_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
