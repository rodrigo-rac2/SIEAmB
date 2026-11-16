import { describe, expect, it } from 'vitest';
import { FEE_EVENTS, FEE_TIERS, centsToAmount, resolveFeeTier, type FeeTier } from './fees';

const EVENTS = [{ id: 'evt-2027', slug: '2027' }];
const tier = (overrides: Partial<FeeTier> = {}): FeeTier => ({
  id: 'lot1',
  eventId: 'evt-2027',
  category: 'ESTUDANTE_POS',
  modality: 'ONLINE',
  amountCents: 5000,
  validFrom: '2026-11-10T00:00:00-03:00',
  validUntil: '2027-01-01T23:59:00-03:00',
  ...overrides,
});
const TIERS = [
  tier(),
  tier({
    id: 'lot2',
    amountCents: 7000,
    validFrom: '2027-01-02T00:00:00-03:00',
    validUntil: '2027-03-20T23:59:00-03:00',
  }),
  tier({ id: 'grad1', category: 'ESTUDANTE_GRADUACAO', amountCents: 3000 }),
];
const query = (now: string, overrides = {}) => ({
  eventSlug: '2027',
  category: 'ESTUDANTE_POS',
  modality: 'ONLINE',
  now: new Date(now),
  ...overrides,
});

describe('resolveFeeTier', () => {
  it('picks the lot in force for the category', () => {
    expect(resolveFeeTier(query('2026-12-01T12:00:00-03:00'), TIERS, EVENTS)?.id).toBe('lot1');
    expect(resolveFeeTier(query('2027-02-01T12:00:00-03:00'), TIERS, EVENTS)?.id).toBe('lot2');
  });

  it('honours the first and the last instant of a lot, in Brazil time', () => {
    expect(resolveFeeTier(query('2026-11-10T00:00:00-03:00'), TIERS, EVENTS)?.id).toBe('lot1');
    expect(resolveFeeTier(query('2027-01-01T23:59:00-03:00'), TIERS, EVENTS)?.id).toBe('lot1');
    // 02:30 UTC on 10 Nov is still 9 Nov in Brazil: the lot has not started.
    expect(resolveFeeTier(query('2026-11-10T02:30:00Z'), TIERS, EVENTS)).toBeNull();
  });

  it.each([
    ['before the first lot', query('2026-11-09T23:59:59-03:00')],
    ['in the gap between two lots', query('2027-01-01T23:59:30-03:00')],
    ['after the last lot', query('2027-03-21T00:00:00-03:00')],
    ['for a category without a fee', query('2026-12-01T12:00:00-03:00', { category: 'PROFESSOR' })],
    [
      'for a modality without a fee',
      query('2026-12-01T12:00:00-03:00', { modality: 'PRESENCIAL' }),
    ],
    ['for an unknown event', query('2026-12-01T12:00:00-03:00', { eventSlug: '2031' })],
  ])('charges nothing %s', (_name, q) => {
    expect(resolveFeeTier(q, TIERS, EVENTS)).toBeNull();
  });

  it('refuses to guess between two overlapping lots', () => {
    const overlapping = [...TIERS, tier({ id: 'dup', amountCents: 100 })];
    expect(resolveFeeTier(query('2026-12-01T12:00:00-03:00'), overlapping, EVENTS)).toBeNull();
  });

  it.each([0, -5000, 49.5, Number.NaN])('never charges an amount of %s', (amountCents) => {
    expect(
      resolveFeeTier(query('2026-12-01T12:00:00-03:00'), [tier({ amountCents })], EVENTS),
    ).toBeNull();
  });
});

describe('the fee table the site ships', () => {
  it('belongs to events that exist and never overlaps for the same category and modality', () => {
    expect(FEE_TIERS.length).toBeGreaterThan(0);
    for (const t of FEE_TIERS) {
      expect(FEE_EVENTS.map((e) => e.id)).toContain(t.eventId);
      expect(Date.parse(t.validFrom)).toBeLessThan(Date.parse(t.validUntil));
      const rivals = FEE_TIERS.filter(
        (o) =>
          o !== t &&
          o.eventId === t.eventId &&
          o.category === t.category &&
          o.modality === t.modality,
      );
      for (const o of rivals) {
        const overlap =
          Date.parse(t.validFrom) <= Date.parse(o.validUntil) &&
          Date.parse(o.validFrom) <= Date.parse(t.validUntil);
        expect(overlap, `${t.id} overlaps ${o.id}`).toBe(false);
      }
    }
  });
});

describe('centsToAmount', () => {
  it.each([
    [3000, '30.00'],
    [5005, '50.05'],
    [1, '0.01'],
    [123456, '1234.56'],
  ])('%i centavos → %s', (cents, amount) => {
    expect(centsToAmount(cents)).toBe(amount);
  });
});
