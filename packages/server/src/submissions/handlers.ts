import { randomUUID } from 'node:crypto';
import { authenticate, isEmail, sha256, text } from '../account/handlers';
import type { AuthGateway, AuthUser } from '../account/auth';
import { notifyUsers, sendThroughOutbox, type OutboxDeps, type OutboxMail } from '../core/outbox';
import { emailLocale } from '../payments/emailTemplates';
import { json, readJsonObject, type Log } from '../payments/http';
import { firstName } from '../payments/notifications';
import {
  MODALITY_NAMES,
  renderOrganiserEmail,
  renderSubmissionEmail,
  type SubmissionEmailKind,
} from './emails';
import { UnreadableFileError, extensionOf, inspectFile } from './files';
import {
  MODALITIES,
  areaName,
  areaRefs,
  rulesFor,
  windowState,
  type Modality,
  type SubmissionRules,
} from './rules';
import type { Author, FileStorage, Submission, SubmissionInput, SubmissionStore } from './store';

export interface SubmissionDeps extends OutboxDeps {
  store: SubmissionStore;
  files: FileStorage;
  auth: AuthGateway;
  /** Counts one more attempt under a key; false once the window is over the limit. */
  hitRateLimit(key: string, windowSeconds: number, max: number): Promise<boolean>;
  /** Name the account holder gave, for the author list. */
  profileName(userId: string): Promise<string>;
  siteUrl: string;
  log: Log;
  /** Real time, for records. */
  now: () => Date;
  /** The clock the submission window is judged by (can be moved outside production). */
  windowNow: () => Date;
  pepper: string;
}

export const UPLOADS_PER_HOUR = 30;
export const DOWNLOAD_LINK_SECONDS = 60;
const TITLE = { min: 5, max: 300 };
const ABSTRACT = { min: 50, max: 5000 };
const KEYWORD = { min: 2, max: 60 };

const site = (deps: SubmissionDeps) => deps.siteUrl.replace(/\/+$/, '');

/** What a paper looks like to someone allowed to see it. */
function view(submission: Submission, user: AuthUser, open: boolean) {
  const isMain = submission.userId === user.id;
  return {
    id: submission.id,
    number: submission.number,
    title: submission.title,
    titleEn: submission.titleEn,
    modality: submission.modality,
    areaRef: submission.areaRef,
    abstract: submission.abstract,
    keywords: submission.keywords,
    keywordsEn: submission.keywordsEn,
    fileName: submission.fileName,
    filePages: submission.filePages,
    status: submission.status,
    createdAt: submission.createdAt,
    updatedAt: submission.updatedAt,
    authors: submission.authors,
    role: isMain ? 'main' : 'coauthor',
    // Only the main author changes a paper, and only until submissions close.
    canEdit: isMain && open && submission.status === 'SUBMITTED',
  };
}

interface Context {
  user: AuthUser;
  event: { id: string; slug: string; name: string };
  rules: SubmissionRules;
  open: boolean;
  state: ReturnType<typeof windowState>;
}

/** The logged-in person, the edition and its rules, or the response that says what is missing. */
async function context(
  request: Request,
  deps: SubmissionDeps,
  eventSlug: unknown,
): Promise<Context | { response: Response }> {
  const auth = await authenticate(request, deps);
  if ('response' in auth) return auth;
  const slug = text(eventSlug, 40);
  const event = slug ? await deps.store.findEvent(slug) : null;
  const rules = event ? rulesFor(event.slug) : null;
  if (!event || !rules) return { response: json(404, { error: 'event_not_found' }) };
  const state = windowState(rules, deps.windowNow());
  return { user: auth.user, event, rules, state, open: state === 'open' };
}

const closedResponse = (state: Context['state']): Response =>
  json(409, { error: state === 'not_open' ? 'submissions_not_open' : 'submissions_closed' });

// ───────────────────────────── Read ─────────────────────────────

