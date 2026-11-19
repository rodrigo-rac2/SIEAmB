/**
 * Browser side of paper submissions (#216). Everything goes through
 * /api/v1/submissions, where the server applies the edital's rules; the file
 * itself goes straight to private storage through a one-time link.
 */
import rulesFixture from '../data/submissionRules.json';

export type Modality = 'ARTIGO' | 'RESUMO_EXPANDIDO';
export type SubmissionStatus =
  'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'APPROVED_WITH_REVISION' | 'REJECTED';
export type WindowState = 'not_open' | 'open' | 'closed';

export interface PaperAuthor {
  position: number;
  fullName: string;
  email: string;
}

export interface Paper {
  id: string;
  number: number;
  title: string;
  titleEn: string;
  modality: Modality;
  areaRef: string;
  abstract: string;
  keywords: string[];
  keywordsEn: string[];
  fileName: string;
  filePages: number | null;
  status: SubmissionStatus;
  createdAt: string;
  updatedAt: string;
  authors: PaperAuthor[];
  /** Where the reader stands in the author list, from 1. */
  position: number | null;
  sentByMe: boolean;
  /** The reader may change it as an organiser, not as its sender (#250). */
  asOrganiser?: boolean;
  canEdit: boolean;
  /**
   * For whoever may change the paper (ADR-010): what is on record about who each author is.
   * `account`: the person's own account says it; `typed`: typed by the sender, shown as a
   * hint; `missing`: a line from before documents were asked for.
   */
  authorDocuments?: { position: number; state: 'account' | 'typed' | 'missing'; hint?: string }[];
  /** On a paper the reader sent: authors whose document no longer matches their own account. */
  authorIssues?: { position: number; fullName: string }[];
}

export interface MyPapers {
  state: WindowState;
  closesAt: string;
  /** The published date has passed; sending may still be open. */
  pastDeadline?: boolean;
  /** When the organisers closed submissions by hand (#236); absent or null otherwise. */
  closedAt?: string | null;
  limits: { asMain: number; maxAsMain: number; asCoauthor: number; maxAsCoauthor: number };
  submissions: Paper[];
  /** The account has not said who the person is: nothing can be sent yet (ADR-010). */
  documentMissing?: boolean;
  /** Places that wait for this person: listed with another document, or under another address. */
  waiting?: { otherDocument: number; otherEmail: { maskedEmail: string; count: number }[] };
}

/** The document typed for an author who has no account, as the form holds it. */
export interface AuthorDocumentInput {
  cpf?: string;
  passport?: string;
  country?: string;
}

export interface PaperInput {
  id?: string;
  title: string;
  titleEn: string;
  modality: Modality;
  areaRef: string;
  abstract: string;
  keywords: string;
  keywordsEn: string;
  /** Every author, in the order of the paper. A person picked from the suggestions goes as `ref`. */
  authors: (({ fullName: string; email: string } | { fullName: string; ref: string }) & AuthorDocumentInput)[];
  confirmDuplicate?: boolean;
}

export interface SubmissionRules {
  eventId: string;
  opensAt: string;
  closesAt: string;
  locksAtClose: boolean;
  maxAuthors: number;
  maxAsMainAuthor: number;
  maxAsCoauthor: number;
  maxKeywords: number;
  maxFileMb: number;
  formats: string[];
  modalities: Record<Modality, { minPages: number; maxPages: number }>;
}

/** The edital's rules for an edition, from the same file the server enforces. */
export const rulesForEvent = (eventId: string): SubmissionRules | null =>
  (rulesFixture as SubmissionRules[]).find((r) => r.eventId === eventId) ?? null;

const KNOWN_ERRORS = [
  'not_logged_in',
  'email_not_confirmed',
  'event_not_found',
  'submissions_not_open',
  'submissions_closed',
  'submission_not_found',
  'submission_locked',
  'too_many_attempts',
  'wrong_file_type',
  'file_missing',
  'file_too_large',
  'unreadable_file',
  'wrong_page_count',
  'invalid_title',
  'invalid_title_en',
  'invalid_modality',
  'invalid_area',
  'invalid_abstract',
  'invalid_keywords',
  'invalid_author',
  'sender_not_listed',
  'document_required',
  'author_document_required',
  'author_invalid_cpf',
  'author_invalid_passport',
  'author_invalid_country',
  'author_other_email',
  'duplicate_author',
  'too_many_authors',
  'too_many_as_main',
  'coauthor_limit',
  'duplicate_title',
  'upload_failed',
] as const;

export type SubmissionErrorCode = (typeof KNOWN_ERRORS)[number] | 'generic';

