import type {
  AnaisEntry,
  CommitteeMember,
  EventSummary,
  FeeTier,
  ImportantDate,
  NewsItem,
  Registration,
  RegistrationInput,
  Sponsor,
  ThematicArea,
} from '@sieamb/shared';
import type { DataProvider } from './DataProvider';

import anais from '../data/anais.json';
import committee from '../data/committee.json';
import events from '../data/events.json';
import feeTiers from '../data/feeTiers.json';
import importantDates from '../data/importantDates.json';
import news from '../data/news.json';
import sponsors from '../data/sponsors.json';
import thematicAreas from '../data/thematicAreas.json';

const EVENTS = events as EventSummary[];
const NEWS = news as NewsItem[];

/** Fixture-backed provider: powers the pure-static prototype and unit tests. */
export class StaticDataProvider implements DataProvider {
  async getEvents(): Promise<EventSummary[]> {
    return [...EVENTS].sort((a, b) => b.edition - a.edition);
  }

  async getEventBySlug(slug: string): Promise<EventSummary | null> {
    return EVENTS.find((e) => e.slug === slug) ?? null;
  }

  async getCurrentEvent(): Promise<EventSummary> {
    const current = EVENTS.find((e) => e.isCurrent);
    if (!current) throw new Error('No current event configured');
    return current;
  }

  async getImportantDates(eventId: string): Promise<ImportantDate[]> {
    return (importantDates as ImportantDate[])
      .filter((d) => d.eventId === eventId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async getThematicAreas(eventId: string): Promise<ThematicArea[]> {
    return (thematicAreas as ThematicArea[])
      .filter((a) => a.eventId === eventId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async getCommittee(eventId: string): Promise<CommitteeMember[]> {
    return (committee as CommitteeMember[])
      .filter((m) => m.eventId === eventId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async getSponsors(eventId: string): Promise<Sponsor[]> {
    return (sponsors as Sponsor[])
      .filter((s) => s.eventId === eventId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async getFeeTiers(eventId: string): Promise<FeeTier[]> {
    return (feeTiers as FeeTier[]).filter((f) => f.eventId === eventId);
  }

  async getAnais(eventId: string): Promise<AnaisEntry[]> {
    return (anais as AnaisEntry[])
      .filter((a) => a.eventId === eventId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async getPublishedNews(eventId: string): Promise<NewsItem[]> {
    return NEWS.filter((n) => n.eventId === eventId && n.status === 'PUBLISHED').sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '');
    });
  }

  async getNewsBySlug(eventId: string, slug: string): Promise<NewsItem | null> {
    return (
      NEWS.find((n) => n.eventId === eventId && n.slug === slug && n.status === 'PUBLISHED') ?? null
    );
  }

  async createRegistration(eventId: string, input: RegistrationInput): Promise<Registration> {
    // Static mode has no persistence; simulate success so the flow is demoable.
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
