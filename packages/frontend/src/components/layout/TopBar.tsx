import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatDateRange } from '@sieamb/shared';
import { useCurrentEvent } from '../../hooks/useCurrentEvent';
import { useLocale, useLocalized } from '../../hooks/useLocale';
import { useAuth } from '../../contexts/AuthContext';
import { useEvent } from '../../contexts/EventContext';
import { firstName } from '../../lib/names';
import { showsEditionsLink } from '../../lib/nav';
import { fetchAccount, onAccountChange, type Account } from '../../services/account';
import { AccountMenu } from './AccountMenu';
import { LanguageSwitcher } from './LanguageSwitcher';
import { NotificationsBell } from './NotificationsBell';
import '../shared/Processing.css';
import './TopBar.css';

export function TopBar() {
  const { t } = useTranslation();
  const { event } = useEvent();
  const auth = useAuth();
  const locale = useLocale();
  const l = useLocalized();

  // Accounts, papers and the organisers' panel belong to the current edition. From the archive of
  // an older one the account links lead there, not to pages that edition never had (#314).
  const { current, settled } = useCurrentEvent();
  // If the current edition cannot be told, the edition on screen is the best there is.
  const accountSlug = current?.slug ?? (settled ? (event?.slug ?? null) : null);

  // The account of who is logged in: the first name for the button, and which pages its list
  // offers (#252, #311, #315). The server decides again when a page is opened; this only shows the doors.
  const accessToken = auth.enabled ? auth.accessToken : null;
  const who = auth.enabled ? auth.email : null;
  const [account, setAccount] = useState<Account | null>(null);
  const [failed, setFailed] = useState(false);
  // Another person, or nobody: what was known is theirs no longer.
  useEffect(() => {
    setAccount(null);
    setFailed(false);
  }, [who]);
  // Read again whenever the session is renewed, keeping what is on screen meanwhile (#319).
  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    fetchAccount(accessToken)
      .then((data) => {
        if (!active) return;
        setAccount(data);
        setFailed(false);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [accessToken]);
  // A name changed in Minha área shows here at once (#313).
  useEffect(() => onAccountChange(setAccount), []);

  // Until the answers are in, the line says so, and keeps its height (#319).
  const waiting = auth.loading || !accountSlug || (Boolean(accessToken) && !account && !failed);

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
      {auth.enabled && (
        <div className="container topbar__account" data-testid="topbar-account">
          {waiting || !accountSlug ? (
            <span className="topbar__waiting" aria-live="polite" data-testid="topbar-waiting">
              <span className="processing__spinner" aria-hidden="true" />
              {t('common.loading')}
            </span>
          ) : accessToken ? (
            <>
              <NotificationsBell slug={accountSlug} />
              <AccountMenu
                slug={accountSlug}
                name={(account && firstName(account.user.fullName)) || t('account.nav.account')}
                panel={Boolean(account?.panels?.platformAdmin || account?.panels?.slugs.includes(accountSlug))}
                reviewing={Boolean(account?.panels?.reviewing?.includes(accountSlug))}
                onSignOut={() => void auth.signOut()}
              />
            </>
          ) : (
            <Link className="topbar__login" to={`/${accountSlug}/conta/entrar`}>
              {t('account.nav.login')}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
