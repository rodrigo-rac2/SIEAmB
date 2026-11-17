import { randomUUID } from 'node:crypto';
import { authenticate, isEmail, sha256, text } from '../account/handlers';
import type { AuthGateway, AuthUser } from '../account/auth';
import { notifyUsers, sendThroughOutbox, type OutboxDeps, type OutboxMail } from '../core/outbox';
import { emailLocale } from '../payments/emailTemplates';
import { json, readJsonObject, type Log } from '../payments/http';
import { audienceFor, firstName } from '../payments/notifications';
import {
  MODALITY_NAMES,
  renderOrganiserEmail,
  renderSubmissionEmail,
  type SubmissionEmailKind,
} from './emails';
import { UnreadableFileError, extensionOf, inspectFile } from './files';
import { maskEmail, openEmail, sealEmail } from './people';
import {
  MODALITIES,
  areaName,
  areaRefs,
  pastDeadline,
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
  siteUrl: string;
  log: Log;
  /** Real time, for records. */
  now: () => Date;
  /** The clock the submission window is judged by (can be moved outside production). */
  windowNow: () => Date;
  pepper: string;
  /** The rules to judge by; the edital's file when absent. */
  rules?: SubmissionRules[];
}

export const UPLOADS_PER_HOUR = 30;
export const DOWNLOAD_LINK_SECONDS = 60;
export const PEOPLE_SEARCHES_PER_HOUR = 300;
export const PEOPLE_SUGGESTIONS = 6;
const PEOPLE_MIN_LETTERS = 3;
const TITLE = { min: 5, max: 300 };
const ABSTRACT = { min: 50, max: 5000 };
const KEYWORD = { min: 2, max: 60 };

const site = (deps: SubmissionDeps) => deps.siteUrl.replace(/\/+$/, '');

/** What a paper looks like to someone allowed to see it. */
function view(submission: Submission, user: AuthUser, open: boolean, organiser = false) {
  const mine = submission.authors.find((a) => a.email === user.email);
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
    /** Where the reader stands in the author list, from 1. */
    position: mine?.position ?? null,
    sentByMe: submission.userId === user.id,
    // Whoever sent the paper changes or withdraws it, while submissions are open and it is not
    // under review; the other authors only see it (#250). The organisers can at any time.
    canEdit: organiser || (submission.userId === user.id && open && submission.status === 'SUBMITTED'),
    /** The reader may change it because of their role in the organisation, not as its sender. */
    asOrganiser: organiser && submission.userId !== user.id,
  };
}

interface Context {
  user: AuthUser;
  event: { id: string; slug: string; name: string; closedAt: string | null };
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
  const rules = event ? rulesFor(event.slug, deps.rules) : null;
  if (!event || !rules) return { response: json(404, { error: 'event_not_found' }) };
  const state = stateOf(rules, event.closedAt, deps.windowNow());
  return { user: auth.user, event, rules, state, open: state === 'open' };
}

/**
 * Open or not: the dates of the rules, and over them the organisers' own switch (#236).
 * Closed by hand is closed whatever the dates say; before the opening date nothing is open.
 */
function stateOf(rules: SubmissionRules, closedAt: string | null, now: Date): ReturnType<typeof windowState> {
  const byDate = windowState(rules, now);
  return closedAt && byDate === 'open' ? 'closed' : byDate;
}

const closedResponse = (state: Context['state']): Response =>
  json(409, { error: state === 'not_open' ? 'submissions_not_open' : 'submissions_closed' });

// ───────────────────────────── Read ─────────────────────────────

/** Public: when submissions open and close, as the server's clock sees it. */
async function rules(request: Request, deps: SubmissionDeps): Promise<Response> {
  const slug = text(new URL(request.url).searchParams.get('eventSlug'), 40);
  const found = rulesFor(slug, deps.rules);
  const event = found ? await deps.store.findEvent(slug) : null;
  if (!found || !event) return json(404, { error: 'event_not_found' });
  return json(200, {
    state: stateOf(found, event.closedAt, deps.windowNow()),
    opensAt: found.opensAt,
    closesAt: found.closesAt,
    pastDeadline: pastDeadline(found, deps.windowNow()),
    // When the organisers closed submissions by hand; null otherwise.
    closedAt: event.closedAt,
  });
}

const positionOf = (submission: Submission, email: string): number | null =>
  submission.authors.find((a) => a.email === email)?.position ?? null;

