import { formatDate, type Locale, type NewsItem } from '@sieamb/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import './NewsCard.css';

export function NewsCard({ item, base }: { item: NewsItem; base: string }) {
  const { t, i18n } = useTranslation();
  const locale = (i18n.resolvedLanguage ?? 'pt-BR') as Locale;

  return (
    <article className="news-card">
      {item.isPinned && <span className="news-card__pin">{t('news.pinned')}</span>}
      <h3 className="news-card__title">
        <Link to={`${base}/avisos/${item.slug}`}>{item.title}</Link>
      </h3>
      {item.publishedAt && (
        <p className="news-card__date">
          {t('news.publishedAt', { date: formatDate(item.publishedAt, locale) })}
        </p>
      )}
      {item.excerpt && <p className="news-card__excerpt">{item.excerpt}</p>}
      <Link className="news-card__more" to={`${base}/avisos/${item.slug}`}>
        {t('news.readMore')} →
      </Link>
    </article>
  );
}
