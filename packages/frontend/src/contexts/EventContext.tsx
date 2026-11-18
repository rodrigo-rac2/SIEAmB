import type { EventSummary } from '@sieamb/shared';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { getDataProvider } from '../services';

interface EventContextValue {
  event: EventSummary | null;
  loading: boolean;
  notFound: boolean;
  /** Set when the slug in the URL is a legacy slug of an edition: redirect there instead of 404. */
  redirectSlug?: string;
}

const LOADING: EventContextValue = { event: null, loading: true, notFound: false };
const NOT_FOUND: EventContextValue = { event: null, loading: false, notFound: true };

const EventContext = createContext<EventContextValue>(LOADING);

/** Where a slug leads among the editions: to one of them, to the slug it now goes by, or nowhere. */
function resolve(events: EventSummary[], slug: string | undefined): EventContextValue {
  const event = slug ? events.find((e) => e.slug === slug) : events.find((e) => e.isCurrent);
  if (event) return { event, loading: false, notFound: false };
  const alias = slug ? events.find((e) => e.legacySlugs.includes(slug)) : undefined;
  if (alias) return { event: null, loading: false, notFound: false, redirectSlug: alias.slug };
  return NOT_FOUND;
}

export function EventProvider({ children }: { children: ReactNode }) {
  const { eventSlug } = useParams<{ eventSlug: string }>();
  const { pathname, search, hash } = useLocation();

  // The editions ship with the site, so the answer is there for the first paint: no page is
  // drawn empty and then filled (#329).
  const known = useMemo(() => {
    const events = getDataProvider().peekEvents?.();
    return events ? resolve(events, eventSlug) : null;
  }, [eventSlug]);

  // Only a provider that has to ask goes through a waiting state.
  const [asked, setAsked] = useState<EventContextValue>(LOADING);
  useEffect(() => {
    if (known) return;
    let cancelled = false;
    setAsked(LOADING);
    getDataProvider()
      .getEvents()
      .then((events) => !cancelled && setAsked(resolve(events, eventSlug)))
      .catch(() => !cancelled && setAsked(NOT_FOUND));
    return () => {
      cancelled = true;
    };
  }, [eventSlug, known]);

  const state = known ?? asked;

  if (state.redirectSlug && eventSlug) {
    const target = pathname.replace(`/${eventSlug}`, `/${state.redirectSlug}`) + search + hash;
    return <Navigate to={target} replace />;
  }

  return <EventContext.Provider value={state}>{children}</EventContext.Provider>;
}

export function useEvent(): EventContextValue {
  return useContext(EventContext);
}
