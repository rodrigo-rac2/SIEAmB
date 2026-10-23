import { formatDate, localize, type Edital } from '@sieamb/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Markdown from 'react-markdown';
import { Link, useParams } from 'react-router-dom';
import { EditalFiles } from '../components/editais/EditalFiles';
import { PageHeader } from '../components/shared/PageHeader';
import { useEvent } from '../contexts/EventContext';
import { useLocale, useLocalized } from '../hooks/useLocale';
import { assetUrl } from '../lib/assets';
import { getDataProvider } from '../services';
import './EditalPage.css';

/** Relative links in the edital body point at files under public/, not at SPA routes. */
function resolveHref(href: string): string {
  return /^(https?:|mailto:|#)/.test(href) ? href : assetUrl(href);
}

export function EditalPage() {
  const { t } = useTranslation();
  const l = useLocalized();
  const locale = useLocale();
  const { event } = useEvent();
  const { editalSlug } = useParams<{ editalSlug: string }>();
  const [edital, setEdital] = useState<Edital | null | undefined>(undefined);

  useEffect(() => {
    if (!event || !editalSlug) return;
    void getDataProvider().getEditalBySlug(event.id, editalSlug).then(setEdital);
  }, [event, editalSlug]);

  if (!event) return null;
  const back = (
    <Link to={`/${event.slug}/editais`}>← {t('editais.backToList')}</Link>
  );

  if (edital === undefined) {
    return (
      <section className="section">
        <div className="container">
          <p>{t('common.loading')}</p>
        </div>
      </section>
    );
  }

  if (edital === null) {
    return (
      <section className="section">
        <div className="container">
          <h1>{t('common.notFoundTitle')}</h1>
          <p>{t('common.notFoundBody')}</p>
          {back}
        </div>
      </section>
    );
  }

  // The body is shown in the language it was written in; the notice says so when it differs.
  const body = l(edital.bodyMd);
  const bodyLang = body === localize(edital.bodyMd, 'pt-BR') ? 'pt-BR' : locale;

  return (
    <>
      <PageHeader title={l(edital.title)}>
        <p style={{ margin: 0, color: 'var(--color-ink-muted)', fontSize: 'var(--text-sm)' }}>
          {t('editais.publishedAt', { date: formatDate(edital.publishedAt, locale) })}
        </p>
      </PageHeader>
      <section className="section">
        <div className="container edital">
          <aside className="edital__files" aria-label={t('editais.files')}>
            <h2>{t('editais.files')}</h2>
            <EditalFiles files={edital.attachments} />
          </aside>
          {bodyLang !== locale && (
            <p className="edital__notice" role="note">
              {t('editais.officialTextNotice')}
            </p>
          )}
          <div className="edital__body" lang={bodyLang}>
            <Markdown
              components={{
                a: ({ href, children }) => {
                  const url = resolveHref(href ?? '');
                  return /^https?:/.test(url) ? (
                    <a href={url} target="_blank" rel="noreferrer">
                      {children}
                    </a>
                  ) : (
                    <a href={url}>{children}</a>
                  );
                },
              }}
            >
              {body}
            </Markdown>
          </div>
          <p style={{ marginTop: 'var(--space-6)' }}>{back}</p>
        </div>
      </section>
    </>
  );
}
