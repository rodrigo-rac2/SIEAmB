import { describe, expect, it } from 'vitest';
import { documentInput, documentProblem } from './DocumentFields';

describe('documentProblem', () => {
  it.each([
    [{ cpf: '529.982.247-25', passport: '', country: '' }, null],
    [{ cpf: '', passport: 'ab 123-456', country: 'PT' }, null],
    [{ cpf: '529.982.247-25', passport: 'AB123456', country: 'US' }, null],
    [{ cpf: '', passport: '', country: '' }, 'document_required'],
    [{ cpf: '   ', passport: '  ', country: 'PT' }, 'document_required'],
    [{ cpf: '529.982.247-26', passport: '', country: '' }, 'invalid_cpf'],
    [{ cpf: '', passport: 'A1', country: 'PT' }, 'invalid_passport'],
    [{ cpf: '', passport: 'AB123456', country: '' }, 'invalid_country'],
    [{ cpf: '', passport: 'AB123456', country: 'BR' }, 'invalid_country'],
  ] as const)('%o is %s', (value, problem) => {
    expect(documentProblem({ ...value })).toBe(problem);
  });
});

describe('documentInput', () => {
  it('sends only what was filled, and a country only with a passport', () => {
    expect(documentInput({ cpf: ' 529.982.247-25 ', passport: '', country: 'PT' })).toEqual({ cpf: '529.982.247-25' });
    expect(documentInput({ cpf: '', passport: ' AB123456 ', country: 'PT' })).toEqual({ passport: 'AB123456', country: 'PT' });
    expect(documentInput({ cpf: '529.982.247-25', passport: 'AB123456', country: 'US' })).toEqual({
      cpf: '529.982.247-25',
      passport: 'AB123456',
      country: 'US',
    });
    expect(documentInput({ cpf: '', passport: '', country: '' })).toEqual({});
  });
});
