/**
 * Browser side of the organisation area (#219). Everything goes through
 * /api/v1/admin, where the server checks the person's role in the edition.
 */
export type PanelRole = 'ADMIN' | 'ORGANIZER';
export type MemberRole = 'ADMIN' | 'ORGANIZER' | 'REVIEWER';
export type ManualStatus = 'CONFIRMED' | 'EXEMPT' | 'CANCELLED';
export type PanelState = 'PAID' | 'PENDING' | 'UNPAID' | ManualStatus;

export interface PanelRegistration {
  id: string;
  fullName: string;
  email: string;
  cpf?: string | null;
  passport?: string | null;
  country?: string;
  institution: string | null;
  category: string;
  createdAt: string;
  hasAccount: boolean;
  byOrganiser: boolean;
  state: PanelState;
  payment: 'PAID' | 'PENDING' | 'UNPAID';
  paidCents: number | null;
  paidAt: string | null;
  /** Standing papers this person is an author of (#225). */
  papers?: number;
  manual: { status: ManualStatus; reason: string | null; by: string | null; at: string | null } | null;
  deleted: { at: string; by: string | null; reason: string | null } | null;
}

export interface PanelRegistrations {
  role: PanelRole;
  counts: { total: number; confirmed: number; pending: number; unpaid: number; cancelled: number; deleted: number };
  registrations: PanelRegistration[];
}

export interface PanelPaper {
  id: string;
  number: number;
  title: string;
  modality: string;
  areaRef: string;
  status: string;
  fileName: string;
  filePages: number | null;
  createdAt: string;
  deletedAt: string | null;
  /** `registration` is the state of that author's registration, or null when they have none (#225). */
  authors: { position: number; fullName: string; email: string; registration?: PanelState | null }[];
  authorRegistered: boolean;
  /** Who reviews it (#232). */
  reviewers: { userId: string; fullName: string; email: string }[];
}

export interface PanelPapers {
  role: PanelRole;
  /** Set while the organisers have submissions closed by hand (#236). */
  closed?: { closedAt: string; closedBy: string } | null;
  counts: { total: number; withdrawn: number };
  submissions: PanelPaper[];
}

export interface PanelMembers {
  role: PanelRole;
  canManage: MemberRole[];
  members: { userId: string; email: string; fullName: string; role: MemberRole }[];
  invites: { email: string; role: MemberRole }[];
  /** The person looking is the owner of the site (the platform administrator). */
  owner: boolean;
  /** Every account, with its roles in the edition and whether the person looking may change it (#268). */
  accounts: {
    userId: string;
    email: string;
    fullName: string;
    institution: string | null;
    /** Sent to the owner only, who is the one who can change it (#272). */
    cpf?: string | null;
    owner: boolean;
    roles: MemberRole[];
    canEdit: boolean;
  }[];
}

export interface PanelRequest {
  id: string;
  createdAt: string;
  registrationName: string;
  registrationEmail: string;
  accountName: string;
  accountEmail: string;
}

const KNOWN_ERRORS = [
  'not_logged_in',
  'not_found',
  'admin_only',
  'invalid_name',
  'invalid_email',
  'invalid_cpf',
  'document_required',
  'invalid_category',
  'invalid_status',
  'reason_required',
  'registration_exists',
  'registration_not_found',
  'registration_paid',
  'invalid_role',
  'cannot_remove_self',
  'request_not_found',
  'cannot_link',
  'invalid_audience',
  'invalid_subject',
  'invalid_body',
  'no_recipients',
  'too_many_attempts',
  'not_remindable',
  'already_reminded',
  'reminders_unavailable',
  'not_a_reviewer',
  'reviewer_is_author',
  'submission_not_found',
  'reviewer_not_found',
  'owner_only',
  'account_not_found',
  'account_without_login',
  'email_in_use',
  'document_in_use',
  'weak_password',
] as const;

export type AdminErrorCode = (typeof KNOWN_ERRORS)[number] | 'generic';

export class AdminError extends Error {
  constructor(readonly code: AdminErrorCode) {
    super(code);
    this.name = 'AdminError';
  }
}

async function request<T>(method: 'GET' | 'POST', action: string, token: string, eventSlug: string, body?: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1/admin/${action}${method === 'GET' ? `?eventSlug=${encodeURIComponent(eventSlug)}` : ''}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify({ eventSlug, ...body }) } : {}),
    });
  } catch {
    throw new AdminError('generic');
  }
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new AdminError((KNOWN_ERRORS as readonly string[]).includes(data.error ?? '') ? (data.error as AdminErrorCode) : 'generic');
  }
  return data as T;
}

