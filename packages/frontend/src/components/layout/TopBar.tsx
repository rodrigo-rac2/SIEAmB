import { useTranslation } from 'react-i18next';
import { formatDateRange, type Locale } from '@sieamb/shared';
import { useEvent } from '../../contexts/EventContext';
import './TopBar.css';

export function TopBar() {
  const { i18n } = useTranslation();
  const { event } = useEvent();
  if (!event) return null;

  const locale = (i18n.resolvedLanguage ?? 'pt-BR') as Locale;

  return (
    <div className="topbar">
      <div className="container topbar__inner">
        <span>{formatDateRange(event.startsAt, event.endsAt, locale)}</span>
        {event.venue && <span>{event.venue}</span>}
      </div>
    </div>
  );
}
