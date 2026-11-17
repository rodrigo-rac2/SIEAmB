import { authenticate, isEmail, text } from '../account/handlers';
import type { AuthGateway, AuthUser } from '../account/auth';
import { notifyUsers, sendThroughOutbox, type OutboxDeps, type OutboxMail } from '../core/outbox';
import { emailLocale, layoutEmail } from '../payments/emailTemplates';
import { json, readJsonObject, type Log } from '../payments/http';
import { firstName } from '../payments/notifications';
import { isValidCpf } from '../payments/payer';
import {
  AUDIENCES,
  RegistrationExistsError,
  type AdminRegistration,
  type Audience,
  type Person,
  type AdminStore,
  type ManualStatus,
  type MemberRole,
  type PanelRole,
} from './store';

/** What became of a reminder asked for by hand. */
export type RemindOutcome = 'sent' | 'queued' | 'duplicate' | 'skipped' | 'failed';

export interface AdminDeps extends OutboxDeps {
  /**
   * Owes one payment reminder to a registration under `key` (#225). With `deliver`, tries to
   * send it right away; otherwise the background job sends it. Absent where payments are not set up.
   */
  remind?: (registrationId: string, key: string, now: Date, deliver: boolean) => Promise<RemindOutcome>;
  store: AdminStore;
  auth: AuthGateway;
  siteUrl: string;
  log: Log;
  now: () => Date;
}

const CATEGORIES = ['ESTUDANTE_GRADUACAO', 'ESTUDANTE_POS', 'PROFISSIONAL'];
const MANUAL: ManualStatus[] = ['CONFIRMED', 'EXEMPT', 'CANCELLED'];
const ROLES: MemberRole[] = ['ADMIN', 'ORGANIZER', 'REVIEWER'];
export const REASON_MIN = 5;

export type RegistrationState = 'PAID' | 'PENDING' | 'UNPAID' | 'CONFIRMED' | 'EXEMPT' | 'CANCELLED';

/** What the payments say, before anything an administrator decided. */
export function paymentState(registration: Pick<AdminRegistration, 'payments'>): 'PAID' | 'PENDING' | 'UNPAID' {
  const statuses = registration.payments.map((p) => p.status);
  if (statuses.includes('APPROVED')) return 'PAID';
  if (statuses.includes('PENDING')) return 'PENDING';
  return 'UNPAID';
}

interface Context {
  user: AuthUser;
  event: { id: string; slug: string; name: string };
  role: PanelRole;
}

/**
 * The logged-in person and their standing in the edition. Someone with no role
 * gets "not found", the same as for an edition that does not exist.
 */
async function context(
  request: Request,
  deps: AdminDeps,
  eventSlug: unknown,
  needs: PanelRole = 'ORGANIZER',
): Promise<Context | { response: Response }> {
  const auth = await authenticate(request, deps);
  if ('response' in auth) return auth;
  const slug = text(eventSlug, 40);
  const event = slug ? await deps.store.findEvent(slug) : null;
  const role = event ? await deps.store.roleOf(event.id, auth.user.id) : null;
  if (!event || !role) return { response: json(404, { error: 'not_found' }) };
  if (needs === 'ADMIN' && role !== 'ADMIN') return { response: json(403, { error: 'admin_only' }) };
  return { user: auth.user, event, role };
}

const slugOf = (request: Request) => new URL(request.url).searchParams.get('eventSlug');

async function audit(deps: AdminDeps, ctx: Context, action: string, entity: string, entityId: string | null, meta: Record<string, unknown> = {}) {
  try {
    await deps.store.audit({ actorId: ctx.user.id, action, entity, entityId, meta: { ...meta, eventSlug: ctx.event.slug } });
  } catch (error) {
    // The change is done; an audit line that could not be written is logged, loudly.
    deps.log('audit_failed', { action, error: error instanceof Error ? error.message : 'unknown' });
  }
}

// ───────────────────────────── Registrations ─────────────────────────────

