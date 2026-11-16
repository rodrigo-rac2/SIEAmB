import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/shared/PageHeader';
import { useAuth } from '../../contexts/AuthContext';
import { NotFoundPage } from '../NotFoundPage';
import '../../components/registration/RegistrationForm.css';
import './Account.css';
import { useAccountPaths } from './useAccountPaths';

/** Only paths inside the site are followed after logging in. */
export const safeNext = (next: string | null, fallback: string): string =>
  next && /^\/(?!\/)[^\s\\]*$/.test(next) ? next : fallback;

/** `/:event/conta/entrar` */
export function LoginPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const paths = useAccountPaths();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!auth.enabled) return <NotFoundPage />;
  if (!paths.ready) return null;
  if (auth.accessToken) return <Navigate to={safeNext(params.get('next'), paths.area)} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const problem = await auth.signIn(email, password);
    setBusy(false);
    if (problem) setError(t(`account.login.errors.${problem}`));
  };

  return (
    <>
      <PageHeader title={t('account.login.title')} />
      <section className="section">
        <div className="container account">
          <form className="reg-form" onSubmit={(e) => void submit(e)} noValidate>
            <div className="reg-form__field">
              <label htmlFor="login-email">{t('account.email')}</label>
              <input
                id="login-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="reg-form__field">
              <label htmlFor="login-password">{t('account.password.label')}</label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <p className="reg-form__error reg-form__error--global" role="alert">
                {error}
              </p>
            )}
            <button className="reg-form__submit" type="submit" disabled={busy || !email || !password}>
              {busy ? t('account.login.submitting') : t('account.login.submit')}
            </button>
          </form>
          <p className="account__links">
            <Link to={paths.recover}>{t('account.login.forgot')}</Link>
            <Link to={paths.signup}>{t('account.login.create')}</Link>
          </p>
        </div>
      </section>
    </>
  );
}
