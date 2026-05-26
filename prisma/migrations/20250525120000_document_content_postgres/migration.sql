-- Store document bytes in PostgreSQL (replaces stub S3 presign flow)
ALTER TABLE "system"."document_storage" ADD COLUMN "content" BYTEA;
