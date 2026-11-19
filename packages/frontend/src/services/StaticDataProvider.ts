import type {
  AnaisEntry,
  CommitteeMember,
  Edital,
  EventSummary,
  FeeTier,
  Founder,
  ImportantDate,
  NewsItem,
  Registration,
  RegistrationInput,
  SiteContent,
  Sponsor,
  ThematicArea,
} from '@sieamb/shared';
import type { ContentNow, DataProvider } from './DataProvider';

import anais from '../data/anais.json';
import committee from '../data/committee.json';
import editais from '../data/editais.json';
import events from '../data/events.json';
import feeTiers from '../data/feeTiers.json';
import founders from '../data/founders.json';
import importantDates from '../data/importantDates.json';
import news from '../data/news.json';
import site from '../data/site.json';
import sponsors from '../data/sponsors.json';
import thematicAreas from '../data/thematicAreas.json';

const EVENTS = events as EventSummary[];
const NEWS = news as NewsItem[];
const EDITAIS = editais as Edital[];

/** The fixtures ship with the site, so every read can be answered on the spot. */
const CONTENT: ContentNow = {
  getSiteContent: () => site as SiteContent,

  getFounders: () => [...(founders as Founder[])].sort((a, b) => a.sortOrder - b.sortOrder),

  getEvents: () => [...EVENTS].sort((a, b) => b.edition - a.edition),

  getEventBySlug: (slug) => EVENTS.find((e) => e.slug === slug) ?? null,

  getCurrentEvent: () => {
    const current = EVENTS.find((e) => e.isCurrent);
    if (!current) throw new Error('No current event configured');
    return current;
  },

  getImportantDates: (eventId) =>
    (importantDates as ImportantDate[])
      .filter((d) => d.eventId === eventId)
      .sort((a, b) => a.sortOrder - b.sortOrder),

  getThematicAreas: (eventId) =>
    (thematicAreas as ThematicArea[])
      .filter((a) => a.eventId === eventId)
      .sort((a, b) => a.sortOrder - b.sortOrder),

  getCommittee: (eventId) =>
    (committee as CommitteeMember[])
      .filter((m) => m.eventId === eventId)
      .sort((a, b) => a.sortOrder - b.sortOrder),

  getSponsors: (eventId) =>
    (sponsors as Sponsor[])
      .filter((s) => s.eventId === eventId)
      .sort((a, b) => a.sortOrder - b.sortOrder),

  getFeeTiers: (eventId) => (feeTiers as FeeTier[]).filter((f) => f.eventId === eventId),

  getAnais: (eventId) =>
    (anais as AnaisEntry[])
      .filter((a) => a.eventId === eventId)
      .sort((a, b) => a.sortOrder - b.sortOrder),

  getEditais: (eventId) =>
    EDITAIS.filter((e) => e.eventId === eventId).sort((a, b) => a.sortOrder - b.sortOrder),

  getEditalBySlug: (eventId, slug) =>
    EDITAIS.find((e) => e.eventId === eventId && e.slug === slug) ?? null,

  getPublishedNews: (eventId) =>
    NEWS.filter((n) => n.eventId === eventId && n.status === 'PUBLISHED').sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '');
    }),

  getNewsBySlug: (eventId, slug) =>
    NEWS.find((n) => n.eventId === eventId && n.slug === slug && n.status === 'PUBLISHED') ?? null,
};

/** Fixture-backed provider: powers the pure-static prototype and unit tests. */
export class StaticDataProvider implements DataProvider {
  constructor(private readonly options: { failRegistrations?: boolean } = {}) {}

  /** A getter, so a test can stand in for a provider that has to ask. */
  get now(): ContentNow | undefined {
    return CONTENT;
  }

  // The promises say the same as `now`; an error there (no current edition) is a rejection here.
  async getSiteContent() {
    return CONTENT.getSiteContent();
  }
  async getFounders() {
    return CONTENT.getFounders();
  }
  async getEvents() {
    return CONTENT.getEvents();
  }
  async getEventBySlug(slug: string) {
    return CONTENT.getEventBySlug(slug);
  }
  async getCurrentEvent() {
    return CONTENT.getCurrentEvent();
  }
  async getImportantDates(eventId: string) {
    return CONTENT.getImportantDates(eventId);
  }
  async getThematicAreas(eventId: string) {
    return CONTENT.getThematicAreas(eventId);
  }
  async getCommittee(eventId: string) {
    return CONTENT.getCommittee(eventId);
  }
  async getSponsors(eventId: string) {
    return CONTENT.getSponsors(eventId);
  }
  async getFeeTiers(eventId: string) {
    return CONTENT.getFeeTiers(eventId);
  }
  async getAnais(eventId: string) {
    return CONTENT.getAnais(eventId);
  }
  async getEditais(eventId: string) {
    return CONTENT.getEditais(eventId);
  }
  async getEditalBySlug(eventId: string, slug: string) {
    return CONTENT.getEditalBySlug(eventId, slug);
  }
  async getPublishedNews(eventId: string) {
    return CONTENT.getPublishedNews(eventId);
  }
  async getNewsBySlug(eventId: string, slug: string) {
    return CONTENT.getNewsBySlug(eventId, slug);
  }

  async createRegistration(eventId: string, input: RegistrationInput): Promise<Registration> {
    // Static mode has no persistence; simulate success so the flow is demoable,
    // unless the factory asked for honest failures (misconfigured persistence).
    if (this.options.failRegistrations) throw new Error('registration_persistence_unavailable');
    return {
      id: `local-${Date.now()}`,
      eventId,
      userId: `local-user-${input.email}`,
      category: input.category,
      modality: input.modality,
      status: 'PENDING_PAYMENT',
      createdAt: new Date().toISOString(),
    };
  }
}
