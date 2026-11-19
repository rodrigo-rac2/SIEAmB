import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { PageHeader } from '../../components/shared/PageHeader';
import { useAuth } from '../../contexts/AuthContext';
import { useEvent } from '../../contexts/EventContext';
import { useLocalized } from '../../hooks/useLocale';
import { useContent } from '../../hooks/useContent';
import { SubmissionError, browser, fetchReviewing, paperFileUrl, type ReviewPaper } from '../../services/submissions';
import { NotFoundPage } from '../NotFoundPage';
import '../account/Account.css';
import './Papers.css';
import { Loading, PageLoading } from '../../components/shared/Loading';

/**
 * `/:event/avaliacoes`: the papers the organisers chose this person to review (#232).
 * The review is not blind, so the authors are shown by name, as in the file.
 */
export function ReviewingPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const { event } = useEvent();
  const location = useLocation();
  const l = useLocalized();
  const accessToken = auth.enabled ? auth.accessToken : null;
  const [papers, setPapers] = useState<ReviewPaper[] | null>(null);
  const areas = useContent('getThematicAreas', event?.id) ?? [];
  const [error, setError] = useState<string | null>(null);

  const message = (err: unknown) =>
    t(`papers.errors.${err instanceof SubmissionError ? err.code : 'generic'}`, err instanceof SubmissionError ? err.details : {});

  useEffect(() => {
    if (!accessToken || !event) return;
    let active = true;
    fetchReviewing(accessToken, event.slug)
      .then((data) => active && setPapers(data.submissions))
      .catch((err) => active && setError(message(err)));
    return () => {
      active = false;
    };
    // `message` only reads the translation function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, event]);

  if (!auth.enabled) return <NotFoundPage />;
  if (!event) return null;
  // The session is still being read: say so, under the page's title (#324).
  if (auth.loading) return <PageLoading title={t('reviewing.title')} />;
  if (!accessToken) {
    return <Navigate to={`/${event.slug}/conta/entrar?next=${encodeURIComponent(location.pathname)}`} replace />;
  }

  const open = async (id: string) => {
    try {
      browser.open(await paperFileUrl(accessToken, id));
    } catch (err) {
      setError(message(err));
    }
  };
  const areaName = (ref: string) => {
    const area = areas.find((a) => a.id === ref);
    return area ? l(area.name) : ref;
  };

  return (
    <>
      <PageHeader title={t('reviewing.title')} />
      <section className="section">
        <div className="container papers">
          {error && (
            <p className="reg-form__error reg-form__error--global" role="alert">
              {error}
            </p>
          )}
          {!papers && !error && <Loading />}
          {papers && papers.length === 0 && <p data-testid="nothing-to-review">{t('reviewing.none')}</p>}
          {papers && papers.length > 0 && <p>{t('reviewing.intro')}</p>}
          {papers?.map((paper) => (
            <div className="account__card" key={paper.id} data-testid="review-card">
              <p className="papers__meta">
                {t('papers.number', { number: paper.number })} · {t(`papers.modalities.${paper.modality}`)} ·{' '}
                {areaName(paper.areaRef)}
              </p>
              <h3>{paper.title}</h3>
              <p className="papers__meta">{paper.titleEn}</p>
              <ol className="papers__authors">
                {paper.authors.map((a) => (
                  <li key={a.position}>{a.fullName}</li>
                ))}
              </ol>
              <h4>{t('reviewing.abstract')}</h4>
              <p className="papers__abstract">{paper.abstract}</p>
              <p className="papers__meta">
                {t('reviewing.keywords')}: {[...paper.keywords, ...paper.keywordsEn].join('; ')}
              </p>
              <p className="papers__meta">
                {paper.fileName}
                {paper.filePages !== null && ` · ${t('papers.pages', { count: paper.filePages })}`}
              </p>
              <div className="account__actions">
                <button className="account__button" type="button" onClick={() => void open(paper.id)}>
                  {t('papers.openFile')}
                </button>
              </div>
            </div>
          ))}
          <p className="account__links">
            <Link to={`/${event.slug}/minha-area`}>{t('account.area.title')}</Link>
          </p>
        </div>
      </section>
    </>
  );
}
