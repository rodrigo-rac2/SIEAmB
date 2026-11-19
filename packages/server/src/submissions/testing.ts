// Test helpers for the submission handlers. Not imported by runtime code.
import { strToU8, zipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import type { AuthUser } from '../account/auth';
import { FakeAuth } from '../account/testing';
import type { NewNotification, OutboxJob, OutboxMail, OutboxStore } from '../core/outbox';
import type { Mailer, OutgoingMail } from '../payments/notifications';
import type { SubmissionDeps } from './handlers';
import { RULES } from './rules';
import { NO_DOCUMENT, type PersonDocument } from '../core/document';
import { countPlaces, isLineOf, passportKey, type Identity } from './identity';
import type {
  AccountRef,
  Author,
  FileStorage,
  LimitCheck,
  Organiser,
  Person,
  SaveResult,
  StoredAuthor,
  Submission,
  SubmissionInput,
  SubmissionStore,
} from './store';

export const NOW = new Date('2026-12-01T15:00:00-03:00');
export const EVENT = { id: 'ev-2027', slug: '2027', name: 'II SIEAmB' };
export const MAIN: AuthUser = { id: 'user-main', email: 'maria@ufcg.edu.br', emailConfirmed: true };
export const OTHER: AuthUser = { id: 'user-other', email: 'joao@ufpb.br', emailConfirmed: true };
export const ORGANISER: AuthUser = { id: 'user-org', email: 'viviane@ufcg.edu.br', emailConfirmed: true };

/** CPFs with valid check digits: the documents of the three accounts above, and a spare. */
export const MAIN_CPF = '52998224725';
export const OTHER_CPF = '11144477735';
export const ORGANISER_CPF = '39053344705';
export const SPARE_CPF = '12345678909';
export const cpfOnly = (cpf: string): PersonDocument => ({ cpf, passport: null, country: null });
export const passportOnly = (passport: string, country: string): PersonDocument => ({ cpf: null, passport, country });

/** An author line as stored; without a document it is a line from before documents were asked for. */
export const line = (position: number, fullName: string, email: string, document: PersonDocument = NO_DOCUMENT): StoredAuthor => ({
  position,
  fullName,
  email,
  document,
});

export async function pdf(pages: number): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) document.addPage([595, 842]);
  // Word and most tools write PDFs with compressed object streams: make ours the same.
  return document.save({ useObjectStreams: true });
}

export function docx(pages: number | null, wordFile = true): Uint8Array {
  const entries: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      wordFile
        ? '<Types><Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
        : '<Types><Override ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
    ),
    'word/document.xml': strToU8('<w:document/>'),
  };
  if (pages !== null) {
    entries['docProps/app.xml'] = strToU8(`<Properties><Pages>${pages}</Pages><Words>900</Words></Properties>`);
  }
  return zipSync(entries);
}

let seq = 0;

export class FakeSubmissionStore implements SubmissionStore {
  submissions: Submission[] = [];
  organisers: Organiser[] = [];
  /** The accounts, each with the document that says who the person is. */
  users: AccountRef[] = [
    { id: MAIN.id, email: MAIN.email, document: cpfOnly(MAIN_CPF) },
    { id: OTHER.id, email: OTHER.email, document: cpfOnly(OTHER_CPF) },
    { id: ORGANISER.id, email: ORGANISER.email, document: cpfOnly(ORGANISER_CPF) },
  ];
  /** Every call that wrote a paper, with the people it was checked for. */
  saves: { id: string | null; check: LimitCheck }[] = [];
  deletions: { id: string; userId: string; reason: string }[] = [];
  /** Who the name suggestions can find. */
  people: Person[] = [];
  searches: { eventId: string; query: string; limit: number }[] = [];

