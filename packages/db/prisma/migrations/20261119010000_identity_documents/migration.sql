-- Identity by document (ADR-010, #342, #343).
-- A person is one CPF, or one passport with its country, or both; everywhere the
-- same way: CPF as 11 digits with valid check digits, passport in upper case with
-- no spaces, dots or dashes, country as an ISO two-letter code that is not BR
-- (Brazilians are identified by the CPF).

-- ───────────────────────────── CPF check digits ─────────────────────────────
-- The same mod-11 rule as the form and the server, so that no path at all can
-- store a CPF that is not one ("valid CPF numbers at all times", Rodrigo, 2026-11-19).
CREATE OR REPLACE FUNCTION public.is_valid_cpf(p_cpf text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  first_sum integer := 0;
  second_sum integer := 0;
  first_digit integer;
  second_digit integer;
BEGIN
  IF p_cpf IS NULL OR p_cpf !~ '^[0-9]{11}$' OR p_cpf ~ '^([0-9])\1{10}$' THEN
    RETURN false;
  END IF;
  FOR i IN 1..9 LOOP
    first_sum := first_sum + substr(p_cpf, i, 1)::integer * (11 - i);
  END LOOP;
  first_digit := (first_sum * 10) % 11;
  IF first_digit = 10 THEN first_digit := 0; END IF;
  FOR i IN 1..10 LOOP
    second_sum := second_sum + substr(p_cpf, i, 1)::integer * (12 - i);
  END LOOP;
  second_digit := (second_sum * 10) % 11;
  IF second_digit = 10 THEN second_digit := 0; END IF;
  RETURN first_digit = substr(p_cpf, 10, 1)::integer AND second_digit = substr(p_cpf, 11, 1)::integer;
END;
$$;

-- ───────────────────────────── Accounts ─────────────────────────────
-- "country" on an account is the country of the passport; it says nothing without one.
ALTER TABLE "users"
  ADD CONSTRAINT "users_cpf_valid" CHECK ("cpf" IS NULL OR public.is_valid_cpf("cpf")),
  ADD CONSTRAINT "users_passport_shape" CHECK ("passport" IS NULL OR "passport" ~ '^[A-Z0-9]{5,20}$'),
  ADD CONSTRAINT "users_passport_country" CHECK ("passport" IS NULL OR ("country" ~ '^[A-Z]{2}$' AND "country" <> 'BR'));

-- One account per passport, as there already is one per CPF (users_cpf_key).
CREATE UNIQUE INDEX "users_country_passport_key" ON "users"("country", "passport") WHERE "passport" IS NOT NULL;

-- ───────────────────────────── Paper authors ─────────────────────────────
-- Every author carries a document from now on. The columns allow nothing for the
-- lines written before this (dev only); the server asks for one on every new line.
ALTER TABLE "submission_authors"
  ADD COLUMN "cpf" TEXT,
  ADD COLUMN "passport" TEXT,
  ADD COLUMN "country" TEXT;

ALTER TABLE "submission_authors"
  ADD CONSTRAINT "submission_authors_cpf_valid" CHECK ("cpf" IS NULL OR public.is_valid_cpf("cpf")),
  ADD CONSTRAINT "submission_authors_passport_shape" CHECK ("passport" IS NULL OR "passport" ~ '^[A-Z0-9]{5,20}$'),
  -- A country only together with a passport, and a passport always with its country
  -- ("IS NOT NULL" is said outright: a check lets a comparison with nothing through).
  ADD CONSTRAINT "submission_authors_passport_country" CHECK (
    ("passport" IS NULL AND "country" IS NULL)
    OR ("passport" IS NOT NULL AND "country" IS NOT NULL AND "country" ~ '^[A-Z]{2}$' AND "country" <> 'BR')
  );

CREATE INDEX "submission_authors_cpf_idx" ON "submission_authors"("cpf") WHERE "cpf" IS NOT NULL;
CREATE INDEX "submission_authors_country_passport_idx" ON "submission_authors"("country", "passport") WHERE "passport" IS NOT NULL;

-- ───────────────────────────── Registrations ─────────────────────────────
-- The public form writes straight from the browser, and a page loaded before this
-- release keeps sending what it always sent. So the row is put in shape here, not
-- refused for its shape: CPF down to its digits, passport to upper case without
-- separators, country to upper case. A CPF that is not one is refused, with the
-- code of a failed check, when the row is created or its CPF changes; rows already
-- there are left alone, so nothing that updates an old registration can fail on it.
CREATE OR REPLACE FUNCTION public.normalise_registration_document()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.cpf := NULLIF(regexp_replace(COALESCE(NEW.cpf, ''), '[^0-9]', '', 'g'), '');
  NEW.passport := NULLIF(upper(regexp_replace(COALESCE(NEW.passport, ''), '[[:space:].-]', '', 'g')), '');
  NEW.country := upper(btrim(COALESCE(NEW.country, 'BR')));
  IF NEW.cpf IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.cpf IS DISTINCT FROM OLD.cpf) AND NOT public.is_valid_cpf(NEW.cpf) THEN
    RAISE EXCEPTION 'invalid CPF' USING ERRCODE = 'check_violation', CONSTRAINT = 'pre_registrations_cpf_valid';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "pre_registrations_normalise_document"
  BEFORE INSERT OR UPDATE OF "cpf", "passport", "country" ON "pre_registrations"
  FOR EACH ROW EXECUTE FUNCTION public.normalise_registration_document();

-- Passports already stored as they were typed take the same shape, so that they can
-- be matched. Their country stays what the form wrote (it never asked: 'BR'), which
-- the server reads as "country not known".
UPDATE "pre_registrations"
   SET "passport" = upper(regexp_replace("passport", '[[:space:].-]', '', 'g'))
 WHERE "passport" IS NOT NULL
   AND "passport" <> upper(regexp_replace("passport", '[[:space:].-]', '', 'g'));

CREATE INDEX "pre_registrations_country_passport_idx" ON "pre_registrations"("country", "passport") WHERE "passport" IS NOT NULL;

-- ───────────────────────────── Documents waiting for a confirmed e-mail ─────────────────────────────
-- What someone typed when asking for an account. It becomes the account's document
-- only after the e-mail is confirmed, on the screen where the password is chosen, so
-- an address nobody confirmed reserves no document, and nobody can attach a document
-- to an address that is not theirs. One line per address: the last request wins.
CREATE TABLE "signup_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "cpf" TEXT,
    "passport" TEXT,
    "country" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signup_documents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "signup_documents_email_lower" CHECK ("email" = lower("email")),
    CONSTRAINT "signup_documents_some_document" CHECK ("cpf" IS NOT NULL OR "passport" IS NOT NULL),
    CONSTRAINT "signup_documents_cpf_valid" CHECK ("cpf" IS NULL OR public.is_valid_cpf("cpf")),
    CONSTRAINT "signup_documents_passport_shape" CHECK ("passport" IS NULL OR "passport" ~ '^[A-Z0-9]{5,20}$'),
    CONSTRAINT "signup_documents_passport_country" CHECK (
      ("passport" IS NULL AND "country" IS NULL)
      OR ("passport" IS NOT NULL AND "country" IS NOT NULL AND "country" ~ '^[A-Z]{2}$' AND "country" <> 'BR')
    )
);

CREATE UNIQUE INDEX "signup_documents_email_key" ON "signup_documents"("email");

-- Written and read only by the server functions.
ALTER TABLE "signup_documents" ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "signup_documents" TO service_role;
