import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatDateRange } from '@sieamb/shared';
import { useLocale, useLocalized } from '../../hooks/useLocale';
import { useAuth } from '../../contexts/AuthContext';
import { useEvent } from '../../contexts/EventContext';
import { showsEditionsLink } from '../../lib/nav';
import { fetchAccount } from '../../services/account';
import { LanguageSwitcher } from './LanguageSwitcher';
import { NotificationsBell } from './NotificationsBell';
import './TopBar.css';

export function TopBar() {
  const { t } = useTranslation();
  const { event } = useEvent();
  const auth = useAuth();
  const locale = useLocale();
  const l = useLocalized();

  // Whoever may open the organisers' panel of this edition gets a link to it here, on every
  // page (#252). The server decides again when the panel is opened; this only shows the door.
  const accessToken = auth.enabled ? auth.accessToken : null;
  const slug = event?.slug;
  const [panel, setPanel] = useState(false);
  useEffect(() => {
    setPanel(false);
    if (!accessToken || !slug) return;
    let active = true;
    fetchAccount(accessToken)
      .then((account) => {
        if (active) setPanel(Boolean(account.panels?.platformAdmin || account.panels?.slugs.includes(slug)));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [accessToken, slug]);

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
          {event && panel && (
            <Link className="topbar__editions" to={`/${event.slug}/painel`} data-testid="topbar-panel" title={t('panel.title')}>
              {t('panel.short')}
            </Link>
          )}
          {event && <NotificationsBell slug={event.slug} />}
          <LanguageSwitcher />
          {/* Right-most, on every page: out in one click (#253). */}
          {auth.enabled && auth.accessToken && (
            <button className="topbar__editions topbar__logout" type="button" onClick={() => void auth.signOut()}>
              {t('account.nav.logout')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
