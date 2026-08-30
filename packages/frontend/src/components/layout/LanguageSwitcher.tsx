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

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const current = i18n.resolvedLanguage ?? 'pt-BR';

  return (
    <div className="lang-switcher" role="group" aria-label={t('language.label')}>
      {SUPPORTED_LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          className={`lang-switcher__flag ${current === locale ? 'is-active' : ''}`}
          aria-label={t(`language.${locale}`)}
          aria-pressed={current === locale}
          title={t(`language.${locale}`)}
          onClick={() => void i18n.changeLanguage(locale)}
        >
          {FLAGS[locale]}
        </button>
      ))}
    </div>
  );
}
