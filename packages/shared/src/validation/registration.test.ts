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
