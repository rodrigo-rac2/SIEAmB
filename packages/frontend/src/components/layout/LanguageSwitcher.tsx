import { useTranslation } from 'react-i18next';
import { SUPPORTED_LOCALES } from '../../i18n';
import './LanguageSwitcher.css';

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();

  return (
    <label className="lang-switcher">
      <span className="visually-hidden">{t('language.label')}</span>
      <select
        value={i18n.resolvedLanguage ?? 'pt-BR'}
        onChange={(e) => void i18n.changeLanguage(e.target.value)}
      >
        {SUPPORTED_LOCALES.map((locale) => (
          <option key={locale} value={locale}>
            {t(`language.${locale}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
