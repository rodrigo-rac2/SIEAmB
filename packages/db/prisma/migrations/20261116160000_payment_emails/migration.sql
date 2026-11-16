-- CreateEnum
CREATE TYPE "PaymentEmailKind" AS ENUM ('PROCESSING', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentEmailStatus" AS ENUM ('PENDING', 'SENT', 'SKIPPED');

-- CreateTable
CREATE TABLE "payment_emails" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_id" UUID NOT NULL,
    "kind" "PaymentEmailKind" NOT NULL,
    "status" "PaymentEmailStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_emails_status_created_at_idx" ON "payment_emails"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_emails_payment_id_kind_key" ON "payment_emails"("payment_id", "kind");

-- AddForeignKey
ALTER TABLE "payment_emails" ADD CONSTRAINT "payment_emails_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────────────────────────── Hand-written companions ─────────────────────────────

-- The outbox of payment e-mails (#185) is written and read only by the server
-- functions (service_role). RLS is on with no policy and no grant for
-- anon/authenticated, so the browser cannot see or touch it.
ALTER TABLE "payment_emails" ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "payment_emails" TO service_role;
