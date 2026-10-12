import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatDateRange } from '@sieamb/shared';
import { useLocale, useLocalized } from '../../hooks/useLocale';
import { useEvent } from '../../contexts/EventContext';
import { showsEditionsLink } from '../../lib/nav';
import { LanguageSwitcher } from './LanguageSwitcher';
import './TopBar.css';

export function TopBar() {
  const { t } = useTranslation();
  const { event } = useEvent();
  const locale = useLocale();
  const l = useLocalized();

  return (
    <div className="topbar">
      <div className="container topbar__inner">
        <div className="topbar__info">
          {event && <span>{formatDateRange(event.startsAt, event.endsAt, locale)}</span>}
          {event?.venue && <span className="topbar__venue">{l(event.venue)}</span>}
        </div>
        <div className="topbar__actions">
          {showsEditionsLink(event) && (
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
