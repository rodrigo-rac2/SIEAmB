import type { EventSummary } from '@sieamb/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useEvent } from '../../contexts/EventContext';
import { getDataProvider } from '../../services';
import './ArchivedBanner.css';

/** Shown on archived editions: tells the visitor this is a past edition and links to the current one. */
export function ArchivedBanner() {
  const { t } = useTranslation();
  const { event } = useEvent();
  const [current, setCurrent] = useState<EventSummary | null>(null);

  useEffect(() => {
    if (!event?.isArchived) return;
    void getDataProvider().getCurrentEvent().then(setCurrent);
  }, [event]);

  if (!event?.isArchived) return null;

  return (
    <div className="archived-banner" role="note">
      <div className="container archived-banner__inner">
        <span>{t('editions.archivedBanner', { event: event.name })}</span>
        {current && (
          <Link to={`/${current.slug}/`}>
            {t('editions.goToCurrent', { event: current.name })} →
          </Link>
        )}
      </div>
    </div>
  );
}
