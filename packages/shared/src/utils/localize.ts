import type { Locale, LocalizedMap, LocalizedText } from '../types/index.js';

export const SOURCE_LOCALE: Locale = 'pt-BR';

export function isLocalizedMap(value: unknown): value is LocalizedMap {
  return typeof value === 'object' && value !== null && typeof (value as LocalizedMap)['pt-BR'] === 'string';
}

/**
 * Resolve a LocalizedText for a locale. Falls back to pt-BR (the source language), so a
 * missing translation shows the original text instead of nothing. Null stays null.
 */
export function localize(value: LocalizedText, locale: Locale): string;
export function localize(value: LocalizedText | null | undefined, locale: Locale): string | null;
export function localize(value: LocalizedText | null | undefined, locale: Locale): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  const hit = value[locale];
  if (typeof hit === 'string' && hit.trim() !== '') return hit;
  return value['pt-BR'];
}

/** Locales a value is missing a translation for (empty strings count as missing). */
export function missingLocales(value: LocalizedText, locales: readonly Locale[]): Locale[] {
  if (typeof value === 'string') return locales.filter((l) => l !== SOURCE_LOCALE);
  return locales.filter((l) => !(typeof value[l] === 'string' && value[l]!.trim() !== ''));
}

/** The pt-BR source string: stable key for grouping and lookups that must not change with the UI language. */
export function sourceText(value: LocalizedText): string {
  return typeof value === 'string' ? value : value['pt-BR'];
}
