import { formatCpf, isPassportCountry, isValidCpf, isValidPassport, maskCpf } from '@sieamb/shared';
import { DocumentFields, type DocumentValue } from '../../components/account/DocumentFields';
import { Processing } from '../../components/shared/Processing';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { PageHeader } from '../../components/shared/PageHeader';
import { useAuth } from '../../contexts/AuthContext';
import { useEvent } from '../../contexts/EventContext';
import { useLocale } from '../../hooks/useLocale';
import {
  accountErrorText,
  fetchAccount,
  requestRegistrationLink,
  saveProfile,
  type Account,
  type AccountRegistration,
  type AccountSuggestion,
  type ProfileInput,
} from '../../services/account';
import { fetchReviewing, fetchWindow, type WindowState } from '../../services/submissions';
import { NotFoundPage } from '../NotFoundPage';
import '../../components/registration/RegistrationForm.css';
import './Account.css';
import { useAccountPaths } from './useAccountPaths';
import { Loading, PageLoading } from '../../components/shared/Loading';

const money = (cents: number, locale: string) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL' }).format(cents / 100);

const day = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso));

function RegistrationCard({ registration }: { registration: AccountRegistration }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const base = `/${registration.eventSlug}`;
  return (
    <div className="account__card" data-testid="registration-card">
      <h3>{registration.eventName}</h3>
      <p>
        <span className={`account__state account__state--${registration.state}`}>
          {t(`account.area.states.${registration.state}`)}
        </span>
      </p>
      <p>
        {t(`account.area.stateBody.${registration.state}`)}
        {registration.amountCents !== null && ` ${money(registration.amountCents, locale)}.`}
      </p>
      <p className="reg-form__hint">
        {t(`registration.categories.${registration.category}`, { defaultValue: registration.category })}
        {' · '}
        {t('account.area.registeredOn', { date: day(registration.createdAt, locale) })}
      </p>
      <div className="account__actions">
        {registration.payToken && (
          <Link
            className="account__button"
            to={`${base}/inscricoes/pagar?t=${registration.payToken}`}
          >
            {t('account.area.payCta')}
          </Link>
        )}
        {registration.paymentId && (
          <Link to={`${base}/inscricoes/pagamento?p=${registration.paymentId}`}>
            {t('account.area.followPayment')}
          </Link>
        )}
      </div>
    </div>
  );
}