/** A registration as the panel shows it. Documents only go to administrators. */
function viewRegistration(r: AdminRegistration, role: PanelRole) {
  const payment = paymentState(r);
  const paid = r.payments.find((p) => p.status === 'APPROVED');
  return {
    id: r.id,
    fullName: r.fullName,
    email: r.email,
    ...(role === 'ADMIN' ? { cpf: r.cpf, passport: r.passport, country: r.country } : {}),
    institution: r.institution,
    category: r.category,
    createdAt: r.createdAt,
    hasAccount: Boolean(r.userId),
    byOrganiser: Boolean(r.createdBy),
    // What counts: the administrator's decision when there is one, the payment otherwise.
    state: (r.manualStatus ?? payment) as RegistrationState,
    // The payment is shown whatever was decided by hand.
    payment,
    paidCents: paid?.amountCents ?? null,
    paidAt: paid?.paidAt ?? null,
    manual: r.manualStatus
      ? { status: r.manualStatus, reason: r.manualReason, by: r.manualBy, at: r.manualAt }
      : null,
    deleted: r.deletedAt ? { at: r.deletedAt, by: r.deletedBy, reason: r.deletedReason } : null,
  };
}

async function registrations(request: Request, deps: AdminDeps): Promise<Response> {
  const ctx = await context(request, deps, slugOf(request));
  if ('response' in ctx) return ctx.response;
  const all = await deps.store.listRegistrations(ctx.event.id);
  // How many standing papers each address is an author of: the registration and the papers side by side (#225).
  const papers = new Map<string, number>();
  for (const paper of await deps.store.listSubmissions(ctx.event.id)) {
    if (paper.deletedAt) continue;
    for (const author of paper.authors) papers.set(author.email, (papers.get(author.email) ?? 0) + 1);
  }
  const live = all.filter((r) => !r.deletedAt);
  const count = (state: RegistrationState) => live.filter((r) => (r.manualStatus ?? paymentState(r)) === state).length;
  return json(200, {
    role: ctx.role,
    counts: {
      total: live.length,
      confirmed: count('PAID') + count('CONFIRMED') + count('EXEMPT'),
      pending: count('PENDING'),
      unpaid: count('UNPAID'),
      cancelled: count('CANCELLED'),
      deleted: all.length - live.length,
    },
    registrations: all.map((r) => ({ ...viewRegistration(r, ctx.role), papers: papers.get(r.email) ?? 0 })),
  });
}

async function registrationCreate(request: Request, deps: AdminDeps): Promise<Response> {
  const body = await readJsonObject(request);
  const ctx = await context(request, deps, body.eventSlug, 'ADMIN');
  if ('response' in ctx) return ctx.response;
  const fullName = text(body.fullName, 150);
  const email = text(body.email, 200).toLowerCase();
  if (fullName.length < 5) return json(400, { error: 'invalid_name' });
  if (!isEmail(email)) return json(400, { error: 'invalid_email' });
  const cpf = typeof body.cpf === 'string' ? body.cpf.replace(/\D/g, '') : '';
  const passport = text(body.passport, 30).toUpperCase().replace(/[\s.-]/g, '');
  const country = (text(body.country, 2) || 'BR').toUpperCase();
  if (cpf && !isValidCpf(cpf)) return json(400, { error: 'invalid_cpf' });
  if (!cpf && !passport) return json(400, { error: 'document_required' });
  const category = text(body.category, 40);
  if (!CATEGORIES.includes(category)) return json(400, { error: 'invalid_category' });
  const manualStatus = body.manualStatus ? MANUAL.find((s) => s === body.manualStatus) : null;
  if (body.manualStatus && !manualStatus) return json(400, { error: 'invalid_status' });
  const reason = text(body.reason, 300);
  if (manualStatus && reason.length < REASON_MIN) return json(400, { error: 'reason_required' });

  try {
    const created = await deps.store.insertRegistration({
      eventId: ctx.event.id,
      fullName,
      email,
      cpf: cpf || null,
      passport: cpf ? null : passport,
      country: cpf ? 'BR' : country,
      institution: text(body.institution, 200) || null,
      category,
      modality: 'ONLINE',
      locale: emailLocale(text(body.locale, 10)),
      createdBy: ctx.user.id,
      manualStatus: manualStatus ?? null,
      manualReason: manualStatus ? reason : null,
      now: deps.now(),
    });
    await audit(deps, ctx, 'registration.create', 'pre_registration', created.id, { manualStatus: manualStatus ?? null });
    return json(201, { registration: viewRegistration(created, ctx.role) });
  } catch (error) {
    if (error instanceof RegistrationExistsError) return json(409, { error: 'registration_exists' });
    throw error;
  }
}

