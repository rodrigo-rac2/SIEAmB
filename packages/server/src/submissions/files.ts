import { unzipSync, strFromU8 } from 'fflate';
import { PDFDocument } from 'pdf-lib';

export type FileKind = 'pdf' | 'docx';

export interface FileCheck {
  kind: FileKind;
  /** Null when the file does not say how many pages it has (some Word files). */
  pages: number | null;
}

/** Thrown when the bytes are not the kind of file the name says, or cannot be read at all. */
export class UnreadableFileError extends Error {
  constructor() {
    super('unreadable_file');
    this.name = 'UnreadableFileError';
  }
}

const startsWith = (bytes: Uint8Array, signature: number[]): boolean =>
  signature.every((byte, i) => bytes[i] === byte);

/** `Trabalho Final.PDF` → `pdf`; anything but the accepted formats → null. */
export function extensionOf(fileName: string, formats: string[]): FileKind | null {
  const match = /\.([A-Za-z0-9]+)$/.exec(fileName.trim());
  const ext = match ? match[1]!.toLowerCase() : '';
  return formats.includes(ext) && (ext === 'pdf' || ext === 'docx') ? ext : null;
}

async function pdfPages(bytes: Uint8Array): Promise<number> {
  // %PDF
  if (!startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) throw new UnreadableFileError();
  try {
    const document = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    return document.getPageCount();
  } catch {
    throw new UnreadableFileError();
  }
}

function docxPages(bytes: Uint8Array): number | null {
  // PK: a Word file is a zip.
  if (!startsWith(bytes, [0x50, 0x4b])) throw new UnreadableFileError();
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, {
      filter: (file) => file.name === 'docProps/app.xml' || file.name === '[Content_Types].xml',
    });
  } catch {
    throw new UnreadableFileError();
  }
  // Any zip is not a Word file: it must declare a word-processing document.
  const types = entries['[Content_Types].xml'];
  if (!types || !strFromU8(types).includes('wordprocessingml')) throw new UnreadableFileError();
  const app = entries['docProps/app.xml'];
  if (!app) return null;
  const match = /<Pages>(\d{1,4})<\/Pages>/.exec(strFromU8(app));
  const pages = match ? Number(match[1]) : 0;
  // Word writes 0 or leaves it out when the file was never paginated (e.g. made by another program).
  return pages > 0 ? pages : null;
}

/**
 * Checks that the bytes really are a PDF or a Word file and counts the pages.
 * A PDF always has a count. A Word file only carries the count Word wrote when it
 * was last saved, and sometimes none.
 */
export async function inspectFile(bytes: Uint8Array, kind: FileKind): Promise<FileCheck> {
  return { kind, pages: kind === 'pdf' ? await pdfPages(bytes) : docxPages(bytes) };
}
