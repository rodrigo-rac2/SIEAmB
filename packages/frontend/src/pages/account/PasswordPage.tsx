import { useEffect, useState, type FormEvent } from 'react';
import { PasswordInput } from '../../components/shared/PasswordInput';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/shared/PageHeader';
import { useAuth, type LinkType } from '../../contexts/AuthContext';
import { maskCpf } from '@sieamb/shared';
import { DocumentFields, NO_DOCUMENT, documentInput, documentProblem } from '../../components/account/DocumentFields';
import { Loading } from '../../components/shared/Loading';
import { PASSWORD_MIN, accountErrorText, fetchAccount, savePassword } from '../../services/account';
import { NotFoundPage } from '../NotFoundPage';
import '../../components/registration/RegistrationForm.css';
import './Account.css';
import { safeNext, takeNext } from './nextPage';
import { useAccountPaths } from './useAccountPaths';

/**
 * `/:event/conta/confirmar` (new account) and `/:event/conta/nova-senha` (forgotten
 * password): the link from the e-mail logs the person in, and the password is
 * chosen here. Until it is, the account has a password nobody knows.
 *
 * A new account also confirms here who the person is (ADR-010): the document typed when
 * the account was asked for is shown, to keep or to correct, and becomes the account's
 * with the password. Only now, because only now is it known who reads this e-mail.
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
  // Whether this account still has to say who the person is, and what is typed for it.
  // `null` until the account has answered.
  const [needsDocument, setNeedsDocument] = useState<boolean | null>(type === 'signup' ? null : false);
  const [document, setDocument] = useState(NO_DOCUMENT);

  const { enabled, accessToken } = auth;
  useEffect(() => {
    if (type !== 'signup' || link !== 'ok' || !accessToken) return;
    let active = true;
    fetchAccount(accessToken)
      .then(({ user }) => {
        if (!active) return;
        const waiting = user.pendingDocument;
        if (user.documentMissing && waiting) {
          setDocument({ cpf: maskCpf(waiting.cpf ?? ''), passport: waiting.passport ?? '', country: waiting.country ?? '' });
        }
        setNeedsDocument(Boolean(user.documentMissing));
      })
      // The account could not be read: ask for the document anyway, the server decides.
      .catch(() => active && setNeedsDocument(true));
    return () => {
      active = false;
    };
  }, [type, link, accessToken]);

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
    const problem = needsDocument ? documentProblem(document) : null;
    if (problem) return setError(t(`account.errors.${problem}`));
    setBusy(true);
    try {
      await savePassword(auth.accessToken, password, needsDocument ? documentInput(document) : {});
      // Changing the password ends every session of the account, this one included.
      if (auth.email) await auth.signIn(auth.email, password);
      // On to where the person was going before the site asked for an account, if anywhere.
      // The link in the e-mail says it; failing that, what this browser remembers; failing that, Minha área.
      const remembered = takeNext(paths.area);
      navigate(safeNext(params.get('next'), remembered), { replace: true });
    } catch (err) {
      setError(accountErrorText(t, err, { min: PASSWORD_MIN }));
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
          {link === 'ok' && needsDocument === null && <Loading />}
          {link === 'ok' && needsDocument !== null && (
            <>
              <p>{t(`${key}.intro`)}</p>
              <form className="reg-form" onSubmit={(e) => void submit(e)} noValidate>
                {needsDocument && (
                  <fieldset className="account__fieldset" data-testid="confirm-document">
                    <legend>{t('account.document.title')}</legend>
                    <DocumentFields idPrefix="confirm" value={document} onChange={setDocument} disabled={busy} />
                    <p className="reg-form__hint">{t('account.document.confirm')}</p>
                  </fieldset>
                )}
                <div className="reg-form__field">
                  <label htmlFor="new-password">{t('account.password.new')}</label>
                  <PasswordInput
                    id="new-password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <p className="reg-form__hint">{t('account.password.hint', { min: PASSWORD_MIN })}</p>
                </div>
                <div className="reg-form__field">
                  <label htmlFor="repeat-password">{t('account.password.repeat')}</label>
                  <PasswordInput
                    id="repeat-password"
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
