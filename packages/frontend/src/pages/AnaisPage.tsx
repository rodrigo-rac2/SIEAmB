import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/shared/PageHeader';
import { useEvent } from '../contexts/EventContext';
import { useContent } from '../hooks/useContent';
import { Loading } from '../components/shared/Loading';

export function AnaisPage() {
  const { t } = useTranslation();
  const { event } = useEvent();
  const entries = useContent('getAnais', event?.id);

  if (!event) return null;

  return (
    <>
      <PageHeader title={t('anais.title')} />
      <section className="section">
        <div className="container" style={{ maxWidth: '72ch' }}>
          {entries === undefined ? (
            <Loading />
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
