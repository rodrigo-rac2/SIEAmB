import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/shared/PageHeader';
import { useAuth } from '../../contexts/AuthContext';
import { DocumentFields, NO_DOCUMENT, documentInput, documentProblem } from '../../components/account/DocumentFields';
import { accountErrorText, startRecovery, startSignup } from '../../services/account';
import { NotFoundPage } from '../NotFoundPage';
import '../../components/registration/RegistrationForm.css';
import './Account.css';
import { rememberNext } from './nextPage';
import { useAccountPaths } from './useAccountPaths';

/**
 * `/:event/conta/criar` and `/:event/conta/recuperar`: both answer "check your e-mail",
 * whatever the address is. The password is chosen after the link in the e-mail, never here.
 * A new account also says who the person is, by CPF or passport (ADR-010): a document
 * that another account holds is refused here, with that account's address masked.
 */
export function SignupPage({ mode }: { mode: 'signup' | 'recover' }) {
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const paths = useAccountPaths();
  const [params] = useSearchParams();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [document, setDocument] = useState(NO_DOCUMENT);
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
    // Said here, before anything is sent: the server would refuse it for the same reason.
    const problem = signup ? documentProblem(document) : null;
    if (problem) return setError(t(`account.errors.${problem}`));
    setBusy(true);
    try {
      const common = { email: email.trim(), locale: i18n.language, eventSlug: paths.slug };
      const next = params.get('next');
      await (signup
        ? startSignup({ ...common, fullName: fullName.trim(), ...documentInput(document), ...(next ? { next } : {}) })
        : startRecovery(common));
      setSent(true);
    } catch (err) {
      setError(accountErrorText(t, err));
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
                {signup && (
                  <>
                    <DocumentFields idPrefix="signup" value={document} onChange={setDocument} disabled={busy} />
                    <p className="reg-form__hint">{t('account.document.hint')}</p>
                  </>
                )}
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
            {/* Someone told their document already has an account needs the way back into it. */}
            {signup && <Link to={paths.recover}>{t('account.login.forgot')}</Link>}
          </p>
        </div>
      </section>
    </>
  );
}
