import { beforeEach, describe, expect, it } from 'vitest';
import { StaticDataProvider } from './StaticDataProvider';

describe('StaticDataProvider', () => {
  let provider: StaticDataProvider;

  beforeEach(() => {
    provider = new StaticDataProvider();
  });

  it('returns the current event', async () => {
    const event = await provider.getCurrentEvent();
    expect(event.isCurrent).toBe(true);
    expect(event.slug).toBe('2026');
  });

  it('finds events by slug and returns null for unknown slugs', async () => {
    expect((await provider.getEventBySlug('2026'))?.edition).toBe(2);
    expect((await provider.getEventBySlug('1999'))).toBeNull();
  });

  it('lists events newest first', async () => {
    const events = await provider.getEvents();
    expect(events.map((e) => e.edition)).toEqual([2, 1]);
  });

  it('returns published news pinned-first, newest-first', async () => {
    const event = await provider.getCurrentEvent();
    const news = await provider.getPublishedNews(event.id);
    expect(news.length).toBeGreaterThan(0);
    expect(news[0]?.isPinned).toBe(true);
    expect(news.every((n) => n.status === 'PUBLISHED')).toBe(true);
  });

  it('scopes important dates to the event and sorts them', async () => {
    const event = await provider.getCurrentEvent();
    const dates = await provider.getImportantDates(event.id);
    expect(dates.every((d) => d.eventId === event.id)).toBe(true);
    const orders = dates.map((d) => d.sortOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it('simulates a registration in static mode', async () => {
    const event = await provider.getCurrentEvent();
    const reg = await provider.createRegistration(event.id, {
      fullName: 'Maria da Silva',
      email: 'maria@example.com',
      cpf: '52998224725',
      country: 'BR',
      category: 'ESTUDANTE_POS',
      modality: 'PRESENCIAL',
      password: 'secret123',
    });
    expect(reg.status).toBe('PENDING_PAYMENT');
    expect(reg.eventId).toBe(event.id);
  });

  it('current edition is the online II SIEAmB in March 2027 and its schedule ends on the event day', async () => {
    const event = await provider.getCurrentEvent();
    expect(event.startsAt.startsWith('2027-03-24')).toBe(true);
    expect(event.endsAt.startsWith('2027-03-26')).toBe(true);
    expect(event.isOnline).toBe(true);
    expect(event.venueUrl).toMatch(/youtube\.com/);
    const dates = await provider.getImportantDates(event.id);
    const times = dates.map((d) => new Date(d.date).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(dates.at(-1)?.date.startsWith('2027-03-24')).toBe(true);
    expect(dates.find((d) => d.isExtended)?.label).toMatch(/Prorroga/);
  });
});
