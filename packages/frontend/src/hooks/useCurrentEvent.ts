import type { EventSummary } from '@sieamb/shared';
import { useEffect, useState } from 'react';
import { getDataProvider } from '../services';

interface CurrentEvent {
  /** The current edition, or `null` while it is asked for or when there is none. */
  current: EventSummary | null;
  /** False only while a provider that has to ask has not answered yet. */
  settled: boolean;
}

/**
 * The current edition, whatever edition is on screen. It is there for the first paint when the
 * editions ship with the site (#329); otherwise it arrives when the provider answers.
 */
export function useCurrentEvent(): CurrentEvent {
  const [state, setState] = useState<CurrentEvent>(() => {
    const events = getDataProvider().peekEvents?.();
    return events
      ? { current: events.find((e) => e.isCurrent) ?? null, settled: true }
      : { current: null, settled: false };
  });

  useEffect(() => {
    if (state.settled) return;
    let active = true;
    getDataProvider()
      .getCurrentEvent()
      .then((current) => active && setState({ current, settled: true }))
      .catch(() => active && setState({ current: null, settled: true }));
    return () => {
      active = false;
    };
  }, [state.settled]);

  return state;
}
