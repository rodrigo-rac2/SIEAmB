-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'REFUNDED');

-- AlterTable
ALTER TABLE "pre_registrations" ADD COLUMN "pay_token" UUID NOT NULL DEFAULT gen_random_uuid();

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "pre_registration_id" UUID NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "amount_cents" INTEGER NOT NULL,
    "fee_tier_ref" TEXT NOT NULL,
    "mp_order_id" TEXT,
    "mp_status" TEXT,
    "mp_status_detail" TEXT,
    "checkout_url" TEXT,
    "order_snapshot" JSONB,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pre_registrations_pay_token_key" ON "pre_registrations"("pay_token");

-- CreateIndex
CREATE UNIQUE INDEX "payments_mp_order_id_key" ON "payments"("mp_order_id");

-- CreateIndex
CREATE INDEX "payments_pre_registration_id_status_idx" ON "payments"("pre_registration_id", "status");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_pre_registration_id_fkey" FOREIGN KEY ("pre_registration_id") REFERENCES "pre_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───────────────────────────── Hand-written companions ─────────────────────────────

-- Payments are written and read only by the server functions (service_role).
-- RLS is on with no policy and no grant for anon/authenticated, so the browser
-- cannot see or touch this table.
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "payments" TO service_role;

-- At most one unpaid order in flight per pre-registration: a second "pay" click
-- gets the same order back instead of opening another one.
CREATE UNIQUE INDEX "payments_one_open_per_pre_registration"
  ON "payments"("pre_registration_id")
  WHERE "status" IN ('CREATED', 'PENDING');

-- Money is never zero or negative.
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_cents_positive" CHECK ("amount_cents" > 0);
