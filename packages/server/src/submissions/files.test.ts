import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { UnreadableFileError, extensionOf, inspectFile } from './files';
import { docx, pdf } from './testing';

const FORMATS = ['pdf', 'docx'];

describe('extensionOf', () => {
  it.each([
    ['trabalho.pdf', 'pdf'],
    ['Trabalho Final.PDF', 'pdf'],
    ['artigo.v2.docx', 'docx'],
    ['2027/user/3f2b8c1e.docx', 'docx'],
    [' resumo.DocX ', 'docx'],
  ])('%s is a %s', (name, kind) => {
    expect(extensionOf(name, FORMATS)).toBe(kind);
  });

  it.each(['trabalho.doc', 'trabalho.odt', 'trabalho.pdf.exe', 'trabalho', 'pdf', '.', '', 'x.PDF '.trim() + 'x'])(
    '%s is not accepted',
    (name) => {
      expect(extensionOf(name, FORMATS)).toBeNull();
    },
  );

  it('follows the formats of the edition', () => {
    expect(extensionOf('x.docx', ['pdf'])).toBeNull();
  });
});

describe('inspectFile', () => {
  it.each([1, 4, 6, 12, 15, 40])('counts the %i pages of a PDF', async (pages) => {
    expect(await inspectFile(await pdf(pages), 'pdf')).toEqual({ kind: 'pdf', pages });
  });

  it('reads the page count Word wrote in a .docx', async () => {
    expect(await inspectFile(docx(13), 'docx')).toEqual({ kind: 'docx', pages: 13 });
  });

  it.each([
    ['has no properties part', docx(null)],
    ['says zero pages', docx(0)],
  ])('gives no page count when the .docx %s', async (_name, bytes) => {
    expect(await inspectFile(bytes, 'docx')).toEqual({ kind: 'docx', pages: null });
  });

  it.each([
    ['a Word file named .pdf', docx(5), 'pdf'],
    ['a PDF named .docx', null, 'docx'],
    ['text named .pdf', strToU8('just some text, not a PDF'), 'pdf'],
    ['a truncated PDF', strToU8('%PDF-1.7\n1 0 obj'), 'pdf'],
    ['a zip that is a spreadsheet', docx(5, false), 'docx'],
    ['a zip with anything else in it', zipSync({ 'evil.exe': strToU8('MZ') }), 'docx'],
    ['a broken zip', strToU8('PK\u0003\u0004 not really a zip'), 'docx'],
    ['an empty file', new Uint8Array(), 'pdf'],
    ['an empty file named .docx', new Uint8Array(), 'docx'],
  ] as const)('refuses %s', async (_name, bytes, kind) => {
    const input = bytes ?? (await pdf(3));
    await expect(inspectFile(input, kind)).rejects.toBeInstanceOf(UnreadableFileError);
  });
});
