import { createHash, randomBytes } from 'node:crypto';
import { emailLocale } from '../payments/emailTemplates';
import { json, readJsonObject, type Log } from '../payments/http';
import { firstName, isSendableEmail, type Mailer } from '../payments/notifications';
import { isValidCpf } from '../payments/payer';
import type { AuthGateway, AuthUser } from './auth';
import { maskEmail, renderAccountEmail, type AccountEmailKind } from './emails';
import {
  DocumentInUseError,
  type AccountStore,
  type EventRef,
  type OwnRegistration,
  type Profile,
  type ProfilePatch,
} from './store';

export interface AccountDeps {
  store: AccountStore;
  auth: AuthGateway;
  /** Absent when no sender is configured: the request still answers, nothing is mailed. */
  mailer?: Mailer;
  siteUrl: string;
  log: Log;
  now: () => Date;
  /** Mixed into the rate-limit keys, so the counters table never holds an address or an IP. */
  pepper: string;
}

const HOUR = 3600;
const DAY = 24 * HOUR;

/** How many attempts fit in a window, per purpose. */
export const LIMITS = {
  signupPerEmail: { window: HOUR, max: 3 },
  recoverPerEmail: { window: HOUR, max: 3 },
  // Generous on purpose: a whole campus can sit behind one address. The limits per
  // e-mail address above are what stop someone hammering one person.
  perIp: { window: HOUR, max: 120 },
  checkPerIp: { window: HOUR, max: 30 },
  linkPerUser: { window: DAY, max: 5 },
  profilePerUser: { window: HOUR, max: 20 },
} as const;

export const LINK_REQUEST_TTL_MS = 48 * HOUR * 1000;
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;

const EMAIL = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;
export const isEmail = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 200 && EMAIL.test(value);

export const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

// Not imported from @sieamb/shared: that package is an ES module and the Vercel
// functions are built as CommonJS, so the import only fails once deployed.
const normalizeCpf = (value: string): string => value.replace(/\D/g, '');

export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** The caller's address as Vercel reports it; one shared bucket when it is missing. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown';
}

async function allowed(
  deps: AccountDeps,
  purpose: string,
  value: string,
  limit: { window: number; max: number },
): Promise<boolean> {
  return deps.store.hitRateLimit(
    sha256(`${deps.pepper}:${purpose}:${value}`),
    limit.window,
    limit.max,
  );
}

async function eventFor(deps: AccountDeps, slug: unknown): Promise<EventRef | null> {
  const wanted = text(slug, 40);
  return (wanted ? await deps.store.findEvent(wanted) : null) ?? (await deps.store.currentEvent());
}

const site = (deps: AccountDeps) => deps.siteUrl.replace(/\/+$/, '');

/** Never throws: an e-mail that fails is logged, and the person can ask again. */
async function send(
  deps: AccountDeps,
  kind: AccountEmailKind,
  to: string,
  locale: string,
  data: Parameters<typeof renderAccountEmail>[2],
): Promise<void> {
  if (!deps.mailer) return deps.log('account_email_skipped', { kind, reason: 'no_mailer' });
  if (!isSendableEmail(to)) return deps.log('account_email_skipped', { kind, reason: 'test_address' });
  try {
    await deps.mailer.send({ to, ...renderAccountEmail(kind, locale, data) });
    deps.log('account_email_sent', { kind });
  } catch (error) {
    deps.log('account_email_failed', { kind, error: error instanceof Error ? error.name : 'unknown' });
  }
}

// ───────────────────────────── Public: create account, recover ─────────────────────────────

/**
 * Starts an account for an address. The answer is the same whether the address
 * is new, unconfirmed or already has an account, and whether the e-mail could be
 * sent or not, so the form cannot be used to learn who has an account.
 */
