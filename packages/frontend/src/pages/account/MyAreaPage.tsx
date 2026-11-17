import { formatCpf, maskCpf } from '@sieamb/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { PageHeader } from '../../components/shared/PageHeader';
import { useAuth } from '../../contexts/AuthContext';
import { useEvent } from '../../contexts/EventContext';
import { useLocale } from '../../hooks/useLocale';
import {
  AccountError,
  fetchAccount,
  requestRegistrationLink,
  saveProfile,
  type Account,
  type AccountRegistration,
  type AccountSuggestion,
  type ProfileInput,
} from '../../services/account';
import { NotFoundPage } from '../NotFoundPage';
import '../../components/registration/RegistrationForm.css';
import './Account.css';
import { useAccountPaths } from './useAccountPaths';

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
  const [cpf, setCpf] = useState('');
  const [passport, setPassport] = useState('');
  const [country, setCountry] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    const input: ProfileInput = { fullName: fullName.trim(), institution: institution.trim() };
    if (!user.documentLocked) {
      if (cpf.trim()) input.cpf = cpf;
      else if (passport.trim()) {
        input.passport = passport;
        input.country = country;
      }
    }
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
      {user.documentLocked ? (
        <div className="reg-form__field">
          <label htmlFor="profile-document">
            {user.cpf ? t('registration.cpf') : t('registration.passport')}
          </label>
          <input
            id="profile-document"
            type="text"
            value={user.cpf ? formatCpf(user.cpf) : `${user.passport ?? ''} (${user.country})`}
            readOnly
            disabled
          />
          <p className="reg-form__hint">{t('account.area.documentLockedHint')}</p>
        </div>
      ) : (
        <>
          <div className="reg-form__row">
            <div className="reg-form__field">
              <label htmlFor="profile-cpf">{t('registration.cpf')}</label>
              <input
                id="profile-cpf"
                type="text"
                inputMode="numeric"
                placeholder="000.000.000-00"
                value={cpf}
                onChange={(e) => setCpf(maskCpf(e.target.value))}
              />
            </div>
            <div className="reg-form__field">
              <label htmlFor="profile-passport">{t('registration.passport')}</label>
              <input
                id="profile-passport"
                type="text"
                value={passport}
                onChange={(e) => setPassport(e.target.value)}
              />
            </div>
          </div>
          {passport.trim() && !cpf.trim() && (
            <div className="reg-form__field">
              <label htmlFor="profile-country">{t('account.area.country')}</label>
              <input
                id="profile-country"
                type="text"
                maxLength={2}
                placeholder="PT"
                value={country}
                onChange={(e) => setCountry(e.target.value.toUpperCase())}
              />
            </div>
          )}
          <p className="reg-form__hint">{t('account.area.documentHint')}</p>
        </>
      )}
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
      <button className="reg-form__submit" type="submit" disabled={busy}>
        {busy ? t('common.loading') : t('common.save')}
      </button>
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
  const [error, setError] = useState<string | null>(null);

  const message = useCallback(
    (err: unknown) => t(`account.errors.${err instanceof AccountError ? err.code : 'generic'}`),
    [t],
  );

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
  if (auth.loading || !paths.ready) return null;
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
          {!account && !error && <p role="status">{t('common.loading')}</p>}
          {account && (
            <>
              <h2>{t('account.area.registrationTitle')}</h2>
              {here.map((r) => (
                <RegistrationCard key={r.id} registration={r} />
              ))}
              {account.suggestions.map((s) => (
                <Suggestion key={s.registrationId} suggestion={s} onAsk={(noAccess) => ask(s, noAccess)} />
              ))}
              {here.length === 0 && !waiting && (
                <div className="account__card" data-testid="no-registration">
                  <p>{t('account.area.none')}</p>
                  <div className="account__actions">
                    <Link className="account__button" to={paths.register}>
                      {t('account.area.registerCta')}
                    </Link>
                  </div>
                </div>
              )}
              {elsewhere.length > 0 && (
                <>
                  <h2 className="account__section">{t('account.area.otherEditions')}</h2>
                  {elsewhere.map((r) => (
                    <RegistrationCard key={r.id} registration={r} />
                  ))}
                </>
              )}

              <h2 className="account__section">{t('account.area.profileTitle')}</h2>
              <ProfileForm account={account} onSave={save} />

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
