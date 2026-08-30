import type { NewsItem } from '@sieamb/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NewsCard } from '../components/news/NewsCard';
import { PageHeader } from '../components/shared/PageHeader';
import { useEvent } from '../contexts/EventContext';
import { getDataProvider } from '../services';

export function NewsListPage() {
  const { t } = useTranslation();
  const { event } = useEvent();
  const [news, setNews] = useState<NewsItem[] | null>(null);

  useEffect(() => {
    if (!event) return;
    void getDataProvider().getPublishedNews(event.id).then(setNews);
  }, [event]);

  if (!event) return null;

  return (
    <>
      <PageHeader title={t('news.title')} />
      <section className="section">
        <div className="container">
          {news === null ? (
            <p>{t('common.loading')}</p>
          ) : news.length === 0 ? (
            <p>{t('news.empty')}</p>
          ) : (
            <div className="home-news">
              {news.map((item) => (
                <NewsCard key={item.id} item={item} base={`/${event.slug}`} />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
