// Seeds the events that exist today in the frontend fixtures so foreign keys
// have something to point at. Idempotent: upserts by slug. Content (team,
// dates, news) stays in the fixtures until the admin panel (#15) takes over.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPrismaClient, type Prisma } from '../src/index.js';

// Fixture JSON is already plain data; this only narrows the type for Prisma's Json inputs.
const json = (v: unknown): Prisma.InputJsonValue | undefined =>
  v === null || v === undefined ? undefined : (v as Prisma.InputJsonValue);

interface FixtureEvent {
  slug: string;
  legacySlugs?: string[];
  name: string;
  fullName: string;
  edition: number;
  aboutMd: unknown;
  startsAt: string;
  endsAt: string;
  venue: unknown;
  isOnline?: boolean;
  venueUrl?: string | null;
  isCurrent: boolean;
  isArchived: boolean;
  heroImageUrl?: string | null;
  logoUrl?: string | null;
  lockupUrl?: string | null;
  theme?: unknown;
  settings?: Record<string, unknown>;
}

const fixturePath = fileURLToPath(
  new URL('../../frontend/src/data/events.json', import.meta.url),
);
const events = JSON.parse(readFileSync(fixturePath, 'utf8')) as FixtureEvent[];

const prisma = createPrismaClient({ connectionString: process.env.DIRECT_URL });

try {
  for (const e of events) {
    const data = {
      legacySlugs: e.legacySlugs ?? [],
      name: e.name,
      fullName: e.fullName,
      edition: e.edition,
      aboutMd: json(e.aboutMd),
      startsAt: new Date(e.startsAt),
      endsAt: new Date(e.endsAt),
      venue: json(e.venue),
      isOnline: e.isOnline ?? false,
      venueUrl: e.venueUrl ?? null,
      isCurrent: e.isCurrent,
      isArchived: e.isArchived,
      heroImageUrl: e.heroImageUrl ?? null,
      logoUrl: e.logoUrl ?? null,
      lockupUrl: e.lockupUrl ?? null,
      theme: json(e.theme),
      settings: json(e.settings) ?? {},
    };
    await prisma.event.upsert({ where: { slug: e.slug }, create: { slug: e.slug, ...data }, update: data });
    console.log(`seeded event ${e.slug}`);
  }
} finally {
  await prisma.$disconnect();
}
