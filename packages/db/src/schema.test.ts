// Guards the conventions in docs/IMPLEMENTATION_PLAN.md §3 so a future model
// doesn't silently ship camelCase columns or an unmapped table name.
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');

const migrationsDir = new URL('../prisma/migrations/', import.meta.url);
const allMigrationsSql = readdirSync(migrationsDir)
  .filter((d) => /^\d{14}_/.test(d))
  .sort()
  .map((d) => readFileSync(new URL(`${d}/migration.sql`, migrationsDir), 'utf8'))
  .join('\n');

interface Model {
  name: string;
  body: string;
}

const models: Model[] = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map((m) => ({
  name: m[1]!,
  body: m[2]!,
}));

const fieldLines = (body: string) =>
  body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//') && !l.startsWith('@@'));

describe('schema.prisma conventions', () => {
  it('finds the Phase 1 models', () => {
    expect(models.map((m) => m.name)).toEqual(
      expect.arrayContaining(['Event', 'User', 'EventMember', 'News', 'FeeTier', 'Registration']),
    );
  });

  it('maps every model to a snake_case table', () => {
    for (const m of models) {
      const map = m.body.match(/@@map\("([^"]+)"\)/);
      expect(map, `${m.name} has no @@map`).not.toBeNull();
      expect(map![1]).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('maps every camelCase scalar field to a snake_case column', () => {
    for (const m of models) {
      for (const line of fieldLines(m.body)) {
        const [name, type] = line.split(/\s+/);
        if (!name || !type) continue;
        const isRelation = models.some((o) => o.name === type.replace(/[[\]?]/g, ''));
        if (isRelation) continue;
        if (/[A-Z]/.test(name)) {
          const expected = name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
          expect(line, `${m.name}.${name} should map to ${expected}`).toContain(
            `@map("${expected}")`,
          );
        }
      }
    }
  });

  it('uses uuid primary keys and timestamps on every table', () => {
    for (const m of models) {
      expect(m.body, `${m.name} id`).toMatch(/^\s+id\s+String\s+@id.*@db\.Uuid/m);
      expect(m.body, `${m.name} created_at`).toMatch(/createdAt\s+DateTime\s+@default\(now\(\)\)/);
    }
  });

  it('stores money in integer centavos', () => {
    const money = [...schema.matchAll(/^\s+(\w*(?:amount|price|cents)\w*)\s+(\w+)/gim)];
    expect(money.length).toBeGreaterThan(0);
    for (const [, field, type] of money) {
      expect(type, `${field} must be Int (centavos)`).toBe('Int');
      expect(field).toMatch(/Cents$/);
    }
  });

  it('keeps the auth mirror and RLS in the initial migration', () => {
    const sql = readFileSync(
      new URL('../prisma/migrations/20261014153129_init/migration.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('CREATE UNIQUE INDEX "one_current_event"');
    expect(sql).toContain('AFTER INSERT ON auth.users');
    expect(sql).toMatch(
      /GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role/,
    );
  });

  it('enables RLS on every table across all migrations', () => {
    for (const m of models) {
      const table = m.body.match(/@@map\("([^"]+)"\)/)![1];
      expect(allMigrationsSql, `RLS on ${table}`).toMatch(
        new RegExp(`ALTER TABLE "${table}"\\s+ENABLE ROW LEVEL SECURITY`),
      );
    }
  });

  it('browser roles only ever write to pre_registrations, and only INSERT (#149)', () => {
    const browserWriteGrants = [
      ...allMigrationsSql.matchAll(/GRANT ([^;]*?) ON ([^;]*?) TO ([^;]*?);/g),
    ].filter(
      ([, privileges = '', , roles = '']) =>
        /anon|authenticated/.test(roles) && /INSERT|UPDATE|DELETE|ALL/.test(privileges),
    );
    expect(browserWriteGrants.map(([stmt]) => stmt)).toEqual([
      'GRANT INSERT ON "pre_registrations" TO anon, authenticated;',
    ]);
    // The anon key ships in the bundle and pre_registrations holds CPFs: no reads.
    expect(allMigrationsSql).not.toMatch(
      /GRANT [^;]*SELECT[^;]*"pre_registrations"[^;]*TO [^;]*(anon|authenticated)/,
    );
    // Tables with a browser-side default id must generate it in the database (PostgREST skips Prisma defaults).
    expect(allMigrationsSql).toMatch(
      /ALTER TABLE "pre_registrations" ALTER COLUMN "id" SET DEFAULT gen_random_uuid\(\)/,
    );
  });
});
