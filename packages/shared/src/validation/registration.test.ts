import { describe, expect, it } from 'vitest';
import { registrationSchema } from './registration.js';

const base = {
  fullName: 'Maria da Silva Santos',
  email: 'maria@example.com',
  cpf: '529.982.247-25',
  passport: '',
  country: 'BR',
  institution: 'UFCG',
  category: 'ESTUDANTE_POS' as const,
  modality: 'PRESENCIAL' as const,
  consent: true,
};

describe('registrationSchema', () => {
  it('accepts a valid Brazilian registration', () => {
    const parsed = registrationSchema.parse(base);
    expect(parsed.cpf).toBe('52998224725'); // normalized
  });

  it('accepts a foreigner with passport and no CPF', () => {
    const parsed = registrationSchema.parse({
      ...base,
      cpf: '',
      passport: 'AB1234567',
      country: 'AR',
    });
    expect(parsed.passport).toBe('AB1234567');
  });

  it('rejects when neither CPF nor passport is given', () => {
    const result = registrationSchema.safeParse({ ...base, cpf: '', passport: '' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid CPF', () => {
    const result = registrationSchema.safeParse({ ...base, cpf: '111.111.111-11' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing LGPD consent', () => {
    const result = registrationSchema.safeParse({ ...base, consent: false });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['consent']);
      expect(result.error.issues[0]?.message).toBe('consent_required');
    }
  });

  it('lower-cases the e-mail so the per-event unique index catches case variants', () => {
    const parsed = registrationSchema.parse({ ...base, email: ' Maria@Example.COM ' });
    expect(parsed.email).toBe('maria@example.com');
  });

  it('rejects an invalid category', () => {
    const result = registrationSchema.safeParse({ ...base, category: 'ALIEN' });
    expect(result.success).toBe(false);
  });
});

describe('registrationSchema: passport and its country (ADR-010)', () => {
  const foreigner = { ...base, cpf: '', passport: 'ab 123-456', country: 'pt' };
  const problem = (data: unknown) => {
    const result = registrationSchema.safeParse(data);
    return result.success ? null : result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`);
  };

  it('stores a passport in upper case without separators, with its country in upper case', () => {
    expect(registrationSchema.parse(foreigner)).toMatchObject({ cpf: '', passport: 'AB123456', country: 'PT' });
  });

  it.each([
    ['no country', { country: '' }, ['country:invalid_country']],
    ['Brazil as the country', { country: 'BR' }, ['country:invalid_country']],
    ['a country that does not exist', { country: 'ZZ' }, ['country:invalid_country']],
    ['a passport that is too short', { passport: 'A1' }, ['passport:invalid_passport']],
    ['a passport with a strange character', { passport: 'AB_123456' }, ['passport:invalid_passport']],
  ])('refuses a passport with %s', (_name, over, issues) => {
    expect(problem({ ...foreigner, ...over })).toEqual(issues);
  });

  it('takes a CPF and a passport together', () => {
    expect(registrationSchema.parse({ ...base, passport: 'AB123456', country: 'US' })).toMatchObject({
      cpf: '52998224725',
      passport: 'AB123456',
      country: 'US',
    });
  });

  it('without a passport the country is BR whatever was sent, as the column holds for everybody else', () => {
    expect(registrationSchema.parse({ ...base, country: 'PT' }).country).toBe('BR');
    expect(registrationSchema.parse({ ...base, country: undefined }).country).toBe('BR');
  });

  it('still asks for one of the two documents', () => {
    expect(problem({ ...base, cpf: '', passport: '', country: 'PT' })).toEqual(['cpf:cpf_or_passport_required']);
  });
});