/** The registration named in the body, if it belongs to the edition the person administers. */
async function target(body: Record<string, unknown>, deps: AdminDeps, ctx: Context) {
  const registration = await deps.store.findRegistration(text(body.id, 40));
  return registration && registration.eventId === ctx.event.id ? registration : null;
}

async function registrationStatus(request: Request, deps: AdminDeps): Promise<Response> {
  const body = await readJsonObject(request);
  const ctx = await context(request, deps, body.eventSlug, 'ADMIN');
  if ('response' in ctx) return ctx.response;
  const registration = await target(body, deps, ctx);
  if (!registration || registration.deletedAt) return json(404, { error: 'registration_not_found' });
  // null puts the registration back in the hands of the payment.
  const status = body.status === null ? null : MANUAL.find((s) => s === body.status);
  if (status === undefined) return json(400, { error: 'invalid_status' });
  const reason = text(body.reason, 300);
  if (reason.length < REASON_MIN) return json(400, { error: 'reason_required' });
  const now = deps.now();
  // What it was before the change, for the audit line.
  const before = { from: registration.manualStatus, payment: paymentState(registration) };
  await deps.store.patchRegistration(registration.id, {
    manualStatus: status,
    manualReason: status ? reason : null,
    manualBy: status ? ctx.user.id : null,
    manualAt: status ? now.toISOString() : null,
  });
  await audit(deps, ctx, 'registration.status', 'pre_registration', registration.id, {
    from: before.from,
    to: status,
    reason,
    payment: before.payment,
  });
  return json(200, { ok: true });
}

async function registrationDelete(request: Request, deps: AdminDeps): Promise<Response> {
  const body = await readJsonObject(request);
  const ctx = await context(request, deps, body.eventSlug, 'ADMIN');
  if ('response' in ctx) return ctx.response;
  const registration = await target(body, deps, ctx);
  if (!registration || registration.deletedAt) return json(404, { error: 'registration_not_found' });
  const reason = text(body.reason, 300);
  if (reason.length < REASON_MIN) return json(400, { error: 'reason_required' });
  // Money was received for it: deleting needs the administrator to say so on purpose (ADR-006).
  if (paymentState(registration) === 'PAID' && body.confirmPaid !== true) {
    return json(409, { error: 'registration_paid' });
  }
  const now = deps.now();
  await deps.store.patchRegistration(registration.id, {
    deletedAt: now.toISOString(),
    deletedBy: ctx.user.id,
    deletedReason: reason,
  });
  await audit(deps, ctx, 'registration.delete', 'pre_registration', registration.id, { reason, payment: paymentState(registration) });
  return json(200, { ok: true });
}

async function registrationRestore(request: Request, deps: AdminDeps): Promise<Response> {
  const body = await readJsonObject(request);
  const ctx = await context(request, deps, body.eventSlug, 'ADMIN');
  if ('response' in ctx) return ctx.response;
  const registration = await target(body, deps, ctx);
  if (!registration || !registration.deletedAt) return json(404, { error: 'registration_not_found' });
  try {
    await deps.store.patchRegistration(registration.id, { deletedAt: null, deletedBy: null, deletedReason: null });
  } catch (error) {
    // Someone registered again with that e-mail, or the account got another registration, in the meantime.
    if (error instanceof RegistrationExistsError) return json(409, { error: 'registration_exists' });
    throw error;
  }
  await audit(deps, ctx, 'registration.restore', 'pre_registration', registration.id);
  return json(200, { ok: true });
}

// ───────────────────────────── Payment reminders by hand (#225) ─────────────────────────────

/** The Brazilian calendar day: one reminder by hand per registration per day, whoever clicks. */
const brDay = (now: Date): string => new Date(now.getTime() - 3 * 3600_000).toISOString().slice(0, 10);

/** Only someone who still owes the fee is reminded: not paid, and nothing decided by hand. */
const remindable = (r: AdminRegistration): boolean =>
  !r.deletedAt && !r.manualStatus && paymentState(r) !== 'PAID';

