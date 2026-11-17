// Test helpers for the organisation area. Not imported by runtime code.
import type { AuthUser } from '../account/auth';
import { FakeAuth } from '../account/testing';
import type { Mailer, OutgoingMail } from '../payments/notifications';
import { FakeOutbox } from '../submissions/testing';
import type { AdminDeps } from './handlers';
import {
  RegistrationExistsError,
  type AdminRegistration,
  type AdminStore,
  type AdminSubmission,
  type Invite,
  type Member,
  type MemberRole,
  type NewRegistration,
  type PanelRole,
  type PendingLink,
  type RegistrationPatch,
} from './store';

export const NOW = new Date('2026-12-01T15:00:00-03:00');
export const EVENT = { id: 'ev-2027', slug: '2027', name: 'II SIEAmB' };
export const OTHER_EVENT = { id: 'ev-2025', slug: '2025', name: 'I SIEAmB' };
export const ADMIN: AuthUser = { id: 'user-admin', email: 'najara@ufcg.edu.br', emailConfirmed: true };
export const ORGANISER: AuthUser = { id: 'user-org', email: 'viviane@ufcg.edu.br', emailConfirmed: true };
export const REVIEWER: AuthUser = { id: 'user-rev', email: 'avaliador@ufpb.br', emailConfirmed: true };
export const NOBODY: AuthUser = { id: 'user-none', email: 'pessoa@ufrn.br', emailConfirmed: true };
export const PLATFORM: AuthUser = { id: 'user-root', email: 'rodrigo@sieamb.org', emailConfirmed: true };

let seq = 0;

export class FakeAdminStore implements AdminStore {
  registrations: AdminRegistration[] = [];
  submissions: (AdminSubmission & { eventId: string })[] = [];
  members: (Member & { eventId: string })[] = [
    { eventId: EVENT.id, userId: ADMIN.id, email: ADMIN.email, fullName: 'Najara Escarião', role: 'ADMIN' },
    { eventId: EVENT.id, userId: ORGANISER.id, email: ORGANISER.email, fullName: 'Viviane Farias', role: 'ORGANIZER' },
    { eventId: EVENT.id, userId: REVIEWER.id, email: REVIEWER.email, fullName: 'Avaliador Um', role: 'REVIEWER' },
  ];
  invites: (Invite & { eventId: string })[] = [];
  users = [
    { id: ADMIN.id, email: ADMIN.email, fullName: 'Najara Escarião' },
    { id: ORGANISER.id, email: ORGANISER.email, fullName: 'Viviane Farias' },
    { id: REVIEWER.id, email: REVIEWER.email, fullName: 'Avaliador Um' },
    { id: NOBODY.id, email: NOBODY.email, fullName: 'Pessoa Comum' },
  ];
  links: (PendingLink & { eventId: string; status: string })[] = [];
  audits: { actorId: string; action: string; entity: string; entityId: string | null; meta: Record<string, unknown> }[] = [];
  failAudit = false;

