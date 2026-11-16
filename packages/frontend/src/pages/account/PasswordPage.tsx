import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/shared/PageHeader';
import { useAuth, type LinkType } from '../../contexts/AuthContext';
import { AccountError, PASSWORD_MIN, savePassword } from '../../services/account';
import { NotFoundPage } from '../NotFoundPage';
import '../../components/registration/RegistrationForm.css';
import './Account.css';
import { useAccountPaths } from './useAccountPaths';

/**
 * `/:event/conta/confirmar` (new account) and `/:event/conta/nova-senha` (forgotten
 * password): the link from the e-mail logs the person in, and the password is
 * chosen here. Until it is, the account has a password nobody knows.
 */
export function PasswordPage({ type }: { type: LinkType }) {
  const { t } = useTranslation();
  const auth = useAuth();
  const paths = useAccountPaths();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const tokenHash = params.get('token_hash');
  const { verifyLink } = auth;
  const [link, setLink] = useState<'checking' | 'ok' | 'invalid'>(tokenHash ? 'checking' : 'invalid');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { enabled } = auth;
  useEffect(() => {
    if (!tokenHash || !enabled) return;
    let active = true;
    void verifyLink(tokenHash, type).then((ok) => {
      if (active) setLink(ok ? 'ok' : 'invalid');
    });
    return () => {
      active = false;
    };
  }, [enabled, tokenHash, type, verifyLink]);

  if (!auth.enabled) return <NotFoundPage />;
  if (!paths.ready) return null;

  const key = type === 'signup' ? 'account.confirm' : 'account.newPassword';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password.length < PASSWORD_MIN) return setError(t('account.errors.weak_password', { min: PASSWORD_MIN }));
    if (password !== repeat) return setError(t('account.password.mismatch'));
    if (!auth.accessToken) return setError(t('account.errors.not_logged_in'));
    setBusy(true);
    try {
      await savePassword(auth.accessToken, password);
      navigate(paths.area, { replace: true });
    } catch (err) {
      const code = err instanceof AccountError ? err.code : 'generic';
      setError(t(`account.errors.${code}`, { min: PASSWORD_MIN }));
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={t(`${key}.title`)} />
      <section className="section">
        <div className="container account">
          {link === 'checking' && <p role="status">{t('account.password.checking')}</p>}
          {link === 'invalid' && (
            <div className="account__notice" role="alert">
              <h2>{t('account.password.invalidTitle')}</h2>
              <p>{t('account.password.invalidBody')}</p>
              <p className="account__links">
                <Link to={type === 'signup' ? paths.signup : paths.recover}>
                  {t('account.password.askAgain')}
                </Link>
                <Link to={paths.login}>{t('account.backToLogin')}</Link>
              </p>
            </div>
          )}
          {link === 'ok' && (
            <>
              <p>{t(`${key}.intro`)}</p>
              <form className="reg-form" onSubmit={(e) => void submit(e)} noValidate>
                <div className="reg-form__field">
                  <label htmlFor="new-password">{t('account.password.new')}</label>
                  <input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <p className="reg-form__hint">{t('account.password.hint', { min: PASSWORD_MIN })}</p>
                </div>
                <div className="reg-form__field">
                  <label htmlFor="repeat-password">{t('account.password.repeat')}</label>
                  <input
                    id="repeat-password"
                    type="password"
                    autoComplete="new-password"
                    value={repeat}
                    onChange={(e) => setRepeat(e.target.value)}
                    required
                  />
                </div>
                {error && (
                  <p className="reg-form__error reg-form__error--global" role="alert">
                    {error}
                  </p>
                )}
                <button className="reg-form__submit" type="submit" disabled={busy}>
                  {busy ? t('common.loading') : t('account.password.submit')}
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </>
  );
}