async function remind(request: Request, deps: AdminDeps): Promise<Response> {
  const body = await readJsonObject(request);
  const ctx = await context(request, deps, body.eventSlug);
  if ('response' in ctx) return ctx.response;
  if (!deps.remind) return json(503, { error: 'reminders_unavailable' });
  const now = deps.now();
  const key = (id: string) => `manual:${id}:${brDay(now)}`;

  // One registration: sent on the spot, so the organiser sees what happened.
  if (body.id !== undefined) {
    const registration = await target(body, deps, ctx);
    if (!registration || registration.deletedAt) return json(404, { error: 'registration_not_found' });
    if (!remindable(registration)) return json(409, { error: 'not_remindable' });
    const outcome = await deps.remind(registration.id, key(registration.id), now, true);
    await audit(deps, ctx, 'registration.remind', 'pre_registration', registration.id, { outcome });
    if (outcome === 'duplicate') return json(409, { error: 'already_reminded' });
    return json(200, { ok: true, outcome });
  }

  // Everyone who still owes the fee: queued, and sent by the background job.
  const all = (await deps.store.listRegistrations(ctx.event.id)).filter(remindable);
  const wanted = Array.isArray(body.ids) ? new Set(body.ids.map(String)) : null;
  const chosen = wanted ? all.filter((r) => wanted.has(r.id)) : all;
  let queued = 0;
  let already = 0;
  for (const registration of chosen) {
    const outcome = await deps.remind(registration.id, key(registration.id), now, false);
    if (outcome === 'duplicate') already += 1;
    else queued += 1;
  }
  await audit(deps, ctx, 'registration.remind_all', 'pre_registration', null, { queued, already });
  return json(200, { ok: true, queued, already });
}

// ───────────────────────────── Papers ─────────────────────────────

async function submissions(request: Request, deps: AdminDeps): Promise<Response> {
  const ctx = await context(request, deps, slugOf(request));
  if ('response' in ctx) return ctx.response;
  const all = await deps.store.listSubmissions(ctx.event.id);
  // For each paper: is at least one of its authors registered and confirmed? (the edital's condition)
  const states = new Map<string, RegistrationState>(
    (await deps.store.listRegistrations(ctx.event.id))
      .filter((r) => !r.deletedAt)
      .map((r) => [r.email, (r.manualStatus ?? paymentState(r)) as RegistrationState]),
  );
  const isConfirmed = (email: string) => ['PAID', 'CONFIRMED', 'EXEMPT'].includes(states.get(email) ?? '');
  return json(200, {
    role: ctx.role,
    // Closed by hand (#236): since when and by whom; null while open.
    closed: await deps.store.submissionsClosed(ctx.event.id),
    counts: { total: all.filter((s) => !s.deletedAt).length, withdrawn: all.filter((s) => s.deletedAt).length },
    submissions: all.map((s) => ({
      ...s,
      // Each author with the state of their registration, or null when they have none (#225).
      authors: s.authors.map((a) => ({ ...a, registration: states.get(a.email) ?? null })),
      authorRegistered: s.authors.some((a) => isConfirmed(a.email)),
    })),
  });
}

/**
 * The organisers' switch (#236): closed, nobody sends, changes or withdraws a paper,
 * whatever the published date says; reopened, everything works again.
 */
async function submissionsSwitch(request: Request, deps: AdminDeps, close: boolean): Promise<Response> {
  const body = await readJsonObject(request);
  const ctx = await context(request, deps, body.eventSlug);
  if ('response' in ctx) return ctx.response;
  const changed = await deps.store.setSubmissionsClosed(ctx.event.id, close ? { at: deps.now(), by: ctx.user.id } : null);
  // Two organisers pressing the same button: the second one changes nothing and is told how things stand.
  if (changed) await audit(deps, ctx, close ? 'submissions.close' : 'submissions.reopen', 'event', ctx.event.id);
  return json(200, { ok: true, changed, closed: await deps.store.submissionsClosed(ctx.event.id) });
}

// ───────────────────────────── Reviewers of a paper (#232) ─────────────────────────────

/**
 * A paper with someone to review it is under review, and its authors can no longer
 * change it; with nobody left it goes back to "enviado". Other states are left alone.
 */
async function settleStatus(deps: AdminDeps, submissionId: string, now: Date): Promise<void> {
  const paper = await deps.store.findSubmission(submissionId);
  if (!paper || paper.deletedAt) return;
  if (paper.reviewers.length > 0 && paper.status === 'SUBMITTED') {
    await deps.store.setSubmissionStatus(paper.id, 'UNDER_REVIEW', now);
  } else if (paper.reviewers.length === 0 && paper.status === 'UNDER_REVIEW') {
    await deps.store.setSubmissionStatus(paper.id, 'SUBMITTED', now);
  }
}

