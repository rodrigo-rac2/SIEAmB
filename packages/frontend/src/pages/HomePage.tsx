import type { ImportantDate, Locale, NewsItem, Sponsor } from '@sieamb/shared';
import { formatDateRange } from '@sieamb/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { NewsCard } from '../components/news/NewsCard';
import { ImportantDatesTable } from '../components/shared/ImportantDatesTable';
import { useEvent } from '../contexts/EventContext';
import { getDataProvider } from '../services';
import './HomePage.css';

export function HomePage() {
  const { t, i18n } = useTranslation();
  const { event } = useEvent();
  const [dates, setDates] = useState<ImportantDate[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);

  useEffect(() => {
    if (!event) return;
    const provider = getDataProvider();
    void provider.getImportantDates(event.id).then(setDates);
    void provider.getPublishedNews(event.id).then((items) => setNews(items.slice(0, 3)));
    void provider.getSponsors(event.id).then(setSponsors);
  }, [event]);

  if (!event) return null;
  const base = `/${event.slug}`;
  const locale = (i18n.resolvedLanguage ?? 'pt-BR') as Locale;

  const quickLinks = [
    { to: `${base}/inscricoes`, title: t('home.quickRegistration'), desc: t('home.quickRegistrationDesc') },
    { to: `${base}/submissoes`, title: t('home.quickSubmissions'), desc: t('home.quickSubmissionsDesc') },
    { to: `${base}/datas-importantes`, title: t('home.quickDates'), desc: t('home.quickDatesDesc') },
    { to: `${base}/areas-tematicas`, title: t('home.quickAreas'), desc: t('home.quickAreasDesc') },
  ];

  return (
    <>
      <section className="hero">
        <div className="container hero__inner">
          <p className="hero__edition">{event.name}</p>
          <h1 className="hero__title">{event.fullName}</h1>
          <p className="hero__tagline">{t('home.heroTagline')}</p>
          <p className="hero__meta">
            {formatDateRange(event.startsAt, event.endsAt, locale)}
            {event.venue ? ` · ${event.venue}` : ''}
          </p>
          {event.settings.registrationOpen && (
            <Link className="hero__cta" to={`${base}/inscricoes`}>
              {t('registration.registerCta')}
            </Link>
          )}
        </div>
      </section>

      <section className="section">
        <div className="container quick-links">
          {quickLinks.map((q) => (
            <Link key={q.to} to={q.to} className="quick-links__card">
              <h2>{q.title}</h2>
              <p>{q.desc}</p>
              <span className="quick-links__more">{t('common.learnMore')} →</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="section section--alt">
        <div className="container">
          <h2>{t('home.aboutTitle')}</h2>
          <p className="home-about__text">{t('home.aboutTeaser')}</p>
          <Link to={`${base}/o-evento`}>{t('common.learnMore')} →</Link>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2>{t('home.datesTitle')}</h2>
          <ImportantDatesTable dates={dates} />
        </div>
      </section>

      {news.length > 0 && (
        <section className="section section--alt">
          <div className="container">
            <h2>{t('home.newsTitle')}</h2>
            <div className="home-news">
              {news.map((item) => (
                <NewsCard key={item.id} item={item} base={base} />
              ))}
            </div>
            <p className="home-news__all">
              <Link to={`${base}/avisos`}>{t('home.allNews')} →</Link>
            </p>
          </div>
        </section>
      )}

      {sponsors.length > 0 && (
        <section className="section">
          <div className="container">
            <h2>{t('home.sponsorsTitle')}</h2>
            <ul className="home-sponsors">
              {sponsors.map((s) => (
                <li key={s.id}>
                  {s.website ? (
                    <a href={s.website} target="_blank" rel="noreferrer">
                      {s.name}
                    </a>
                  ) : (
                    s.name
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </>
  );
}
