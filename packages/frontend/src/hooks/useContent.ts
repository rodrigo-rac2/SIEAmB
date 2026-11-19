import { useEffect, useMemo, useState } from 'react';
import { getDataProvider } from '../services';
import type { Content, ContentProvider, ContentRead } from '../services/DataProvider';

/** The arguments of a read, each allowed to be missing while the page does not know it yet. */
type MaybeEach<T extends unknown[]> = { [I in keyof T]: T[I] | null | undefined };
type Maybe<K extends ContentRead> = MaybeEach<Parameters<ContentProvider[K]>>;

/**
 * Reads public content for a page: `useContent('getImportantDates', event?.id)`.
 *
 * The content ships with the site, so the answer is there on the first render and the page is
 * never drawn without it (#331). With a provider that has to ask, or while an argument is still
 * missing, the answer is `undefined`: that, and only that, means "not known yet" (a read that
 * finds nothing answers `null` or an empty list).
 */
export function useContent<K extends ContentRead>(
  read: K,
  ...args: Maybe<K>
): Content<K> | undefined {
  const provider = getDataProvider();
  const now = provider.now;
  const ready = args.every((arg) => arg != null);
  // The arguments are ids and slugs: the key says the same as they do, and is stable between renders.
  const key = JSON.stringify([read, ...args]);

  const told = useMemo(
    () => (now && ready ? (now[read] as (...a: unknown[]) => Content<K>)(...args) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [now, key],
  );

  const [asked, setAsked] = useState<{ key: string; value: Content<K> } | null>(null);
  useEffect(() => {
    if (now || !ready) return;
    let active = true;
    (provider[read] as (...a: unknown[]) => Promise<Content<K>>)
      .apply(provider, args)
      .then((value) => active && setAsked({ key, value }))
      // A read that fails leaves the page waiting, as it did before this hook.
      .catch(() => undefined);
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, now, key]);

  if (now) return told;
  // An answer to other arguments is not an answer to these.
  return asked?.key === key ? asked.value : undefined;
}
