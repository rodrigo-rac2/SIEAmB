import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { PageHeader } from '../../components/shared/PageHeader';
import { useAuth } from '../../contexts/AuthContext';
import { useEvent } from '../../contexts/EventContext';
import { useLocale, useLocalized } from '../../hooks/useLocale';
import { useContent } from '../../hooks/useContent';
import { fetchAccount, type AccountRegistration } from '../../services/account';
import {
  SubmissionError,
  browser,
  fetchMyPapers,
  paperFileUrl,
  withdrawPaper,
  type MyPapers,
  type Paper,
} from '../../services/submissions';
import { NotFoundPage } from '../NotFoundPage';
import '../../components/registration/RegistrationForm.css';
import '../account/Account.css';
import './Papers.css';
import { Loading, PageLoading } from '../../components/shared/Loading';

const day = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'America/Fortaleza' }).format(new Date(iso));

/** The registration beside the papers: the edital asks for one registered author per approved paper. */
function RegistrationNotice({
  registration,
  hasPapers,
  slug,
}: {
  registration: AccountRegistration | null;
  hasPapers: boolean;
  slug: string;
}) {
  const { t } = useTranslation();
  if (!registration) {
    return (
      <div className="account__notice" data-testid="registration-notice">
        <p>{t(hasPapers ? 'papers.registration.noneWithPapers' : 'papers.registration.none')}</p>
        <Link className="account__button" to={`/${slug}/inscricoes/nova`}>
          {t('account.area.registerCta')}
        </Link>
      </div>
    );
  }
  return (
    <div
      className={`account__notice${registration.state === 'PAID' ? ' account__notice--ok' : ''}`}
      data-testid="registration-notice"
    >
      <p>
        <strong>{t(`account.area.states.${registration.state}`)}.</strong>{' '}
        {t(`papers.registration.${registration.state}`)}
      </p>
      {registration.payToken && (
        <Link className="account__button" to={`/${slug}/inscricoes/pagar?t=${registration.payToken}`}>
          {t('account.area.payCta')}
        </Link>
      )}
    </div>
  );
}

