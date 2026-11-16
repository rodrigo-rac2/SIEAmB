-- CreateEnum
CREATE TYPE "LinkRequestStatus" AS ENUM ('PENDING', 'CONFIRMED', 'NEEDS_ORGANISER', 'REJECTED', 'EXPIRED');

-- AlterTable
ALTER TABLE "pre_registrations" ADD COLUMN "user_id" UUID;

-- CreateTable
CREATE TABLE "registration_link_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pre_registration_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "status" "LinkRequestStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "decided_at" TIMESTAMP(3),
    "decided_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registration_link_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_hits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limit_hits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "registration_link_requests_token_hash_key" ON "registration_link_requests"("token_hash");

-- CreateIndex
CREATE INDEX "registration_link_requests_user_id_status_idx" ON "registration_link_requests"("user_id", "status");

-- CreateIndex
CREATE INDEX "registration_link_requests_pre_registration_id_status_idx" ON "registration_link_requests"("pre_registration_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_hits_key_window_start_key" ON "rate_limit_hits"("key", "window_start");

-- CreateIndex
CREATE INDEX "pre_registrations_cpf_idx" ON "pre_registrations"("cpf");

-- CreateIndex
CREATE INDEX "pre_registrations_passport_idx" ON "pre_registrations"("passport");

-- CreateIndex
CREATE UNIQUE INDEX "pre_registrations_event_id_user_id_key" ON "pre_registrations"("event_id", "user_id");

-- AddForeignKey
ALTER TABLE "pre_registrations" ADD CONSTRAINT "pre_registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_link_requests" ADD CONSTRAINT "registration_link_requests_pre_registration_id_fkey" FOREIGN KEY ("pre_registration_id") REFERENCES "pre_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_link_requests" ADD CONSTRAINT "registration_link_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────────────────────────── Hand-written companions ─────────────────────────────

-- Accounts (#208, #209). Everything here is written and read only by the server
-- functions (service_role): RLS is on with no policy and no grant for
-- anon/authenticated. The browser still inserts pre_registrations as before and
-- cannot set user_id: its INSERT grant is column-less, so the policy below pins it.
ALTER TABLE "registration_link_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rate_limit_hits"            ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "registration_link_requests" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON "rate_limit_hits"            TO service_role;

-- The server now updates accounts (profile data) and links registrations.
GRANT SELECT, INSERT, UPDATE, DELETE ON "users" TO service_role;

-- A registration is never born linked to an account: only the server links it,
-- after the account's e-mail is confirmed.
CREATE POLICY "no account on public insert" ON "pre_registrations"
  AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK ("user_id" IS NULL);

-- One counter per key and time window. Returns false once the window is over its limit.
CREATE OR REPLACE FUNCTION public.hit_rate_limit(p_key text, p_window_seconds integer, p_max integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamp(3);
  v_count integer;
BEGIN
  v_start := (to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds) AT TIME ZONE 'UTC');
  INSERT INTO rate_limit_hits ("key", "window_start", "count")
  VALUES (p_key, v_start, 1)
  ON CONFLICT ("key", "window_start") DO UPDATE SET "count" = rate_limit_hits."count" + 1
  RETURNING "count" INTO v_count;
  RETURN v_count <= p_max;
END;
$$;
REVOKE ALL ON FUNCTION public.hit_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hit_rate_limit(text, integer, integer) TO service_role;