/** Public: when submissions open and close, as the server's clock sees it. */
async function rules(request: Request, deps: SubmissionDeps): Promise<Response> {
  const slug = text(new URL(request.url).searchParams.get('eventSlug'), 40);
  const found = rulesFor(slug);
  if (!found) return json(404, { error: 'event_not_found' });
  return json(200, {
    state: windowState(found, deps.windowNow()),
    opensAt: found.opensAt,
    closesAt: found.closesAt,
  });
}

async function mine(request: Request, deps: SubmissionDeps): Promise<Response> {
  const ctx = await context(request, deps, new URL(request.url).searchParams.get('eventSlug'));
  if ('response' in ctx) return ctx.response;
  const { user, event, rules: r } = ctx;
  const all = await deps.store.listByAuthorEmail(event.id, user.email);
  return json(200, {
    state: ctx.state,
    closesAt: r.closesAt,
    limits: {
      asMain: all.filter((s) => s.userId === user.id).length,
      maxAsMain: r.maxAsMainAuthor,
      asCoauthor: all.filter((s) => s.userId !== user.id).length,
      maxAsCoauthor: r.maxAsCoauthor,
    },
    submissions: all.map((s) => view(s, user, ctx.open)),
  });
}

/** A short-lived link to the file, for its authors and for the organisers. */
async function file(request: Request, deps: SubmissionDeps): Promise<Response> {
  const auth = await authenticate(request, deps);
  if ('response' in auth) return auth.response;
  const id = text(new URL(request.url).searchParams.get('id'), 40);
  const submission = id ? await deps.store.findById(id) : null;
  // Same answer for "does not exist" and "not yours": nothing to learn by guessing ids.
  if (!submission) return json(404, { error: 'submission_not_found' });
  const isAuthor = submission.authors.some((a) => a.email === auth.user.email);
  const allowed =
    (isAuthor && !submission.deletedAt) || (await deps.store.isOrganiser(submission.eventId, auth.user.id));
  if (!allowed) return json(404, { error: 'submission_not_found' });
  const url = await deps.files.createDownloadUrl(submission.filePath, submission.fileName, DOWNLOAD_LINK_SECONDS);
  deps.log('submission_file_opened', { submissionId: submission.id, byOrganiser: !isAuthor });
  return json(200, { url });
}

// ───────────────────────────── Upload ─────────────────────────────

async function uploadUrl(request: Request, deps: SubmissionDeps): Promise<Response> {
  const body = await readJsonObject(request);
  const ctx = await context(request, deps, body.eventSlug);
  if ('response' in ctx) return ctx.response;
  if (!ctx.open) return closedResponse(ctx.state);
  const { user, event, rules: r } = ctx;
  if (!(await deps.hitRateLimit(sha256(`${deps.pepper}:upload:${user.id}`), 3600, UPLOADS_PER_HOUR))) {
    return json(429, { error: 'too_many_attempts' });
  }
  const kind = extensionOf(text(body.fileName, 300), r.formats);
  if (!kind) return json(400, { error: 'wrong_file_type' });
  const size = typeof body.size === 'number' ? body.size : NaN;
  if (!Number.isFinite(size) || size <= 0) return json(400, { error: 'file_missing' });
  if (size > r.maxFileMb * 1024 * 1024) return json(400, { error: 'file_too_large', maxMb: r.maxFileMb });
  // The stored name is ours: the person's own folder and a random id. The name the
  // author gave is kept with the paper and only used when the file is downloaded.
  const path = `${event.slug}/${user.id}/${randomUUID()}.${kind}`;
  return json(200, { path, uploadUrl: await deps.files.createUploadUrl(path) });
}

// ───────────────────────────── Save ─────────────────────────────

const normalise = (title: string): string =>
  title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Spacing, hyphens and punctuation do not make it another paper ("semi-árido" / "semiárido").
    .replace(/[^a-z0-9]+/g, '');

