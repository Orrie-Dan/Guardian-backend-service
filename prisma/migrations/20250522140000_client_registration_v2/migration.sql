-- Client registration v2: mobile money + org verification documents

CREATE TYPE "customer"."MobileMoneyProvider" AS ENUM ('MOMO_MTN', 'AIRTEL_MONEY');
CREATE TYPE "customer"."OrgVerificationDocumentType" AS ENUM (
  'TIN_CERTIFICATE',
  'BUSINESS_REGISTRATION',
  'NATIONAL_ID',
  'OTHER'
);

ALTER TABLE "customer"."organizations"
  ADD COLUMN "mobile_money_provider" "customer"."MobileMoneyProvider",
  ADD COLUMN "mobile_money_phone" VARCHAR(20);

UPDATE "customer"."organizations"
SET
  "mobile_money_provider" = 'MOMO_MTN',
  "mobile_money_phone" = '+250788000001'
WHERE "mobile_money_provider" IS NULL;

ALTER TABLE "customer"."organizations"
  ALTER COLUMN "mobile_money_provider" SET NOT NULL,
  ALTER COLUMN "mobile_money_phone" SET NOT NULL;

CREATE TABLE "customer"."organization_verification_documents" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "document_id" UUID NOT NULL,
  "document_type" "customer"."OrgVerificationDocumentType" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_verification_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_verification_documents_organization_id_document_id_key"
  ON "customer"."organization_verification_documents"("organization_id", "document_id");

ALTER TABLE "customer"."organization_verification_documents"
  ADD CONSTRAINT "organization_verification_documents_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "customer"."organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer"."organization_verification_documents"
  ADD CONSTRAINT "organization_verification_documents_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "system"."document_storage"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
