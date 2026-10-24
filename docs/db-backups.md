# Database backups

`.github/workflows/db-backup.yml` dumps the production database (`sieamb-prod`) every Sunday at 06:00 UTC: the `public` schema with its data, plus the `auth.users` and `auth.identities` rows. Each dump is encrypted with the `BACKUP_PASSPHRASE` repository secret (gpg, AES256) and uploaded to the [`db-backups` release](https://github.com/rodrigo-rac2/SIEAmB/releases/tag/db-backups). Release files never expire. The repository is public, so only the passphrase protects the data. Keep a copy of it outside GitHub, because a secret can't be read back once it's saved.

## Archive dump

For a dump that should be easy to find later, for example the final one after registrations close, run the workflow by hand with a label:

```bash
gh workflow run db-backup.yml -f label=final-2027
```

The files are named `sieamb-prod-{public,auth}-<UTC timestamp>-<label>.dump.gpg`.

## Restore

```bash
gh release download db-backups -p 'sieamb-prod-public-<stamp>.dump.gpg' -p 'sieamb-prod-auth-<stamp>.dump.gpg'
gpg --decrypt sieamb-prod-public-<stamp>.dump.gpg > public.dump
gpg --decrypt sieamb-prod-auth-<stamp>.dump.gpg > auth.dump
```

On a new or empty project, create the schema with the migrations first. They also create what the dumps leave out: the grants, the RLS policies and the `auth.users` trigger. Don't run the seed. Then load the data, using the target's session pooler URL, because the direct host is IPv6-only:

```bash
DIRECT_URL="$TARGET_DB_URL" npm run -w packages/db migrate:deploy
pg_restore --no-owner --no-privileges --data-only -d "$TARGET_DB_URL" public.dump
pg_restore --no-owner --no-privileges --data-only -d "$TARGET_DB_URL" auth.dump
```

Load `public` before `auth`. The trigger copies each new auth user into `public.users` with `ON CONFLICT DO NOTHING`, so the users restored first are kept as they were.

## Paused projects

The free plan pauses a project after a week without enough activity. `.github/workflows/db-watchdog.yml` checks both projects every 6 hours, restores a paused one and opens an `infra` issue. Supabase only allows unpausing for 90 days after a pause, so act on any watchdog issue that says a restore failed.