function keywordList(value: unknown, max: number): string[] | null {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[;\n]/) : [];
  const list = raw.map((k) => text(k, KEYWORD.max)).filter(Boolean);
  if (list.length > max || list.some((k) => k.length < KEYWORD.min)) return null;
  return [...new Set(list)];
}

type Parsed =
  | { error: string; extra?: Record<string, unknown> }
  | { fields: Omit<SubmissionInput, 'filePath' | 'fileName' | 'filePages' | 'authors' | 'locale'>; coauthors: Omit<Author, 'position'>[] };

function parse(body: Record<string, unknown>, ctx: Context): Parsed {
  const { rules: r, user, event } = ctx;
  const title = text(body.title, TITLE.max + 1);
  const titleEn = text(body.titleEn, TITLE.max + 1);
  if (title.length < TITLE.min || title.length > TITLE.max) return { error: 'invalid_title' };
  if (titleEn.length < TITLE.min || titleEn.length > TITLE.max) return { error: 'invalid_title_en' };
  const modality = MODALITIES.find((m) => m === body.modality);
  if (!modality) return { error: 'invalid_modality' };
  const areaRef = text(body.areaRef, 40);
  if (!areaRefs(event.slug).includes(areaRef)) return { error: 'invalid_area' };
  const abstract = typeof body.abstract === 'string' ? body.abstract.trim() : '';
  if (abstract.length < ABSTRACT.min || abstract.length > ABSTRACT.max) return { error: 'invalid_abstract' };
  const keywords = keywordList(body.keywords, r.maxKeywords);
  const keywordsEn = keywordList(body.keywordsEn, r.maxKeywords);
  if (!keywords || keywords.length === 0 || !keywordsEn) return { error: 'invalid_keywords' };

  const rawAuthors = Array.isArray(body.coauthors) ? body.coauthors : [];
  if (rawAuthors.length > r.maxAuthors - 1) return { error: 'too_many_authors', extra: { max: r.maxAuthors } };
  const coauthors: Omit<Author, 'position'>[] = [];
  for (const raw of rawAuthors) {
    const entry = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const fullName = text(entry.fullName, 150);
    const email = text(entry.email, 200).toLowerCase();
    if (fullName.length < 3 || !isEmail(email)) return { error: 'invalid_coauthor' };
    // The main author is not also a co-author, and nobody is listed twice.
    if (email === user.email || coauthors.some((c) => c.email === email)) {
      return { error: 'duplicate_author', extra: { email } };
    }
    coauthors.push({ fullName, email });
  }
  return { fields: { title, titleEn, modality, areaRef, abstract, keywords, keywordsEn }, coauthors };
}

/** Page limits of the modality; a file that does not say its page count is accepted and flagged. */
function pagesProblem(pages: number | null, modality: Modality, r: SubmissionRules): Response | null {
  const { minPages, maxPages } = r.modalities[modality];
  if (pages === null || (pages >= minPages && pages <= maxPages)) return null;
  return json(400, { error: 'wrong_page_count', pages, minPages, maxPages });
}

