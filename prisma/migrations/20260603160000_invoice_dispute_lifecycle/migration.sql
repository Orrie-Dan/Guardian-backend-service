-- Invoice dispute lifecycle (phase 4)

ALTER TYPE "billing"."InvoiceStatus" ADD VALUE 'PENDING_CONFIRMATION' AFTER 'DRAFT';
ALTER TYPE "billing"."InvoiceStatus" ADD VALUE 'DISPUTED' AFTER 'OVERDUE';

ALTER TABLE "billing"."invoices"
  ADD COLUMN "void_reason" VARCHAR(500),
  ADD COLUMN "replacement_invoice_id" UUID,
  ADD COLUMN "dispute_reason" VARCHAR(500),
  ADD COLUMN "disputed_at" TIMESTAMP(3),
  ADD COLUMN "disputed_by" UUID,
  ADD COLUMN "status_before_dispute" VARCHAR(40),
  ADD COLUMN "dispute_resolved_at" TIMESTAMP(3),
  ADD COLUMN "dispute_resolved_by" UUID,
  ADD COLUMN "dispute_resolution_note" VARCHAR(500);

ALTER TABLE "billing"."invoices"
  ADD CONSTRAINT "invoices_replacement_invoice_id_fkey"
  FOREIGN KEY ("replacement_invoice_id") REFERENCES "billing"."invoices"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "billing"."invoices"
  ADD CONSTRAINT "invoices_disputed_by_fkey"
  FOREIGN KEY ("disputed_by") REFERENCES "identity"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "billing"."invoices"
  ADD CONSTRAINT "invoices_dispute_resolved_by_fkey"
  FOREIGN KEY ("dispute_resolved_by") REFERENCES "identity"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