async function mine(request: Request, deps: SubmissionDeps): Promise<Response> {
  const ctx = await context(request, deps, new URL(request.url).searchParams.get('eventSlug'));
  if ('response' in ctx) return ctx.response;
  const { user, event, rules: r } = ctx;
  const all = await deps.store.listByAuthorEmail(event.id, user.email);
  const organiser = all.length > 0 && (await deps.store.isOrganiser(event.id, user.id));
  return json(200, {
    state: ctx.state,
    closesAt: r.closesAt,
    pastDeadline: pastDeadline(r, deps.windowNow()),
    closedAt: event.closedAt,
    // The edital's two limits, read by the place in the author list: first, or any other.
    limits: {
      asMain: all.filter((s) => positionOf(s, user.email) === 1).length,
      maxAsMain: r.maxAsMainAuthor,
      asCoauthor: all.filter((s) => (positionOf(s, user.email) ?? 0) > 1).length,
      maxAsCoauthor: r.maxAsCoauthor,
    },
    submissions: all.map((s) => view(s, user, ctx.open, organiser)),
  });
}

/**
 * One paper, to open the form on it: for whoever sent it, its other authors (who will
 * find they cannot change it) and the organisers. To anyone else it does not exist.
 */
async function one(request: Request, deps: SubmissionDeps): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const ctx = await context(request, deps, params.get('eventSlug'));
  if ('response' in ctx) return ctx.response;
  const submission = await deps.store.findById(text(params.get('id'), 40));
  if (!submission || submission.deletedAt || submission.eventId !== ctx.event.id) {
    return json(404, { error: 'submission_not_found' });
  }
  const organiser = await deps.store.isOrganiser(ctx.event.id, ctx.user.id);
  if (!organiser && positionOf(submission, ctx.user.email) === null) {
    return json(404, { error: 'submission_not_found' });
  }
  return json(200, { submission: view(submission, ctx.user, ctx.open, organiser) });
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
  // Authors and the people chosen to review it, while it stands; organisers always.
  const isReviewer = !isAuthor && !submission.deletedAt && (await deps.store.isReviewerOf(submission.id, auth.user.id));
  const allowed =
    ((isAuthor || isReviewer) && !submission.deletedAt) ||
    (await deps.store.isOrganiser(submission.eventId, auth.user.id));
  if (!allowed) return json(404, { error: 'submission_not_found' });
  const url = await deps.files.createDownloadUrl(submission.filePath, submission.fileName, DOWNLOAD_LINK_SECONDS);
  deps.log('submission_file_opened', {
    submissionId: submission.id,
    as: isAuthor ? 'author' : isReviewer ? 'reviewer' : 'organiser',
  });
  return json(200, { url });
}

/**
 * The papers this person was chosen to review (#232). The review is not blind: the
 * authors' names are shown, as they are in the file. Their e-mails are not.
 */
async function reviewing(request: Request, deps: SubmissionDeps): Promise<Response> {
  const ctx = await context(request, deps, new URL(request.url).searchParams.get('eventSlug'));
  if ('response' in ctx) return ctx.response;
  const assigned = await deps.store.listAssignedTo(ctx.event.id, ctx.user.id);
  return json(200, {
    submissions: assigned.map((s) => ({
      id: s.id,
      number: s.number,
      title: s.title,
      titleEn: s.titleEn,
      modality: s.modality,
      areaRef: s.areaRef,
      abstract: s.abstract,
      keywords: s.keywords,
      keywordsEn: s.keywordsEn,
      fileName: s.fileName,
      filePages: s.filePages,
      status: s.status,
      createdAt: s.createdAt,
      authors: s.authors.map((a) => ({ position: a.position, fullName: a.fullName })),
    })),
  });
}

/**
 * People already known to the system whose name matches what is being typed in the
 * author list. Only a suggestion: a name and e-mail can always be typed instead.
 */
async function people(request: Request, deps: SubmissionDeps): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const ctx = await context(request, deps, params.get('eventSlug'));
  if ('response' in ctx) return ctx.response;
  const query = text(params.get('q'), 80);
  if (query.replace(/\s+/g, '').length < PEOPLE_MIN_LETTERS) return json(200, { people: [] });
  if (!(await deps.hitRateLimit(sha256(`${deps.pepper}:people:${ctx.user.id}`), 3600, PEOPLE_SEARCHES_PER_HOUR))) {
    return json(429, { error: 'too_many_attempts' });
  }
  const found = await deps.store.searchPeople(ctx.event.id, query, PEOPLE_SUGGESTIONS + 1);
  return json(200, {
    people: found
      .filter((p) => p.email !== ctx.user.email)
      .slice(0, PEOPLE_SUGGESTIONS)
      .map((p) => ({
        fullName: p.fullName,
        institution: p.institution,
        emailHint: maskEmail(p.email),
        ref: sealEmail(p.email, deps.pepper),
      })),
  });
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
  | { fields: Omit<SubmissionInput, 'filePath' | 'fileName' | 'filePages' | 'authors' | 'locale'>; authors: Author[] };

