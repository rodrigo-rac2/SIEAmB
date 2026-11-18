import type { Edital, ImportantDate, NewsItem, Sponsor } from '@sieamb/shared';
import { formatDate, formatDateList } from '@sieamb/shared';
import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { NewsCard } from '../components/news/NewsCard';
import { ImportantDatesTable } from '../components/shared/ImportantDatesTable';
import { useEvent } from '../contexts/EventContext';
import { useLocale, useLocalized } from '../hooks/useLocale';
import { getDataProvider } from '../services';
import { assetUrl } from '../lib/assets';
import { accountsEnabled } from '../services/account';
import { fetchWindow, type WindowState } from '../services/submissions';
import './HomePage.css';
import { Loading } from '../components/shared/Loading';

/**
 * Reproduces the identity lockup typography for the pt-BR full name
 * ("II Seminário" light · "Internacional de" bold+light · "Estudos Ambientais" bold dark).
 * Any other string falls back to plain text, so other locales stay correct.
 */
function BrandTitle({ text }: { text: string }) {
  const m = /^(.*?Seminário)\s+(Internacional)\s+(de)\s+(.+)$/u.exec(text);
  if (!m) return <>{text}</>;
  return (
    <>
      <span className="brand-title__l1">{m[1]}</span>{' '}
      <span className="brand-title__l2">
        <strong>{m[2]}</strong> {m[3]}
      </span>{' '}
      <span className="brand-title__l3">{m[4]}</span>
    </>
  );
}

