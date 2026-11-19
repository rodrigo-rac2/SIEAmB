import countries from '../../../shared/src/data/countries.json';
import { isValidCpf } from '../payments/payer';

/**
 * How a person is identified (ADR-010): a CPF, a passport with its country, or both.
 *
 * The rules are the ones of `packages/shared/src/utils/document.ts`, written again here
 * because the functions are built as CommonJS and cannot import that package once
 * deployed (ADR-007). `document.vectors.json` is run against both copies, and against the
 * database's own check, so they cannot drift apart.
 */
export interface PersonDocument {
  cpf: string | null;
  passport: string | null;
  /** Of the passport; null without one. */
  country: string | null;
}

export type DocumentProblem = 'document_required' | 'invalid_cpf' | 'invalid_passport' | 'invalid_country';

export const NO_DOCUMENT: PersonDocument = { cpf: null, passport: null, country: null };

const PASSPORT = /^[A-Z0-9]{5,20}$/;
/** Every country but Brazil, whose citizens are identified by the CPF. */
const PASSPORT_COUNTRIES = new Set((countries as string[]).filter((code) => code !== 'BR'));

const asText = (value: unknown): string => (typeof value === 'string' ? value : '');

export const normalizeCpf = (value: unknown): string => asText(value).replace(/\D/g, '');

/** Upper case, without spaces, dots or dashes: `ab 123-456` is `AB123456`. */
export const normalizePassport = (value: unknown): string => asText(value).toUpperCase().replace(/[\s.-]/g, '');

export const isValidPassport = (value: unknown): boolean => PASSPORT.test(normalizePassport(value));

export const isPassportCountry = (value: unknown): boolean => PASSPORT_COUNTRIES.has(asText(value).trim().toUpperCase());

export { isValidCpf };

/**
 * Reads what a form sent. Empty fields are simply not given; what is given must be right;
 * at least a CPF or a passport must be there. A country sent without a passport is ignored.
 */
export function readDocument(raw: { cpf?: unknown; passport?: unknown; country?: unknown }):
  | { document: PersonDocument }
  | { problem: DocumentProblem } {
  const cpf = normalizeCpf(raw.cpf);
  const passport = normalizePassport(raw.passport);
  const country = asText(raw.country).trim().toUpperCase();
  if (!cpf && !passport) return { problem: 'document_required' };
  if (cpf && !isValidCpf(cpf)) return { problem: 'invalid_cpf' };
  if (passport && !PASSPORT.test(passport)) return { problem: 'invalid_passport' };
  if (passport && !PASSPORT_COUNTRIES.has(country)) return { problem: 'invalid_country' };
  return { document: { cpf: cpf || null, passport: passport || null, country: passport ? country : null } };
}

export const hasDocument = (document: PersonDocument | null | undefined): boolean =>
  Boolean(document && (document.cpf || document.passport));

/** The passport as one value, so that two of them compare as number and country together. */
const passportOf = (document: PersonDocument): string | null =>
  document.passport ? `${document.country ?? ''}:${document.passport}` : null;

/**
 * Whether two documents are of the same person.
 * - `conflict`: they both give a CPF, or both a passport, and it is not the same one.
 * - `match`: at least one of the two kinds is the same, and neither conflicts.
 * - `unknown`: they have no kind in common (one is a CPF, the other a passport), or one is empty.
 */
export function compareDocuments(a: PersonDocument, b: PersonDocument): 'match' | 'conflict' | 'unknown' {
  const [passportA, passportB] = [passportOf(a), passportOf(b)];
  const cpf = a.cpf && b.cpf ? a.cpf === b.cpf : null;
  const passport = passportA && passportB ? passportA === passportB : null;
  if (cpf === false || passport === false) return 'conflict';
  return cpf || passport ? 'match' : 'unknown';
}

/**
 * A document as it may be shown back to whoever typed it for someone else: enough to
 * recognise it, never enough to copy it. `***.982.247-**` and `AB•••56 (PT)`.
 */
export function maskDocument(document: PersonDocument): string {
  const parts: string[] = [];
  if (document.cpf) parts.push(`***.${document.cpf.slice(3, 6)}.${document.cpf.slice(6, 9)}-**`);
  if (document.passport) {
    const p = document.passport;
    // A short number shows one character at each end, so that most of it stays hidden.
    const shown = p.length >= 8 ? 2 : 1;
    parts.push(`${p.slice(0, shown)}•••${p.slice(-shown)} (${document.country ?? ''})`);
  }
  return parts.join(' · ');
}
