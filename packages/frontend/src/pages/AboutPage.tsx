import type { EventSummary, Founder, SiteContent } from '@sieamb/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Markdown from 'react-markdown';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/shared/PageHeader';
import { useEvent } from '../contexts/EventContext';
import { assetUrl } from '../lib/assets';
import { getDataProvider } from '../services';
import './AboutPage.css';

export function AboutPage() {
  const { t } = useTranslation();
  const { event } = useEvent();
  const [site, setSite] = useState<SiteContent | null>(null);
  const [founders, setFounders] = useState<Founder[]>([]);
  const [editions, setEditions] = useState<EventSummary[]>([]);

  useEffect(() => {
    const provider = getDataProvider();
    void provider.getSiteContent().then(setSite);
    void provider.getFounders().then(setFounders);
    void provider.getEvents().then(setEditions);
  }, []);

  if (!event) return null;
  const previous = editions.filter((e) => e.id !== event.id);

  return (
    <>
      <PageHeader title={t('about.title')} />
      <section className="section">
        <div className="container about">
          {site && <Markdown>{site.aboutMd}</Markdown>}
          <p>{t('about.organizedBy')}.</p>

          <h2 id="edicao">
            {t('about.editionTitle')}: {event.name}
          </h2>
          {event.aboutMd ? (
            <Markdown>{event.aboutMd}</Markdown>
          ) : (
            <p className="about__pending">{t('about.editionPending')}</p>
          )}

          <h2 id="idealizadores">{t('about.foundersTitle')}</h2>
          <ul className="founders">
            {founders.map((f) => (
              <li key={f.id} className="founder">
                <div className="founder__photo" aria-hidden={!f.photoUrl}>
                  {f.photoUrl ? (
                    <img src={assetUrl(f.photoUrl)} alt="" loading="lazy" />
                  ) : (
                    <span>{f.name.replace(/^(Dra?\.|Ma?\.|Me\.)\s+/, '').charAt(0)}</span>
                  )}
                </div>
                <div className="founder__body">
                  <h3>{f.name}</h3>
                  {f.affiliation && <p className="founder__affiliation">{f.affiliation}</p>}
                  <div className="founder__bio">
                    <Markdown>{f.bioMd}</Markdown>
                  </div>
                  {(f.lattesUrl || f.orcidUrl) && (
                    <p className="founder__links">
                      {f.lattesUrl && (
                        <a href={f.lattesUrl} target="_blank" rel="noreferrer">
                          {t('about.lattes')}
                        </a>
                      )}
                      {f.orcidUrl && (
                        <a href={f.orcidUrl} target="_blank" rel="noreferrer">
                          {t('about.orcid')}
                        </a>
                      )}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {previous.length > 0 && (
            <>
              <h2>{t('about.previousEditions')}</h2>
              <ul>
                {previous.map((e) => (
                  <li key={e.id}>
                    <Link to={`/${e.slug}/o-evento`}>{e.fullName}</Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>
    </>
  );
}
