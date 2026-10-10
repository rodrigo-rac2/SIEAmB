import { describe, expect, it } from 'vitest';
import { navLinks, showsEditionsLink } from './nav';

describe('navLinks', () => {
  it('current edition: team right after the about page, no editions link in the menu', () => {
    const links = navLinks({ slug: '2027', isArchived: false });
    const keys = links.map((l) => l.labelKey);
    expect(keys.indexOf('nav.committee')).toBe(keys.indexOf('nav.about') + 1);
    expect(keys).not.toContain('nav.editions');
    expect(links.find((l) => l.labelKey === 'nav.committee')?.to).toBe('/2027/organizacao');
    expect(links[0]).toMatchObject({ to: '/2027/', end: true });
  });

  it('archived edition: recap only, no registration or submissions', () => {
    const keys = navLinks({ slug: '2025', isArchived: true }).map((l) => l.labelKey);
    expect(keys).toEqual(['nav.home', 'nav.committee', 'nav.anais', 'nav.dates', 'nav.contact']);
  });

  it('falls back to root paths while the event is still loading', () => {
    expect(navLinks(null)[0]?.to).toBe('/');
  });
});

describe('showsEditionsLink', () => {
  it('is false for the first edition and while loading, true from the second edition on', () => {
    expect(showsEditionsLink({ edition: 1 })).toBe(false);
    expect(showsEditionsLink(null)).toBe(false);
    expect(showsEditionsLink({ edition: 2 })).toBe(true);
  });
});
