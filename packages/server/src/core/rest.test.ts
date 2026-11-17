import { describe, expect, it } from 'vitest';
import { RestClient, parseRows } from './rest';

describe('moments read from the database', () => {
  it('marks a zone-less moment as UTC, with or without fractions of a second', () => {
    const rows = parseRows<{ created_at: string; updated_at: string }[]>(
      '[{"created_at":"2026-11-17T13:52:02.618","updated_at":"2026-11-07T14:12:00"}]',
    );
    expect(rows).toEqual([{ created_at: '2026-11-17T13:52:02.618Z', updated_at: '2026-11-07T14:12:00Z' }]);
    // What the browser then makes of it, wherever it is: 13:52 UTC, 10:52 in Brazil.
    expect(new Date(rows[0]!.created_at).toISOString()).toBe('2026-11-17T13:52:02.618Z');
  });

  it('reaches moments nested in related rows and in lists', () => {
    const rows = parseRows<unknown>('[{"user":{"created_at":"2026-11-17T23:30:00"},"payments":[{"paid_at":"2026-11-17T23:31:00.5"}]}]');
    expect(rows).toEqual([{ user: { created_at: '2026-11-17T23:30:00Z' }, payments: [{ paid_at: '2026-11-17T23:31:00.5Z' }] }]);
  });

  it.each([
    ['a moment that already says its zone', '2026-11-17T13:52:02.618Z'],
    ['a moment with an offset', '2026-11-17T10:52:02-03:00'],
    ['a plain date', '2026-11-17'],
    ['a title that only contains a moment', 'Reunião de 2026-11-17T13:52:02'],
    ['an e-mail', 'maria@ufcg.edu.br'],
    ['an empty text', ''],
  ])('leaves %s as it is', (_name, value) => {
    expect(parseRows<{ v: string }>(JSON.stringify({ v: value }))).toEqual({ v: value });
  });

  it('leaves numbers, booleans and nulls alone, and reads an empty answer as null', () => {
    expect(parseRows('{"n":20261117,"b":true,"x":null}')).toEqual({ n: 20261117, b: true, x: null });
    expect(parseRows('')).toBeNull();
  });

  it('is what the client answers with', async () => {
    const client = new RestClient('https://db.example', 'key', (async () =>
      new Response('[{"created_at":"2026-11-17T13:52:02.618"}]')) as unknown as typeof fetch);
    expect(await client.request('events?select=created_at')).toEqual([{ created_at: '2026-11-17T13:52:02.618Z' }]);
  });
});
