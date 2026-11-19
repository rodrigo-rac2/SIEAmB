import type { PaymentStatus } from '../payments/status';

export type PanelRole = 'ADMIN' | 'ORGANIZER';
export type MemberRole = 'ADMIN' | 'ORGANIZER' | 'REVIEWER';
export type ManualStatus = 'CONFIRMED' | 'EXEMPT' | 'CANCELLED';

export interface AdminRegistration {
  id: string;
  eventId: string;
  fullName: string;
  email: string;
  cpf: string | null;
  passport: string | null;
  country: string;
  institution: string | null;
  category: string;
  modality: string;
  createdAt: string;
  userId: string | null;
  createdBy: string | null;
  manualStatus: ManualStatus | null;
  manualReason: string | null;
  manualBy: string | null;
  manualAt: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
  deletedReason: string | null;
  payments: { status: PaymentStatus; amountCents: number; paidAt: string | null }[];
}

export interface NewRegistration {
  eventId: string;
  fullName: string;
  email: string;
  cpf: string | null;
  passport: string | null;
  country: string;
  institution: string | null;
  category: string;
  modality: string;
  locale: string;
  createdBy: string;
  manualStatus: ManualStatus | null;
  manualReason: string | null;
  now: Date;
}

export interface RegistrationPatch {
  manualStatus?: ManualStatus | null;
  manualReason?: string | null;
  manualBy?: string | null;
  manualAt?: string | null;
  deletedAt?: string | null;
  deletedBy?: string | null;
  deletedReason?: string | null;
}

export interface AdminSubmission {
  id: string;
  number: number;
  title: string;
  modality: string;
  areaRef: string;
  status: string;
  fileName: string;
  filePages: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deletedReason: string | null;
  /** With who each one is (ADR-010): the handler sends the document on to administrators only. */
  authors: { position: number; fullName: string; email: string; cpf?: string | null; passport?: string | null; country?: string | null }[];
  /** Who reviews it (#232), in the order they were chosen. */
  reviewers: { userId: string; fullName: string; email: string }[];
}

export interface Member {
  userId: string;
  email: string;
  fullName: string;
  role: MemberRole;
}

/** An account of the site, whatever its roles. `owner` is the platform administrator. */
export interface Account {
  id: string;
  email: string;
  fullName: string;
  institution: string | null;
  /** Digits only; null for someone who gave none. */
  cpf: string | null;
  /** In its stored shape, with the country that issued it (ADR-010); null without one. */
  passport: string | null;
  country: string | null;
  owner: boolean;
}

export interface AccountPatch {
  fullName?: string;
  institution?: string | null;
  /** Only the owner changes these (#272, ADR-010). */
  email?: string;
  cpf?: string | null;
  /** null takes the passport off the account, and its country with it. */
  passport?: string | null;
  country?: string;
}

/** The new e-mail, CPF or passport already belongs to another account. */
export class AccountConflictError extends Error {
  constructor() {
    super('account_conflict');
    this.name = 'AccountConflictError';
  }
}

export interface Invite {
  email: string;
  role: MemberRole;
}

export type Audience = 'all' | 'registered' | 'authors' | 'reviewers' | 'organisers';
export const AUDIENCES: Audience[] = ['all', 'registered', 'authors', 'reviewers', 'organisers'];

export interface Person {
  email: string;
  fullName: string;
}

export interface SentAnnouncement {
  id: string;
  audience: Audience;
  subject: string;
  body: string;
  recipients: number;
  senderName: string;
  createdAt: string;
}

export interface PendingLink {
  id: string;
  createdAt: string;
  registrationId: string;
  registrationName: string;
  registrationEmail: string;
  registrationDeleted: boolean;
  accountId: string;
  accountName: string;
  accountEmail: string;
}

/** Thrown when a write would break "one registration per e-mail (or account) per event". */
export class RegistrationExistsError extends Error {
  constructor() {
    super('registration_exists');
    this.name = 'RegistrationExistsError';
  }
}

export interface AdminStore {
  findEvent(slug: string): Promise<{ id: string; slug: string; name: string } | null>;
  /** The person's standing in the edition; a platform administrator counts as ADMIN everywhere. */
  roleOf(eventId: string, userId: string): Promise<PanelRole | null>;

