// Test helpers for the account handlers. Not imported by runtime code.
import type { Mailer, OutgoingMail } from '../payments/notifications';
import type { AuthGateway, AuthUser, SignupStart } from './auth';
import type { AccountDeps } from './handlers';
import {
  DocumentInUseError,
  type AccountNotification,
  type AccountStore,
  type DocumentQuery,
  type EventRef,
  type LinkRequest,
  type LinkRequestStatus,
  type OwnRegistration,
  type Profile,
  type ProfilePatch,
  type RegistrationMatch,
} from './store';

export const NOW = new Date('2026-11-17T15:00:00-03:00');
export const EVENT: EventRef = { id: 'ev-2027', slug: '2027', name: 'II SIEAmB' };
export const OLD_EVENT: EventRef = { id: 'ev-2025', slug: '2025', name: 'I SIEAmB' };
/** A CPF with valid check digits, and another one. */
export const CPF = '52998224725';
export const OTHER_CPF = '11144477735';

export interface FakeRegistration extends RegistrationMatch {
  cpf: string | null;
  passport: string | null;
  country: string;
  payments: OwnRegistration['payments'];
  manualStatus?: OwnRegistration['manualStatus'];
}

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${(seq += 1)}`;

/** In-memory AccountStore that enforces the same uniqueness rules as the database. */
export class FakeAccountStore implements AccountStore {
  events: EventRef[] = [EVENT, OLD_EVENT];
  profiles = new Map<string, Profile>();
  registrations: FakeRegistration[] = [];
  links: (LinkRequest & { tokenHash: string })[] = [];
  hits = new Map<string, number>();

  addProfile(user: AuthUser, fullName = 'Maria Clara de Souza'): Profile {
    const profile: Profile = {
      id: user.id,
      email: user.email,
      fullName,
      cpf: null,
      passport: null,
      country: 'BR',
      institution: null,
    };
    this.profiles.set(user.id, profile);
    return profile;
  }

  addRegistration(over: Partial<FakeRegistration> = {}): FakeRegistration {
    const registration: FakeRegistration = {
      id: nextId('reg'),
      eventId: EVENT.id,
      eventSlug: EVENT.slug,
      eventName: EVENT.name,
      email: 'pessoa@ufcg.edu.br',
      fullName: 'Maria Clara de Souza',
      locale: 'pt-BR',
      createdAt: '2026-11-10T12:00:00.000Z',
      userId: null,
      cpf: null,
      passport: null,
      country: 'BR',
      payments: [],
      ...over,
    };
    this.registrations.push(registration);
    return registration;
  }

  async findEvent(slug: string) {
    return this.events.find((e) => e.slug === slug) ?? null;
  }
  async currentEvent() {
    return this.events[0] ?? null;
  }
  async getProfile(userId: string) {
    const profile = this.profiles.get(userId);
    return profile ? { ...profile } : null;
  }
  async updateProfile(userId: string, patch: ProfilePatch) {
    const profile = this.profiles.get(userId);
    if (!profile) throw new Error('profile_not_found');
    if (patch.cpf && [...this.profiles.values()].some((p) => p.id !== userId && p.cpf === patch.cpf)) {
      throw new DocumentInUseError();
    }
    Object.assign(profile, patch);
    return { ...profile };
  }
  async linkRegistrationsByEmail(userId: string, email: string) {
    let linked = 0;
    for (const r of this.registrations.filter((x) => x.email === email && !x.userId)) {
      if (await this.linkRegistration(r.id, userId)) linked += 1;
    }
    return linked;
  }
  async listRegistrations(userId: string): Promise<OwnRegistration[]> {
    return this.registrations
      .filter((r) => r.userId === userId)
      .map((r) => ({
        id: r.id,
        eventSlug: r.eventSlug,
        eventName: r.eventName,
        category: 'ESTUDANTE_POS',
        modality: 'ONLINE',
        createdAt: r.createdAt,
        payToken: `pay-${r.id}`,
        manualStatus: r.manualStatus ?? null,
        payments: r.payments,
      }));
  }
  async findRegistrationsByDocument(query: DocumentQuery, eventId?: string) {
    if (!query.cpf && !(query.passport && query.country)) return [];
    return this.registrations.filter(
      (r) =>
        (!eventId || r.eventId === eventId) &&
        ((query.cpf && r.cpf === query.cpf) ||
          (query.passport && r.passport === query.passport && r.country === query.country)),
    );
  }
  async findRegistration(id: string) {
    return this.registrations.find((r) => r.id === id) ?? null;
  }
  async linkRegistration(preRegistrationId: string, userId: string) {
    const registration = this.registrations.find((r) => r.id === preRegistrationId);
    if (!registration || registration.userId) return false;
    if (this.registrations.some((r) => r.userId === userId && r.eventId === registration.eventId)) {
      return false;
    }
    registration.userId = userId;
    return true;
  }
  async insertLinkRequest(request: {
    preRegistrationId: string;
    userId: string;
    tokenHash: string;
    status: LinkRequestStatus;
    expiresAt: Date;
  }) {
    const row = {
      id: nextId('link'),
      preRegistrationId: request.preRegistrationId,
      userId: request.userId,
      tokenHash: request.tokenHash,
      status: request.status,
      expiresAt: request.expiresAt.toISOString(),
    };
    this.links.push(row);
    return row;
  }
  async findLinkRequestByTokenHash(tokenHash: string) {
    return this.links.find((l) => l.tokenHash === tokenHash) ?? null;
  }
  async listLinkRequests(userId: string) {
    return this.links.filter((l) => l.userId === userId);
  }
  async updateLinkRequest(id: string, status: LinkRequestStatus) {
    const link = this.links.find((l) => l.id === id);
    if (link) link.status = status;
  }
  notices: (AccountNotification & { userId: string })[] = [];
  async listNotifications(userId: string, limit: number) {
    return this.notices
      .filter((n) => n.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map(({ userId: _owner, ...n }) => n);
  }
  async countUnreadNotifications(userId: string) {
    return this.notices.filter((n) => n.userId === userId && !n.readAt).length;
  }
  async markNotificationsRead(userId: string, now: Date) {
    for (const n of this.notices) if (n.userId === userId && !n.readAt) n.readAt = now.toISOString();
  }
  invitesApplied: string[] = [];
  panels = { platformAdmin: false, slugs: [] as string[] };
  async applyRoleInvites(_userId: string, email: string) {
    this.invitesApplied.push(email);
  }
  async listPanels() {
    return this.panels;
  }
  async hitRateLimit(key: string, _windowSeconds: number, max: number) {
    const count = (this.hits.get(key) ?? 0) + 1;
    this.hits.set(key, count);
    return count <= max;
  }
}

/** The login service, in memory: accounts, their tokens, and what was asked of it. */
export class FakeAuth implements AuthGateway {
  /** email → confirmed? */
  accounts = new Map<string, boolean>();
  tokens = new Map<string, AuthUser>();
  passwords: { userId: string; password: string }[] = [];
  signups: string[] = [];
  fail = false;

  login(user: AuthUser, token = `token-${user.id}`): string {
    this.tokens.set(token, user);
    return token;
  }
  async startSignup(email: string): Promise<SignupStart> {
    if (this.fail) throw new Error('auth_signup_failed: 500');
    this.signups.push(email);
    if (this.accounts.get(email)) return { kind: 'exists' };
    this.accounts.set(email, false);
    return { kind: 'link', tokenHash: `hash-for-${email}` };
  }
  async startRecovery(email: string) {
    if (this.fail) throw new Error('auth_recovery_failed: 500');
    return this.accounts.has(email) ? { tokenHash: `recovery-for-${email}` } : null;
  }
  async userFromToken(accessToken: string) {
    return this.tokens.get(accessToken) ?? null;
  }
  async setPassword(userId: string, password: string) {
    this.passwords.push({ userId, password });
  }
  emails: { userId: string; email: string }[] = [];
  async setEmail(userId: string, email: string): Promise<'ok' | 'in_use'> {
    if (this.accounts.has(email)) return 'in_use';
    this.emails.push({ userId, email });
    return 'ok';
  }
}

export const USER: AuthUser = { id: 'user-1', email: 'maria@ufcg.edu.br', emailConfirmed: true };

export function setup(options: { failSends?: boolean; noMailer?: boolean } = {}) {
  const store = new FakeAccountStore();
  const auth = new FakeAuth();
  const sent: OutgoingMail[] = [];
  const logs: { event: string; data: Record<string, unknown> }[] = [];
  const mailer: Mailer = {
    async send(mail) {
      if (options.failSends) throw new Error('smtp down');
      sent.push(mail);
    },
  };
  const deps: AccountDeps = {
    store,
    auth,
    mailer: options.noMailer ? undefined : mailer,
    siteUrl: 'https://dev.sieamb.org/',
    log: (event, data) => logs.push({ event, data }),
    now: () => NOW,
    pepper: 'test-pepper',
  };
  return { store, auth, sent, logs, deps };
}

export function call(
  method: string,
  action: string,
  options: { body?: unknown; token?: string; ip?: string } = {},
): Request {
  return new Request(`https://dev.sieamb.org/api/v1/account/${action}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      'x-forwarded-for': options.ip ?? '203.0.113.7',
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
}
