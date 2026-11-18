-- The background job, started by the database every 10 minutes (#273).
--
-- GitHub Actions was the one starting it (`email-sweep.yml`, cron */10) and ran it about three
-- times a day: retries of failed e-mails, payment reminders and the rest of a large announcement
-- waited hours. Supabase's own scheduler (pg_cron) keeps time, and pg_net lets the database call
-- the site's endpoint.
--
-- The address of the site and the secret the endpoint asks for are NOT in this file. They live
-- in Supabase Vault, one pair per database, set by hand once:
--
--   select vault.create_secret('https://dev.sieamb.org', 'sieamb_site_url');
--   select vault.create_secret('<CRON_SECRET of that site>', 'sieamb_cron_secret');
--
-- Until both exist the job does nothing, so this migration is safe to run before them.
-- On a database without these extensions (Prisma's shadow database, a local Postgres) the whole
-- file is skipped.

DO $migration$
BEGIN
  IF (SELECT count(*) FROM pg_available_extensions WHERE name IN ('pg_cron', 'pg_net', 'supabase_vault')) < 3 THEN
    RAISE NOTICE 'background job schedule skipped: pg_cron, pg_net or supabase_vault is not available here';
    RETURN;
  END IF;

  CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
  CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
  CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

  -- Not `public`: that schema is what the REST API exposes.
  CREATE SCHEMA IF NOT EXISTS private;
  REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

  EXECUTE $function$
    CREATE OR REPLACE FUNCTION private.run_background_job()
    RETURNS bigint
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
    AS $body$
    DECLARE
      site text;
      secret text;
      request_id bigint;
    BEGIN
      SELECT decrypted_secret INTO site FROM vault.decrypted_secrets WHERE name = 'sieamb_site_url';
      SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name = 'sieamb_cron_secret';
      -- Not set up for this database yet: nothing to call.
      IF coalesce(site, '') = '' OR coalesce(secret, '') = '' THEN
        RETURN NULL;
      END IF;
      -- Asynchronous: the answer lands in net._http_response, with this id.
      SELECT net.http_post(
        url := rtrim(site, '/') || '/api/v1/payments/emails/deliver',
        headers := jsonb_build_object('Authorization', 'Bearer ' || secret, 'Content-Type', 'application/json'),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      ) INTO request_id;
      RETURN request_id;
    END;
    $body$
  $function$;

  REVOKE ALL ON FUNCTION private.run_background_job() FROM PUBLIC, anon, authenticated;

  -- Scheduling under the same name replaces the earlier schedule: running this twice leaves one job.
  PERFORM cron.schedule('sieamb-background-job', '*/10 * * * *', 'SELECT private.run_background_job()');
END
$migration$;
