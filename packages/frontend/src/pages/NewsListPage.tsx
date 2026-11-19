import { useTranslation } from 'react-i18next';
import { NewsCard } from '../components/news/NewsCard';
import { PageHeader } from '../components/shared/PageHeader';
import { useEvent } from '../contexts/EventContext';
import { useContent } from '../hooks/useContent';
import { Loading } from '../components/shared/Loading';

export function NewsListPage() {
  const { t } = useTranslation();
  const { event } = useEvent();
  const news = useContent('getPublishedNews', event?.id);

  if (!event) return null;

  return (
    <>
      <PageHeader title={t('news.title')} />
      <section className="section">
        <div className="container">
          {news === undefined ? (
            <Loading />
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
