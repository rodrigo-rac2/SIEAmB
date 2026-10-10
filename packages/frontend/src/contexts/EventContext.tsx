import type { EventSummary } from '@sieamb/shared';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { getDataProvider } from '../services';

interface EventContextValue {
  event: EventSummary | null;
  loading: boolean;
  notFound: boolean;
  /** Set when the slug in the URL is a legacy slug of an edition: redirect there instead of 404. */
  redirectSlug?: string;
}

const EventContext = createContext<EventContextValue>({
  event: null,
  loading: true,
  notFound: false,
});

export function EventProvider({ children }: { children: ReactNode }) {
  const { eventSlug } = useParams<{ eventSlug: string }>();
  const { pathname, search, hash } = useLocation();
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
      .then(async (event) => {
        if (cancelled) return;
        if (event === null && eventSlug) {
          const alias = (await provider.getEvents()).find((e) => e.legacySlugs.includes(eventSlug));
          if (cancelled) return;
          if (alias) {
            setState({ event: null, loading: false, notFound: false, redirectSlug: alias.slug });
            return;
          }
        }
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

  if (state.redirectSlug && eventSlug) {
    const target = pathname.replace(`/${eventSlug}`, `/${state.redirectSlug}`) + search + hash;
    return <Navigate to={target} replace />;
  }

  return <EventContext.Provider value={state}>{children}</EventContext.Provider>;
}

export function useEvent(): EventContextValue {
  return useContext(EventContext);
}
