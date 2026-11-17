import eventsFixture from '../../../frontend/src/data/events.json';
import rulesFixture from '../../../frontend/src/data/submissionRules.json';
import areasFixture from '../../../frontend/src/data/thematicAreas.json';

export type Modality = 'ARTIGO' | 'RESUMO_EXPANDIDO';
export const MODALITIES: Modality[] = ['ARTIGO', 'RESUMO_EXPANDIDO'];

export interface SubmissionRules {
  eventId: string;
  opensAt: string;
  closesAt: string;
  /**
   * Whether the closing date stops sending, changing and withdrawing. When false the
   * date is only what the site shows: the organisers postpone it by announcing a new one.
   */
  locksAtClose: boolean;
  /** Main author included. */
  maxAuthors: number;
  maxAsMainAuthor: number;
  maxAsCoauthor: number;
  maxKeywords: number;
  maxFileMb: number;
  formats: string[];
  modalities: Record<Modality, { minPages: number; maxPages: number }>;
}

/**
 * The edital's rules, from the same file the site shows them from, so what the
 * page says and what the server enforces cannot drift.
 */
export const RULES = rulesFixture as SubmissionRules[];

const fixtureEventId = (slug: string): string | null =>
  eventsFixture.find((e) => e.slug === slug)?.id ?? null;

export function rulesFor(eventSlug: string, rules: SubmissionRules[] = RULES): SubmissionRules | null {
  const id = fixtureEventId(eventSlug);
  return (id && rules.find((r) => r.eventId === id)) || null;
}

/** The ids of the thematic areas of an edition, e.g. `a3`. */
export function areaRefs(eventSlug: string): string[] {
  const id = fixtureEventId(eventSlug);
  return areasFixture.filter((a) => a.eventId === id).map((a) => a.id);
}

/** The name of an area in Portuguese, for e-mails to the organisers. */
export function areaName(eventSlug: string, ref: string): string {
  const area = areasFixture.find((a) => a.id === ref && a.eventId === fixtureEventId(eventSlug));
  const name: unknown = area?.name;
  if (typeof name === 'string') return name;
  return (name as Record<string, string> | undefined)?.['pt-BR'] ?? ref;
}

export type WindowState = 'not_open' | 'open' | 'closed';

export function windowState(rules: SubmissionRules, now: Date): WindowState {
  const at = now.getTime();
  if (at < Date.parse(rules.opensAt)) return 'not_open';
  if (at > Date.parse(rules.closesAt) && rules.locksAtClose) return 'closed';
  return 'open';
}

/** The published date is behind us (whether or not it locks anything). */
export const pastDeadline = (rules: SubmissionRules, now: Date): boolean =>
  now.getTime() > Date.parse(rules.closesAt);

/**
 * `SUBMISSIONS_NOW` moves the clock of the submission window, and only that, so
 * the closed state can be tried before January. Ignored in production.
 */
export function submissionClock(env: Record<string, string | undefined>, now: Date): Date {
  const override = env.VERCEL_ENV === 'production' ? undefined : env.SUBMISSIONS_NOW;
  if (override) {
    const date = new Date(override);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return now;
}
