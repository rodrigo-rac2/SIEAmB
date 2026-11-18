import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatDateRange } from '@sieamb/shared';
import { useLocale, useLocalized } from '../../hooks/useLocale';
import { useAuth } from '../../contexts/AuthContext';
import { useEvent } from '../../contexts/EventContext';
import { showsEditionsLink } from '../../lib/nav';
import { fetchAccount } from '../../services/account';
import { AccountMenu } from './AccountMenu';
import { LanguageSwitcher } from './LanguageSwitcher';
import { NotificationsBell } from './NotificationsBell';
import './TopBar.css';

export function TopBar() {
  const { t } = useTranslation();
  const { event } = useEvent();
  const auth = useAuth();
  const locale = useLocale();
  const l = useLocalized();

  // Whoever may open the organisers' panel of this edition gets a link to it in the account menu,
  // on every page (#252). The server decides again when the panel is opened; this only shows the door.
  const accessToken = auth.enabled ? auth.accessToken : null;
  const slug = event?.slug;
  const [panel, setPanel] = useState(false);
  // The first name for the account menu (#311); the e-mail stands in until the account is read.
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    setPanel(false);
    setName(null);
    if (!accessToken || !slug) return;
    let active = true;
    fetchAccount(accessToken)
      .then((account) => {
        if (!active) return;
        setPanel(Boolean(account.panels?.platformAdmin || account.panels?.slugs.includes(slug)));
        setName(account.user.fullName.trim().split(/\s+/)[0] || null);
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
          <LanguageSwitcher />
        </div>
      </div>
      {/* The account has a line of its own, at the right, where accounts are on (#311). */}
      {auth.enabled && event && !auth.loading && (
        <div className="container topbar__account" data-testid="topbar-account">
          {auth.accessToken ? (
            <>
              <NotificationsBell slug={event.slug} />
              <AccountMenu
                slug={event.slug}
                name={name ?? auth.email ?? t('account.nav.myArea')}
                panel={panel}
                onSignOut={() => void auth.signOut()}
              />
            </>
          ) : (
            <Link className="topbar__login" to={`/${event.slug}/conta/entrar`}>
              {t('account.nav.login')}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
