import { NO_DOCUMENT, compareDocuments, hasDocument, type PersonDocument } from '../core/document';
import type { StoredAuthor, Submission } from './store';

/**
 * Everything that says who a person is (ADR-010): the addresses and documents of a line in
 * a paper, together with those of the account behind it. A paper counts for a person when
 * one of its lines has any of them, so someone listed under two addresses is one person.
 */
export interface Identity {
  emails: string[];
  cpfs: string[];
  /** As `CC:NUMBER`: a passport is its number and its country together. */
  passports: string[];
}

export const passportKey = (document: PersonDocument): string | null =>
  document.passport && document.country ? `${document.country}:${document.passport}` : null;

const unique = (values: (string | null | undefined)[]): string[] => [...new Set(values.filter((v): v is string => Boolean(v)))];

/** The identity made of some addresses and documents. */
export function identityOf(emails: (string | null | undefined)[], documents: PersonDocument[]): Identity {
  return {
    emails: unique(emails.map((e) => e?.toLowerCase())),
    cpfs: unique(documents.map((d) => d.cpf)),
    passports: unique(documents.map(passportKey)),
  };
}

/** Whether a line of a paper is one of this person's. */
export function isLineOf(line: StoredAuthor, who: Identity): boolean {
  if (who.emails.includes(line.email)) return true;
  if (line.document.cpf && who.cpfs.includes(line.document.cpf)) return true;
  const passport = passportKey(line.document);
  return passport !== null && who.passports.includes(passport);
}

/** The place a person holds in a paper: the first of their lines in it, or null when they have none. */
export function placeOf(submission: Pick<Submission, 'authors'>, who: Identity): number | null {
  const places = submission.authors.filter((a) => isLineOf(a, who)).map((a) => a.position);
  return places.length > 0 ? Math.min(...places) : null;
}

/** How many papers the person is the first author of, and how many they are in any other place of. */
export function countPlaces(submissions: Pick<Submission, 'authors'>[], who: Identity): { asMain: number; asCoauthor: number } {
  let asMain = 0;
  let asCoauthor = 0;
  for (const submission of submissions) {
    const place = placeOf(submission, who);
    if (place === 1) asMain += 1;
    else if (place !== null) asCoauthor += 1;
  }
  return { asMain, asCoauthor };
}

export type Standing =
  /** The line is the account's: the paper is theirs to see. */
  | 'attached'
  /** The address is the account's but the document is not, or cannot be told to be: the place waits (decision 9). */
  | 'waiting'
  /** Not a line of this address at all. */
  | 'none';

/**
 * Where an account stands on a line. The address proves the mailbox and the document says
 * who: both must agree. A line written before documents existed goes by the address alone.
 */
export function standingOn(line: StoredAuthor, email: string, document: PersonDocument): Standing {
  if (line.email !== email) return 'none';
  if (!hasDocument(line.document)) return 'attached';
  return compareDocuments(line.document, document) === 'match' ? 'attached' : 'waiting';
}

/** The line of a paper that is the account's own, if it has one that is attached. */
export function ownLine(submission: Pick<Submission, 'authors'>, email: string, document: PersonDocument | null): StoredAuthor | null {
  return submission.authors.find((a) => standingOn(a, email, document ?? NO_DOCUMENT) === 'attached') ?? null;
}
