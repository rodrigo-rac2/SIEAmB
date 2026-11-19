import type { PersonDocument } from '../core/document';
import type { PaymentStatus } from '../payments/status';

export interface Profile {
  id: string;
  email: string;
  fullName: string;
  cpf: string | null;
  passport: string | null;
  /** Of the passport; means nothing without one (the column is never empty). */
  country: string;
  institution: string | null;
}

export interface ProfilePatch {
  fullName?: string;
  cpf?: string;
  passport?: string;
  country?: string;
  institution?: string | null;
}

export interface EventRef {
  id: string;
  slug: string;
  name: string;
}

/** A registration as its owner sees it. */
export interface OwnRegistration {
  id: string;
  eventSlug: string;
  eventName: string;
  category: string;
  modality: string;
  createdAt: string;
  payToken: string;
  /** Set by an administrator, whatever the payment says (#219); null when the payment decides. */
  manualStatus: 'CONFIRMED' | 'EXEMPT' | 'CANCELLED' | null;
  payments: { id: string; status: PaymentStatus; mpStatus: string | null; amountCents: number }[];
}

/** A registration that may belong to an account: same CPF or passport, another e-mail. */
export interface RegistrationMatch {
  id: string;
  eventId: string;
  eventSlug: string;
  eventName: string;
  email: string;
  fullName: string;
  locale: string;
  createdAt: string;
  userId: string | null;
}

export type LinkRequestStatus = 'PENDING' | 'CONFIRMED' | 'NEEDS_ORGANISER' | 'REJECTED' | 'EXPIRED';

export interface LinkRequest {
  id: string;
  preRegistrationId: string;
  userId: string;
  status: LinkRequestStatus;
  expiresAt: string;
}

export interface DocumentQuery {
  cpf?: string | null;
  passport?: string | null;
  country?: string | null;
}

/** An account as far as its document goes: enough to tell who holds a CPF or a passport. */
export interface DocumentHolder {
  id: string;
  email: string;
  cpf: string | null;
  passport: string | null;
  country: string;
}

/** Thrown when the CPF or passport already belongs to another account. */
export class DocumentInUseError extends Error {
  constructor() {
    super('document_in_use');
    this.name = 'DocumentInUseError';
  }
}

export interface AccountNotification {
  id: string;
  kind: string;
  data: Record<string, unknown>;
  eventSlug: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface AccountStore {
  findEvent(slug: string): Promise<EventRef | null>;
  currentEvent(): Promise<EventRef | null>;

  getProfile(userId: string): Promise<Profile | null>;
  updateProfile(userId: string, patch: ProfilePatch): Promise<Profile>;

  /** The accounts that hold this CPF, or this passport with its country. Empty for an empty document. */
  findAccountsByDocument(document: PersonDocument): Promise<DocumentHolder[]>;

  /**
   * What was typed when an account was asked for (ADR-010): it waits by address until the
   * e-mail is confirmed. One per address; a new one replaces the one before.
   */
  saveSignupDocument(email: string, document: PersonDocument): Promise<void>;
  getSignupDocument(email: string): Promise<PersonDocument | null>;
  deleteSignupDocument(email: string): Promise<void>;

  /**
   * Gives the account every registration made with its (confirmed) e-mail that has
   * no account yet. Returns how many were linked. Never moves a registration that
   * already has an account, and skips an event where the account already has one.
   */
  linkRegistrationsByEmail(userId: string, email: string): Promise<number>;
  listRegistrations(userId: string): Promise<OwnRegistration[]>;

  /** Registrations with this CPF, or this passport and country. Empty for an empty query. */
  findRegistrationsByDocument(query: DocumentQuery, eventId?: string): Promise<RegistrationMatch[]>;
  findRegistration(id: string): Promise<RegistrationMatch | null>;
  /** True when the row was linked; false when it already had an account or the account already has one in the event. */
  linkRegistration(preRegistrationId: string, userId: string): Promise<boolean>;

  insertLinkRequest(request: {
    preRegistrationId: string;
    userId: string;
    tokenHash: string;
    status: LinkRequestStatus;
    expiresAt: Date;
  }): Promise<LinkRequest>;
  findLinkRequestByTokenHash(tokenHash: string): Promise<LinkRequest | null>;
  listLinkRequests(userId: string): Promise<LinkRequest[]>;
  updateLinkRequest(id: string, status: LinkRequestStatus, now: Date): Promise<void>;

  /**
   * Turns the roles that were given to this address before it had an account into
   * real ones (#219). Only called for a confirmed e-mail.
   */
  applyRoleInvites(userId: string, email: string): Promise<void>;
  /** The editions whose organisation area this account may open, and those where it is a reviewer. */
  listPanels(userId: string): Promise<{ platformAdmin: boolean; slugs: string[]; reviewing: string[] }>;

  /** The latest notices of an account, newest first (#221). */
  listNotifications(userId: string, limit: number): Promise<AccountNotification[]>;
  countUnreadNotifications(userId: string): Promise<number>;
  markNotificationsRead(userId: string, now: Date): Promise<void>;

  /** Counts one more attempt under `key`; false once the window is over `max`. */
  hitRateLimit(key: string, windowSeconds: number, max: number): Promise<boolean>;
}