function parse(body: Record<string, unknown>, ctx: Context, pepper: string, mustBeListed: boolean): Parsed {
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

  // Every author, in the order of the paper. Whoever sends it is one of them, in any place.
  const rawAuthors = Array.isArray(body.authors) ? body.authors : [];
  if (rawAuthors.length > r.maxAuthors) return { error: 'too_many_authors', extra: { max: r.maxAuthors } };
  const authors: Author[] = [];
  for (const raw of rawAuthors) {
    const entry = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const fullName = text(entry.fullName, 150);
    // A person picked from the suggestions comes as a sealed reference, not as an address.
    const ref = text(entry.ref, 600);
    const email = ref ? (openEmail(ref, pepper) ?? '') : text(entry.email, 200).toLowerCase();
    if (fullName.length < 3 || !isEmail(email)) return { error: 'invalid_author' };
    if (authors.some((a) => a.email === email)) {
      // Never echo an address the person did not type themselves.
      return { error: 'duplicate_author', extra: { name: fullName } };
    }
    authors.push({ position: authors.length + 1, fullName, email });
  }
  // Whoever sends or changes a paper is one of its authors; an organiser fixing someone's paper is not.
  if (mustBeListed && !authors.some((a) => a.email === user.email)) return { error: 'sender_not_listed' };
  if (authors.length === 0) return { error: 'sender_not_listed' };
  return { fields: { title, titleEn, modality, areaRef, abstract, keywords, keywordsEn }, authors };
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
  const { user, event, rules: r } = ctx;

  const id = text(body.id, 40);
  const existing = id ? await deps.store.findById(id) : null;
  // The organisers change any paper of the edition, at any time (#250).
  const organiser = Boolean(id) && (await deps.store.isOrganiser(event.id, user.id));
  if (!ctx.open && !organiser) return closedResponse(ctx.state);
  // Only whoever sent the paper changes it; to the other authors and to anyone else it does not exist here.
  if (id && (!existing || existing.deletedAt || existing.eventId !== event.id || (existing.userId !== user.id && !organiser))) {
    return json(404, { error: 'submission_not_found' });
  }
  const asOrganiser = Boolean(existing) && organiser && existing!.userId !== user.id;
  if (existing && existing.status !== 'SUBMITTED' && !organiser) return json(409, { error: 'submission_locked' });

  const parsed = parse(body, ctx, deps.pepper, !asOrganiser);
  if ('error' in parsed) return json(400, { error: parsed.error, ...parsed.extra });
  const { fields, authors } = parsed;

  // The edital's limits, for every person in the list and counted over the papers that
  // are still standing: so many as first author, so many in any other place.
  const related: Submission[] = [];
  for (const author of authors) {
    const theirs = (await deps.store.listByAuthorEmail(event.id, author.email)).filter((s) => s.id !== existing?.id);
    const first = author.position === 1;
    const count = theirs.filter((s) => {
      const position = positionOf(s, author.email) ?? 0;
      return first ? position === 1 : position > 1;
    }).length;
    const max = first ? r.maxAsMainAuthor : r.maxAsCoauthor;
    if (count >= max) {
      return json(409, { error: first ? 'too_many_as_main' : 'coauthor_limit', name: author.fullName, max });
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
  return json(existing ? 200 : 201, { submission: view(saved, user, ctx.open, organiser) });
}

async function withdraw(request: Request, deps: SubmissionDeps): Promise<Response> {
  const body = await readJsonObject(request);
  const ctx = await context(request, deps, body.eventSlug);
  if ('response' in ctx) return ctx.response;
  const submission = await deps.store.findById(text(body.id, 40));
  const organiser = Boolean(submission) && (await deps.store.isOrganiser(ctx.event.id, ctx.user.id));
  if (!ctx.open && !organiser) return closedResponse(ctx.state);
  // Whoever sent it, or the organisers; to the other authors it is not theirs to withdraw (#250).
  if (!submission || submission.deletedAt || submission.eventId !== ctx.event.id || (submission.userId !== ctx.user.id && !organiser)) {
    return json(404, { error: 'submission_not_found' });
  }
  if (submission.status !== 'SUBMITTED' && !organiser) return json(409, { error: 'submission_locked' });
  const now = deps.now();
  const bySender = submission.userId === ctx.user.id;
  await deps.store.softDelete(submission.id, ctx.user.id, bySender ? 'withdrawn by its sender' : 'withdrawn by the organisers', now);
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
    // Who did it: the person logged in, by the name they have in the author list.
    // An organiser who is not an author is named by the role, never by their address.
    const main = submission.authors.find((a) => a.email === ctx.user.email)?.fullName ?? 'Comissão organizadora';
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
    // A paper of test accounts is announced to test organisers only (#255).
    const organisers = audienceFor(
      submission.authors.map((a) => a.email),
      await deps.store.listOrganisers(event.id),
    );
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
  one: { GET: one },
  people: { GET: people },
  reviewing: { GET: reviewing },
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
