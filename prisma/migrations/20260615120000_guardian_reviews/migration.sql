-- Guardian reviews (client ratings per completed assignment)

CREATE TABLE "job"."guardian_reviews" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "reviewer_user_id" UUID NOT NULL,
    "rating" SMALLINT NOT NULL,
    "comment" VARCHAR(1000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guardian_reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guardian_reviews_assignment_id_key" ON "job"."guardian_reviews"("assignment_id");

CREATE INDEX "guardian_reviews_guardian_id_created_at_idx" ON "job"."guardian_reviews"("guardian_id", "created_at" DESC);

CREATE INDEX "guardian_reviews_job_id_idx" ON "job"."guardian_reviews"("job_id");

ALTER TABLE "job"."guardian_reviews" ADD CONSTRAINT "guardian_reviews_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job"."jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "job"."guardian_reviews" ADD CONSTRAINT "guardian_reviews_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "job"."job_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "job"."guardian_reviews" ADD CONSTRAINT "guardian_reviews_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardian"."guardians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "job"."guardian_reviews" ADD CONSTRAINT "guardian_reviews_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "customer"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "job"."guardian_reviews" ADD CONSTRAINT "guardian_reviews_reviewer_user_id_fkey" FOREIGN KEY ("reviewer_user_id") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "job"."guardian_reviews" ADD CONSTRAINT "guardian_reviews_rating_check" CHECK ("rating" >= 1 AND "rating" <= 5);