export class SubmissionError extends Error {
  constructor(
    readonly code: SubmissionErrorCode,
    /** What the server said besides the code: page counts, limits, the e-mail over the limit. */
    readonly details: Record<string, string | number> = {},
  ) {
    super(code);
    this.name = 'SubmissionError';
  }
}

async function request<T>(
  method: 'GET' | 'POST',
  action: string,
  options: { body?: unknown; token?: string; query?: string } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1/submissions/${action}${options.query ?? ''}`, {
      method,
      headers: {
        ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch {
    throw new SubmissionError('generic');
  }
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const code = (KNOWN_ERRORS as readonly string[]).includes(String(data.error))
      ? (data.error as SubmissionErrorCode)
      : 'generic';
    const details: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(data)) {
      if (key !== 'error' && (typeof value === 'string' || typeof value === 'number')) details[key] = value;
    }
    throw new SubmissionError(code, details);
  }
  return data as T;
}

const slugQuery = (eventSlug: string) => `?eventSlug=${encodeURIComponent(eventSlug)}`;

export const fetchWindow = (eventSlug: string): Promise<{ state: WindowState; opensAt: string; closesAt: string }> =>
  request('GET', 'rules', { query: slugQuery(eventSlug) });

/** Someone already known to the system, as the author list may suggest them. Never a full e-mail. */
export interface PersonSuggestion {
  fullName: string;
  institution: string | null;
  emailHint: string;
  /** What the form sends back instead of the e-mail. */
  ref: string;
  /** Their account already says who they are: no document has to be typed for them. */
  hasDocument?: boolean;
}

/** People whose name matches what is being typed; empty when nothing matches or on any failure. */
export const searchPeople = (token: string, eventSlug: string, query: string): Promise<PersonSuggestion[]> =>
  request<{ people: PersonSuggestion[] }>('GET', 'people', {
    token,
    query: `${slugQuery(eventSlug)}&q=${encodeURIComponent(query)}`,
  })
    .then((data) => data.people ?? [])
    .catch(() => []);

/** A paper as the person chosen to review it sees it: the authors by name, no e-mails. */
export interface ReviewPaper {
  id: string;
  number: number;
  title: string;
  titleEn: string;
  modality: Modality;
  areaRef: string;
  abstract: string;
  keywords: string[];
  keywordsEn: string[];
  fileName: string;
  filePages: number | null;
  status: SubmissionStatus;
  createdAt: string;
  authors: { position: number; fullName: string }[];
}

export const fetchReviewing = (token: string, eventSlug: string): Promise<{ submissions: ReviewPaper[] }> =>
  request('GET', 'reviewing', { token, query: slugQuery(eventSlug) });

/** One paper, for the form: the sender, another author (read only) or an organiser. */
export const fetchPaper = (token: string, eventSlug: string, id: string): Promise<{ submission: Paper }> =>
  request('GET', 'one', { token, query: `${slugQuery(eventSlug)}&id=${encodeURIComponent(id)}` });

export const fetchMyPapers = (token: string, eventSlug: string): Promise<MyPapers> =>
  request('GET', 'mine', { token, query: slugQuery(eventSlug) });

/** Sends the file to private storage and returns where it was put. */
export async function uploadPaperFile(token: string, eventSlug: string, file: File): Promise<string> {
  const { path, uploadUrl } = await request<{ path: string; uploadUrl: string }>('POST', 'upload-url', {
    token,
    body: { eventSlug, fileName: file.name, size: file.size },
  });
  let response: Response;
  try {
    response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': file.type || 'application/octet-stream' },
      body: file,
    });
  } catch {
    throw new SubmissionError('upload_failed');
  }
  if (!response.ok) throw new SubmissionError('upload_failed');
  return path;
}

export const savePaper = (
  token: string,
  eventSlug: string,
  locale: string,
  input: PaperInput,
  file: { path: string; name: string } | null,
): Promise<{ submission: Paper }> =>
  request('POST', 'save', {
    token,
    body: {
      ...input,
      eventSlug,
      locale,
      ...(file ? { filePath: file.path, fileName: file.name } : {}),
    },
  });

export const withdrawPaper = (token: string, eventSlug: string, id: string): Promise<unknown> =>
  request('POST', 'withdraw', { token, body: { eventSlug, id } });

/** Leaving the page for a download goes through here, so tests can watch it. */
export const browser = {
  open: (url: string): void => window.location.assign(url),
};

/** A link that opens the file for a minute. */
export const paperFileUrl = async (token: string, id: string): Promise<string> =>
  (await request<{ url: string }>('GET', 'file', { token, query: `?id=${encodeURIComponent(id)}` })).url;
