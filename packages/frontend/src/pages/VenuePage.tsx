import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/shared/PageHeader';
import { useEvent } from '../contexts/EventContext';
import { useLocalized } from '../hooks/useLocale';

export function VenuePage() {
  const { t } = useTranslation();
  const { event } = useEvent();
  const l = useLocalized();

  if (!event) return null;

  return (
    <>
      <PageHeader title={t('venue.title')} />
      <section className="section">
        <div className="container" style={{ maxWidth: '72ch' }}>
          <h2>{l(event.venue) ?? t('venue.title')}</h2>
          {event.isOnline && <p>{t('venue.onlineText')}</p>}
          {event.venueUrl && (
            <p>
              <a href={event.venueUrl} target="_blank" rel="noreferrer">
                {event.isOnline ? t('venue.onlineCta') : t('venue.mapCta')} →
              </a>
            </p>
          )}
        </div>
      </section>
    </>
  );
}
