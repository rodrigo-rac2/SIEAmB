import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatDateRange } from '@sieamb/shared';
import { useLocale, useLocalized } from '../../hooks/useLocale';
import { useAuth } from '../../contexts/AuthContext';
import { useEvent } from '../../contexts/EventContext';
import { showsEditionsLink } from '../../lib/nav';
import { LanguageSwitcher } from './LanguageSwitcher';
import { NotificationsBell } from './NotificationsBell';
import './TopBar.css';

export function TopBar() {
  const { t } = useTranslation();
  const { event } = useEvent();
  const auth = useAuth();
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
          {auth.enabled && event && !auth.loading && (
            <Link
              className="topbar__editions"
              to={auth.accessToken ? `/${event.slug}/minha-area` : `/${event.slug}/conta/entrar`}
            >
              {auth.accessToken ? t('account.nav.myArea') : t('account.nav.login')}
            </Link>
          )}
          {event && <NotificationsBell slug={event.slug} />}
          <LanguageSwitcher />
        </div>
      </div>
    </div>
  );
}