export const fetchPanelRegistrations = (token: string, slug: string) => request<PanelRegistrations>('GET', 'registrations', token, slug);
export const fetchPanelPapers = (token: string, slug: string) => request<PanelPapers>('GET', 'submissions', token, slug);
export const fetchPanelMembers = (token: string, slug: string) => request<PanelMembers>('GET', 'members', token, slug);
export const fetchPanelRequests = (token: string, slug: string) => request<{ requests: PanelRequest[] }>('GET', 'link-requests', token, slug);

export const createPanelRegistration = (token: string, slug: string, input: Record<string, unknown>) =>
  request<unknown>('POST', 'registration-create', token, slug, input);
export const setRegistrationStatus = (token: string, slug: string, id: string, status: ManualStatus | null, reason: string) =>
  request<unknown>('POST', 'registration-status', token, slug, { id, status, reason });
export const deleteRegistration = (token: string, slug: string, id: string, reason: string, confirmPaid: boolean) =>
  request<unknown>('POST', 'registration-delete', token, slug, { id, reason, confirmPaid });
export const restoreRegistration = (token: string, slug: string, id: string) =>
  request<unknown>('POST', 'registration-restore', token, slug, { id });
/** One payment reminder, sent on the spot (#225). */
export const remindRegistration = (token: string, slug: string, id: string) =>
  request<{ outcome: 'sent' | 'queued' | 'skipped' | 'failed' }>('POST', 'remind', token, slug, { id });
/** A reminder to each of these registrations that still owes the fee; the background job sends them. */
export const remindRegistrations = (token: string, slug: string, ids: string[]) =>
  request<{ queued: number; already: number }>('POST', 'remind', token, slug, { ids });
export const addMember = (token: string, slug: string, email: string, role: MemberRole) =>
  request<{ invited: boolean }>('POST', 'member-add', token, slug, { email, role });
export const removeMember = (token: string, slug: string, email: string, role: MemberRole) =>
  request<unknown>('POST', 'member-remove', token, slug, { email, role });
export const closeSubmissions = (token: string, slug: string) => request<unknown>('POST', 'submissions-close', token, slug, {});
export const reopenSubmissions = (token: string, slug: string) => request<unknown>('POST', 'submissions-reopen', token, slug, {});
export const assignReviewer = (token: string, slug: string, submissionId: string, userId: string) =>
  request<{ already?: boolean }>('POST', 'reviewer-assign', token, slug, { submissionId, userId });
export const unassignReviewer = (token: string, slug: string, submissionId: string, userId: string) =>
  request<unknown>('POST', 'reviewer-unassign', token, slug, { submissionId, userId });
export const decideRequest = (token: string, slug: string, id: string, approve: boolean) =>
  request<unknown>('POST', 'link-decide', token, slug, { id, approve });

export type Audience = 'all' | 'registered' | 'authors' | 'reviewers' | 'organisers';
export const AUDIENCES: Audience[] = ['all', 'registered', 'authors', 'reviewers', 'organisers'];

export interface SentAnnouncement {
  id: string;
  audience: Audience;
  subject: string;
  body: string;
  recipients: number;
  senderName: string;
  createdAt: string;
}

export const fetchAudiences = (token: string, slug: string) =>
  request<{ counts: Record<Audience, number> }>('GET', 'audiences', token, slug);
export const fetchAnnouncements = (token: string, slug: string) =>
  request<{ announcements: SentAnnouncement[] }>('GET', 'announcements', token, slug);
export const sendAnnouncement = (token: string, slug: string, audience: Audience, subject: string, body: string) =>
  request<{ recipients: number; sentNow: number; waiting: number }>('POST', 'announce', token, slug, { audience, subject, body });

/** A spreadsheet of what is on screen. Values that start like a formula are neutralised. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (value: string | number | null | undefined) => {
    let text = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  // The byte-order mark makes Excel read the accents right.
  return `${String.fromCharCode(0xfeff)}${rows.map((row) => row.map(cell).join(';')).join('\r\n')}`;
}

/** An administrator corrects someone's name and institution (#269). */
export const updateAccount = (
  token: string,
  slug: string,
  userId: string,
  data: { fullName: string; institution: string; email?: string; cpf?: string },
) =>
  request<{ ok: true; changed: boolean }>('POST', 'account-update', token, slug, { userId, ...data });
/** Sends the person the e-mail to choose a new password (#270). */
export const sendPasswordLink = (token: string, slug: string, userId: string) =>
  request<{ ok: true; queued: boolean }>('POST', 'account-password-link', token, slug, { userId });
/** The owner sets someone's password (#272). */
export const setAccountPassword = (token: string, slug: string, userId: string, password: string) =>
  request<{ ok: true }>('POST', 'account-password-set', token, slug, { userId, password });
