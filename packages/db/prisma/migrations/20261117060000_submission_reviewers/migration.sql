-- CreateTable
CREATE TABLE "submission_reviewers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "submission_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "assigned_by" UUID NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_reviewers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "submission_reviewers_user_id_idx" ON "submission_reviewers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "submission_reviewers_submission_id_user_id_key" ON "submission_reviewers"("submission_id", "user_id");

-- AddForeignKey
ALTER TABLE "submission_reviewers" ADD CONSTRAINT "submission_reviewers_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_reviewers" ADD CONSTRAINT "submission_reviewers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────────────────────────── Hand-written companions ─────────────────────────────

-- Who reviews each paper (#232): one or more people per paper, chosen by the organisers.
-- Written and read only by the server functions.
ALTER TABLE "submission_reviewers" ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "submission_reviewers" TO service_role;
