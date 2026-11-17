import type { Modality } from './rules';

export type SubmissionStatus =
  'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'APPROVED_WITH_REVISION' | 'REJECTED';

export interface Author {
  position: number;
  fullName: string;
  email: string;
}

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
  authors: Author[];
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
  authors: Author[];
}

export interface Organiser {
  userId: string;
  email: string;
  fullName: string;
}

export interface SubmissionStore {
  findEvent(slug: string): Promise<{ id: string; slug: string; name: string } | null>;
  /** Papers of the edition, withdrawn ones left out, where the e-mail is any of the authors. */
  listByAuthorEmail(eventId: string, email: string): Promise<Submission[]>;
  findById(id: string): Promise<Submission | null>;
  insert(eventId: string, userId: string, input: SubmissionInput, now: Date): Promise<Submission>;
  /** Replaces the fields and the list of authors of a paper. */
  update(id: string, input: SubmissionInput, now: Date): Promise<Submission>;
  softDelete(id: string, userId: string, reason: string, now: Date): Promise<void>;
  /** People with the Administrador or Organizador role in the edition. */
  listOrganisers(eventId: string): Promise<Organiser[]>;
  isOrganiser(eventId: string, userId: string): Promise<boolean>;
  /** Accounts, by e-mail, among the given addresses: who gets the in-site notice too. */
  findUsersByEmail(emails: string[]): Promise<{ id: string; email: string }[]>;
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