export function HomePage() {
  const { t } = useTranslation();
  const l = useLocalized();
  const locale = useLocale();
  const { event } = useEvent();
  const [dates, setDates] = useState<ImportantDate[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [edital, setEdital] = useState<Edital | null>(null);
  // Whether papers can be sent right now, and until when (#306). Null where the system is off.
  const [papers, setPapers] = useState<{ state: WindowState; closesAt: string } | null>(null);
  const [papersUnknown, setPapersUnknown] = useState(false);

  useEffect(() => {
    if (!event) return;
    const provider = getDataProvider();
    void provider.getImportantDates(event.id).then(setDates);
    void provider.getPublishedNews(event.id).then((items) => setNews(items.slice(0, 3)));
    void provider.getSponsors(event.id).then(setSponsors);
    // Newest call of the edition drives the strip under the hero.
    void provider
      .getEditais(event.id)
      .then((list) => setEdital([...list].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0] ?? null));
  }, [event]);

  useEffect(() => {
    if (!event || !accountsEnabled()) return;
    let active = true;
    fetchWindow(event.slug)
      .then((w) => active && setPapers(w))
      // Without the answer the page stays as it is without submissions: nothing is promised.
      .catch(() => active && setPapersUnknown(true));
    return () => {
      active = false;
    };
  }, [event]);

  if (!event) return null;
  const base = `/${event.slug}`;
  const papersOpen = papers?.state === 'open';
  // Asked and not answered yet. Until then the page shows neither "Edital publicado" nor
  // "Submissões abertas", so that neither is drawn only to be replaced by the other (#324).
  const papersPending = accountsEnabled() && !papers && !papersUnknown;

  const pdf = edital?.attachments.find((f) => f.format === 'pdf');

  const quickLinks = [
    ...(edital
      ? [{ to: `${base}/editais`, title: t('home.quickEditais'), desc: t('home.quickEditaisDesc') }]
      : []),
    {
      to: `${base}/inscricoes`,
      title: t('home.quickRegistration'),
      desc: t('home.quickRegistrationDesc'),
    },
    {
      to: `${base}/submissoes`,
      title: t('home.quickSubmissions'),
      desc: t('home.quickSubmissionsDesc'),
    },
    {
      to: `${base}/datas-importantes`,
      title: t('home.quickDates'),
      desc: t('home.quickDatesDesc'),
    },
    { to: `${base}/areas-tematicas`, title: t('home.quickAreas'), desc: t('home.quickAreasDesc') },
    {
      to: `${base}/programacao`,
      title: t('home.quickProgramme'),
      desc: t('home.quickProgrammeDesc'),
    },
  ];

  return (
    <>
      <section
        className={`hero ${event.heroImageUrl ? 'hero--light' : ''}`}
        style={
          event.heroImageUrl
            ? ({ '--hero-texture': `url(${assetUrl(event.heroImageUrl)})` } as CSSProperties)
            : undefined
        }
      >
        <div className="container hero__inner">
          <p className="hero__edition">{event.name}</p>
          {event.lockupUrl ? (
            <h1 className="hero__title">
              <img className="hero__lockup" src={assetUrl(event.lockupUrl)} alt="" />
              <span className="visually-hidden">{event.fullName}</span>
            </h1>
          ) : event.heroImageUrl && event.logoUrl ? (
            <div className="hero__brand">
              <img className="hero__brand-logo" src={assetUrl(event.logoUrl)} alt="" />
              <h1 className="hero__title hero__title--brand">
                <BrandTitle text={event.fullName} />
              </h1>
            </div>
          ) : (
            <h1 className="hero__title">{event.fullName}</h1>
          )}
          {event.motto && (
            <p className="hero__motto" data-testid="hero-motto">
              {t('home.mottoLabel')} <q>{l(event.motto)}</q>
            </p>
          )}
          <p className="hero__meta">
            <span>{formatDateList(event.startsAt, event.endsAt, locale)}</span>
            {event.venue && <span>{l(event.venue)}</span>}
          </p>
          <p className="hero__actions">
            {event.settings.registrationOpen && (
              <Link className="hero__cta" to={`${base}/inscricoes`}>
                {t('registration.registerCta')}
              </Link>
            )}
            {/* While papers can be sent, the way in sits beside the registration (#244, #306). */}
            {papersOpen && (
              <Link className="hero__cta hero__cta--second" to={`${base}/meus-trabalhos/novo`} data-testid="hero-submit">
                {t('papers.send')}
              </Link>
            )}
            {/* Its place is kept while the server is asked, so "Fazer inscrição" does not move when it comes. */}
            {papersPending && (
              <span className="hero__cta hero__cta--second hero__cta--waiting" aria-hidden="true" data-testid="hero-submit-waiting">
                <span className="processing__spinner" />
                <span className="hero__cta-ghost">{t('papers.send')}</span>
              </span>
            )}
          </p>
        </div>
      </section>

      {event.settings.registrationOpen && (
        <section className="registration-callout" aria-labelledby="registration-callout-title">
          <div className="container registration-callout__inner">
            <div className="registration-callout__text">
              <span className="registration-callout__badge">
                <span className="registration-callout__dot" aria-hidden="true" />
                {t('home.registrationBadge')}
              </span>
              <h2 id="registration-callout-title" className="registration-callout__title">
                {t('home.registrationTitle', { event: event.name })}
              </h2>
              <p>{t('home.registrationBody')}</p>
            </div>
            <div className="registration-callout__actions">
              <Link className="registration-callout__primary" to={`${base}/inscricoes/nova`}>
                {t('registration.registerCta')} →
              </Link>
              <Link className="registration-callout__secondary" to={`${base}/inscricoes`}>
                {t('home.registrationFees')}
              </Link>
            </div>
          </div>
        </section>
      )}

      {edital && papersPending && (
        <section className="edital-strip edital-strip--waiting" aria-busy="true" data-testid="edital-strip-waiting">
          <div className="container edital-strip__inner">
            <Loading />
          </div>
        </section>
      )}

      {edital && !papersPending && (
        <section className="edital-strip" aria-labelledby="edital-strip-title">
          <div className="container edital-strip__inner">
            <div className="edital-strip__text">
              {papersOpen ? (
                <>
                  <span className="edital-strip__badge edital-strip__badge--open" data-testid="papers-open-badge">
                    <span className="registration-callout__dot" aria-hidden="true" />
                    {t('home.papersBadge')}
                  </span>
                  <h2 id="edital-strip-title" className="edital-strip__title">
                    {t('home.papersTitle', { event: event.name })}
                  </h2>
                  <p>{t('home.papersBody', { date: formatDate(papers.closesAt, locale) })}</p>
                </>
              ) : (
                <>
                  <span className="edital-strip__badge">{t('home.editalBadge')}</span>
                  <h2 id="edital-strip-title" className="edital-strip__title">
                    {l(edital.title)}
                  </h2>
                  {edital.summary && <p>{l(edital.summary)}</p>}
                </>
              )}
            </div>
            <div className="edital-strip__actions">
              {papersOpen && (
                <Link className="edital-strip__primary" to={`${base}/meus-trabalhos/novo`} data-testid="papers-open-cta">
                  {t('papers.send')} →
                </Link>
              )}
              <Link className={papersOpen ? undefined : 'edital-strip__primary'} to={`${base}/editais/${edital.slug}`}>
                {t('home.editalRead')}
                {papersOpen ? '' : ' →'}
              </Link>
              {pdf && (
                <a href={assetUrl(pdf.url)} target="_blank" rel="noreferrer">
                  {t('home.editalPdf')}
                </a>
              )}
            </div>
          </div>
        </section>
      )}

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
