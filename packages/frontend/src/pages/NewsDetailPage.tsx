import { formatDate } from '@sieamb/shared';
import { useTranslation } from 'react-i18next';
import Markdown from 'react-markdown';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../components/shared/PageHeader';
import { useEvent } from '../contexts/EventContext';
import { useContent } from '../hooks/useContent';
import { useLocale, useLocalized } from '../hooks/useLocale';
import { Loading } from '../components/shared/Loading';

export function NewsDetailPage() {
  const { t } = useTranslation();
  const l = useLocalized();
  const locale = useLocale();
  const { event } = useEvent();
  const { newsSlug } = useParams<{ newsSlug: string }>();
  const item = useContent('getNewsBySlug', event?.id, newsSlug);

  if (!event) return null;

  if (item === undefined) {
    return (
      <section className="section">
        <div className="container">
          <Loading />
        </div>
      </section>
    );
  }

  if (item === null) {
    return (
      <section className="section">
        <div className="container">
          <h1>{t('common.notFoundTitle')}</h1>
          <p>{t('common.notFoundBody')}</p>
          <Link to={`/${event.slug}/avisos`}>← {t('news.title')}</Link>
        </div>
      </section>
    );
  }

  return (
    <>
      <PageHeader title={l(item.title)}>
        {item.publishedAt && (
          <p style={{ margin: 0, color: 'var(--color-ink-muted)', fontSize: 'var(--text-sm)' }}>
            {t('news.publishedAt', { date: formatDate(item.publishedAt, locale) })}
          </p>
        )}
      </PageHeader>
      <section className="section">
        <div className="container" style={{ maxWidth: '72ch' }}>
          <Markdown
            components={{
              // Internal paths stay in the SPA; everything else opens in a new tab.
              a: ({ href = '', children }) =>
                href.startsWith('/') ? (
                  <Link to={href}>{children}</Link>
                ) : (
                  <a href={href} target="_blank" rel="noreferrer">
                    {children}
                  </a>
                ),
            }}
          >
            {l(item.bodyMd)}
          </Markdown>
          <p style={{ marginTop: 'var(--space-6)' }}>
            <Link to={`/${event.slug}/avisos`}>← {t('news.title')}</Link>
          </p>
        </div>
      </section>
    </>
  );
}
