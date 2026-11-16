import { describe, expect, it } from 'vitest';
import { isValidCpf, payerData } from './payer';

describe('isValidCpf', () => {
  it('accepts a CPF with the right check digits, masked or not', () => {
    expect(isValidCpf('52998224725')).toBe(true);
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('00000000191')).toBe(true);
  });
  it.each(['52998224724', '11111111111', '00000000000', '123', '', '529982247251', 'abc'])(
    'refuses %j',
    (value) => {
      expect(isValidCpf(value)).toBe(false);
    },
  );
});

describe('payerData', () => {
  it('splits the name and keeps a valid CPF as digits', () => {
    expect(payerData('Maria Clara de Souza', '529.982.247-25')).toEqual({
      firstName: 'Maria',
      lastName: 'Clara de Souza',
      cpf: '52998224725',
    });
  });
  it('a single name has no last name', () => {
    expect(payerData('Cher', null)).toEqual({ firstName: 'Cher' });
  });
  it('leaves the CPF out for a foreigner, a wrong CPF or a repeated-digit one', () => {
    expect(payerData('John Smith', null)).toEqual({ firstName: 'John', lastName: 'Smith' });
    expect(payerData('Ana Lima', '52998224724')).not.toHaveProperty('cpf');
    expect(payerData('Ana Lima', '111.111.111-11')).not.toHaveProperty('cpf');
    expect(payerData('Ana Lima', '')).not.toHaveProperty('cpf');
  });
  it('sends nothing for an empty or blank name', () => {
    expect(payerData('', null)).toEqual({});
    expect(payerData('   ', undefined)).toEqual({});
    expect(payerData(null, null)).toEqual({});
  });
  it('drops line breaks and control characters, and collapses spaces', () => {
    expect(payerData('  Ana\r\n  Maria\t Lima\u0000 ', null)).toEqual({ firstName: 'Ana', lastName: 'Maria Lima' });
  });
  it('caps very long names', () => {
    const data = payerData(`${'A'.repeat(200)} ${'B'.repeat(300)}`, null);
    expect(data.firstName).toHaveLength(60);
    expect(data.lastName).toHaveLength(100);
  });

  it('folds accents and cedillas to plain letters, as a card carries the name (#198)', () => {
    expect(payerData('José Antônio da Conceição', null)).toEqual({
      firstName: 'Jose',
      lastName: 'Antonio da Conceicao',
    });
    expect(payerData('Cláudia Araújo Müller', null)).toEqual({ firstName: 'Claudia', lastName: 'Araujo Muller' });
    expect(payerData('Ñandú Æon', null).firstName).toBe('Nandu');
    expect(payerData('Søren Weiß Łukasz', null)).toEqual({ firstName: 'Soren', lastName: 'Weiss Lukasz' });
  });
  it('handles a name already split into letter plus combining accent', () => {
    expect(payerData('Jose\u0301 Arau\u0301jo', null)).toEqual({ firstName: 'Jose', lastName: 'Araujo' });
  });
  it('keeps apostrophes and hyphens, drops digits and symbols', () => {
    expect(payerData("Ana-Maria D'Ávila 3º <b>", null)).toEqual({ firstName: 'Ana-Maria', lastName: "D'Avila b" });
  });
  it('sends no name when nothing Latin is left, instead of something mangled', () => {
    expect(payerData('周林', null)).toEqual({});
    expect(payerData('Иван Петров', '52998224725')).toEqual({ cpf: '52998224725' });
    expect(payerData('🙂 !!!', null)).toEqual({});
  });
  it('never sends a non-ASCII character', () => {
    const data = payerData('Zoë Çağla Ångström Íñigo Õunapuu', null);
    expect(`${data.firstName} ${data.lastName}`).toMatch(/^[A-Za-z' -]+$/);
  });
});
