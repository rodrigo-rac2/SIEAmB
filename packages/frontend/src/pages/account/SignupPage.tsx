import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/shared/PageHeader';
import { useAuth } from '../../contexts/AuthContext';
import { AccountError, startRecovery, startSignup } from '../../services/account';
import { NotFoundPage } from '../NotFoundPage';
import '../../components/registration/RegistrationForm.css';
import './Account.css';
import { rememberNext } from './nextPage';
import { useAccountPaths } from './useAccountPaths';

/**
 * `/:event/conta/criar` and `/:event/conta/recuperar`: both only ask for the
 * address and answer "check your e-mail", whatever the address is. The password
 * is chosen after the link in the e-mail, never here.
 */
export function SignupPage({ mode }: { mode: 'signup' | 'recover' }) {
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const paths = useAccountPaths();
  const [params] = useSearchParams();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  if (!auth.enabled) return <NotFoundPage />;
  if (!paths.ready) return null;
  rememberNext(params.get('next'));

  const signup = mode === 'signup';
  const key = signup ? 'account.signup' : 'account.recover';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const common = { email: email.trim(), locale: i18n.language, eventSlug: paths.slug };
      const next = params.get('next');
      await (signup
        ? startSignup({ ...common, fullName: fullName.trim(), ...(next ? { next } : {}) })
        : startRecovery(common));
      setSent(true);
    } catch (err) {
      const code = err instanceof AccountError ? err.code : 'generic';
      setError(t(`account.errors.${code}`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={t(`${key}.title`)} />
      <section className="section">
        <div className="container account">
          {sent ? (
            <div className="account__notice account__notice--ok" role="status">
              <h2>{t(`${key}.sentTitle`)}</h2>
              <p>{t(`${key}.sentBody`, { email: email.trim() })}</p>
              <p>{t('account.sentHint')}</p>
            </div>
          ) : (
            <>
              <p>{t(`${key}.intro`)}</p>
              <form className="reg-form" onSubmit={(e) => void submit(e)} noValidate>
                {signup && (
                  <div className="reg-form__field">
                    <label htmlFor="signup-name">{t('registration.fullName')}</label>
                    <input
                      id="signup-name"
                      type="text"
                      autoComplete="name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                    />
                  </div>
                )}
                <div className="reg-form__field">
                  <label htmlFor="signup-email">{t('account.email')}</label>
                  <input
                    id="signup-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                {error && (
                  <p className="reg-form__error reg-form__error--global" role="alert">
                    {error}
                  </p>
                )}
                <button
                  className="reg-form__submit"
                  type="submit"
                  disabled={busy || !email || (signup && !fullName)}
                >
                  {busy ? t('common.loading') : t(`${key}.submit`)}
                </button>
              </form>
            </>
          )}
          <p className="account__links">
            <Link to={paths.login}>{t('account.backToLogin')}</Link>
          </p>
        </div>
      </section>
    </>
  );
}
