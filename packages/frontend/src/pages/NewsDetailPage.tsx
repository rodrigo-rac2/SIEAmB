import { formatDate, type Locale, type NewsItem } from '@sieamb/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Markdown from 'react-markdown';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../components/shared/PageHeader';
import { useEvent } from '../contexts/EventContext';
import { getDataProvider } from '../services';

export function NewsDetailPage() {
  const { t, i18n } = useTranslation();
  const { event } = useEvent();
  const { newsSlug } = useParams<{ newsSlug: string }>();
  const [item, setItem] = useState<NewsItem | null | undefined>(undefined);

  useEffect(() => {
    if (!event || !newsSlug) return;
    void getDataProvider().getNewsBySlug(event.id, newsSlug).then(setItem);
  }, [event, newsSlug]);

  if (!event) return null;
  const locale = (i18n.resolvedLanguage ?? 'pt-BR') as Locale;

  if (item === undefined) {
    return (
      <section className="section">
        <div className="container">
          <p>{t('common.loading')}</p>
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
      <PageHeader title={item.title}>
        {item.publishedAt && (
          <p style={{ margin: 0, color: 'var(--color-ink-muted)', fontSize: 'var(--text-sm)' }}>
            {t('news.publishedAt', { date: formatDate(item.publishedAt, locale) })}
          </p>
        )}
      </PageHeader>
      <section className="section">
        <div className="container" style={{ maxWidth: '72ch' }}>
          <Markdown>{item.bodyMd}</Markdown>
          <p style={{ marginTop: 'var(--space-6)' }}>
            <Link to={`/${event.slug}/avisos`}>← {t('news.title')}</Link>
          </p>
        </div>
      </section>
    </>
  );
}
