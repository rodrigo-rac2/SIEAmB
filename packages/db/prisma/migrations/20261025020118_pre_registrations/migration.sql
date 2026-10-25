-- CreateTable
CREATE TABLE "pre_registrations" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "cpf" TEXT,
    "passport" TEXT,
    "country" TEXT NOT NULL DEFAULT 'BR',
    "institution" TEXT,
    "category" "ParticipantCategory" NOT NULL,
    "modality" "Modality" NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'pt-BR',
    "consent_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pre_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pre_registrations_event_id_created_at_idx" ON "pre_registrations"("event_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "pre_registrations_event_id_email_key" ON "pre_registrations"("event_id", "email");

-- AddForeignKey
ALTER TABLE "pre_registrations" ADD CONSTRAINT "pre_registrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───────────────────────────── Hand-written companions ─────────────────────────────

-- Anonymous visitors may only INSERT. No SELECT for anon/authenticated: the anon key
-- ships in the browser bundle and these rows hold CPFs. service_role (admin, export)
-- gets everything. Project has "automatically expose new tables" OFF, so grants are explicit.
ALTER TABLE "pre_registrations" ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON "pre_registrations" TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "pre_registrations" TO service_role;

-- Only for events that are taking registrations.
CREATE POLICY "public insert while open" ON "pre_registrations"
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "events" e
      WHERE e."id" = "event_id"
        AND COALESCE((e."settings" ->> 'registrationOpen')::boolean, false)
    )
  );
