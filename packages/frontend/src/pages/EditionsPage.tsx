import type { EventSummary, Locale } from '@sieamb/shared';
import { formatDateRange } from '@sieamb/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/shared/PageHeader';
import { getDataProvider } from '../services';

export function EditionsPage() {
  const { t, i18n } = useTranslation();
  const [events, setEvents] = useState<EventSummary[]>([]);
  const locale = (i18n.resolvedLanguage ?? 'pt-BR') as Locale;

  useEffect(() => {
    void getDataProvider().getEvents().then(setEvents);
  }, []);

  return (
    <>
      <PageHeader title={t('editions.title')} />
      <section className="section">
        <div className="container">
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {events.map((e) => (
              <li
                key={e.id}
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-5)',
                }}
              >
                <h2 style={{ fontSize: 'var(--text-lg)' }}>
                  <Link to={`/${e.slug}/`}>{e.fullName}</Link>
                </h2>
                <p style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
                  {formatDateRange(e.startsAt, e.endsAt, locale)}
                  {' · '}
                  {e.isCurrent ? t('editions.current') : e.isArchived ? t('editions.archived') : ''}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
