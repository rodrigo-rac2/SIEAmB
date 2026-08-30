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