/**
 * The organisers choose who reviews each paper: at least one person, as many as
 * they want. The review is not blind, so the only people kept out are the paper's
 * own authors.
 */
async function reviewerChange(request: Request, deps: AdminDeps, assign: boolean): Promise<Response> {
  const body = await readJsonObject(request);
  const ctx = await context(request, deps, body.eventSlug);
  if ('response' in ctx) return ctx.response;
  const paper = await deps.store.findSubmission(text(body.submissionId, 40));
  if (!paper || paper.eventId !== ctx.event.id || paper.deletedAt) return json(404, { error: 'submission_not_found' });
  const userId = text(body.userId, 40);
  const now = deps.now();

  if (!assign) {
    const removed = await deps.store.unassignReviewer(paper.id, userId);
    if (!removed) return json(404, { error: 'reviewer_not_found' });
    await settleStatus(deps, paper.id, now);
    await audit(deps, ctx, 'reviewer.unassign', 'submission', paper.id, { userId, number: paper.number });
    await notifyUsers([{ userId, eventId: ctx.event.id, kind: 'review.unassigned', data: { number: paper.number, title: paper.title } }], deps);
    return json(200, { ok: true });
  }

  // Only someone who holds the Avaliador role in this edition.
  const reviewer = (await deps.store.listMembers(ctx.event.id)).find((m) => m.userId === userId && m.role === 'REVIEWER');
  if (!reviewer) return json(400, { error: 'not_a_reviewer' });
  if (paper.authors.some((a) => a.email === reviewer.email.toLowerCase())) {
    return json(409, { error: 'reviewer_is_author' });
  }
  const added = await deps.store.assignReviewer(paper.id, reviewer.userId, ctx.user.id, now);
  // Asked twice (two organisers, a double click): the person reviews it once and is told once.
  if (!added) return json(200, { ok: true, already: true });
  await settleStatus(deps, paper.id, now);
  await audit(deps, ctx, 'reviewer.assign', 'submission', paper.id, { userId, number: paper.number });

  const url = `${deps.siteUrl.replace(/\/+$/, '')}/${encodeURIComponent(ctx.event.slug)}/avaliacoes`;
  await sendThroughOutbox(
    [
      {
        to: reviewer.email,
        dedupeKey: `review:${paper.id}:${reviewer.userId}:${now.getTime()}`,
        subject: `Trabalho nº ${paper.number} para avaliar`,
        ...layoutEmail({
          greeting: `Olá, ${firstName(reviewer.fullName)}.`,
          paragraphs: [
            `A comissão organizadora do ${ctx.event.name} indicou você para avaliar o trabalho nº ${paper.number}, "${paper.title}".`,
            'O arquivo e os dados do trabalho estão em "Trabalhos para avaliar", no site.',
          ],
          linkLabel: 'Abrir os trabalhos para avaliar',
          link: url,
          signature: `Comissão organizadora do ${ctx.event.name}`,
        }),
      },
    ],
    deps,
    now,
  );
  await notifyUsers(
    [{ userId: reviewer.userId, eventId: ctx.event.id, kind: 'review.assigned', data: { number: paper.number, title: paper.title } }],
    deps,
  );
  return json(200, { ok: true });
}

// ───────────────────────────── People and roles ─────────────────────────────

async function members(request: Request, deps: AdminDeps): Promise<Response> {
  const ctx = await context(request, deps, slugOf(request));
  if ('response' in ctx) return ctx.response;
  return json(200, {
    role: ctx.role,
    // What this person may give or take: an administrator any role, an organiser only reviewers.
    canManage: ctx.role === 'ADMIN' ? ROLES : (['REVIEWER'] as MemberRole[]),
    members: await deps.store.listMembers(ctx.event.id),
    invites: await deps.store.listInvites(ctx.event.id),
  });
}

