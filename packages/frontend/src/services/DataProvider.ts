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

/**
 * All frontend data access goes through this interface.
 * Implementations: StaticDataProvider (fixtures), SupabaseDataProvider
 * (direct client, Phase 0), ApiDataProvider (Express, Phase 1+).
 */
export interface DataProvider {
  getSiteContent(): Promise<SiteContent>;
  getFounders(): Promise<Founder[]>;

  getEvents(): Promise<EventSummary[]>;
  /**
   * The editions, newest first, when they can be told without waiting (they ship with the site),
   * so the first paint already has them (#329). A provider that has to ask leaves this out or
   * answers `undefined`, and callers wait for `getEvents()`.
   */
  peekEvents?(): EventSummary[] | undefined;
  getEventBySlug(slug: string): Promise<EventSummary | null>;
  getCurrentEvent(): Promise<EventSummary>;

  getImportantDates(eventId: string): Promise<ImportantDate[]>;
  getThematicAreas(eventId: string): Promise<ThematicArea[]>;
  getCommittee(eventId: string): Promise<CommitteeMember[]>;
  getSponsors(eventId: string): Promise<Sponsor[]>;
  getFeeTiers(eventId: string): Promise<FeeTier[]>;

  getAnais(eventId: string): Promise<AnaisEntry[]>;

  getEditais(eventId: string): Promise<Edital[]>;
  getEditalBySlug(eventId: string, slug: string): Promise<Edital | null>;

  getPublishedNews(eventId: string): Promise<NewsItem[]>;
  getNewsBySlug(eventId: string, slug: string): Promise<NewsItem | null>;

  createRegistration(eventId: string, input: RegistrationInput): Promise<Registration>;
}

export class DuplicateRegistrationError extends Error {
  constructor() {
    super('duplicate_registration');
    this.name = 'DuplicateRegistrationError';
  }
}
