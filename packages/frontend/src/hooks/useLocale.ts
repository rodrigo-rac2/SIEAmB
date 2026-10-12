import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { localize, type Locale, type LocalizedText } from '@sieamb/shared';

/** The active UI locale, typed. Single place that knows the pt-BR default. */
export function useLocale(): Locale {
  const { i18n } = useTranslation();
  return (i18n.resolvedLanguage ?? 'pt-BR') as Locale;
}

/**
 * Resolver for LocalizedText content in the active locale, re-rendering on language change.
 *   const l = useLocalized(); <span>{l(event.venue)}</span>
 */
export function useLocalized() {
  const locale = useLocale();
  return useCallback(
    <T extends LocalizedText | null | undefined>(value: T): T extends LocalizedText ? string : string | null =>
      localize(value, locale) as T extends LocalizedText ? string : string | null,
    [locale],
  );
}
