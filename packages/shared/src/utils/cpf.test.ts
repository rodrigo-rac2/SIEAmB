import { describe, expect, it } from 'vitest';
import { formatCpf, isValidCpf, normalizeCpf, maskCpf } from './cpf.js';

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

describe('maskCpf', () => {
  it('puts the dots and the dash in as the digits arrive', () => {
    const steps = ['5', '52', '529', '529.9', '529.98', '529.982', '529.982.2', '529.982.24', '529.982.247', '529.982.247-2', '529.982.247-25'];
    steps.forEach((expected, i) => expect(maskCpf('52998224725'.slice(0, i + 1))).toBe(expected));
  });

  it('is stable on an already masked value and on a half-deleted one', () => {
    expect(maskCpf('529.982.247-25')).toBe('529.982.247-25');
    expect(maskCpf('529.982.')).toBe('529.982');
    expect(maskCpf('529.')).toBe('529');
  });

  it('drops everything that is not a digit', () => {
    expect(maskCpf(' CPF: 529 982 247/25 ')).toBe('529.982.247-25');
    expect(maskCpf('abc')).toBe('');
    expect(maskCpf('')).toBe('');
  });

  it('ignores digits past the eleventh', () => {
    expect(maskCpf('5299822472599')).toBe('529.982.247-25');
  });

  it('keeps leading zeros', () => {
    expect(maskCpf('00000000191')).toBe('000.000.001-91');
  });
});
