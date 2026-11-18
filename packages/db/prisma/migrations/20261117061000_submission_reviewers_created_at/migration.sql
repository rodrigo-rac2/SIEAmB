-- Every table says when a row was made in "created_at" (schema convention).
ALTER TABLE "submission_reviewers" RENAME COLUMN "assigned_at" TO "created_at";
