import type { Edital } from '@sieamb/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { EditalFiles } from '../components/editais/EditalFiles';
import { PageHeader } from '../components/shared/PageHeader';
import { useAuth } from '../contexts/AuthContext';
import { useEvent } from '../contexts/EventContext';
import { getDataProvider } from '../services';
import { fetchWindow, type WindowState } from '../services/submissions';
import './account/Account.css';
import './SubmissionsPage.css';
import { Loading } from '../components/shared/Loading';

export function SubmissionsPage() {
  const { t } = useTranslation();
  const { event } = useEvent();
  const [edital, setEdital] = useState<Edital | null>(null);
  const auth = useAuth();
  // Where the submission system is on, the server says whether submissions are open.
  const [state, setState] = useState<WindowState | null>(null);
  // The server could not say: the page must not claim anything about the window (#324).
  const [unknown, setUnknown] = useState(false);

  useEffect(() => {
    if (!event || !auth.enabled) return;
    let active = true;
    fetchWindow(event.slug)
      .then((w) => active && setState(w.state))
      .catch(() => active && setUnknown(true));
    return () => {
      active = false;
    };
  }, [event, auth.enabled]);

  useEffect(() => {
    if (!event) return;
    void getDataProvider()
      .getEditais(event.id)
      .then((list) => setEdital(list[0] ?? null));
  }, [event]);

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
          ) : auth.enabled && !unknown ? (
            // Asked and not answered yet: no "opens soon" that the answer would then contradict (#324).
            <div className="submissions-soon" data-testid="submissions-loading">
              <Loading />
            </div>
          ) : auth.enabled && event ? (
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
