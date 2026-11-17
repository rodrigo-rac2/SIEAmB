import { authenticate, isEmail, text } from '../account/handlers';
import type { AuthGateway, AuthUser } from '../account/auth';
import { notifyUsers, sendThroughOutbox, type OutboxDeps, type OutboxMail } from '../core/outbox';
import { emailLocale, layoutEmail } from '../payments/emailTemplates';
import { json, readJsonObject, type Log } from '../payments/http';
import { firstName } from '../payments/notifications';
import { isValidCpf } from '../payments/payer';
import {
  RegistrationExistsError,
  type AdminRegistration,
  type AdminStore,
  type ManualStatus,
  type MemberRole,
  type PanelRole,
} from './store';

export interface AdminDeps extends OutboxDeps {
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
    registrations: all.map((r) => viewRegistration(r, ctx.role)),
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

// ───────────────────────────── Papers ─────────────────────────────

async function submissions(request: Request, deps: AdminDeps): Promise<Response> {
  const ctx = await context(request, deps, slugOf(request));
  if ('response' in ctx) return ctx.response;
  const all = await deps.store.listSubmissions(ctx.event.id);
  // For each paper: is at least one of its authors registered and confirmed? (the edital's condition)
  const confirmed = new Set(
    (await deps.store.listRegistrations(ctx.event.id))
      .filter((r) => !r.deletedAt && ['PAID', 'CONFIRMED', 'EXEMPT'].includes(r.manualStatus ?? paymentState(r)))
      .map((r) => r.email),
  );
  return json(200, {
    role: ctx.role,
    counts: { total: all.filter((s) => !s.deletedAt).length, withdrawn: all.filter((s) => s.deletedAt).length },
    submissions: all.map((s) => ({
      ...s,
      authorRegistered: s.authors.some((a) => confirmed.has(a.email)),
    })),
  });
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

// ───────────────────────────── Router ─────────────────────────────

type Handler = (request: Request, deps: AdminDeps) => Promise<Response>;

const ROUTES: Record<string, Partial<Record<string, Handler>>> = {
  registrations: { GET: registrations },
  'registration-create': { POST: registrationCreate },
  'registration-status': { POST: registrationStatus },
  'registration-delete': { POST: registrationDelete },
  'registration-restore': { POST: registrationRestore },
  submissions: { GET: submissions },
  members: { GET: members },
  'member-add': { POST: (request, deps) => memberChange(request, deps, true) },
  'member-remove': { POST: (request, deps) => memberChange(request, deps, false) },
  'link-requests': { GET: linkRequests },
  'link-decide': { POST: linkDecide },
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