async function memberChange(request: Request, deps: AdminDeps, add: boolean): Promise<Response> {
  const body = await readJsonObject(request);
  const ctx = await context(request, deps, body.eventSlug);
  if ('response' in ctx) return ctx.response;
  const role = ROLES.find((r) => r === body.role);
  if (!role) return json(400, { error: 'invalid_role' });
  if (ctx.role !== 'ADMIN' && role !== 'REVIEWER') return json(403, { error: 'admin_only' });
  const email = text(body.email, 200).toLowerCase();
  if (!isEmail(email)) return json(400, { error: 'invalid_email' });
  // Nobody removes their own administrator role: the edition must not be left without one by accident.
  if (!add && role === 'ADMIN' && email === ctx.user.email) return json(409, { error: 'cannot_remove_self' });

  const account = await deps.store.findUserByEmail(email);
  if (add) {
    if (account) await deps.store.addMember(ctx.event.id, account.id, role, ctx.user.id);
    else await deps.store.addInvite(ctx.event.id, email, role, ctx.user.id);
  } else {
    if (account) await deps.store.removeMember(ctx.event.id, account.id, role);
    await deps.store.removeInvite(ctx.event.id, email, role);
    // Someone who is no longer a reviewer keeps no paper to review, nor the way into its file (#232).
    if (account && role === 'REVIEWER') {
      const notices = [];
      for (const id of await deps.store.unassignReviewerEverywhere(ctx.event.id, account.id)) {
        await settleStatus(deps, id, deps.now());
        const paper = await deps.store.findSubmission(id);
        if (paper) {
          notices.push({ userId: account.id, eventId: ctx.event.id, kind: 'review.unassigned', data: { number: paper.number, title: paper.title } });
        }
      }
      // Told once per paper, the same as when taken off by hand (#242).
      await notifyUsers(notices, deps);
    }
  }
  await audit(deps, ctx, add ? 'member.add' : 'member.remove', 'event_member', account?.id ?? null, { email, role, invited: add && !account });

  if (add) {
    const url = `${deps.siteUrl.replace(/\/+$/, '')}/${encodeURIComponent(ctx.event.slug)}/${account ? 'minha-area' : 'conta/criar'}`;
    const roleName = { ADMIN: 'Administrador', ORGANIZER: 'Organizador', REVIEWER: 'Avaliador' }[role];
    const mail: OutboxMail = {
      to: email,
      dedupeKey: `member:${ctx.event.id}:${email}:${role}:${deps.now().getTime()}`,
      subject: `Você agora é ${roleName} no site do ${ctx.event.name}`,
      ...layoutEmail({
        greeting: account ? `Olá, ${firstName(account.fullName)}.` : 'Olá.',
        paragraphs: [
          `Você recebeu o papel de ${roleName} no sistema de submissões do ${ctx.event.name}.`,
          account
            ? 'Entre no site para ver o que esse papel permite. O acesso aparece em Minha área.'
            : 'Para usar esse papel, crie sua conta no site com este mesmo e-mail. O acesso aparece em Minha área assim que a conta for criada.',
        ],
        linkLabel: account ? 'Abrir Minha área' : 'Criar minha conta',
        link: url,
        signature: `Comissão organizadora do ${ctx.event.name}`,
      }),
    };
    await sendThroughOutbox([mail], deps, deps.now());
    if (account) {
      await notifyUsers([{ userId: account.id, eventId: ctx.event.id, kind: 'member.added', data: { role } }], deps);
    }
  }
  return json(200, { ok: true, invited: add && !account });
}

// ───────────────────────────── Requests to bring a registration into an account (#209) ─────────────────────────────

async function linkRequests(request: Request, deps: AdminDeps): Promise<Response> {
  const ctx = await context(request, deps, slugOf(request), 'ADMIN');
  if ('response' in ctx) return ctx.response;
  return json(200, { requests: await deps.store.listPendingLinks(ctx.event.id) });
}

async function linkDecide(request: Request, deps: AdminDeps): Promise<Response> {
  const body = await readJsonObject(request);
  const ctx = await context(request, deps, body.eventSlug, 'ADMIN');
  if ('response' in ctx) return ctx.response;
  const pending = await deps.store.findPendingLink(text(body.id, 40));
  if (!pending || pending.eventId !== ctx.event.id) return json(404, { error: 'request_not_found' });
  const approve = body.approve === true;
  const now = deps.now();
  if (approve) {
    const linked = !pending.registrationDeleted && (await deps.store.linkRegistration(pending.registrationId, pending.accountId));
    if (!linked) return json(409, { error: 'cannot_link' });
  }
  await deps.store.decideLink(pending.id, approve ? 'CONFIRMED' : 'REJECTED', ctx.user.id, now);
  await audit(deps, ctx, approve ? 'link.approve' : 'link.reject', 'pre_registration', pending.registrationId, { accountId: pending.accountId });
  await notifyUsers(
    [{ userId: pending.accountId, eventId: ctx.event.id, kind: approve ? 'link.approved' : 'link.rejected', data: {} }],
    deps,
  );
  return json(200, { ok: true });
}

