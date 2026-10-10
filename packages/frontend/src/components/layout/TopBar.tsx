import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatDateRange, type Locale } from '@sieamb/shared';
import { useEvent } from '../../contexts/EventContext';
import { LanguageSwitcher } from './LanguageSwitcher';
import './TopBar.css';

export function TopBar() {
  const { t, i18n } = useTranslation();
  const { event } = useEvent();

  const locale = (i18n.resolvedLanguage ?? 'pt-BR') as Locale;

  return (
    <div className="topbar">
      <div className="container topbar__inner">
        <div className="topbar__info">
          {event && <span>{formatDateRange(event.startsAt, event.endsAt, locale)}</span>}
          {event?.venue && <span className="topbar__venue">{event.venue}</span>}
        </div>
        <div className="topbar__actions">
          {/* Every edition that HAS prior editions links to the index; the first one has nothing before it. */}
          {event && event.edition > 1 && (
            <Link className="topbar__editions" to="/edicoes-anteriores">
              {t('nav.editions')}
            </Link>
          )}
          <LanguageSwitcher />
        </div>
      </div>
    </div>
  );
}
