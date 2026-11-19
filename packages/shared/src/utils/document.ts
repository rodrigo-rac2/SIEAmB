import countries from '../data/countries.json' with { type: 'json' };
import { isValidCpf, normalizeCpf } from './cpf.js';

/**
 * How a person is identified (ADR-010): a CPF, a passport with its country, or both.
 * The server keeps its own copy of these rules (`packages/server/src/core/document.ts`,
 * it cannot import this package once deployed); `document.vectors.json` is run against
 * both, and against the database's own check, so the three cannot drift apart.
 */

/** ISO 3166-1 two-letter codes, plus XK (Kosovo, which issues passports). */
export const COUNTRY_CODES: readonly string[] = countries;

/** Countries a passport can be from: every one but Brazil, whose citizens give the CPF. */
export const PASSPORT_COUNTRIES: readonly string[] = COUNTRY_CODES.filter((code) => code !== 'BR');

/** A passport number as it is stored: upper case, without spaces, dots or dashes. */
export function normalizePassport(input: string): string {
  return input.toUpperCase().replace(/[\s.-]/g, '');
}

/** 5 to 20 letters or digits, once normalised. */
export function isValidPassport(input: string): boolean {
  return /^[A-Z0-9]{5,20}$/.test(normalizePassport(input));
}

/** The country of a passport: a known two-letter code other than BR. */
export function isPassportCountry(input: string): boolean {
  return PASSPORT_COUNTRIES.includes(input.trim().toUpperCase());
}

export interface PersonDocument {
  cpf: string | null;
  passport: string | null;
  /** Of the passport; null without one. */
  country: string | null;
}

export type DocumentProblem = 'document_required' | 'invalid_cpf' | 'invalid_passport' | 'invalid_country';

/**
 * Reads what was typed into the three fields. Empty fields are simply not given; what is
 * given must be right; at least a CPF or a passport must be there. A country typed
 * without a passport is ignored.
 */
export function readDocument(raw: {
  cpf?: string | null;
  passport?: string | null;
  country?: string | null;
}): { document: PersonDocument } | { problem: DocumentProblem } {
  const cpf = normalizeCpf(raw.cpf ?? '');
  const passport = normalizePassport(raw.passport ?? '');
  const country = (raw.country ?? '').trim().toUpperCase();
  if (!cpf && !passport) return { problem: 'document_required' };
  if (cpf && !isValidCpf(cpf)) return { problem: 'invalid_cpf' };
  if (passport && !isValidPassport(passport)) return { problem: 'invalid_passport' };
  if (passport && !isPassportCountry(country)) return { problem: 'invalid_country' };
  return { document: { cpf: cpf || null, passport: passport || null, country: passport ? country : null } };
}

/** The name of a country in the language of the page; the code itself if the browser has none. */
export function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}
