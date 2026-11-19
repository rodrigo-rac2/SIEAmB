import { describe, expect, it } from 'vitest';
import { isValidCpf, normalizeCpf } from './cpf.js';
import {
  COUNTRY_CODES,
  PASSPORT_COUNTRIES,
  countryName,
  isPassportCountry,
  isValidPassport,
  normalizePassport,
  readDocument,
} from './document.js';
import vectors from './document.vectors.json' with { type: 'json' };

describe('document rules, by the vectors the server and the database are held to as well', () => {
  it.each(vectors.cpf)('CPF $input', ({ input, digits, valid }) => {
    expect(normalizeCpf(input)).toBe(digits);
    expect(isValidCpf(input)).toBe(valid);
  });

  it.each(vectors.passport)('passport "$input"', ({ input, stored, valid }) => {
    expect(normalizePassport(input)).toBe(stored);
    expect(isValidPassport(input)).toBe(valid);
  });

  it.each(vectors.country)('passport country "$input"', ({ input, valid }) => {
    expect(isPassportCountry(input)).toBe(valid);
  });

  it.each(vectors.document)('document $raw', (vector) => {
    const read = readDocument(vector.raw);
    if ('problem' in vector) expect(read).toEqual({ problem: vector.problem });
    else expect(read).toEqual({ document: vector.document });
  });
});

describe('countries', () => {
  it('are two capital letters each, in order, with no repeats', () => {
    expect(COUNTRY_CODES.every((code) => /^[A-Z]{2}$/.test(code))).toBe(true);
    expect([...COUNTRY_CODES]).toEqual([...new Set(COUNTRY_CODES)].sort());
    expect(COUNTRY_CODES.length).toBe(250);
  });

  it('a passport can be from any of them but Brazil', () => {
    expect(COUNTRY_CODES).toContain('BR');
    expect(PASSPORT_COUNTRIES).not.toContain('BR');
    expect(PASSPORT_COUNTRIES.length).toBe(COUNTRY_CODES.length - 1);
  });

  it('every one has a name in each language of the site', () => {
    for (const locale of ['pt-BR', 'en', 'es', 'zh-CN']) {
      for (const code of COUNTRY_CODES) expect(countryName(code, locale), `${code} in ${locale}`).not.toBe(code);
    }
    expect(countryName('PT', 'pt-BR')).toBe('Portugal');
    expect(countryName('DE', 'en')).toBe('Germany');
  });

  it('falls back to the code where the language is not known to the browser', () => {
    expect(countryName('PT', 'not a locale')).toBe('PT');
  });
});