async function signup(request: Request, deps: AccountDeps): Promise<Response> {
  const body = await readJsonObject(request);
  const email = text(body.email, 200).toLowerCase();
  const fullName = text(body.fullName, 150);
  if (!isEmail(email)) return json(400, { error: 'invalid_email' });
  if (fullName.length < 3) return json(400, { error: 'invalid_name' });
  if (
    !(await allowed(deps, 'ip', clientIp(request), LIMITS.perIp)) ||
    !(await allowed(deps, 'signup', email, LIMITS.signupPerEmail))
  ) {
    return json(429, { error: 'too_many_attempts' });
  }

  const event = await eventFor(deps, body.eventSlug);
  const locale = emailLocale(text(body.locale, 10));
  const slug = encodeURIComponent(event?.slug ?? '');
  const base = { firstName: firstName(fullName), eventName: event?.name ?? 'SIEAmB' };
  try {
    const start = await deps.auth.startSignup(email, fullName);
    if (start.kind === 'link') {
      await send(deps, 'confirm', email, locale, {
        ...base,
        url: `${site(deps)}/${slug}/conta/confirmar?token_hash=${encodeURIComponent(start.tokenHash)}&type=signup`,
      });
    } else {
      await send(deps, 'exists', email, locale, { ...base, url: `${site(deps)}/${slug}/conta/entrar` });
    }
  } catch (error) {
    deps.log('account_signup_failed', { error: error instanceof Error ? error.message : 'unknown' });
  }
  return json(202, { ok: true });
}

async function recover(request: Request, deps: AccountDeps): Promise<Response> {
  const body = await readJsonObject(request);
  const email = text(body.email, 200).toLowerCase();
  if (!isEmail(email)) return json(400, { error: 'invalid_email' });
  if (
    !(await allowed(deps, 'ip', clientIp(request), LIMITS.perIp)) ||
    !(await allowed(deps, 'recover', email, LIMITS.recoverPerEmail))
  ) {
    return json(429, { error: 'too_many_attempts' });
  }

  const event = await eventFor(deps, body.eventSlug);
  const locale = emailLocale(text(body.locale, 10));
  try {
    const start = await deps.auth.startRecovery(email);
    if (start) {
      await send(deps, 'recovery', email, locale, {
        firstName: '',
        eventName: event?.name ?? 'SIEAmB',
        url: `${site(deps)}/${encodeURIComponent(event?.slug ?? '')}/conta/nova-senha?token_hash=${encodeURIComponent(start.tokenHash)}&type=recovery`,
      });
    }
  } catch (error) {
    deps.log('account_recover_failed', { error: error instanceof Error ? error.message : 'unknown' });
  }
  return json(202, { ok: true });
}

// ───────────────────────────── Logged in ─────────────────────────────

const bearer = (request: Request): string | null => {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match ? match[1]! : null;
};

/** The logged-in person with a confirmed e-mail, or the response that says why not. */
export async function authenticate(
  request: Request,
  deps: Pick<AccountDeps, 'auth'>,
): Promise<{ user: AuthUser } | { response: Response }> {
  const token = bearer(request);
  if (!token) return { response: json(401, { error: 'not_logged_in' }) };
  const user = await deps.auth.userFromToken(token);
  if (!user) return { response: json(401, { error: 'not_logged_in' }) };
  // Everything an account can see is tied to its address: an unconfirmed one sees nothing.
  if (!user.emailConfirmed) return { response: json(403, { error: 'email_not_confirmed' }) };
  return { user };
}

export type RegistrationState = 'PAID' | 'PENDING' | 'UNPAID' | 'CANCELLED';

export function registrationState(registration: OwnRegistration): RegistrationState {
  // What an administrator decided wins over the payment (#219).
  if (registration.manualStatus === 'CANCELLED') return 'CANCELLED';
  if (registration.manualStatus === 'CONFIRMED' || registration.manualStatus === 'EXEMPT') return 'PAID';
  const statuses = registration.payments.map((p) => p.status);
  if (statuses.includes('APPROVED')) return 'PAID';
  if (statuses.includes('PENDING')) return 'PENDING';
  return 'UNPAID';
}

const documentOf = (profile: Profile) => ({
  cpf: profile.cpf,
  passport: profile.passport,
  country: profile.country,
});

