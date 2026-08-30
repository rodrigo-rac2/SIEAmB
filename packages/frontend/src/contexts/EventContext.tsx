import type { EventSummary } from '@sieamb/shared';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { getDataProvider } from '../services';

interface EventContextValue {
  event: EventSummary | null;
  loading: boolean;
  notFound: boolean;
}

const EventContext = createContext<EventContextValue>({
  event: null,
  loading: true,
  notFound: false,
});

export function EventProvider({ children }: { children: ReactNode }) {
  const { eventSlug } = useParams<{ eventSlug: string }>();
  const [state, setState] = useState<EventContextValue>({
    event: null,
    loading: true,
    notFound: false,
  });

  useEffect(() => {
    let cancelled = false;
    setState({ event: null, loading: true, notFound: false });
    const provider = getDataProvider();
    const load = eventSlug
      ? provider.getEventBySlug(eventSlug)
      : provider.getCurrentEvent().then((e) => e as EventSummary | null);
    load
      .then((event) => {
        if (cancelled) return;
        setState({ event, loading: false, notFound: event === null });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ event: null, loading: false, notFound: true });
      });
    return () => {
      cancelled = true;
    };
  }, [eventSlug]);

  return <EventContext.Provider value={state}>{children}</EventContext.Provider>;
}

export function useEvent(): EventContextValue {
  return useContext(EventContext);
}
