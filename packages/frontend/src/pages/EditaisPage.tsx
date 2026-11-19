import { formatDate } from '@sieamb/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/shared/PageHeader';
import { useEvent } from '../contexts/EventContext';
import { useContent } from '../hooks/useContent';
import { useLocale, useLocalized } from '../hooks/useLocale';
import '../components/news/NewsCard.css';
import { Loading } from '../components/shared/Loading';

export function EditaisPage() {
  const { t } = useTranslation();
  const l = useLocalized();
  const locale = useLocale();
  const { event } = useEvent();
  const editais = useContent('getEditais', event?.id);

  if (!event) return null;
  const base = `/${event.slug}/editais`;

  return (
    <>
      <PageHeader title={t('editais.title')}>
        <p style={{ margin: 0 }}>{t('editais.intro', { edition: event.name })}</p>
      </PageHeader>
      <section className="section">
        <div className="container" style={{ maxWidth: '72ch' }}>
          {editais === undefined ? (
            <Loading />
          ) : editais.length === 0 ? (
            <p role="status">{t('editais.empty', { edition: event.name })}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {editais.map((e) => (
                <article key={e.id} className="news-card">
                  <h2 className="news-card__title">
                    <Link to={`${base}/${e.slug}`}>{l(e.title)}</Link>
                  </h2>
                  <p className="news-card__date">
                    {t('editais.publishedAt', { date: formatDate(e.publishedAt, locale) })}
                  </p>
                  {e.summary && <p className="news-card__excerpt">{l(e.summary)}</p>}
                  <Link className="news-card__more" to={`${base}/${e.slug}`}>
                    {t('editais.read')} →
                  </Link>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
