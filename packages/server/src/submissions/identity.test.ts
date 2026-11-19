import { describe, expect, it } from 'vitest';
import { NO_DOCUMENT } from '../core/document';
import { countPlaces, identityOf, isLineOf, ownLine, passportKey, placeOf, standingOn } from './identity';
import { cpfOnly, line, passportOnly } from './testing';

const A = '52998224725';
const B = '11144477735';

describe('identityOf', () => {
  it('gathers the addresses, lower-cased, and the documents, with no repeats and nothing empty', () => {
    expect(identityOf(['Ana@UFRN.br', 'ana@ufrn.br', null, undefined, ''], [cpfOnly(A), cpfOnly(A), NO_DOCUMENT, passportOnly('AB123456', 'PT')])).toEqual({
      emails: ['ana@ufrn.br'],
      cpfs: [A],
      passports: ['PT:AB123456'],
    });
  });

  it('a passport is its number and its country together', () => {
    expect(passportKey(passportOnly('AB123456', 'PT'))).toBe('PT:AB123456');
    expect(passportKey(cpfOnly(A))).toBeNull();
    expect(passportKey({ cpf: null, passport: 'AB123456', country: null })).toBeNull();
  });
});

describe('isLineOf, placeOf and countPlaces', () => {
  const ana = identityOf(['ana@ufrn.br'], [{ cpf: A, passport: 'AB123456', country: 'PT' }]);

  it.each([
    ['her address', line(1, 'Ana', 'ana@ufrn.br'), true],
    ['her CPF under another address', line(1, 'Ana', 'outra@x.org', cpfOnly(A)), true],
    ['her passport under another address', line(1, 'Ana', 'outra@x.org', passportOnly('AB123456', 'PT')), true],
    ['the same passport number of another country', line(1, 'Outra', 'outra@x.org', passportOnly('AB123456', 'ES')), false],
    ['another CPF and another address', line(1, 'Outra', 'outra@x.org', cpfOnly(B)), false],
    ['no document and another address', line(1, 'Outra', 'outra@x.org'), false],
  ])('%s', (_name, author, expected) => {
    expect(isLineOf(author, ana)).toBe(expected);
  });

  it('an empty identity is nobody: it never matches a line without a document', () => {
    expect(isLineOf(line(1, 'X', 'x@y.org'), identityOf([], [NO_DOCUMENT]))).toBe(false);
  });

  it('the place is the first of the person\'s lines, and null where they have none', () => {
    const paper = { authors: [line(1, 'Líder', 'l@x.org', cpfOnly(B)), line(2, 'Ana', 'a1@x.org', cpfOnly(A)), line(3, 'Ana', 'ana@ufrn.br')] };
    expect(placeOf(paper, ana)).toBe(2);
    expect(placeOf({ authors: [line(1, 'Líder', 'l@x.org', cpfOnly(B))] }, ana)).toBeNull();
  });

  it('counts first places and other places apart, one per paper', () => {
    const papers = [
      { authors: [line(1, 'Ana', 'ana@ufrn.br')] },
      { authors: [line(1, 'Ana', 'x@y.org', cpfOnly(A)), line(2, 'Ana again', 'ana@ufrn.br')] },
      { authors: [line(1, 'L', 'l@x.org', cpfOnly(B)), line(2, 'Ana', 'z@y.org', passportOnly('AB123456', 'PT'))] },
      { authors: [line(1, 'L', 'l@x.org', cpfOnly(B))] },
    ];
    expect(countPlaces(papers, ana)).toEqual({ asMain: 2, asCoauthor: 1 });
    expect(countPlaces([], ana)).toEqual({ asMain: 0, asCoauthor: 0 });
  });
});

describe('standingOn and ownLine', () => {
  it.each([
    ['another address', line(1, 'X', 'outra@x.org', cpfOnly(A)), cpfOnly(A), 'none'],
    ['her address, a line from before documents', line(1, 'Ana', 'ana@ufrn.br'), cpfOnly(A), 'attached'],
    ['her address, a line from before, and an account with no document', line(1, 'Ana', 'ana@ufrn.br'), NO_DOCUMENT, 'attached'],
    ['her address and her CPF', line(1, 'Ana', 'ana@ufrn.br', cpfOnly(A)), cpfOnly(A), 'attached'],
    ['her address and another CPF', line(1, 'Ana', 'ana@ufrn.br', cpfOnly(B)), cpfOnly(A), 'waiting'],
    ['her address, a passport line, a CPF account', line(1, 'Ana', 'ana@ufrn.br', passportOnly('AB123456', 'PT')), cpfOnly(A), 'waiting'],
    ['her address, a document on the line, none on the account', line(1, 'Ana', 'ana@ufrn.br', cpfOnly(A)), NO_DOCUMENT, 'waiting'],
    ['her address, one kind in common and equal', line(1, 'Ana', 'ana@ufrn.br', cpfOnly(A)), { cpf: A, passport: 'AB123456', country: 'PT' }, 'attached'],
  ] as const)('%s: %s', (_name, author, document, expected) => {
    expect(standingOn(author, 'ana@ufrn.br', document)).toBe(expected);
  });

  it('ownLine is the attached line, and nothing when the only line waits', () => {
    const paper = { authors: [line(1, 'L', 'l@x.org', cpfOnly(B)), line(2, 'Ana', 'ana@ufrn.br', cpfOnly(A))] };
    expect(ownLine(paper, 'ana@ufrn.br', cpfOnly(A))?.position).toBe(2);
    expect(ownLine(paper, 'ana@ufrn.br', cpfOnly(B))).toBeNull();
    expect(ownLine(paper, 'ana@ufrn.br', null)).toBeNull();
    expect(ownLine(paper, 'ninguem@x.org', cpfOnly(A))).toBeNull();
  });
});