async function save(request: Request, deps: SubmissionDeps): Promise<Response> {
  const body = await readJsonObject(request);
  const ctx = await context(request, deps, body.eventSlug);
  if ('response' in ctx) return ctx.response;
  if (!ctx.open) return closedResponse(ctx.state);
  const { user, event, rules: r } = ctx;

  const id = text(body.id, 40);
  const existing = id ? await deps.store.findById(id) : null;
  if (id && (!existing || existing.deletedAt || existing.userId !== user.id || existing.eventId !== event.id)) {
    return json(404, { error: 'submission_not_found' });
  }
  if (existing && existing.status !== 'SUBMITTED') return json(409, { error: 'submission_locked' });

  const parsed = parse(body, ctx);
  if ('error' in parsed) return json(400, { error: parsed.error, ...parsed.extra });
  const { fields, coauthors } = parsed;

  // The edital's limits, counted over the papers that are still standing.
  const mine = await deps.store.listByAuthorEmail(event.id, user.email);
  const others = (list: Submission[]) => list.filter((s) => s.id !== existing?.id);
  if (!existing && mine.filter((s) => s.userId === user.id).length >= r.maxAsMainAuthor) {
    return json(409, { error: 'too_many_as_main', max: r.maxAsMainAuthor });
  }
  const related = [...others(mine)];
  for (const coauthor of coauthors) {
    const theirs = others(await deps.store.listByAuthorEmail(event.id, coauthor.email));
    const asCoauthor = theirs.filter((s) => s.authors.some((a) => a.email === coauthor.email && a.position > 1));
    if (asCoauthor.length >= r.maxAsCoauthor) {
      return json(409, { error: 'coauthor_limit', email: coauthor.email, max: r.maxAsCoauthor });
    }
    related.push(...theirs);
  }
  // "Uma única submissão por trabalho": warn when one of the authors already sent this title.
  const same = related.find((s) => normalise(s.title) === normalise(fields.title));
  if (same && body.confirmDuplicate !== true) {
    return json(409, { error: 'duplicate_title', number: same.number });
  }

  // The file: a new one when given, otherwise the one the paper already has.
  const filePath = text(body.filePath, 300);
  let fileFields: Pick<SubmissionInput, 'filePath' | 'fileName' | 'filePages'>;
  if (filePath) {
    const kind = extensionOf(filePath, r.formats);
    // Only a file this person uploaded for this edition can be attached.
    if (!kind || !filePath.startsWith(`${event.slug}/${user.id}/`) || filePath.includes('..')) {
      return json(400, { error: 'file_missing' });
    }
    const bytes = await deps.files.download(filePath);
    if (!bytes || bytes.length === 0) return json(400, { error: 'file_missing' });
    if (bytes.length > r.maxFileMb * 1024 * 1024) return json(400, { error: 'file_too_large', maxMb: r.maxFileMb });
    let pages: number | null;
    try {
      pages = (await inspectFile(bytes, kind)).pages;
    } catch (error) {
      if (error instanceof UnreadableFileError) return json(400, { error: 'unreadable_file' });
      throw error;
    }
    const problem = pagesProblem(pages, fields.modality, r);
    if (problem) return problem;
    const given = text(body.fileName, 200).replace(/[\\/\r\n"]/g, '_');
    fileFields = { filePath, fileName: given || `trabalho.${kind}`, filePages: pages };
  } else if (existing) {
    const problem = pagesProblem(existing.filePages, fields.modality, r);
    if (problem) return problem;
    fileFields = { filePath: existing.filePath, fileName: existing.fileName, filePages: existing.filePages };
  } else {
    return json(400, { error: 'file_missing' });
  }

  const mainName = (await deps.profileName(user.id)) || user.email;
  const authors: Author[] = [
    { position: 1, fullName: mainName, email: user.email },
    ...coauthors.map((c, i) => ({ position: i + 2, ...c })),
  ];
  const input: SubmissionInput = {
    ...fields,
    ...fileFields,
    locale: emailLocale(text(body.locale, 10)),
    authors,
  };
  const now = deps.now();
  const saved = existing
    ? await deps.store.update(existing.id, input, now)
    : await deps.store.insert(event.id, user.id, input, now);
  deps.log(existing ? 'submission_updated' : 'submission_created', { submissionId: saved.id });
  await announce(existing ? 'updated' : 'received', saved, ctx, deps, now);
  return json(existing ? 200 : 201, { submission: view(saved, user, true) });
}

async function withdraw(request: Request, deps: SubmissionDeps): Promise<Response> {
  const body = await readJsonObject(request);
  const ctx = await context(request, deps, body.eventSlug);
  if ('response' in ctx) return ctx.response;
  if (!ctx.open) return closedResponse(ctx.state);
  const submission = await deps.store.findById(text(body.id, 40));
  if (!submission || submission.deletedAt || submission.userId !== ctx.user.id || submission.eventId !== ctx.event.id) {
    return json(404, { error: 'submission_not_found' });
  }
  if (submission.status !== 'SUBMITTED') return json(409, { error: 'submission_locked' });
  const now = deps.now();
  await deps.store.softDelete(submission.id, ctx.user.id, 'withdrawn by the main author', now);
  deps.log('submission_withdrawn', { submissionId: submission.id });
  await announce('withdrawn', submission, ctx, deps, now);
  return json(200, { ok: true });
}

// ───────────────────────────── Notices ─────────────────────────────

/**
 * Tells the authors and the organisers, by e-mail and in the site. Never fails the
 * request: the paper is saved by the time this runs.
 */
async function announce(
  kind: SubmissionEmailKind,
  submission: Submission,
  ctx: Context,
  deps: SubmissionDeps,
  now: Date,
): Promise<void> {
  try {
    const { event } = ctx;
    const main = submission.authors[0]?.fullName ?? '';
    const stamp = kind === 'received' ? 'received' : `${kind}:${now.getTime()}`;
    const base = {
      eventName: event.name,
      number: submission.number,
      title: submission.title,
      mainAuthor: main,
    };
    const mails: OutboxMail[] = submission.authors.map((author) => ({
      to: author.email,
      dedupeKey: `submission:${submission.id}:${stamp}:${author.email}`,
      ...renderSubmissionEmail(kind, submission.locale, {
        ...base,
        firstName: firstName(author.fullName),
        url: `${site(deps)}/${encodeURIComponent(event.slug)}/meus-trabalhos`,
      }),
    }));
    const organisers = await deps.store.listOrganisers(event.id);
    for (const organiser of organisers) {
      mails.push({
        to: organiser.email,
        dedupeKey: `submission:${submission.id}:${stamp}:organiser:${organiser.userId}`,
        ...renderOrganiserEmail(kind, {
          ...base,
          firstName: firstName(organiser.fullName),
          modality: MODALITY_NAMES[submission.modality] ?? submission.modality,
          area: areaName(event.slug, submission.areaRef),
          authors: submission.authors.map((a) => a.fullName).join('; '),
          url: `${site(deps)}/${encodeURIComponent(event.slug)}/painel/trabalhos`,
        }),
      });
    }
    await sendThroughOutbox(mails, deps, now);

    const accounts = await deps.store.findUsersByEmail(submission.authors.map((a) => a.email));
    const data = { number: submission.number, title: submission.title, mainAuthor: main };
    await notifyUsers(
      [
        ...accounts.map((a) => ({ userId: a.id, eventId: event.id, kind: `submission.${kind}`, data })),
        ...organisers
          .filter((o) => !accounts.some((a) => a.id === o.userId))
          .map((o) => ({ userId: o.userId, eventId: event.id, kind: `organiser.submission.${kind}`, data })),
      ],
      deps,
    );
  } catch (error) {
    deps.log('submission_notice_failed', { error: error instanceof Error ? error.message : 'unknown' });
  }
}

// ───────────────────────────── Router ─────────────────────────────

type Handler = (request: Request, deps: SubmissionDeps) => Promise<Response>;

const ROUTES: Record<string, Partial<Record<string, Handler>>> = {
  rules: { GET: rules },
  mine: { GET: mine },
  file: { GET: file },
  'upload-url': { POST: uploadUrl },
  save: { POST: save },
  withdraw: { POST: withdraw },
};

/** One Vercel function serves every submission action: `/api/v1/submissions/<action>`. */
export async function handleSubmissions(
  request: Request,
  action: string,
  deps: SubmissionDeps | null,
): Promise<Response> {
  const route = ROUTES[action];
  if (!route) return json(404, { error: 'not_found' });
  const handler = route[request.method.toUpperCase()];
  if (!handler) return json(405, { error: 'method_not_allowed' });
  if (!deps) return json(503, { error: 'submissions_unavailable' });
  try {
    return await handler(request, deps);
  } catch (error) {
    deps.log('submission_request_failed', {
      action,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return json(500, { error: 'server_error' });
  }
}