// ───────────────────────────── Announcements (#221) ─────────────────────────────

export const ANNOUNCEMENTS_PER_HOUR = 10;
const SUBJECT = { min: 5, max: 150 };
const BODY = { min: 10, max: 5000 };

/** The people of a group, once each, by e-mail. "all" is every group together. */
function audienceOf(groups: Record<Exclude<Audience, 'all'>, Person[]>, audience: Audience): Person[] {
  const lists = audience === 'all' ? Object.values(groups) : [groups[audience]];
  const seen = new Map<string, Person>();
  for (const person of lists.flat()) {
    const known = seen.get(person.email);
    // Keep the entry that has a name.
    if (!known || (!known.fullName && person.fullName)) seen.set(person.email, person);
  }
  return [...seen.values()];
}

/** How many people each group has right now, so the screen can say it before sending. */
async function audiences(request: Request, deps: AdminDeps): Promise<Response> {
  const ctx = await context(request, deps, slugOf(request));
  if ('response' in ctx) return ctx.response;
  const groups = await deps.store.listAudiences(ctx.event.id);
  return json(200, {
    counts: Object.fromEntries(AUDIENCES.map((a) => [a, audienceOf(groups, a).length])),
  });
}

async function announce(request: Request, deps: AdminDeps): Promise<Response> {
  const body = await readJsonObject(request);
  const ctx = await context(request, deps, body.eventSlug);
  if ('response' in ctx) return ctx.response;
  const audience = AUDIENCES.find((a) => a === body.audience);
  if (!audience) return json(400, { error: 'invalid_audience' });
  const subject = text(body.subject, SUBJECT.max + 1);
  if (subject.length < SUBJECT.min || subject.length > SUBJECT.max) return json(400, { error: 'invalid_subject' });
  const message = typeof body.body === 'string' ? body.body.replace(/\r\n/g, '\n').trim() : '';
  if (message.length < BODY.min || message.length > BODY.max) return json(400, { error: 'invalid_body' });
  const now = deps.now();
  if ((await deps.store.countAnnouncementsSince(ctx.user.id, new Date(now.getTime() - 3600_000))) >= ANNOUNCEMENTS_PER_HOUR) {
    return json(429, { error: 'too_many_attempts' });
  }
  const people = audienceOf(await deps.store.listAudiences(ctx.event.id), audience);
  if (people.length === 0) return json(400, { error: 'no_recipients' });

  const id = await deps.store.insertAnnouncement({
    eventId: ctx.event.id,
    senderId: ctx.user.id,
    audience,
    subject,
    body: message,
    recipients: people.map((p) => p.email),
    now,
  });
  await audit(deps, ctx, 'announcement.send', 'announcement', id, { audience, recipients: people.length });

  // From here on nothing fails the request: the announcement is recorded, and the
  // e-mails wait in the outbox for the background job, which sends them in batches.
  try {
    const url = `${deps.siteUrl.replace(/\/+$/, '')}/${encodeURIComponent(ctx.event.slug)}/notificacoes`;
    const paragraphs = message.split(/\n{2,}/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
    const mails: OutboxMail[] = people.map((person) => ({
      to: person.email,
      dedupeKey: `announcement:${id}:${person.email}`,
      subject: `${subject} (${ctx.event.name})`,
      ...layoutEmail({
        greeting: person.fullName ? `Olá, ${firstName(person.fullName)}.` : 'Olá.',
        paragraphs: [
          ...paragraphs,
          `Você recebe este comunicado porque está inscrito, enviou trabalho ou participa da organização do ${ctx.event.name}.`,
        ],
        linkLabel: 'Ver no site',
        link: url,
        signature: `Comissão organizadora do ${ctx.event.name}`,
      }),
    }));
    await deps.outbox.enqueueOutboxBulk(mails);
    const accounts = await deps.store.findAccounts(people.map((p) => p.email));
    await notifyUsers(
      accounts.map((a) => ({ userId: a.id, eventId: ctx.event.id, kind: 'announcement', data: { subject, body: message } })),
      deps,
    );
  } catch (error) {
    deps.log('announcement_delivery_failed', { announcementId: id, error: error instanceof Error ? error.message : 'unknown' });
  }
  return json(201, { ok: true, recipients: people.length });
}

async function announcements(request: Request, deps: AdminDeps): Promise<Response> {
  const ctx = await context(request, deps, slugOf(request));
  if ('response' in ctx) return ctx.response;
  return json(200, { announcements: await deps.store.listAnnouncements(ctx.event.id) });
}

// ───────────────────────────── Router ─────────────────────────────

type Handler = (request: Request, deps: AdminDeps) => Promise<Response>;

const ROUTES: Record<string, Partial<Record<string, Handler>>> = {
  registrations: { GET: registrations },
  'registration-create': { POST: registrationCreate },
  'registration-status': { POST: registrationStatus },
  'registration-delete': { POST: registrationDelete },
  'registration-restore': { POST: registrationRestore },
  remind: { POST: remind },
  submissions: { GET: submissions },
  'submissions-close': { POST: (request, deps) => submissionsSwitch(request, deps, true) },
  'submissions-reopen': { POST: (request, deps) => submissionsSwitch(request, deps, false) },
  'reviewer-assign': { POST: (request, deps) => reviewerChange(request, deps, true) },
  'reviewer-unassign': { POST: (request, deps) => reviewerChange(request, deps, false) },
  members: { GET: members },
  'member-add': { POST: (request, deps) => memberChange(request, deps, true) },
  'member-remove': { POST: (request, deps) => memberChange(request, deps, false) },
  'link-requests': { GET: linkRequests },
  'link-decide': { POST: linkDecide },
  audiences: { GET: audiences },
  announce: { POST: announce },
  announcements: { GET: announcements },
};

/** One Vercel function serves the organisation area: `/api/v1/admin/<action>`. */
export async function handleAdmin(request: Request, action: string, deps: AdminDeps | null): Promise<Response> {
  const route = ROUTES[action];
  if (!route) return json(404, { error: 'not_found' });
  const handler = route[request.method.toUpperCase()];
  if (!handler) return json(405, { error: 'method_not_allowed' });
  if (!deps) return json(503, { error: 'admin_unavailable' });
  try {
    return await handler(request, deps);
  } catch (error) {
    deps.log('admin_request_failed', { action, error: error instanceof Error ? error.message : 'unknown' });
    return json(500, { error: 'server_error' });
  }
}

/**
 * Tells the organisers of the edition about a new registration, by e-mail and in
 * the site (#219). Called once per registration, by the form's own notice.
 */
export async function announceRegistration(
  registration: { id: string; eventId: string; eventSlug: string; fullName: string; category: string },
  deps: Pick<AdminDeps, 'store' | 'outbox' | 'mailer' | 'log' | 'siteUrl'>,
  now: Date,
): Promise<void> {
  const organisers = (await deps.store.listMembers(registration.eventId)).filter((m) => m.role !== 'REVIEWER');
  const unique = [...new Map(organisers.map((o) => [o.userId, o])).values()];
  if (unique.length === 0) return;
  const event = await deps.store.findEvent(registration.eventSlug);
  const eventName = event?.name ?? 'SIEAmB';
  const categories: Record<string, string> = {
    ESTUDANTE_GRADUACAO: 'Estudante de graduação',
    ESTUDANTE_POS: 'Estudante de pós-graduação',
    PROFISSIONAL: 'Profissional',
  };
  const url = `${deps.siteUrl.replace(/\/+$/, '')}/${encodeURIComponent(registration.eventSlug)}/painel`;
  await sendThroughOutbox(
    unique.map((o) => ({
      to: o.email,
      dedupeKey: `registration:${registration.id}:organiser:${o.userId}`,
      subject: `Nova inscrição: ${registration.fullName}`,
      ...layoutEmail({
        greeting: `Olá, ${firstName(o.fullName)}.`,
        paragraphs: [
          `${registration.fullName} fez a inscrição no ${eventName}.`,
          `Categoria: ${categories[registration.category] ?? registration.category}. O pagamento ainda não foi feito; a lista de inscrições mostra a situação de cada uma.`,
        ],
        linkLabel: 'Abrir a lista de inscrições',
        link: url,
        signature: `Sistema de inscrições do ${eventName}`,
      }),
    })),
    deps,
    now,
  );
  await notifyUsers(
    unique.map((o) => ({
      userId: o.userId,
      eventId: registration.eventId,
      kind: 'organiser.registration.new',
      data: { fullName: registration.fullName },
    })),
    deps,
  );
}
