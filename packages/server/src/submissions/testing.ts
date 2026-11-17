// Test helpers for the submission handlers. Not imported by runtime code.
import { strToU8, zipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import type { AuthUser } from '../account/auth';
import { FakeAuth } from '../account/testing';
import type { NewNotification, OutboxJob, OutboxMail, OutboxStore } from '../core/outbox';
import type { Mailer, OutgoingMail } from '../payments/notifications';
import type { SubmissionDeps } from './handlers';
import { RULES } from './rules';
import type { Author, FileStorage, Organiser, Submission, SubmissionInput, SubmissionStore } from './store';

export const NOW = new Date('2026-12-01T15:00:00-03:00');
export const EVENT = { id: 'ev-2027', slug: '2027', name: 'II SIEAmB' };
export const MAIN: AuthUser = { id: 'user-main', email: 'maria@ufcg.edu.br', emailConfirmed: true };
export const OTHER: AuthUser = { id: 'user-other', email: 'joao@ufpb.br', emailConfirmed: true };
export const ORGANISER: AuthUser = { id: 'user-org', email: 'viviane@ufcg.edu.br', emailConfirmed: true };

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
  users: { id: string; email: string }[] = [
    { id: MAIN.id, email: MAIN.email },
    { id: OTHER.id, email: OTHER.email },
    { id: ORGANISER.id, email: ORGANISER.email },
  ];
  deletions: { id: string; userId: string; reason: string }[] = [];

  async findEvent(slug: string) {
    return slug === EVENT.slug ? EVENT : null;
  }
  async listByAuthorEmail(eventId: string, email: string) {
    return this.submissions.filter(
      (s) => s.eventId === eventId && !s.deletedAt && s.authors.some((a) => a.email === email),
    );
  }
  async findById(id: string) {
    return this.submissions.find((s) => s.id === id) ?? null;
  }
  async insert(eventId: string, userId: string, input: SubmissionInput, now: Date) {
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
    return submission;
  }
  async update(id: string, input: SubmissionInput, now: Date) {
    const submission = this.submissions.find((s) => s.id === id);
    if (!submission) throw new Error('submission_not_found');
    Object.assign(submission, input, { updatedAt: now.toISOString() });
    return submission;
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
  async findUsersByEmail(emails: string[]) {
    return this.users.filter((u) => emails.includes(u.email));
  }

  /** A paper already in the table, for tests about limits and visibility. */
  seed(over: Partial<Submission> & { authors?: Author[] } = {}): Submission {
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
      authors: [{ position: 1, fullName: 'Maria Clara de Souza', email: MAIN.email }],
      ...over,
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
    profileName: async (userId) => (userId === MAIN.id ? 'Maria Clara de Souza' : 'João Lima'),
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