  listRegistrations(eventId: string): Promise<AdminRegistration[]>;
  findRegistration(id: string): Promise<AdminRegistration | null>;
  insertRegistration(input: NewRegistration): Promise<AdminRegistration>;
  patchRegistration(id: string, patch: RegistrationPatch): Promise<void>;

  listSubmissions(eventId: string): Promise<AdminSubmission[]>;
  /** Whether the organisers have submissions closed by hand (#236), since when and by whom. */
  submissionsClosed(eventId: string): Promise<{ closedAt: string; closedBy: string } | null>;
  /** Closes (a date and who) or reopens (null). False when it was already that way. */
  setSubmissionsClosed(eventId: string, closed: { at: Date; by: string } | null): Promise<boolean>;
  findSubmission(id: string): Promise<(AdminSubmission & { eventId: string }) | null>;
  /** False when that person already reviews the paper. */
  assignReviewer(submissionId: string, userId: string, by: string, now: Date): Promise<boolean>;
  /** False when that person did not review the paper. */
  unassignReviewer(submissionId: string, userId: string): Promise<boolean>;
  /** Takes a person off every paper of the edition; the ids of the papers they were on. */
  unassignReviewerEverywhere(eventId: string, userId: string): Promise<string[]>;
  setSubmissionStatus(id: string, status: 'SUBMITTED' | 'UNDER_REVIEW', now: Date): Promise<void>;

  /** Every account of the site, by name (#268). */
  listAccounts(): Promise<Account[]>;
  findAccount(id: string): Promise<Account | null>;
  updateAccount(id: string, patch: AccountPatch, now: Date): Promise<void>;
  /**
   * Whether some paper lists both addresses among its authors: then one cannot be turned
   * into the other, since a paper has each address once.
   */
  shareAPaper(emailA: string, emailB: string): Promise<boolean>;
  /**
   * Carries the owner's change of an account to that person's lines in papers (ADR-010):
   * the new address in place of the old one, and, when the account has a document, that
   * document on every line of the address. Without it the person's papers stop being theirs.
   */
  syncAuthorLines(oldEmail: string, newEmail: string, document: { cpf: string | null; passport: string | null; country: string | null } | null): Promise<void>;

  listMembers(eventId: string): Promise<Member[]>;
  listInvites(eventId: string): Promise<Invite[]>;
  findUserByEmail(email: string): Promise<{ id: string; email: string; fullName: string } | null>;
  addMember(eventId: string, userId: string, role: MemberRole, by: string): Promise<void>;
  removeMember(eventId: string, userId: string, role: MemberRole): Promise<void>;
  addInvite(eventId: string, email: string, role: MemberRole, by: string): Promise<void>;
  removeInvite(eventId: string, email: string, role: MemberRole): Promise<void>;

  listPendingLinks(eventId: string): Promise<PendingLink[]>;
  findPendingLink(id: string): Promise<(PendingLink & { eventId: string }) | null>;
  decideLink(id: string, status: 'CONFIRMED' | 'REJECTED', by: string, now: Date): Promise<void>;
  /** False when the registration already has an account or the account already has one in the event. */
  linkRegistration(registrationId: string, userId: string): Promise<boolean>;

  /** Who is in each group of the edition (#221). Administrators are in none of them by role alone. */
  listAudiences(eventId: string): Promise<Record<Exclude<Audience, 'all'>, Person[]>>;
  /** Accounts among the given addresses: they also get the notice in the site. */
  findAccounts(emails: string[]): Promise<{ id: string; email: string }[]>;
  insertAnnouncement(input: { eventId: string; senderId: string; audience: Audience; subject: string; body: string; recipients: string[]; now: Date }): Promise<string>;
  listAnnouncements(eventId: string): Promise<SentAnnouncement[]>;
  countAnnouncementsSince(senderId: string, since: Date): Promise<number>;

  audit(entry: { actorId: string; action: string; entity: string; entityId: string | null; meta: Record<string, unknown> }): Promise<void>;
}
