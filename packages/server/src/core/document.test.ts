import { describe, expect, it } from 'vitest';
import vectors from '../../../shared/src/utils/document.vectors.json';
import {
  NO_DOCUMENT,
  compareDocuments,
  hasDocument,
  isPassportCountry,
  isValidCpf,
  isValidPassport,
  maskDocument,
  normalizeCpf,
  normalizePassport,
  readDocument,
  type PersonDocument,
} from './document';

describe('document rules, by the same vectors as the shared package and the database', () => {
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

describe('what a request may send in place of text', () => {
  it.each([undefined, null, 12345678909, {}, [], true])('%s is read as nothing, never thrown on', (value) => {
    expect(normalizeCpf(value)).toBe('');
    expect(normalizePassport(value)).toBe('');
    expect(isPassportCountry(value)).toBe(false);
    expect(readDocument({ cpf: value, passport: value, country: value })).toEqual({ problem: 'document_required' });
  });
});

describe('compareDocuments', () => {
  const cpf = (value: string): PersonDocument => ({ cpf: value, passport: null, country: null });
  const passport = (number: string, country: string): PersonDocument => ({ cpf: null, passport: number, country });
  const both = (c: string, number: string, country: string): PersonDocument => ({ cpf: c, passport: number, country });
  const A = '52998224725';
  const B = '11144477735';

  it.each([
    ['the same CPF', cpf(A), cpf(A), 'match'],
    ['another CPF', cpf(A), cpf(B), 'conflict'],
    ['the same passport and country', passport('AB123456', 'PT'), passport('AB123456', 'PT'), 'match'],
    ['the same passport number from another country', passport('AB123456', 'PT'), passport('AB123456', 'ES'), 'conflict'],
    ['another passport of the same country', passport('AB123456', 'PT'), passport('ZZ999999', 'PT'), 'conflict'],
    ['a CPF against a passport', cpf(A), passport('AB123456', 'PT'), 'unknown'],
    ['both against only the CPF', both(A, 'AB123456', 'PT'), cpf(A), 'match'],
    ['both against only the passport', both(A, 'AB123456', 'PT'), passport('AB123456', 'PT'), 'match'],
    ['both against both', both(A, 'AB123456', 'PT'), both(A, 'AB123456', 'PT'), 'match'],
    ['the right CPF with a wrong passport', both(A, 'AB123456', 'PT'), both(A, 'ZZ999999', 'PT'), 'conflict'],
    ['the right passport with a wrong CPF', both(A, 'AB123456', 'PT'), both(B, 'AB123456', 'PT'), 'conflict'],
    ['nothing against a CPF', NO_DOCUMENT, cpf(A), 'unknown'],
    ['nothing against nothing', NO_DOCUMENT, NO_DOCUMENT, 'unknown'],
  ] as const)('%s: %s', (_label, a, b, expected) => {
    expect(compareDocuments(a, b)).toBe(expected);
    // Who is asked first does not matter.
    expect(compareDocuments(b, a)).toBe(expected);
  });
});

describe('hasDocument and maskDocument', () => {
  it('tells an empty document from one with a CPF or a passport', () => {
    expect(hasDocument(NO_DOCUMENT)).toBe(false);
    expect(hasDocument(null)).toBe(false);
    expect(hasDocument(undefined)).toBe(false);
    expect(hasDocument({ cpf: '52998224725', passport: null, country: null })).toBe(true);
    expect(hasDocument({ cpf: null, passport: 'AB123456', country: 'PT' })).toBe(true);
  });

  it('shows enough to recognise a document and never enough to copy it', () => {
    expect(maskDocument({ cpf: '52998224725', passport: null, country: null })).toBe('***.982.247-**');
    expect(maskDocument({ cpf: null, passport: 'AB123456', country: 'PT' })).toBe('AB•••56 (PT)');
    expect(maskDocument({ cpf: '52998224725', passport: 'AB123456', country: 'PT' })).toBe('***.982.247-** · AB•••56 (PT)');
    expect(maskDocument({ cpf: null, passport: 'CF9X2', country: 'US' })).toBe('C•••2 (US)');
    expect(maskDocument(NO_DOCUMENT)).toBe('');
    // The first three and the last two digits of the CPF are never in the hint.
    const hint = maskDocument({ cpf: '52998224725', passport: null, country: null });
    expect(hint).not.toContain('529');
    expect(hint.endsWith('25')).toBe(false);
  });
});