function PaperCard({
  paper,
  areaName,
  onOpen,
  onWithdraw,
  slug,
}: {
  paper: Paper;
  areaName: string;
  onOpen: () => Promise<void>;
  onWithdraw: () => Promise<void>;
  slug: string;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    await action();
    setBusy(false);
  };
  return (
    <div className="account__card" data-testid="paper-card">
      <p className="papers__meta">
        {t('papers.number', { number: paper.number })} · {t(`papers.modalities.${paper.modality}`)} · {areaName}
      </p>
      <h3>{paper.title}</h3>
      <p>
        <span className={`account__state account__state--${paper.status === 'APPROVED' ? 'PAID' : 'PENDING'}`}>
          {t(`papers.status.${paper.status}`)}
        </span>{' '}
        <span className="papers__meta">
          {paper.position !== null && `${t('papers.authorPosition', { n: paper.position })} · `}
          {!paper.sentByMe && !paper.canEdit && `${t('papers.readOnly')} · `}
          {t('papers.sentOn', { date: day(paper.createdAt, locale) })}
        </span>
      </p>
      <ol className="papers__authors">
        {paper.authors.map((a) => (
          <li key={a.position}>{a.fullName}</li>
        ))}
      </ol>
      {/* An author who signed up saying they are someone else than the line says (ADR-010): the place waits until this is saved again. */}
      {(paper.authorIssues ?? []).map((issue) => (
        <p className="account__notice" role="status" data-testid="author-issue" key={issue.position}>
          {t('papers.authorIssue', { name: issue.fullName })}
        </p>
      ))}
      <p className="papers__meta">
        {paper.fileName}
        {paper.filePages !== null && ` · ${t('papers.pages', { count: paper.filePages })}`}
      </p>
      <div className="account__actions">
        <button className="account__button account__button--quiet" type="button" disabled={busy} onClick={() => void run(onOpen)}>
          {t('papers.openFile')}
        </button>
        {paper.canEdit && <Link to={`/${slug}/meus-trabalhos/${paper.id}`}>{t('papers.edit')}</Link>}
        {paper.canEdit && !confirming && (
          <button className="account__button account__button--quiet" type="button" onClick={() => setConfirming(true)}>
            {t('papers.withdraw')}
          </button>
        )}
        {paper.canEdit && confirming && (
          <>
            <span>{t('papers.withdrawConfirm')}</span>
            <button className="account__button" type="button" disabled={busy} onClick={() => void run(onWithdraw)}>
              {t('papers.withdrawYes')}
            </button>
            <button className="account__button account__button--quiet" type="button" onClick={() => setConfirming(false)}>
              {t('common.cancel')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** `/:event/meus-trabalhos`: the papers a person sent or is a co-author of, with the registration beside them. */
export function MyPapersPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const { event } = useEvent();
  const location = useLocation();
  const locale = useLocale();
  const l = useLocalized();
  // Where the submission system is off the page does not exist, and asks nothing.
  const accessToken = auth.enabled ? auth.accessToken : null;
  const [papers, setPapers] = useState<MyPapers | null>(null);
  const [registration, setRegistration] = useState<AccountRegistration | null>(null);
  const areas = useContent('getThematicAreas', event?.id) ?? [];
  const [error, setError] = useState<string | null>(null);

  const message = useCallback(
    (err: unknown) =>
      t(`papers.errors.${err instanceof SubmissionError ? err.code : 'generic'}`, err instanceof SubmissionError ? err.details : {}),
    [t],
  );

  const load = useCallback(async () => {
    if (!accessToken || !event) return;
    try {
      const [mine, account] = await Promise.all([fetchMyPapers(accessToken, event.slug), fetchAccount(accessToken)]);
      setPapers(mine);
      setRegistration(account.registrations.find((r) => r.eventSlug === event.slug) ?? null);
    } catch (err) {
      setError(message(err));
    }
  }, [accessToken, event, message]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!auth.enabled) return <NotFoundPage />;
  if (!event) return null;
  // The session is still being read: say so, under the page's title (#324).
  if (auth.loading) return <PageLoading title={t('papers.title')} />;
  if (!accessToken) {
    return <Navigate to={`/${event.slug}/conta/entrar?next=${encodeURIComponent(location.pathname)}`} replace />;
  }

  const open = async (paper: Paper) => {
    setError(null);
    try {
      browser.open(await paperFileUrl(accessToken, paper.id));
    } catch (err) {
      setError(message(err));
    }
  };
  const withdraw = async (paper: Paper) => {
    setError(null);
    try {
      await withdrawPaper(accessToken, event.slug, paper.id);
      await load();
    } catch (err) {
      setError(message(err));
    }
  };

  const areaName = (ref: string) => {
    const area = areas.find((a) => a.id === ref);
    return area ? l(area.name) : ref;
  };
  // Room left in either of the edital's limits: as first author, or in any other place.
  const canSend =
    papers?.state === 'open' &&
    (papers.limits.asMain < papers.limits.maxAsMain || papers.limits.asCoauthor < papers.limits.maxAsCoauthor);

  return (
    <>
      <PageHeader title={t('papers.title')} />
      <section className="section">
        <div className="container papers">
          {error && (
            <p className="reg-form__error reg-form__error--global" role="alert">
              {error}
            </p>
          )}
          {!papers && !error && <Loading />}
          {papers && (
            <>
              <p className="papers__limits" data-testid="paper-limits">
                {t(`papers.window.${papers.state === 'open' && papers.pastDeadline ? 'open_late' : papers.state}`, {
                  // Closed by the organisers: the day they closed it, not the published date.
                  date: day(papers.state === 'closed' && papers.closedAt ? papers.closedAt : papers.closesAt, locale),
                })}{' '}
                {t('papers.limits', papers.limits)}
              </p>
              {/* Nothing is sent, and no paper that names a document is shown, until the account says who the person is (ADR-010). */}
              {papers.documentMissing && (
                <div className="account__notice" role="status" data-testid="document-missing">
                  <p>{t('papers.documentMissing')}</p>
                  <Link className="account__button" to={`/${event.slug}/minha-area#meus-dados`}>
                    {t('papers.documentMissingCta')}
                  </Link>
                </div>
              )}
              {/* Places that wait: listed with another document, or under another address. */}
              {(papers.waiting?.otherDocument ?? 0) > 0 && !papers.documentMissing && (
                <p className="account__notice" role="status" data-testid="waiting-other-document">
                  {t('papers.waitingOtherDocument', { count: papers.waiting!.otherDocument })}
                </p>
              )}
              {(papers.waiting?.otherEmail ?? []).map((place) => (
                <p className="account__notice" role="status" data-testid="waiting-other-email" key={place.maskedEmail}>
                  {t('papers.waitingOtherEmail', { count: place.count, email: place.maskedEmail })}
                </p>
              ))}
              {canSend && !papers.documentMissing && (
                <p>
                  <Link className="account__button" to={`/${event.slug}/meus-trabalhos/novo`}>
                    {t('papers.send')}
                  </Link>
                </p>
              )}
              {papers.state === 'open' && !canSend && <p className="account__notice">{t('papers.limitReached', papers.limits)}</p>}

              {papers.submissions.length === 0 && <p data-testid="no-papers">{t('papers.none')}</p>}
              {papers.submissions.map((paper) => (
                <PaperCard
                  key={paper.id}
                  paper={paper}
                  areaName={areaName(paper.areaRef)}
                  slug={event.slug}
                  onOpen={() => open(paper)}
                  onWithdraw={() => withdraw(paper)}
                />
              ))}

              {/* The registration comes after the papers, always: this page is about the papers (#257). */}
              <RegistrationNotice registration={registration} hasPapers={papers.submissions.length > 0} slug={event.slug} />
              <p className="account__links">
                <Link to={`/${event.slug}/minha-area`}>{t('account.nav.myArea')}</Link>
                <Link to={`/${event.slug}/submissoes`}>{t('submissions.rulesTitle')}</Link>
              </p>
            </>
          )}
        </div>
      </section>
    </>
  );
}
