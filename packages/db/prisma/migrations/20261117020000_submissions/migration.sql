-- AlterEnum
ALTER TYPE "EventRole" ADD VALUE 'ORGANIZER';

-- CreateEnum
CREATE TYPE "SubmissionModality" AS ENUM ('ARTIGO', 'RESUMO_EXPANDIDO');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'APPROVED_WITH_REVISION', 'REJECTED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'SENT', 'SKIPPED');

-- CreateTable
CREATE TABLE "submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "number" SERIAL NOT NULL,
    "event_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "title_en" TEXT NOT NULL,
    "modality" "SubmissionModality" NOT NULL,
    "area_ref" TEXT NOT NULL,
    "abstract" TEXT NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "keywords_en" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "file_path" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_pages" INTEGER,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "locale" TEXT NOT NULL DEFAULT 'pt-BR',
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,
    "deleted_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_authors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "submission_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_authors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_emails" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "to_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body_text" TEXT,
    "body_html" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "event_id" UUID,
    "kind" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "submissions_number_key" ON "submissions"("number");

-- CreateIndex
CREATE INDEX "submissions_event_id_deleted_at_idx" ON "submissions"("event_id", "deleted_at");

-- CreateIndex
CREATE INDEX "submissions_user_id_idx" ON "submissions"("user_id");

-- CreateIndex
CREATE INDEX "submission_authors_email_idx" ON "submission_authors"("email");

-- CreateIndex
CREATE UNIQUE INDEX "submission_authors_submission_id_position_key" ON "submission_authors"("submission_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "submission_authors_submission_id_email_key" ON "submission_authors"("submission_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_emails_dedupe_key_key" ON "outbox_emails"("dedupe_key");

-- CreateIndex
CREATE INDEX "outbox_emails_status_created_at_idx" ON "outbox_emails"("status", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_authors" ADD CONSTRAINT "submission_authors_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────────────────────────── Hand-written companions ─────────────────────────────

-- Submissions, their authors, the general outbox and the notifications (#216, #217)
-- are written and read only by the server functions (service_role). RLS is on with
-- no policy and no grant for anon/authenticated: the browser reaches them through
-- /api/v1, where the server checks who is asking.
ALTER TABLE "submissions"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "submission_authors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outbox_emails"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications"      ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "submissions"        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON "submission_authors" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON "outbox_emails"      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON "notifications"      TO service_role;
GRANT USAGE, SELECT ON SEQUENCE "submissions_number_seq" TO service_role;
-- The server reads who holds a role in an edition to notify the organisers.
GRANT SELECT, INSERT, UPDATE, DELETE ON "event_members" TO service_role;
