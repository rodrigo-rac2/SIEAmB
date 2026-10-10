import type { EventSummary } from '@sieamb/shared';

export interface NavLinkDef {
  to: string;
  labelKey: string;
  end?: boolean;
}

/**
 * Main menu per edition. Archived editions are a recap (team, anais, dates, contact).
 * The editions index is NOT here: it lives in the top bar so the menu stays on one line.
 */
export function navLinks(event: Pick<EventSummary, 'slug' | 'isArchived'> | null): NavLinkDef[] {
  const base = event ? `/${event.slug}` : '';
  if (event?.isArchived) {
    return [
      { to: `${base}/`, labelKey: 'nav.home', end: true },
      { to: `${base}/organizacao`, labelKey: 'nav.committee' },
      { to: `${base}/anais`, labelKey: 'nav.anais' },
      { to: `${base}/datas-importantes`, labelKey: 'nav.dates' },
      { to: `${base}/contato`, labelKey: 'nav.contact' },
    ];
  }
  return [
    { to: `${base}/`, labelKey: 'nav.home', end: true },
    { to: `${base}/o-evento`, labelKey: 'nav.about' },
    { to: `${base}/organizacao`, labelKey: 'nav.committee' },
    { to: `${base}/areas-tematicas`, labelKey: 'nav.areas' },
    { to: `${base}/submissoes`, labelKey: 'nav.submissions' },
    { to: `${base}/inscricoes`, labelKey: 'nav.registration' },
    { to: `${base}/datas-importantes`, labelKey: 'nav.dates' },
    { to: `${base}/avisos`, labelKey: 'nav.news' },
    { to: `${base}/local`, labelKey: 'nav.venue' },
    { to: `${base}/contato`, labelKey: 'nav.contact' },
  ];
}

/** Every edition that HAS prior editions links to the index; the first one has nothing before it. */
export function showsEditionsLink(event: Pick<EventSummary, 'edition'> | null): boolean {
  return !!event && event.edition > 1;
}
