import type { AnaisEntry } from '@sieamb/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/shared/PageHeader';
import { useEvent } from '../contexts/EventContext';
import { getDataProvider } from '../services';

export function AnaisPage() {
  const { t } = useTranslation();
  const { event } = useEvent();
  const [entries, setEntries] = useState<AnaisEntry[] | null>(null);

  useEffect(() => {
    if (!event) return;
    void getDataProvider().getAnais(event.id).then(setEntries);
  }, [event]);

  if (!event) return null;

  return (
    <>
      <PageHeader title={t('anais.title')} />
      <section className="section">
        <div className="container" style={{ maxWidth: '72ch' }}>
          {entries === null ? (
            <p>{t('common.loading')}</p>
          ) : entries.length === 0 ? (
            <p>{t('anais.empty', { event: event.name })}</p>
          ) : (
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {entries.map((entry) => (
                <li key={entry.id}>
                  <a href={entry.url} target="_blank" rel="noreferrer">
                    {entry.title}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
