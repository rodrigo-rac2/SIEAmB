import eventsFixture from '../../../frontend/src/data/events.json';
import feeTiersFixture from '../../../frontend/src/data/feeTiers.json';

export interface FeeTier {
  id: string;
  eventId: string;
  category: string;
  modality: string;
  amountCents: number;
  validFrom: string;
  validUntil: string;
}

export interface FeeEvent {
  id: string;
  slug: string;
}

/**
 * The fee table the site shows (frontend fixtures) is also what the server
 * charges, so the price on screen and the price on the order cannot drift.
 */
export const FEE_TIERS: FeeTier[] = feeTiersFixture;
export const FEE_EVENTS: FeeEvent[] = eventsFixture.map(({ id, slug }) => ({ id, slug }));

export interface FeeQuery {
  eventSlug: string;
  category: string;
  modality: string;
  now: Date;
}

/**
 * The tier in force at `now` for this category and modality, or null when the
 * lot has not started, has ended, or the category has no fee at all.
 * The price is decided here, on the server, never taken from the browser.
 */
export function resolveFeeTier(
  query: FeeQuery,
  tiers: FeeTier[] = FEE_TIERS,
  events: FeeEvent[] = FEE_EVENTS,
): FeeTier | null {
  const event = events.find((e) => e.slug === query.eventSlug);
  if (!event) return null;
  const at = query.now.getTime();
  const matches = tiers.filter(
    (tier) =>
      tier.eventId === event.id &&
      tier.category === query.category &&
      tier.modality === query.modality &&
      Number.isInteger(tier.amountCents) &&
      tier.amountCents > 0 &&
      at >= Date.parse(tier.validFrom) &&
      at <= Date.parse(tier.validUntil),
  );
  // Overlapping lots would be a data mistake; never guess which price applies.
  return matches.length === 1 ? matches[0]! : null;
}

/** 3000 → "30.00", the decimal string Mercado Pago expects. */
export function centsToAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}
