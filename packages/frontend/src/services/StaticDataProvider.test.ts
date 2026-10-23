import { localize, missingLocales, sourceText, type LocalizedText } from '@sieamb/shared';
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
    expect(event.slug).toBe('2027');
  });

  it('finds events by slug and returns null for unknown slugs', async () => {
    expect((await provider.getEventBySlug('2027'))?.edition).toBe(2);
    expect(await provider.getEventBySlug('1999')).toBeNull();
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
    // The extension (15/02/2027) is internal guidance for now and must not be published.
    expect(dates.some((d) => d.isExtended || /Prorroga/.test(sourceText(d.label)))).toBe(false);
    expect(dates).toHaveLength(10);
    expect(sourceText(dates.find((d) => d.monthOnly)!.label)).toBe('Divulgação da programação');
    expect(
      dates
        .find((d) => /Início das submissões/.test(sourceText(d.label)))
        ?.date.startsWith('2026-11-15'),
    ).toBe(true);
  });

  it('serves the general about text, the four founders and the 2025 edition text', async () => {
    const site = await provider.getSiteContent();
    expect(sourceText(site.aboutMd)).toContain('Seminário Internacional de Estudos Ambientais');
    expect(localize(site.aboutMd, 'en')).toContain(
      'International Seminar on Environmental Studies',
    );
    const founders = await provider.getFounders();
    expect(founders.map((f) => f.name)).toEqual([
      'Dra. Viviane Farias Silva',
      'Dr. José Otávio Aguiar',
      'Dr. Niklas Werner Weins',
      'Ma. Najara Escarião Agripino',
    ]);
    expect(sourceText((await provider.getEventBySlug('2025'))!.aboutMd!)).toContain(
      'Governança Ambiental',
    );
  });

  it('2027 team has the three committee groups with coordinators, 2025 keeps its own plus speakers', async () => {
    const current = await provider.getCurrentEvent();
    const team = await provider.getCommittee(current.id);
    const groups = [...new Set(team.map((m) => sourceText(m.role)))];
    expect(groups).toEqual(['Comitê Científico', 'Equipe de Revisores', 'Equipe de Mídias']);
    expect(team.filter((m) => m.isCoordinator).map((m) => m.name)).toEqual([
      'Ma. Thays Alves da Silva',
      'Lara Maria Almeida Ferreira',
      'Daniela Torres Teixeira',
    ]);
    expect(team.every((m) => m.bioMd && sourceText(m.bioMd).length > 40)).toBe(true);
    const first = await provider.getCommittee('evt-2025');
    expect([...new Set(first.map((m) => sourceText(m.role)))]).toEqual([
      'Equipe Organizadora',
      'Equipe de Revisores',
      'Palestrantes',
    ]);
  });

  it('2027 team: every member has a Lattes link, same person keeps the same links and affiliation everywhere', async () => {
    const team = await provider.getCommittee('evt-2027');
    const missing = team.filter((m) => !m.lattesUrl).map((m) => m.name);
    expect(missing).toEqual([]);
    for (const m of team) {
      if (m.lattesUrl) expect(m.lattesUrl).toMatch(/^https?:\/\/lattes\.cnpq\.br\/\d{16}$/);
      if (m.orcidUrl)
        expect(m.orcidUrl).toMatch(/^https:\/\/orcid\.org\/\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/);
    }
    const byName = new Map<string, string>();
    for (const m of team) {
      const key = `${m.lattesUrl}|${m.orcidUrl}|${m.institution}`;
      expect(byName.get(m.name) ?? key).toBe(key);
      byName.set(m.name, key);
    }
    const inst = Object.fromEntries(team.map((m) => [m.name, m.institution]));
    expect(inst['Ma. Thays Alves da Silva']).toBe('PPGS/UFPel');
    expect(inst['Ma. Zhou Lin']).toBe('PPGA&S/Unicamp');
    expect(inst['Luana Bramorski Cerqueira Cesar']).toBe('PPGS/Unicamp');
    expect(inst['Pollyanna Kécia Cordeiro Grangeiro']).toBe('PPGEGRN/UFCG / PPGA/UFCG');
  });

  it('founders carry the same Lattes/ORCID as their 2027 team entries, and all of them have both', async () => {
    const founders = await provider.getFounders();
    const team = await provider.getCommittee('evt-2027');
    for (const f of founders) {
      expect(f.lattesUrl, f.name).toMatch(/^https?:\/\/lattes\.cnpq\.br\//);
      expect(f.orcidUrl, f.name).toMatch(/^https:\/\/orcid\.org\//);
      const twin = team.find((m) => m.name === f.name);
      if (twin) {
        expect(twin.lattesUrl, f.name).toBe(f.lattesUrl);
        expect(twin.orcidUrl, f.name).toBe(f.orcidUrl);
      }
    }
  });

  it('content strings carry every locale: venue, dates, groups, lots, areas, news, bios, about', async () => {
    const locales = ['pt-BR', 'en', 'es', 'zh-CN'] as const;
    const gaps: string[] = [];
    const check = (what: string, v: LocalizedText | null) => {
      if (v === null) return;
      const m = missingLocales(v, locales);
      if (m.length) gaps.push(`${what}: ${m.join(',')}`);
    };
    for (const e of await provider.getEvents()) {
      check(`venue ${e.slug}`, e.venue);
      for (const d of await provider.getImportantDates(e.id)) check(`date ${d.id}`, d.label);
      for (const m of await provider.getCommittee(e.id)) check(`role ${m.id}`, m.role);
      for (const f of await provider.getFeeTiers(e.id)) check(`lot ${f.id}`, f.label);
      for (const a of await provider.getThematicAreas(e.id)) {
        check(`area ${a.id} name`, a.name);
        check(`area ${a.id} description`, a.description);
      }
      check(`about ${e.slug}`, e.aboutMd);
      for (const m of await provider.getCommittee(e.id)) check(`bio ${m.id}`, m.bioMd);
      for (const n of await provider.getPublishedNews(e.id)) {
        check(`news ${n.slug} title`, n.title);
        check(`news ${n.slug} excerpt`, n.excerpt);
        check(`news ${n.slug} body`, n.bodyMd);
      }
      for (const ed of await provider.getEditais(e.id)) {
        check(`edital ${ed.slug} title`, ed.title);
        check(`edital ${ed.slug} summary`, ed.summary);
        for (const f of ed.attachments) check(`edital ${ed.slug} file ${f.url}`, f.label);
      }
    }
    check('site about', (await provider.getSiteContent()).aboutMd);
    for (const f of await provider.getFounders()) {
      check(`founder ${f.id} bio`, f.bioMd);
      check(`founder ${f.id} affiliation`, f.affiliation);
    }
    expect(gaps).toEqual([]);
    const current = await provider.getCurrentEvent();
    expect(localize(current.venue, 'en')).toBe('Online event');
    expect(localize(current.venue, 'zh-CN')).toBe('线上活动');
  });

  it('every team member and founder has a photo under team/', async () => {
    const founders = await provider.getFounders();
    const team = [
      ...(await provider.getCommittee('evt-2027')),
      ...(await provider.getCommittee('evt-2025')),
    ];
    expect([...founders, ...team].every((p) => p.photoUrl?.startsWith('team/'))).toBe(true);
  });

  it('2027 fees: three categories, two contiguous lots, online only, committee amounts', async () => {
    const tiers = await provider.getFeeTiers('evt-2027');
    expect(tiers).toHaveLength(6);
    expect(new Set(tiers.map((t) => t.modality))).toEqual(new Set(['ONLINE']));
    const price = (c: string, lot: string) =>
      tiers.find((t) => t.category === c && sourceText(t.label) === lot)?.amountCents;
    expect([
      price('ESTUDANTE_GRADUACAO', 'Lote 1'),
      price('ESTUDANTE_GRADUACAO', 'Lote 2'),
    ]).toEqual([3000, 5000]);
    expect([price('ESTUDANTE_POS', 'Lote 1'), price('ESTUDANTE_POS', 'Lote 2')]).toEqual([
      5000, 7000,
    ]);
    expect([price('PROFISSIONAL', 'Lote 1'), price('PROFISSIONAL', 'Lote 2')]).toEqual([
      7000, 9000,
    ]);
    const l1 = tiers.find((t) => sourceText(t.label) === 'Lote 1')!;
    const l2 = tiers.find((t) => sourceText(t.label) === 'Lote 2')!;
    expect(l1.validFrom.startsWith('2026-11-10')).toBe(true);
    expect(l1.validUntil.startsWith('2027-01-01')).toBe(true);
    expect(l2.validFrom.startsWith('2027-01-02')).toBe(true);
    expect(l2.validUntil.startsWith('2027-03-20')).toBe(true);
  });

  it('the 2027 edition keeps 2026 as a legacy slug and no slug is shared', async () => {
    const events = await provider.getEvents();
    expect(events.find((e) => e.slug === '2027')?.legacySlugs).toEqual(['2026']);
    const all = events.flatMap((e) => [e.slug, ...e.legacySlugs]);
    expect(new Set(all).size).toBe(all.length);
  });
});