  /** Set to close submissions by hand, as the organisers' button does. */
  closedAt: string | null = null;
  async findEvent(slug: string) {
    return slug === EVENT.slug ? { ...EVENT, closedAt: this.closedAt } : null;
  }
  async listByIdentity(eventId: string, who: Identity) {
    return this.submissions.filter(
      (s) => s.eventId === eventId && !s.deletedAt && s.authors.some((a) => isLineOf(a, who)),
    );
  }
  async findById(id: string) {
    return this.submissions.find((s) => s.id === id) ?? null;
  }
  /** submission id → the accounts chosen to review it. */
  reviewers = new Map<string, string[]>();
  async listAssignedTo(eventId: string, userId: string) {
    return this.submissions.filter(
      (s) => s.eventId === eventId && !s.deletedAt && (this.reviewers.get(s.id) ?? []).includes(userId),
    );
  }
  async isReviewerOf(submissionId: string, userId: string) {
    return (this.reviewers.get(submissionId) ?? []).includes(userId);
  }
  async searchPeople(eventId: string, query: string, limit: number) {
    this.searches.push({ eventId, query, limit });
    const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return this.people.filter((p) => fold(p.fullName).includes(fold(query.trim()))).slice(0, limit);
  }
  /**
   * As the database function does: the limits are counted again for every author, over the
   * papers that stand, and only then is anything written.
   */
  async save(eventId: string, userId: string, id: string | null, input: SubmissionInput, check: LimitCheck, now: Date): Promise<SaveResult> {
    this.saves.push({ id, check });
    for (const [i, author] of input.authors.entries()) {
      const who = check.identities[i]!;
      const others = (await this.listByIdentity(eventId, who)).filter((s) => s.id !== id);
      const places = countPlaces(others, who);
      if (author.position === 1 && places.asMain >= check.maxAsMain) return { refused: 'too_many_as_main', position: 1 };
      if (author.position > 1 && places.asCoauthor >= check.maxAsCoauthor) return { refused: 'coauthor_limit', position: author.position };
    }
    if (id) {
      const submission = this.submissions.find((s) => s.id === id && s.eventId === eventId && !s.deletedAt);
      if (!submission) return { refused: 'submission_not_found', position: null };
      Object.assign(submission, input, { updatedAt: now.toISOString() });
      return { submission };
    }
    seq += 1;
    const submission: Submission = {
      ...input,
      id: `sub-${seq}`,
      number: seq,
      eventId,
      userId,
      status: 'SUBMITTED',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      deletedAt: null,
    };
    this.submissions.push(submission);
    return { submission };
  }
  async softDelete(id: string, userId: string, reason: string, now: Date) {
    const submission = this.submissions.find((s) => s.id === id);
    if (submission) submission.deletedAt = now.toISOString();
    this.deletions.push({ id, userId, reason });
  }
  async listOrganisers() {
    return this.organisers;
  }
  async isOrganiser(_eventId: string, userId: string) {
    return this.organisers.some((o) => o.userId === userId);
  }
  /** Organisers who are not administrators: they see every paper and change none (#265). */
  notAdmins = new Set<string>();
  async isAdmin(_eventId: string, userId: string) {
    return this.organisers.some((o) => o.userId === userId) && !this.notAdmins.has(userId);
  }
  async findAccountsByEmail(emails: string[]) {
    return this.users.filter((u) => emails.includes(u.email));
  }
  async findAccountsByDocument(documents: PersonDocument[]) {
    return this.users.filter((u) =>
      documents.some(
        (d) =>
          (d.cpf !== null && u.document.cpf === d.cpf) ||
          (passportKey(d) !== null && passportKey(u.document) === passportKey(d)),
      ),
    );
  }
  /** An account, with or without a document, for tests about who a person is. */
  addUser(user: AuthUser, document: PersonDocument = NO_DOCUMENT): AccountRef {
    const account = { id: user.id, email: user.email, document };
    this.users = [...this.users.filter((u) => u.id !== user.id), account];
    return account;
  }

  /** A paper already in the table, for tests about limits and visibility. */
  seed(over: Omit<Partial<Submission>, 'authors'> & { authors?: (Author & { document?: PersonDocument })[] } = {}): Submission {
    seq += 1;
    const submission: Submission = {
      id: `sub-${seq}`,
      number: seq,
      eventId: EVENT.id,
      userId: MAIN.id,
      title: `Trabalho de teste ${seq}`,
      titleEn: `Test paper ${seq}`,
      modality: 'RESUMO_EXPANDIDO',
      areaRef: 'a3',
      abstract: 'x'.repeat(80),
      keywords: ['água'],
      keywordsEn: [],
      filePath: `2027/${MAIN.id}/seed-${seq}.pdf`,
      fileName: 'trabalho.pdf',
      filePages: 5,
      status: 'SUBMITTED',
      locale: 'pt-BR',
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      deletedAt: null,
      ...over,
      // A line given without a document is a line from before documents were asked for.
      authors: (over.authors ?? [{ position: 1, fullName: 'Maria Clara de Souza', email: MAIN.email, document: cpfOnly(MAIN_CPF) }]).map(
        (a) => ({ ...a, document: a.document ?? NO_DOCUMENT }),
      ),
    };
    this.submissions.push(submission);
    return submission;
  }
}

export class FakeFiles implements FileStorage {
  objects = new Map<string, Uint8Array>();
  uploadUrls: string[] = [];
  downloadUrls: { path: string; fileName: string; seconds: number }[] = [];

