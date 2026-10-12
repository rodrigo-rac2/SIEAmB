import { useTranslation } from 'react-i18next';
import type { Locale } from '@sieamb/shared';
import { SUPPORTED_LOCALES } from '../../i18n';
import './LanguageSwitcher.css';

const FLAGS: Record<Locale, string> = {
  'pt-BR': '🇧🇷',
  en: '🇺🇸',
  es: '🇪🇸',
  'zh-CN': '🇨🇳',
};

/** Short label shown next to the flag: readable where flag emojis render as letter pairs (Windows). */
const SHORT: Record<Locale, string> = {
  'pt-BR': 'PT',
  en: 'EN',
  es: 'ES',
  'zh-CN': '中文',
};

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const current = i18n.resolvedLanguage ?? 'pt-BR';

  return (
    <div className="lang-switcher" role="group" aria-label={t('language.label')}>
      {SUPPORTED_LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          className={`lang-switcher__btn ${current === locale ? 'is-active' : ''}`}
          aria-label={t(`language.${locale}`)}
          aria-pressed={current === locale}
          title={t(`language.${locale}`)}
          lang={locale}
          onClick={() => void i18n.changeLanguage(locale)}
        >
          <span className="lang-switcher__flag" aria-hidden="true">
            {FLAGS[locale]}
          </span>
          <span className="lang-switcher__code">{SHORT[locale]}</span>
        </button>
      ))}
    </div>
  );
}
