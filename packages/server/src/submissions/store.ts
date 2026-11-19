import type { PersonDocument } from '../core/document';
import type { Identity } from './identity';
import type { Modality } from './rules';

export type SubmissionStatus =
  'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'APPROVED_WITH_REVISION' | 'REJECTED';

/** An author as other people may see them: never with a document. */
export interface Author {
  position: number;
  fullName: string;
  email: string;
}

/**
 * An author as stored, with who they are (ADR-010). Server only: nothing that goes to a
 * browser is made from this without leaving the document out. Empty on lines written
 * before documents were asked for.
 */
export interface StoredAuthor extends Author {
  document: PersonDocument;
}

/** An account as far as telling who a person is goes. */
export interface AccountRef {
  id: string;
  email: string;
  document: PersonDocument;
}

/** What the edital allows one person, and who each author of the paper being saved is. */
export interface LimitCheck {
  maxAsMain: number;
  maxAsCoauthor: number;
  /** One per author, in the order of the list. */
  identities: Identity[];
}

export type SaveResult =
  | { submission: Submission }
  /** Nothing was written: the author in that place is over a limit, or the paper is gone. */
  | { refused: 'too_many_as_main' | 'coauthor_limit' | 'submission_not_found'; position: number | null };

export interface Submission {
  id: string;
  number: number;
  eventId: string;
  userId: string;
  title: string;
  titleEn: string;
  modality: Modality;
  areaRef: string;
  abstract: string;
  keywords: string[];
  keywordsEn: string[];
  filePath: string;
  fileName: string;
  filePages: number | null;
  status: SubmissionStatus;
  locale: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  authors: StoredAuthor[];
}

export interface SubmissionInput {
  title: string;
  titleEn: string;
  modality: Modality;
  areaRef: string;
  abstract: string;
  keywords: string[];
  keywordsEn: string[];
  filePath: string;
  fileName: string;
  filePages: number | null;
  locale: string;
  authors: StoredAuthor[];
}

export interface Organiser {
  userId: string;
  email: string;
  fullName: string;
}

export interface Person {
  fullName: string;
  email: string;
  institution: string | null;
}

export interface SubmissionStore {
  /** `closedAt` is set while the organisers have submissions closed by hand (#236). */
  findEvent(slug: string): Promise<{ id: string; slug: string; name: string; closedAt: string | null } | null>;
  /**
   * Papers of the edition, withdrawn ones left out, where a line has any of the person's
   * addresses or documents. Empty for an empty identity.
   */
  listByIdentity(eventId: string, who: Identity): Promise<Submission[]>;
  findById(id: string): Promise<Submission | null>;
  /** Papers of the edition this person was chosen to review (#232), withdrawn ones left out. */
  listAssignedTo(eventId: string, userId: string): Promise<Submission[]>;
  isReviewerOf(submissionId: string, userId: string): Promise<boolean>;
  /**
   * People whose name contains the text, ignoring case and accents: accounts,
   * registrations of the edition and authors of its papers, one row per e-mail.
   */
  searchPeople(eventId: string, query: string, limit: number): Promise<Person[]>;
  /**
   * Writes a new paper (`id` null) or replaces the fields and the authors of one, in a single
   * step with the count of the edital's limits for every author, so that two saves at the
   * same moment cannot both pass and a paper is never left without its authors (ADR-010).
   */
  save(eventId: string, userId: string, id: string | null, input: SubmissionInput, check: LimitCheck, now: Date): Promise<SaveResult>;
  softDelete(id: string, userId: string, reason: string, now: Date): Promise<void>;
  /** People with the Administrador or Organizador role in the edition. */
  listOrganisers(eventId: string): Promise<Organiser[]>;
  isOrganiser(eventId: string, userId: string): Promise<boolean>;
  /** An administrator of the edition (or of the platform): the only staff who change or withdraw a paper (#265). */
  isAdmin(eventId: string, userId: string): Promise<boolean>;
  /** Accounts among the given addresses, with their documents. */
  findAccountsByEmail(emails: string[]): Promise<AccountRef[]>;
  /** Accounts that hold any of these documents (a CPF, or a passport with its country). */
  findAccountsByDocument(documents: PersonDocument[]): Promise<AccountRef[]>;
}

/** The private bucket with the papers. */
export interface FileStorage {
  /** Where the browser sends the file, valid for a short time and for that one object. */
  createUploadUrl(path: string): Promise<string>;
  /** The whole file, or null when nothing was uploaded there. */
  download(path: string): Promise<Uint8Array | null>;
  /** A link that opens the file for a short time. */
  createDownloadUrl(path: string, fileName: string, seconds: number): Promise<string>;
}
