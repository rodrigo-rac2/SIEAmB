// Prisma 7 configuration. The CLI (migrate, studio, seed) reads the connection
// from here; the runtime client gets it through the pg driver adapter in src/index.ts.
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Secrets live in the repo-root .env (local) or in the CI/Vercel environment.
loadEnv({ path: '../../.env' });

export default defineConfig({
  // Needed for migrations.initShadowDb (Prisma 7.10).
  experimental: { externalTables: true },
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
    // The shadow database Prisma spins up for diffing is a bare Postgres: give it
    // the Supabase pieces our migrations reference (auth schema, auth.users, auth.uid()).
    initShadowDb: `
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (
        id uuid PRIMARY KEY,
        email text,
        raw_user_meta_data jsonb
      );
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid';
    `,
  },
  datasource: {
    // Session-mode pooler (IPv4). The direct db.<ref> host is IPv6-only on the free tier.
    url: process.env.DIRECT_URL ?? 'postgresql://unset:unset@localhost:5432/unset',
  },
});
