import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { EditalFiles } from '../components/editais/EditalFiles';
import { PageHeader } from '../components/shared/PageHeader';
import { useAuth } from '../contexts/AuthContext';
import { useEvent } from '../contexts/EventContext';
import { useContent } from '../hooks/useContent';
import { fetchWindow, rulesForEvent, type WindowState } from '../services/submissions';
import './account/Account.css';
import './SubmissionsPage.css';
import { Loading } from '../components/shared/Loading';

export function SubmissionsPage() {
  const { t } = useTranslation();
  const { event } = useEvent();
  const edital = useContent('getEditais', event?.id)?.[0] ?? null;
  const auth = useAuth();
  // Where the submission system is on, the server says whether submissions are open, for an
  // edition that has submission rules. One without them has no window to ask about (#339).
  const asks = auth.enabled && Boolean(event && rulesForEvent(event.id));
  // The answer belongs to the edition it was asked for. `state` is null when the server could
  // not say: the page must then claim nothing about the window (#324).
  const [answer, setAnswer] = useState<{ slug: string; state: WindowState | null } | null>(null);

  useEffect(() => {
    if (!event || !asks) return;
    let active = true;
    const slug = event.slug;
    fetchWindow(slug)
      .then((w) => active && setAnswer({ slug, state: w.state }))
      .catch(() => active && setAnswer({ slug, state: null }));
    return () => {
      active = false;
    };
  }, [event, asks]);

  const told = asks && event && answer?.slug === event.slug ? answer : null;
  const state = told?.state ?? null;
  const unknown = Boolean(told) && !state;

  return (
    <>
      <PageHeader title={t('submissions.title')} />
      <section className="section">
        <div className="container">
          {event && state ? (
            <div className="submissions-soon" role="status" data-testid="submissions-open">
              <h2>{t(`submissions.state.${state}.title`)}</h2>
              <p>{t(`submissions.state.${state}.body`)}</p>
              <p>
                {state === 'open' && (
                  <Link className="account__button" to={`/${event.slug}/meus-trabalhos/novo`}>
                    {t('papers.send')}
                  </Link>
                )}{' '}
                <Link to={`/${event.slug}/meus-trabalhos`}>{t('papers.title')}</Link>
              </p>
            </div>
          ) : asks && !unknown ? (
            // Asked and not answered yet: no "opens soon" that the answer would then contradict (#324).
            <div className="submissions-soon" data-testid="submissions-loading">
              <Loading />
            </div>
          ) : asks && event ? (
            <div className="submissions-soon" role="status" data-testid="submissions-unknown">
              <h2>{t('submissions.unknown.title')}</h2>
              <p>{t('submissions.unknown.body')}</p>
              <p>
                <Link to={`/${event.slug}/meus-trabalhos`}>{t('papers.title')}</Link>
              </p>
            </div>
          ) : (
            <div className="submissions-soon" role="status">
              <h2>{t('submissions.comingSoon')}</h2>
              <p>{t('submissions.comingSoonBody')}</p>
            </div>
          )}
          {event && edital && (
            <div className="submissions-rules">
              <h2>{t('submissions.rulesTitle')}</h2>
              <p>{t('submissions.rulesBody')}</p>
              <p>
                <Link to={`/${event.slug}/editais/${edital.slug}`}>{t('submissions.rulesCta')} →</Link>
              </p>
              <h3>{t('submissions.templatesTitle')}</h3>
              <EditalFiles files={edital.attachments.filter((f) => f.format !== 'pdf')} />
            </div>
          )}
        </div>
      </section>
    </>
  );
}
