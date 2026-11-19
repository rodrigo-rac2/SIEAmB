import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/shared/PageHeader';
import { useAuth } from '../../contexts/AuthContext';
import { AccountError, confirmRegistrationLink, type AccountErrorCode } from '../../services/account';
import { NotFoundPage } from '../NotFoundPage';
import './Account.css';
import { useAccountPaths } from './useAccountPaths';

// The link is spent on its first use; keep the outcome so a second mount shows the same.
const outcomes = new Map<string, Promise<AccountErrorCode | null>>();

const confirmOnce = (token: string): Promise<AccountErrorCode | null> => {
  let outcome = outcomes.get(token);
  if (!outcome) {
    outcome = confirmRegistrationLink(token)
      .then(() => null)
      .catch((err: unknown) => (err instanceof AccountError ? err.code : 'generic'));
    outcomes.set(token, outcome);
  }
  return outcome;
};

/** `/:event/conta/vincular?t=<token>`: the click that says "yes, that registration is mine" (#209). */
export function LinkPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const paths = useAccountPaths();
  const [params] = useSearchParams();
  const token = params.get('t');
  const [state, setState] = useState<'checking' | 'done' | AccountErrorCode>(token ? 'checking' : 'link_not_found');

  const { enabled } = auth;
  useEffect(() => {
    // Where accounts are off the page does not exist, and must not spend the link.
    if (!token || !enabled) return;
    let active = true;
    void confirmOnce(token).then((problem) => {
      if (active) setState(problem ?? 'done');
    });
    return () => {
      active = false;
    };
  }, [enabled, token]);

  if (!auth.enabled) return <NotFoundPage />;
  if (!paths.ready) return null;

  return (
    <>
      <PageHeader title={t('account.link.title')} />
      <section className="section">
        <div className="container account">
          {state === 'checking' && <p role="status">{t('account.password.checking')}</p>}
          {state === 'done' && (
            <div className="account__notice account__notice--ok" role="status">
              <h2>{t('account.link.doneTitle')}</h2>
              <p>{t('account.link.doneBody')}</p>
            </div>
          )}
          {state !== 'checking' && state !== 'done' && (
            <div className="account__notice" role="alert">
              <p>{t(`account.errors.${state}`)}</p>
            </div>
          )}
          <p className="account__links">
            <Link to={paths.area}>{t('account.nav.myArea')}</Link>
          </p>
        </div>
      </section>
    </>
  );
}
