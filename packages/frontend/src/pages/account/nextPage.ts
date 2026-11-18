/**
 * Where a person was going when the site asked them to log in or create an
 * account. Creating an account passes through an e-mail link, so the address
 * cannot ride on the URL alone: it is kept in this browser for a day.
 */
const KEY = 'sieamb-next';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Only a path inside this site: never another origin, never a protocol-relative address. */
export const safeNext = (next: string | null, fallback: string): string =>
  next && /^\/(?!\/)[^\s\\]*$/.test(next) ? next : fallback;

export function rememberNext(next: string | null): void {
  if (!next || safeNext(next, '') !== next) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ next, at: Date.now() }));
  } catch {
    // No storage (private mode): the person lands on their area instead.
  }
}

/** The remembered address, once: reading it forgets it. */
export function takeNext(fallback: string): string {
  try {
    const raw = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as { next?: unknown; at?: unknown };
    if (typeof saved.next !== 'string' || typeof saved.at !== 'number') return fallback;
    if (Date.now() - saved.at > DAY_MS) return fallback;
    return safeNext(saved.next, fallback);
  } catch {
    return fallback;
  }
}

export function forgetNext(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to forget.
  }
}
