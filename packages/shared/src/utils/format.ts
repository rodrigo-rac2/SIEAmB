import type { Locale } from '../types/index.js';

const localeMap: Record<Locale, string> = {
  'pt-BR': 'pt-BR',
  en: 'en-US',
  es: 'es-ES',
  'zh-CN': 'zh-CN',
};

/** Format integer centavos as BRL currency, locale-aware. */
export function formatMoney(amountCents: number, locale: Locale = 'pt-BR'): string {
  return new Intl.NumberFormat(localeMap[locale], {
    style: 'currency',
    currency: 'BRL',
  }).format(amountCents / 100);
}

/** Format an ISO date as a long date in the given locale (America/Fortaleza). */
export function formatDate(iso: string, locale: Locale = 'pt-BR'): string {
  return new Intl.DateTimeFormat(localeMap[locale], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Fortaleza',
  }).format(new Date(iso));
}

/** Format a date range like "10–12 de novembro de 2026" (locale-aware). */
export function formatDateRange(startIso: string, endIso: string, locale: Locale = 'pt-BR'): string {
  const fmt = new Intl.DateTimeFormat(localeMap[locale], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Fortaleza',
  });
  return fmt.formatRange(new Date(startIso), new Date(endIso));
}

/** Format an ISO date as month + year only, e.g. "dezembro de 2026". */
export function formatMonth(iso: string, locale: Locale = 'pt-BR'): string {
  return new Intl.DateTimeFormat(localeMap[locale], {
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Fortaleza',
  }).format(new Date(iso));
}

const listConjunction: Record<Locale, string> = { 'pt-BR': 'e', en: 'and', es: 'y', 'zh-CN': '和' };

/**
 * Spell the days of a short range out, e.g. "24, 25 e 26 de março de 2027" (pt-BR),
 * "March 24, 25 and 26, 2027" (en), "2027年3月24日、25日和26日" (zh-CN).
 * Falls back to formatDateRange when the range spans more than one month or more than 7 days.
 */
export function formatDateList(startIso: string, endIso: string, locale: Locale = 'pt-BR'): string {
  const parts = (iso: string) => {
    const p = new Intl.DateTimeFormat('en-US', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
      timeZone: 'America/Fortaleza',
    }).formatToParts(new Date(iso));
    const get = (type: string) => Number(p.find((x) => x.type === type)?.value);
    return { day: get('day'), month: get('month'), year: get('year') };
  };
  const a = parts(startIso);
  const b = parts(endIso);
  const span = b.day - a.day;
  if (a.year !== b.year || a.month !== b.month || span < 0 || span > 6) {
    return formatDateRange(startIso, endIso, locale);
  }
  const days = Array.from({ length: span + 1 }, (_, i) => a.day + i);
  const join = (items: string[]) => {
    if (items.length === 1) return items[0];
    const head = items.slice(0, -1);
    const last = items[items.length - 1];
    return locale === 'zh-CN'
      ? `${head.join('、')}${listConjunction[locale]}${last}`
      : `${head.join(', ')} ${listConjunction[locale]} ${last}`;
  };
  if (locale === 'zh-CN') {
    return `${a.year}年${a.month}月${join(days.map((d) => `${d}日`))}`;
  }
  const monthName = new Intl.DateTimeFormat(localeMap[locale], {
    month: 'long',
    timeZone: 'America/Fortaleza',
  }).format(new Date(startIso));
  if (locale === 'en') return `${monthName} ${join(days.map(String))}, ${a.year}`;
  return `${join(days.map(String))} de ${monthName} de ${a.year}`;
}