  async createUploadUrl(path: string) {
    this.uploadUrls.push(path);
    return `https://storage.example/upload/${path}?token=t`;
  }
  async download(path: string) {
    return this.objects.get(path) ?? null;
  }
  async createDownloadUrl(path: string, fileName: string, seconds: number) {
    this.downloadUrls.push({ path, fileName, seconds });
    return `https://storage.example/download/${path}?token=t`;
  }
}

export class FakeOutbox implements OutboxStore {
  rows: (OutboxJob & { dedupeKey: string; status: 'PENDING' | 'SENT' | 'SKIPPED'; lockedUntil: number | null; lastError: string | null })[] = [];
  notifications: NewNotification[] = [];
  failNotifications = false;

  async enqueueOutbox(mail: OutboxMail) {
    if (this.rows.some((r) => r.dedupeKey === mail.dedupeKey)) return null;
    const row = {
      id: `mail-${this.rows.length + 1}`,
      to: mail.to,
      subject: mail.subject,
      text: mail.text as string | null,
      html: mail.html as string | null,
      attempts: 0,
      dedupeKey: mail.dedupeKey,
      status: 'PENDING' as const,
      lockedUntil: null,
      lastError: null,
    };
    this.rows.push(row);
    return { ...row };
  }
  async enqueueOutboxBulk(mails: OutboxMail[]) {
    let recorded = 0;
    for (const mail of mails) if (await this.enqueueOutbox(mail)) recorded += 1;
    return recorded;
  }
  async listDueOutbox(now: Date, limit: number) {
    return this.rows
      .filter((r) => r.status === 'PENDING' && r.attempts < 6 && (r.lockedUntil === null || r.lockedUntil < now.getTime()))
      .slice(0, limit)
      .map((r) => ({ ...r }));
  }
  async claimOutbox(job: OutboxJob, now: Date) {
    const row = this.rows.find((r) => r.id === job.id);
    if (!row || row.status !== 'PENDING' || row.attempts !== job.attempts) return false;
    if (row.lockedUntil !== null && row.lockedUntil >= now.getTime()) return false;
    row.attempts += 1;
    row.lockedUntil = now.getTime() + 120_000;
    return true;
  }
  async finishOutbox(id: string, outcome: 'SENT' | 'SKIPPED') {
    const row = this.rows.find((r) => r.id === id)!;
    row.status = outcome;
    row.lockedUntil = null;
    row.text = null;
    row.html = null;
  }
  async releaseOutbox(id: string, reason: string) {
    const row = this.rows.find((r) => r.id === id)!;
    row.lockedUntil = null;
    row.lastError = reason;
  }
  async addNotifications(notifications: NewNotification[]) {
    if (this.failNotifications) throw new Error('db down');
    this.notifications.push(...notifications);
  }
}

export function setup(options: { failSends?: boolean; noMailer?: boolean; locksAtClose?: boolean } = {}) {
  const store = new FakeSubmissionStore();
  const files = new FakeFiles();
  const outbox = new FakeOutbox();
  const auth = new FakeAuth();
  const sent: OutgoingMail[] = [];
  const logs: { event: string; data: Record<string, unknown> }[] = [];
  const hits = new Map<string, number>();
  const mailer: Mailer = {
    async send(mail) {
      if (options.failSends) throw new Error('smtp down');
      sent.push(mail);
    },
  };
  const clock = { window: NOW };
  const deps: SubmissionDeps = {
    store,
    files,
    outbox,
    auth,
    mailer: options.noMailer ? undefined : mailer,
    async hitRateLimit(key, _window, max) {
      const count = (hits.get(key) ?? 0) + 1;
      hits.set(key, count);
      return count <= max;
    },
    siteUrl: 'https://dev.sieamb.org/',
    log: (event, data) => logs.push({ event, data }),
    now: () => NOW,
    windowNow: () => clock.window,
    pepper: 'test-pepper',
    ...(options.locksAtClose ? { rules: RULES.map((r) => ({ ...r, locksAtClose: true })) } : {}),
  };
  const tokens = {
    main: auth.login(MAIN),
    other: auth.login(OTHER),
    organiser: auth.login(ORGANISER),
  };
  return { store, files, outbox, auth, sent, logs, deps, tokens, clock };
}

export function call(
  method: 'GET' | 'POST',
  action: string,
  options: { body?: unknown; token?: string; query?: string } = {},
): Request {
  return new Request(`https://dev.sieamb.org/api/v1/submissions/${action}${options.query ?? ''}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
}