  async findEvent(slug: string) {
    return [EVENT, OTHER_EVENT].find((e) => e.slug === slug) ?? null;
  }
  async roleOf(eventId: string, userId: string): Promise<PanelRole | null> {
    if (userId === PLATFORM.id) return 'ADMIN';
    const roles = this.members.filter((m) => m.eventId === eventId && m.userId === userId).map((m) => m.role);
    if (roles.includes('ADMIN')) return 'ADMIN';
    return roles.includes('ORGANIZER') ? 'ORGANIZER' : null;
  }
  async listRegistrations(eventId: string) {
    return this.registrations.filter((r) => r.eventId === eventId);
  }
  async findRegistration(id: string) {
    return this.registrations.find((r) => r.id === id) ?? null;
  }
  private clash(candidate: { id?: string; eventId: string; email: string; userId: string | null }) {
    return this.registrations.some(
      (r) =>
        r.id !== candidate.id &&
        !r.deletedAt &&
        r.eventId === candidate.eventId &&
        (r.email === candidate.email || (candidate.userId !== null && r.userId === candidate.userId)),
    );
  }
  async insertRegistration(input: NewRegistration) {
    if (this.clash({ eventId: input.eventId, email: input.email, userId: null })) throw new RegistrationExistsError();
    return this.seed({
      eventId: input.eventId,
      fullName: input.fullName,
      email: input.email,
      cpf: input.cpf,
      passport: input.passport,
      country: input.country,
      institution: input.institution,
      category: input.category,
      createdAt: input.now.toISOString(),
      createdBy: input.createdBy,
      manualStatus: input.manualStatus,
      manualReason: input.manualReason,
      manualBy: input.manualStatus ? input.createdBy : null,
      manualAt: input.manualStatus ? input.now.toISOString() : null,
    });
  }
  async patchRegistration(id: string, patch: RegistrationPatch) {
    const registration = this.registrations.find((r) => r.id === id)!;
    // Restoring must respect "only one live registration per e-mail and per account".
    if (patch.deletedAt === null && this.clash(registration)) throw new RegistrationExistsError();
    Object.assign(registration, patch);
  }
  async listSubmissions(eventId: string) {
    return this.submissions.filter((s) => s.eventId === eventId);
  }
  async listMembers(eventId: string) {
    return this.members.filter((m) => m.eventId === eventId).map(({ eventId: _e, ...m }) => m);
  }
  async listInvites(eventId: string) {
    return this.invites.filter((i) => i.eventId === eventId).map(({ eventId: _e, ...i }) => i);
  }
  async findUserByEmail(email: string) {
    return this.users.find((u) => u.email === email) ?? null;
  }
  async addMember(eventId: string, userId: string, role: MemberRole) {
    if (this.members.some((m) => m.eventId === eventId && m.userId === userId && m.role === role)) return;
    const user = this.users.find((u) => u.id === userId)!;
    this.members.push({ eventId, userId, email: user.email, fullName: user.fullName, role });
  }
  async removeMember(eventId: string, userId: string, role: MemberRole) {
    this.members = this.members.filter((m) => !(m.eventId === eventId && m.userId === userId && m.role === role));
  }
  async addInvite(eventId: string, email: string, role: MemberRole) {
    if (this.invites.some((i) => i.eventId === eventId && i.email === email && i.role === role)) return;
    this.invites.push({ eventId, email, role });
  }
  async removeInvite(eventId: string, email: string, role: MemberRole) {
    this.invites = this.invites.filter((i) => !(i.eventId === eventId && i.email === email && i.role === role));
  }
  async listPendingLinks(eventId: string) {
    return this.links.filter((l) => l.eventId === eventId && l.status === 'NEEDS_ORGANISER');
  }
  async findPendingLink(id: string) {
    return this.links.find((l) => l.id === id && l.status === 'NEEDS_ORGANISER') ?? null;
  }
  async decideLink(id: string, status: 'CONFIRMED' | 'REJECTED') {
    const link = this.links.find((l) => l.id === id);
    if (link) link.status = status;
  }
  async linkRegistration(registrationId: string, userId: string) {
    const registration = this.registrations.find((r) => r.id === registrationId);
    if (!registration || registration.userId || registration.deletedAt) return false;
    if (this.clash({ id: registration.id, eventId: registration.eventId, email: '', userId })) return false;
    registration.userId = userId;
    return true;
  }
  async audit(entry: { actorId: string; action: string; entity: string; entityId: string | null; meta: Record<string, unknown> }) {
    if (this.failAudit) throw new Error('db down');
    this.audits.push(entry);
  }

  seed(over: Partial<AdminRegistration> = {}): AdminRegistration {
    seq += 1;
    const registration: AdminRegistration = {
      id: `reg-${seq}`,
      eventId: EVENT.id,
      fullName: `Pessoa Inscrita ${seq}`,
      email: `pessoa${seq}@ufcg.edu.br`,
      cpf: '52998224725',
      passport: null,
      country: 'BR',
      institution: 'UFCG',
      category: 'ESTUDANTE_POS',
      modality: 'ONLINE',
      createdAt: NOW.toISOString(),
      userId: null,
      createdBy: null,
      manualStatus: null,
      manualReason: null,
      manualBy: null,
      manualAt: null,
      deletedAt: null,
      deletedBy: null,
      deletedReason: null,
      payments: [],
      ...over,
    };
    this.registrations.push(registration);
    return registration;
  }
}

export function setup(options: { failSends?: boolean } = {}) {
  const store = new FakeAdminStore();
  const outbox = new FakeOutbox();
  const auth = new FakeAuth();
  const sent: OutgoingMail[] = [];
  const logs: { event: string; data: Record<string, unknown> }[] = [];
  const mailer: Mailer = {
    async send(mail) {
      if (options.failSends) throw new Error('smtp down');
      sent.push(mail);
    },
  };
  const deps: AdminDeps = {
    store,
    outbox,
    auth,
    mailer,
    siteUrl: 'https://dev.sieamb.org/',
    log: (event, data) => logs.push({ event, data }),
    now: () => NOW,
  };
  const tokens = {
    admin: auth.login(ADMIN),
    organiser: auth.login(ORGANISER),
    reviewer: auth.login(REVIEWER),
    nobody: auth.login(NOBODY),
    platform: auth.login(PLATFORM),
  };
  return { store, outbox, auth, sent, logs, deps, tokens };
}

export function call(
  method: 'GET' | 'POST',
  action: string,
  options: { body?: unknown; token?: string; query?: string } = {},
): Request {
  return new Request(`https://dev.sieamb.org/api/v1/admin/${action}${options.query ?? ''}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
}
