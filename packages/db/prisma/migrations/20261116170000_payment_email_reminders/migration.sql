-- Reminders (#187) can be owed to someone who never started a payment, so an
-- outbox row now belongs to a registration and only optionally to a payment.
-- The "one e-mail of each kind" rule moves to an explicit key.

-- AlterEnum
ALTER TYPE "PaymentEmailKind" ADD VALUE 'REMINDER';

-- DropIndex
DROP INDEX "payment_emails_payment_id_kind_key";

-- AlterTable
ALTER TABLE "payment_emails" ADD COLUMN "pre_registration_id" UUID;
ALTER TABLE "payment_emails" ADD COLUMN "dedupe_key" TEXT;

-- Rows written before this migration (only on sieamb-dev) take their values from the payment.
UPDATE "payment_emails" e
   SET "pre_registration_id" = p."pre_registration_id",
       "dedupe_key" = e."payment_id"::text || ':' || e."kind"::text
  FROM "payments" p
 WHERE p."id" = e."payment_id";

ALTER TABLE "payment_emails" ALTER COLUMN "pre_registration_id" SET NOT NULL;
ALTER TABLE "payment_emails" ALTER COLUMN "dedupe_key" SET NOT NULL;
ALTER TABLE "payment_emails" ALTER COLUMN "payment_id" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "payment_emails_dedupe_key_key" ON "payment_emails"("dedupe_key");

-- CreateIndex
CREATE INDEX "payment_emails_pre_registration_id_idx" ON "payment_emails"("pre_registration_id");

-- AddForeignKey
ALTER TABLE "payment_emails" ADD CONSTRAINT "payment_emails_pre_registration_id_fkey" FOREIGN KEY ("pre_registration_id") REFERENCES "pre_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