function Suggestion({
  suggestion,
  onAsk,
}: {
  suggestion: AccountSuggestion;
  onAsk: (noAccess: boolean) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const ask = async (noAccess: boolean) => {
    setBusy(true);
    await onAsk(noAccess);
    setBusy(false);
  };
  return (
    <div className="account__card" data-testid="suggestion-card">
      <p>
        {t('account.area.suggestionBody', {
          event: suggestion.eventName,
          email: suggestion.maskedEmail,
        })}
      </p>
      {suggestion.request === 'PENDING' && (
        <p className="account__notice" role="status">
          {t('account.area.requestSent', { email: suggestion.maskedEmail })}
        </p>
      )}
      {suggestion.request === 'NEEDS_ORGANISER' && (
        <p className="account__notice" role="status">
          {t('account.area.requestOrganiser')}
        </p>
      )}
      {suggestion.request !== 'NEEDS_ORGANISER' && (
        <div className="account__actions">
          <button className="account__button" type="button" disabled={busy} onClick={() => void ask(false)}>
            {suggestion.request === 'PENDING' ? t('account.area.sendAgain') : t('account.area.yesMine')}
          </button>
          <button
            className="account__button account__button--quiet"
            type="button"
            disabled={busy}
            onClick={() => void ask(true)}
          >
            {t('account.area.noAccess')}
          </button>
          <Processing when={busy} />
        </div>
      )}
    </div>
  );
}

function ProfileForm({
  account,
  onSave,
}: {
  account: Account;
  onSave: (input: ProfileInput) => Promise<string | null>;
}) {
  const { t } = useTranslation();
  const { user } = account;
  const [fullName, setFullName] = useState(user.fullName);
  const [institution, setInstitution] = useState(user.institution ?? '');
  // Each kind of document is given once (ADR-010): what the account has is shown and cannot
  // be changed; what it lacks can be typed. An account from before starts with what was
  // typed when it was asked for, if anything.
  const locked = { cpf: Boolean(user.cpf), passport: Boolean(user.passport) };
  const shown = useCallback(
    (): DocumentValue => ({
      cpf: user.cpf ? formatCpf(user.cpf) : maskCpf(user.pendingDocument?.cpf ?? ''),
      passport: user.passport ?? user.pendingDocument?.passport ?? '',
      country: user.passport ? user.country : (user.pendingDocument?.country ?? ''),
    }),
    [user.cpf, user.passport, user.country, user.pendingDocument],
  );
  const [document, setDocument] = useState<DocumentValue>(shown);
  // What was just saved comes back as the account's, locked.
  useEffect(() => setDocument(shown()), [shown]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaved(false);
    const input: ProfileInput = { fullName: fullName.trim(), institution: institution.trim() };
    // Only what the account does not have yet is sent, and checked first by the server's own rules.
    const passport = document.passport.trim();
    if (!locked.cpf && document.cpf.trim()) {
      if (!isValidCpf(document.cpf)) return setError(t('account.errors.invalid_cpf'));
      input.cpf = document.cpf;
    }
    if (!locked.passport && passport) {
      if (!isValidPassport(passport)) return setError(t('account.errors.invalid_passport'));
      if (!isPassportCountry(document.country)) return setError(t('account.errors.invalid_country'));
      input.passport = passport;
      input.country = document.country;
    }
    setBusy(true);
    const problem = await onSave(input);
    setBusy(false);
    if (problem) setError(problem);
    else setSaved(true);
  };

  return (
    <form className="reg-form" onSubmit={(e) => void submit(e)} noValidate>
      <div className="reg-form__field">
        <label htmlFor="profile-email">{t('account.email')}</label>
        <input id="profile-email" type="email" value={user.email} readOnly disabled />
      </div>
      <div className="reg-form__field">
        <label htmlFor="profile-name">{t('registration.fullName')}</label>
        <input
          id="profile-name"
          type="text"
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
      </div>
      <div className="reg-form__field">
        <label htmlFor="profile-institution">{t('registration.institution')}</label>
        <input
          id="profile-institution"
          type="text"
          autoComplete="organization"
          value={institution}
          onChange={(e) => setInstitution(e.target.value)}
        />
      </div>
      <DocumentFields idPrefix="profile" value={document} onChange={setDocument} locked={locked} disabled={busy} />
      <p className="reg-form__hint">
        {locked.cpf && locked.passport ? t('account.area.documentLockedHint') : t('account.area.documentHint')}
      </p>
      {error && (
        <p className="reg-form__error reg-form__error--global" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="account__notice account__notice--ok" role="status">
          {t('account.area.saved')}
        </p>
      )}
      <span className="account__actions">
        <button className="reg-form__submit" type="submit" disabled={busy}>
          {t('common.save')}
        </button>
        <Processing when={busy} />
      </span>
    </form>
  );
}

/** `/:event/minha-area`: what the logged-in person has with the event. */
export function MyAreaPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const { event } = useEvent();
  const paths = useAccountPaths();
  const location = useLocation();
  const { accessToken } = auth;
  const [account, setAccount] = useState<Account | null>(null);
  // How many papers this person was chosen to review; the link only shows when there are some (#232).
  const [toReview, setToReview] = useState(0);
  const eventSlug = event?.slug;
  // Sending is offered unless the server says submissions are not open; if it cannot say, the form will.
  const [windowState, setWindowState] = useState<WindowState | null>(null);
  useEffect(() => {
    // Nothing is asked of the server for someone who is not logged in.
    if (!accessToken || !eventSlug) return;
    let active = true;
    fetchWindow(eventSlug)
      .then((w) => active && setWindowState(w.state))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [accessToken, eventSlug]);
  const canSend = windowState === null || windowState === 'open';
  useEffect(() => {
    if (!accessToken || !eventSlug) return;
    let active = true;
    fetchReviewing(accessToken, eventSlug)
      .then((data) => active && setToReview(data.submissions.length))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [accessToken, eventSlug]);
  const [error, setError] = useState<string | null>(null);

  const message = useCallback((err: unknown) => accountErrorText(t, err), [t]);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    fetchAccount(accessToken)
      .then((data) => active && setAccount(data))
      .catch((err: unknown) => active && setError(message(err)));
    return () => {
      active = false;
    };
  }, [accessToken, message]);

  if (!auth.enabled) return <NotFoundPage />;
  // The session is still being read: say so, under the page's title (#324).
  if (auth.loading) return <PageLoading title={t('account.area.title')} />;
  if (!paths.ready) return null;
  if (!accessToken) {
    return <Navigate to={`${paths.login}?next=${encodeURIComponent(location.pathname)}`} replace />;
  }

  const save = async (input: ProfileInput): Promise<string | null> => {
    try {
      setAccount(await saveProfile(accessToken, input));
      return null;
    } catch (err) {
      return message(err);
    }
  };

  const ask = async (suggestion: AccountSuggestion, noAccess: boolean) => {
    setError(null);
    try {
      await requestRegistrationLink(accessToken, suggestion.registrationId, noAccess);
      setAccount(await fetchAccount(accessToken));
    } catch (err) {
      setError(message(err));
    }
  };

  const here = account?.registrations.filter((r) => r.eventSlug === event?.slug) ?? [];
  const elsewhere = account?.registrations.filter((r) => r.eventSlug !== event?.slug) ?? [];
  const waiting = account?.suggestions.some((s) => s.eventSlug === event?.slug) ?? false;

  return (
    <>
      <PageHeader title={t('account.area.title')} />
      <section className="section">
        <div className="container account">
          {error && (
            <p className="reg-form__error reg-form__error--global" role="alert">
              {error}
            </p>
          )}
          {!account && !error && <Loading />}
          {account && (
            <>
              {event && (toReview > 0 || account.panels?.platformAdmin || account.panels?.slugs.includes(event.slug)) && (
                <p className="account__actions">
                  {toReview > 0 && (
                    <Link className="account__button" to={`/${event.slug}/avaliacoes`} data-testid="reviewing-link">
                      {t('reviewing.link', { count: toReview })}
                    </Link>
                  )}
                  {(account.panels?.platformAdmin || account.panels?.slugs.includes(event.slug)) && (
                    <Link className="account__button" to={`/${event.slug}/painel`} data-testid="panel-link">
                      {t('panel.title')}
                    </Link>
                  )}
                </p>
              )}

              {/* An account from before documents were asked for: nothing can be sent until it says who the person is (ADR-010). */}
              {account.user.documentMissing && (
                <div className="account__notice" role="status" data-testid="document-missing">
                  <h2>{t('account.document.missingTitle')}</h2>
                  <p>
                    {t('account.document.missingBody')} <a href="#meus-dados">{t('account.area.profileTitle')}</a>
                  </p>
                </div>
              )}

              {/* Papers come first: most people open an account to send one (#246). */}
              <h2>{t('papers.title')}</h2>
              <div className="account__card" data-testid="area-papers">
                <p>{t('account.area.papersBody')}</p>
                <div className="account__actions">
                  {canSend && (
                    <Link className="account__button" to={`/${event?.slug ?? ''}/meus-trabalhos/novo`}>
                      {t('account.area.sendNew')}
                    </Link>
                  )}
                  <Link
                    className={canSend ? 'account__button account__button--quiet' : 'account__button'}
                    to={`/${event?.slug ?? ''}/meus-trabalhos`}
                  >
                    {t('papers.title')}
                  </Link>
                </div>
              </div>

              {(here.length > 0 || account.suggestions.length > 0) && (
                <>
                  <h2 className="account__section">{t('account.area.registrationTitle')}</h2>
                  {here.map((r) => (
                    <RegistrationCard key={r.id} registration={r} />
                  ))}
                  {account.suggestions.map((s) => (
                    <Suggestion key={s.registrationId} suggestion={s} onAsk={(noAccess) => ask(s, noAccess)} />
                  ))}
                </>
              )}
              {elsewhere.length > 0 && (
                <>
                  <h2 className="account__section">{t('account.area.otherEditions')}</h2>
                  {elsewhere.map((r) => (
                    <RegistrationCard key={r.id} registration={r} />
                  ))}
                </>
              )}

              <h2 className="account__section" id="meus-dados">
                {t('account.area.profileTitle')}
              </h2>
              <ProfileForm account={account} onSave={save} />

              {/* Not registered yet: a reminder at the end of the page, not the first thing on it (#246). */}
              {here.length === 0 && !waiting && (
                <>
                  <h2 className="account__section">{t('account.area.registrationTitle')}</h2>
                  <div className="account__card" data-testid="no-registration">
                    <p>{t('account.area.none')}</p>
                    <div className="account__actions">
                      <Link className="account__button" to={paths.register}>
                        {t('account.area.registerCta')}
                      </Link>
                    </div>
                  </div>
                </>
              )}

              <p className="account__links account__section">
                <button
                  className="account__button account__button--quiet"
                  type="button"
                  onClick={() => void auth.signOut()}
                >
                  {t('account.nav.logout')}
                </button>
              </p>
            </>
          )}
        </div>
      </section>
    </>
  );
}
