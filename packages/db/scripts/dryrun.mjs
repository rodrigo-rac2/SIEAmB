// Proves a migration before it is applied: runs it and its assertions on the DEV database
// inside one transaction, then ROLLS BACK. Nothing is changed.
//
//   node --env-file=../../.env.local scripts/dryrun.mjs \
//     prisma/migrations/<name>/migration.sql prisma/checks/<name>.sql
//
// The assertions are a DO block that raises on the first thing that is not as it should be
// and reports each group it passed with RAISE NOTICE. The CPF cases of the shared rules
// (document.vectors.json) are handed to it as the setting `app.cpf_vectors`.
import { readFileSync } from 'node:fs';
import pg from 'pg';
const url = process.env.SUPABASE_DEV_DIRECT_URL;
if (!url.includes(process.env.SUPABASE_DEV_PROJECT_REF) || url.includes(process.env.SUPABASE_PROD_PROJECT_REF)) throw new Error('not the dev database');
const [migration, checks] = process.argv.slice(2).map((f) => readFileSync(f, 'utf8'));
const vectors = JSON.parse(readFileSync(new URL('../../shared/src/utils/document.vectors.json', import.meta.url), 'utf8'));
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
client.on('notice', (n) => console.log('  ' + n.message));
await client.connect();
try {
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout = '10s'");
  await client.query(migration);
  console.log('migration applied (inside the transaction)');
  await client.query('SELECT set_config($1, $2, true)', ['app.cpf_vectors', JSON.stringify(vectors.cpf)]);
  await client.query(checks);
  console.log('all assertions passed');
} catch (e) {
  console.log('FAILED:', e.message, e.where ? '\n  at ' + e.where.split('\n')[0] : '');
  process.exitCode = 1;
} finally {
  await client.query('ROLLBACK').catch(() => {});
  const left = await client.query("SELECT to_regclass('public.signup_documents') AS t");
  console.log('rolled back; signup_documents exists afterwards:', left.rows[0].t !== null);
  await client.end();
}
