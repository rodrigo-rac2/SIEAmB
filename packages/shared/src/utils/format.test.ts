import { describe, expect, it } from 'vitest';
import { formatDate, formatDateList, formatDateRange, formatMonth, formatMoney } from './format';

describe('formatDateRange', () => {
  const start = '2027-03-24T08:00:00-03:00';
  const end = '2027-03-26T18:00:00-03:00';

  it('collapses a same-month range in pt-BR', () => {
    expect(formatDateRange(start, end)).toMatch(/^24\s?[–-]\s?26 de março de 2027$/);
  });

  it('renders the same range in every supported locale', () => {
    expect(formatDateRange(start, end, 'en')).toMatch(/March 24\s?[–-]\s?26, 2027/);
    expect(formatDateRange(start, end, 'es')).toMatch(/24\s?[–-]\s?26 de marzo de 2027/);
    expect(formatDateRange(start, end, 'zh-CN')).toMatch(/2027\/3\/24/);
  });

  it('keeps both months when the range crosses a month boundary', () => {
    const out = formatDateRange('2026-10-30T08:00:00-03:00', '2026-11-02T18:00:00-03:00');
    expect(out).toContain('outubro');
    expect(out).toContain('novembro');
  });

  it('keeps both years when the range crosses a year boundary', () => {
    const out = formatDateRange('2026-12-30T08:00:00-03:00', '2027-01-02T18:00:00-03:00');
    expect(out).toContain('2026');
    expect(out).toContain('2027');
  });

  it('does not shift a 23:59 Brazil deadline to the next day', () => {
    // 23:59 in Fortaleza is 02:59 UTC the next day: the displayed date must stay on the 18th.
    expect(formatDate('2027-01-18T23:59:00-03:00')).toBe('18 de janeiro de 2027');
    expect(formatDate('2027-01-18T23:59:00-03:00', 'en')).toBe('January 18, 2027');
  });
});

describe('formatMoney', () => {
  it('formats centavos as BRL in the given locale', () => {
    expect(formatMoney(5000)).toMatch(/R\$\s?50,00/);
    expect(formatMoney(9000, 'en')).toMatch(/R\$\s?90\.00/);
  });
});

describe('formatMonth', () => {
  it('shows month and year only, in the given locale', () => {
    expect(formatMonth('2026-12-01T00:00:00-03:00')).toBe('dezembro de 2026');
    expect(formatMonth('2026-12-01T00:00:00-03:00', 'en')).toBe('December 2026');
  });
});

describe('formatDateList', () => {
  const start = '2027-03-24T08:00:00-03:00';
  const end = '2027-03-26T18:00:00-03:00';

  it('spells the days out the way the committee asked for the home page', () => {
    expect(formatDateList(start, end)).toBe('24, 25 e 26 de março de 2027');
  });

  it('renders the list in every supported locale', () => {
    expect(formatDateList(start, end, 'en')).toBe('March 24, 25 and 26, 2027');
    expect(formatDateList(start, end, 'es')).toBe('24, 25 y 26 de marzo de 2027');
    expect(formatDateList(start, end, 'zh-CN')).toBe('2027年3月24日、25日和26日');
  });

  it('handles a one-day event and a two-day event', () => {
    expect(formatDateList(start, start)).toBe('24 de março de 2027');
    expect(formatDateList(start, '2027-03-25T18:00:00-03:00')).toBe('24 e 25 de março de 2027');
  });

  it('falls back to the range when the days cross a month or the range is long', () => {
    expect(formatDateList('2026-10-30T08:00:00-03:00', '2026-11-02T18:00:00-03:00')).toMatch(/outubro.*novembro/);
    expect(formatDateList('2027-03-01T08:00:00-03:00', '2027-03-15T18:00:00-03:00')).toMatch(/^1\s?[–-]\s?15 de março de 2027$/);
  });

  it('uses the Brazil calendar day, not UTC', () => {
    // 23:00 in Fortaleza on the 26th is 02:00 UTC on the 27th.
    expect(formatDateList(start, '2027-03-26T23:00:00-03:00')).toBe('24, 25 e 26 de março de 2027');
  });
});