async function describe(user: AuthUser, deps: AccountDeps): Promise<Record<string, unknown>> {
  // A registration made with this confirmed address is the person's own, and so is a
  // role that was given to the address before it had an account (#219).
  await deps.store.linkRegistrationsByEmail(user.id, user.email);
  await deps.store.applyRoleInvites(user.id, user.email);
  const profile = await deps.store.getProfile(user.id);
  if (!profile) throw new Error('account_profile_missing');
  const registrations = await deps.store.listRegistrations(user.id);

  const taken = new Set(registrations.map((r) => r.eventSlug));
  const requests = await deps.store.listLinkRequests(user.id);
  const now = deps.now().getTime();
  const matches = (await deps.store.findRegistrationsByDocument(documentOf(profile))).filter(
    (m) => !m.userId && m.email !== user.email && !taken.has(m.eventSlug),
  );

  return {
    // Where this person may open the organisation area.
    panels: await deps.store.listPanels(user.id),
    user: {
      email: profile.email,
      fullName: profile.fullName,
      cpf: profile.cpf,
      passport: profile.passport,
      country: profile.country,
      institution: profile.institution,
      // The document can be given once; after that only the organisers change it (#209).
      documentLocked: Boolean(profile.cpf || profile.passport),
    },
    registrations: registrations.map((r) => {
      const state = registrationState(r);
      const open = r.payments.filter((p) => p.status === 'PENDING').at(-1);
      const paid = r.payments.find((p) => p.status === 'APPROVED');
      return {
        id: r.id,
        eventSlug: r.eventSlug,
        eventName: r.eventName,
        category: r.category,
        modality: r.modality,
        createdAt: r.createdAt,
        state,
        amountCents: (paid ?? open)?.amountCents ?? null,
        // The pay link is only useful, and only handed out, while something is owed.
        payToken: state === 'UNPAID' ? r.payToken : null,
        paymentId: (paid ?? open)?.id ?? null,
      };
    }),
    suggestions: matches.map((m) => {
      const request = requests.find(
        (r) =>
          r.preRegistrationId === m.id &&
          (r.status === 'NEEDS_ORGANISER' ||
            (r.status === 'PENDING' && Date.parse(r.expiresAt) > now)),
      );
      return {
        registrationId: m.id,
        eventSlug: m.eventSlug,
        eventName: m.eventName,
        maskedEmail: maskEmail(m.email),
        createdAt: m.createdAt,
        request: request?.status ?? null,
      };
    }),
  };
}

async function me(request: Request, deps: AccountDeps): Promise<Response> {
  const auth = await authenticate(request, deps);
  if ('response' in auth) return auth.response;
  return json(200, await describe(auth.user, deps));
}

export const NOTIFICATIONS_SHOWN = 50;

/** What is under the bell: the latest notices and how many are unread (#221). */
async function notifications(request: Request, deps: AccountDeps): Promise<Response> {
  const auth = await authenticate(request, deps);
  if ('response' in auth) return auth.response;
  return json(200, {
    unread: await deps.store.countUnreadNotifications(auth.user.id),
    items: await deps.store.listNotifications(auth.user.id, NOTIFICATIONS_SHOWN),
  });
}

async function notificationsRead(request: Request, deps: AccountDeps): Promise<Response> {
  const auth = await authenticate(request, deps);
  if ('response' in auth) return auth.response;
  await deps.store.markNotificationsRead(auth.user.id, deps.now());
  return json(200, { ok: true });
}

const PASSPORT = /^[A-Z0-9]{5,20}$/;
const COUNTRY = /^[A-Z]{2}$/;

async function updateProfile(request: Request, deps: AccountDeps): Promise<Response> {
  const auth = await authenticate(request, deps);
  if ('response' in auth) return auth.response;
  const { user } = auth;
  if (!(await allowed(deps, 'profile', user.id, LIMITS.profilePerUser))) {
    return json(429, { error: 'too_many_attempts' });
  }
  const body = await readJsonObject(request);
  const profile = await deps.store.getProfile(user.id);
  if (!profile) return json(404, { error: 'profile_not_found' });

  const patch: ProfilePatch = {};
  if (body.fullName !== undefined) {
    const fullName = text(body.fullName, 150);
    if (fullName.length < 3) return json(400, { error: 'invalid_name' });
    patch.fullName = fullName;
  }
  if (body.institution !== undefined) patch.institution = text(body.institution, 200) || null;

  const cpf = typeof body.cpf === 'string' ? normalizeCpf(body.cpf) : '';
  const passport = text(body.passport, 30).toUpperCase().replace(/[\s.-]/g, '');
  const country = text(body.country, 2).toUpperCase();
  if (cpf || passport) {
    const locked = Boolean(profile.cpf || profile.passport);
    const same = cpf ? cpf === profile.cpf : passport === profile.passport && country === profile.country;
    if (locked && !same) return json(409, { error: 'document_locked' });
    if (!locked) {
      if (cpf) {
        if (!isValidCpf(cpf)) return json(400, { error: 'invalid_cpf' });
        patch.cpf = cpf;
        patch.country = 'BR';
      } else {
        if (!PASSPORT.test(passport)) return json(400, { error: 'invalid_passport' });
        if (!COUNTRY.test(country) || country === 'BR') return json(400, { error: 'invalid_country' });
        patch.passport = passport;
        patch.country = country;
      }
    }
  }

  try {
    if (Object.keys(patch).length > 0) await deps.store.updateProfile(user.id, patch);
  } catch (error) {
    if (error instanceof DocumentInUseError) return json(409, { error: 'document_in_use' });
    throw error;
  }
  return json(200, await describe(user, deps));
}

