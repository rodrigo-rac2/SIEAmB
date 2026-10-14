-- CreateEnum
CREATE TYPE "EventRole" AS ENUM ('ADMIN', 'SCIENTIFIC_CHAIR', 'AREA_CHAIR', 'REVIEWER', 'EDITOR', 'FINANCE', 'STAFF');

-- CreateEnum
CREATE TYPE "NewsStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ParticipantCategory" AS ENUM ('ESTUDANTE_GRADUACAO', 'ESTUDANTE_POS', 'PROFESSOR', 'PROFISSIONAL', 'COMUNIDADE');

-- CreateEnum
CREATE TYPE "Modality" AS ENUM ('PRESENCIAL', 'ONLINE');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'AWAITING_EMPENHO');

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "legacy_slugs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "name" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "edition" INTEGER NOT NULL,
    "about_md" JSONB,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "venue" JSONB,
    "is_online" BOOLEAN NOT NULL DEFAULT false,
    "venue_url" TEXT,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "hero_image_url" TEXT,
    "logo_url" TEXT,
    "lockup_url" TEXT,
    "theme" JSONB,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "important_dates" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "label" JSONB NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "is_extended" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "important_dates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thematic_areas" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "thematic_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "committee_members" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "institution" TEXT,
    "bio_md" JSONB,
    "photo_url" TEXT,
    "lattes_url" TEXT,
    "orcid" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "committee_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsors" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'apoio',
    "logo_url" TEXT NOT NULL,
    "website" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sponsors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "static_pages" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" JSONB NOT NULL,
    "body_md" JSONB NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "static_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL DEFAULT '',
    "cpf" TEXT,
    "passport" TEXT,
    "country" TEXT NOT NULL DEFAULT 'BR',
    "institution" TEXT,
    "lattes_url" TEXT,
    "orcid" TEXT,
    "phone" TEXT,
    "is_platform_admin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_members" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "role" "EventRole" NOT NULL,
    "area_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "invited_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "author_id" UUID,
    "slug" TEXT NOT NULL,
    "title" JSONB NOT NULL,
    "excerpt" JSONB,
    "body_md" JSONB NOT NULL,
    "cover_image_url" TEXT,
    "status" "NewsStatus" NOT NULL DEFAULT 'DRAFT',
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "news_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_tiers" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "category" "ParticipantCategory" NOT NULL,
    "modality" "Modality" NOT NULL,
    "label" JSONB NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_until" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registrations" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "fee_tier_id" UUID,
    "category" "ParticipantCategory" NOT NULL,
    "modality" "Modality" NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "proof_url" TEXT,
    "checked_in_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "events_slug_key" ON "events"("slug");

-- CreateIndex
CREATE INDEX "important_dates_event_id_idx" ON "important_dates"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "thematic_areas_event_id_code_key" ON "thematic_areas"("event_id", "code");

-- CreateIndex
CREATE INDEX "committee_members_event_id_idx" ON "committee_members"("event_id");

-- CreateIndex
CREATE INDEX "sponsors_event_id_idx" ON "sponsors"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "static_pages_event_id_slug_key" ON "static_pages"("event_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_cpf_key" ON "users"("cpf");

-- CreateIndex
CREATE INDEX "event_members_event_id_role_idx" ON "event_members"("event_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "event_members_user_id_event_id_role_key" ON "event_members"("user_id", "event_id", "role");

-- CreateIndex
CREATE INDEX "news_event_id_status_published_at_idx" ON "news"("event_id", "status", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "news_event_id_slug_key" ON "news"("event_id", "slug");

-- CreateIndex
CREATE INDEX "fee_tiers_event_id_category_modality_idx" ON "fee_tiers"("event_id", "category", "modality");

-- CreateIndex
CREATE INDEX "registrations_event_id_status_idx" ON "registrations"("event_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "registrations_event_id_user_id_key" ON "registrations"("event_id", "user_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- AddForeignKey
ALTER TABLE "important_dates" ADD CONSTRAINT "important_dates_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thematic_areas" ADD CONSTRAINT "thematic_areas_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "committee_members" ADD CONSTRAINT "committee_members_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "static_pages" ADD CONSTRAINT "static_pages_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_members" ADD CONSTRAINT "event_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_members" ADD CONSTRAINT "event_members_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news" ADD CONSTRAINT "news_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news" ADD CONSTRAINT "news_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_tiers" ADD CONSTRAINT "fee_tiers_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_fee_tier_id_fkey" FOREIGN KEY ("fee_tier_id") REFERENCES "fee_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ───────────────────────────── Hand-written companions ─────────────────────────────

-- Exactly one current event.
CREATE UNIQUE INDEX "one_current_event" ON "events" ("is_current") WHERE "is_current";

-- Supabase Auth lives in the auth schema; mirror every new auth user into public.users.
-- Profile completion (CPF, institution…) happens in-app afterwards.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- Row Level Security. The project was created with "automatically expose new
-- tables" OFF, so anon/authenticated have no privileges unless granted here.
-- Writes never come from the browser: the API uses the service role, which
-- bypasses RLS. Only public reads and "my own row" reads are opened.
ALTER TABLE "events"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "important_dates"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "thematic_areas"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "committee_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sponsors"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "static_pages"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_tiers"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "news"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "event_members"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "registrations"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs"        ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON "events", "important_dates", "thematic_areas", "committee_members",
  "sponsors", "static_pages", "fee_tiers", "news" TO anon, authenticated;
GRANT SELECT ON "users", "registrations", "event_members" TO authenticated;
-- The service role is server-side only (API, admin scripts) and bypasses RLS.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;

CREATE POLICY "public read" ON "events"            FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read" ON "important_dates"   FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read" ON "thematic_areas"    FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read" ON "committee_members" FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read" ON "sponsors"          FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read" ON "static_pages"      FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read" ON "fee_tiers"         FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "published only" ON "news" FOR SELECT TO anon, authenticated
  USING ("status" = 'PUBLISHED' AND "deleted_at" IS NULL);

CREATE POLICY "own row" ON "users"         FOR SELECT TO authenticated USING ((select auth.uid()) = "id");
CREATE POLICY "own rows" ON "registrations" FOR SELECT TO authenticated USING ((select auth.uid()) = "user_id");
CREATE POLICY "own rows" ON "event_members" FOR SELECT TO authenticated USING ((select auth.uid()) = "user_id");
