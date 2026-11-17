-- CreateEnum
CREATE TYPE "RegistrationOverride" AS ENUM ('CONFIRMED', 'EXEMPT', 'CANCELLED');

-- DropIndex
DROP INDEX "pre_registrations_event_id_email_key";

-- DropIndex
DROP INDEX "pre_registrations_event_id_user_id_key";

-- AlterTable
ALTER TABLE "pre_registrations" ADD COLUMN "created_by" UUID,
ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by" UUID,
ADD COLUMN "deleted_reason" TEXT,
ADD COLUMN "manual_at" TIMESTAMP(3),
ADD COLUMN "manual_by" UUID,
ADD COLUMN "manual_reason" TEXT,
ADD COLUMN "manual_status" "RegistrationOverride";

-- CreateTable
CREATE TABLE "event_member_invites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "EventRole" NOT NULL,
    "invited_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_member_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_member_invites_email_idx" ON "event_member_invites"("email");

-- CreateIndex
CREATE UNIQUE INDEX "event_member_invites_event_id_email_role_key" ON "event_member_invites"("event_id", "email", "role");

-- CreateIndex
CREATE INDEX "pre_registrations_event_id_email_idx" ON "pre_registrations"("event_id", "email");

-- CreateIndex
CREATE INDEX "pre_registrations_event_id_user_id_idx" ON "pre_registrations"("event_id", "user_id");

-- AddForeignKey
ALTER TABLE "event_member_invites" ADD CONSTRAINT "event_member_invites_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───────────────────────────── Hand-written companions ─────────────────────────────

-- Soft delete (ADR-006, #204): "only one" is counted over the registrations that are
-- not deleted, so someone whose registration was deleted can register again.
CREATE UNIQUE INDEX "pre_registrations_event_id_email_key"
  ON "pre_registrations"("event_id", "email") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "pre_registrations_event_id_user_id_key"
  ON "pre_registrations"("event_id", "user_id") WHERE "deleted_at" IS NULL AND "user_id" IS NOT NULL;

-- The public form never sets what only an administrator decides.
CREATE POLICY "no organiser fields on public insert" ON "pre_registrations"
  AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (
    "manual_status" IS NULL AND "manual_by" IS NULL AND "manual_at" IS NULL AND "manual_reason" IS NULL
    AND "created_by" IS NULL
    AND "deleted_at" IS NULL AND "deleted_by" IS NULL AND "deleted_reason" IS NULL
  );

-- Written and read only by the server functions.
ALTER TABLE "event_member_invites" ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "event_member_invites" TO service_role;
GRANT SELECT, INSERT ON "audit_logs" TO service_role;
ALTER TABLE "audit_logs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