/** Sets the password of the logged-in account: after confirming the e-mail, or after a recovery link. */
async function setPassword(request: Request, deps: AccountDeps): Promise<Response> {
  const auth = await authenticate(request, deps);
  if ('response' in auth) return auth.response;
  const body = await readJsonObject(request);
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return json(400, { error: 'weak_password' });
  }
  // A password built on the person's own address is the first one anybody would try.
  const local = auth.user.email.split('@')[0]!.toLowerCase();
  if (local.length >= 4 && password.toLowerCase().includes(local)) {
    return json(400, { error: 'weak_password' });
  }
  await deps.auth.setPassword(auth.user.id, password);
  deps.log('account_password_set', {});
  return json(200, { ok: true });
}

// ───────────────────────────── A registration under another e-mail (#209) ─────────────────────────────

async function requestLink(request: Request, deps: AccountDeps): Promise<Response> {
  const auth = await authenticate(request, deps);
  if ('response' in auth) return auth.response;
  const { user } = auth;
  const body = await readJsonObject(request);
  const registrationId = text(body.registrationId, 40);
  const noAccess = body.noAccess === true;
  if (!(await allowed(deps, 'link', user.id, LIMITS.linkPerUser))) {
    return json(429, { error: 'too_many_attempts' });
  }

  const profile = await deps.store.getProfile(user.id);
  if (!profile) return json(404, { error: 'profile_not_found' });
  // Only a registration the account's own document points to can be asked for.
  const match = (await deps.store.findRegistrationsByDocument(documentOf(profile))).find(
    (m) => m.id === registrationId && !m.userId && m.email !== user.email,
  );
  if (!match) return json(404, { error: 'registration_not_found' });
  const own = await deps.store.listRegistrations(user.id);
  if (own.some((r) => r.eventSlug === match.eventSlug)) {
    return json(409, { error: 'already_registered' });
  }

  const token = randomBytes(32).toString('base64url');
  const now = deps.now();
  await deps.store.insertLinkRequest({
    preRegistrationId: match.id,
    userId: user.id,
    tokenHash: sha256(token),
    status: noAccess ? 'NEEDS_ORGANISER' : 'PENDING',
    expiresAt: new Date(now.getTime() + LINK_REQUEST_TTL_MS),
  });
  if (noAccess) {
    deps.log('account_link_needs_organiser', {});
    return json(202, { ok: true, request: 'NEEDS_ORGANISER' });
  }
  await send(deps, 'link', match.email, match.locale, {
    firstName: firstName(match.fullName),
    eventName: match.eventName,
    accountEmail: maskEmail(user.email),
    url: `${site(deps)}/${encodeURIComponent(match.eventSlug)}/conta/vincular?t=${encodeURIComponent(token)}`,
  });
  return json(202, { ok: true, request: 'PENDING', maskedEmail: maskEmail(match.email) });
}

/**
 * The click on the link sent to the registration's address. No login is asked:
 * holding the token is the proof that the person reads that inbox.
 */
