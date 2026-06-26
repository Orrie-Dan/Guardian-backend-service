-- AWAITING_RELIEF: departing guardian stays on site waiting for substitute after ops approval.
-- Enum value must be committed before it can be used in DML (see backfill migration).

ALTER TYPE "job"."AssignmentStatus" ADD VALUE 'AWAITING_RELIEF' AFTER 'REPLACEMENT_REQUESTED';
