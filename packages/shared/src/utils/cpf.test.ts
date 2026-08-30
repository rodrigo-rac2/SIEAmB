import { describe, expect, it } from 'vitest';
import { formatCpf, isValidCpf, normalizeCpf } from './cpf.js';

describe('normalizeCpf', () => {
  it('strips punctuation', () => {
    expect(normalizeCpf('529.982.247-25')).toBe('52998224725');
  });

  it('strips arbitrary non-digits', () => {
    expect(normalizeCpf('abc123def456')).toBe('123456');
  });
});

describe('formatCpf', () => {
  it('formats 11 digits', () => {
    expect(formatCpf('52998224725')).toBe('529.982.247-25');
  });

  it('returns input unchanged when not 11 digits', () => {
    expect(formatCpf('1234')).toBe('1234');
  });
});

describe('isValidCpf', () => {
  it('accepts a valid CPF', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('52998224725')).toBe(true);
  });

  it('rejects wrong check digits', () => {
    expect(isValidCpf('52998224724')).toBe(false);
    expect(isValidCpf('52998224735')).toBe(false);
  });

  it('rejects repeated-digit CPFs', () => {
    for (const d of '0123456789') {
      expect(isValidCpf(d.repeat(11))).toBe(false);
    }
  });

  it('rejects wrong length', () => {
    expect(isValidCpf('123')).toBe(false);
    expect(isValidCpf('')).toBe(false);
    expect(isValidCpf('529982247251')).toBe(false);
  });
});