async function confirmLink(request: Request, deps: AccountDeps): Promise<Response> {
  const body = await readJsonObject(request);
  const token = text(body.token, 200);
  if (!token) return json(400, { error: 'invalid_token' });
  if (!(await allowed(deps, 'ip', clientIp(request), LIMITS.perIp))) {
    return json(429, { error: 'too_many_attempts' });
  }
  const linkRequest = await deps.store.findLinkRequestByTokenHash(sha256(token));
  if (!linkRequest) return json(404, { error: 'link_not_found' });
  const now = deps.now();
  if (linkRequest.status === 'CONFIRMED') return json(200, { ok: true, already: true });
  if (linkRequest.status !== 'PENDING') return json(410, { error: 'link_expired' });
  if (Date.parse(linkRequest.expiresAt) <= now.getTime()) {
    await deps.store.updateLinkRequest(linkRequest.id, 'EXPIRED', now);
    return json(410, { error: 'link_expired' });
  }
  const linked = await deps.store.linkRegistration(linkRequest.preRegistrationId, linkRequest.userId);
  if (!linked) {
    await deps.store.updateLinkRequest(linkRequest.id, 'REJECTED', now);
    return json(409, { error: 'cannot_link' });
  }
  await deps.store.updateLinkRequest(linkRequest.id, 'CONFIRMED', now);
  deps.log('account_link_confirmed', {});
  return json(200, { ok: true });
}

// ───────────────────────────── Registration form: document already registered (#210) ─────────────────────────────

/**
 * Tells the form that this CPF or passport already has a registration for the
 * event under another e-mail, so the person does not register twice by accident.
 */
async function checkRegistration(request: Request, deps: AccountDeps): Promise<Response> {
  if (!(await allowed(deps, 'check', clientIp(request), LIMITS.checkPerIp))) {
    return json(429, { error: 'too_many_attempts' });
  }
  const body = await readJsonObject(request);
  const event = await deps.store.findEvent(text(body.eventSlug, 40));
  if (!event) return json(404, { error: 'event_not_found' });
  const email = text(body.email, 200).toLowerCase();
  const cpf = typeof body.cpf === 'string' ? normalizeCpf(body.cpf) : '';
  const passport = text(body.passport, 30).toUpperCase().replace(/[\s.-]/g, '');
  const country = text(body.country, 2).toUpperCase();
  const query = cpf && isValidCpf(cpf) ? { cpf } : passport && country ? { passport, country } : null;
  if (!query) return json(200, { duplicate: false });
  const other = (await deps.store.findRegistrationsByDocument(query, event.id)).find(
    (m) => m.email !== email,
  );
  return json(200, other ? { duplicate: true, maskedEmail: maskEmail(other.email) } : { duplicate: false });
}

// ───────────────────────────── Router ─────────────────────────────

type Handler = (request: Request, deps: AccountDeps) => Promise<Response>;

const ROUTES: Record<string, Partial<Record<string, Handler>>> = {
  signup: { POST: signup },
  recover: { POST: recover },
  me: { GET: me },
  profile: { PUT: updateProfile },
  password: { POST: setPassword },
  'link-request': { POST: requestLink },
  'link-confirm': { POST: confirmLink },
  'registration-check': { POST: checkRegistration },
  notifications: { GET: notifications },
  'notifications-read': { POST: notificationsRead },
};

/** One Vercel function serves every account action: `/api/v1/account/<action>`. */
export async function handleAccount(
  request: Request,
  action: string,
  deps: AccountDeps | null,
): Promise<Response> {
  const route = ROUTES[action];
  if (!route) return json(404, { error: 'not_found' });
  const handler = route[request.method.toUpperCase()];
  if (!handler) return json(405, { error: 'method_not_allowed' });
  if (!deps) return json(503, { error: 'accounts_unavailable' });
  try {
    return await handler(request, deps);
  } catch (error) {
    deps.log('account_request_failed', {
      action,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return json(500, { error: 'server_error' });
  }
}

/**
 * The action of `/api/v1/account/<action>`. The rewrite hands it over as
 * `?action=`; when the platform passes the original address, it is the last segment.
 */
export function actionOf(request: Request, base = 'account'): string {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get('action');
  if (fromQuery) return fromQuery;
  const path = url.pathname.replace(/\/+$/, '');
  const last = decodeURIComponent(path.slice(path.lastIndexOf('/') + 1));
  return last === base ? '' : last;
}
