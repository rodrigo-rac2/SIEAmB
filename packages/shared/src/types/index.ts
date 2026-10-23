export type Locale = 'pt-BR' | 'en' | 'es' | 'zh-CN';

/** Translations of one piece of content. pt-BR is the source language and is always present. */
export type LocalizedMap = { 'pt-BR': string } & Partial<Record<Locale, string>>;

/**
 * Content text that may carry translations. A plain string is pt-BR only (legacy data);
 * a map gives one string per locale. Resolve with `localize()` from utils.
 * Stored as a jsonb column once content moves to the database.
 */
export type LocalizedText = string | LocalizedMap;

export type ParticipantCategory =
  | 'ESTUDANTE_GRADUACAO'
  | 'ESTUDANTE_POS'
  | 'PROFESSOR'
  | 'PROFISSIONAL'
  | 'COMUNIDADE_UFCG';

export type Modality = 'PRESENCIAL' | 'ONLINE';

export type RegistrationStatus =
  | 'PENDING_PAYMENT'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'AWAITING_EMPENHO';

export type NewsStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

/**
 * Per-edition visual theme. Each field overrides the corresponding CSS token
 * for every page of that edition; omitted fields fall back to the defaults in
 * tokens.css. Archived editions keep their palette forever.
 */
export interface EventTheme {
  primary?: string;
  primaryDark?: string;
  primaryLight?: string;
  accent?: string;
  accentLight?: string;
  headingFont?: string;
  bodyFont?: string;
}

export interface EventSummary {
  id: string;
  slug: string;
  /** Old URL slugs of this edition (e.g. before the event year moved); the app redirects them to `slug`. */
  legacySlugs: string[];
  name: string;
  fullName: string;
  edition: number;
  startsAt: string; // ISO
  endsAt: string; // ISO
  /** Presentation text of this edition (markdown). Shown on the About page under the general text. */
  aboutMd: LocalizedText | null;
  venue: LocalizedText | null;
  /** True for remote editions: the venue page shows the streaming link instead of an address. */
  isOnline: boolean;
  /** Where the venue text points: streaming channel for online editions, map link otherwise. */
  venueUrl: string | null;
  isCurrent: boolean;
  isArchived: boolean;
  heroImageUrl: string | null;
  /** Event logo. Relative paths resolve against the site base URL; absolute URLs pass through. */
  logoUrl: string | null;
  /** Horizontal logo + full name lockup, used as the hero title art when present. */
  lockupUrl: string | null;
  theme: EventTheme | null;
  settings: EventSettings;
}

export interface EventSettings {
  registrationOpen?: boolean;
  submissionsOpen?: boolean;
  showProgram?: boolean;
}

export interface ImportantDate {
  id: string;
  eventId: string;
  label: LocalizedText;
  date: string; // ISO
  isExtended: boolean;
  /** The committee only fixed the month: show \"dezembro de 2026\" instead of a day. */
  monthOnly?: boolean;
  sortOrder: number;
}

export interface ThematicArea {
  id: string;
  eventId: string;
  code: string;
  name: LocalizedText;
  description: LocalizedText | null;
  sortOrder: number;
}

/** Site-wide content that does not belong to one edition. */
export interface SiteContent {
  /** General presentation of the SIEAmB (markdown, pt-BR). */
  aboutMd: LocalizedText;
}

/** The founders of the seminar: a fixed group shown on every edition. */
export interface Founder {
  id: string;
  name: string;
  /** Short line under the name, e.g. institution or position. */
  affiliation: LocalizedText | null;
  bioMd: LocalizedText;
  photoUrl: string | null;
  lattesUrl: string | null;
  orcidUrl: string | null;
  sortOrder: number;
}

/** One person in one group of one edition. The same person can appear in several groups. */
export interface CommitteeMember {
  id: string;
  eventId: string;
  name: string;
  /** Group label shown as the section heading, e.g. "Comitê Científico". Grouping keys on the pt-BR text. */
  role: LocalizedText;
  /** Flagged members get the coordination badge inside their group. */
  isCoordinator: boolean;
  institution: string | null;
  bioMd: LocalizedText | null;
  photoUrl: string | null;
  lattesUrl: string | null;
  orcidUrl: string | null;
  sortOrder: number;
}

export interface Sponsor {
  id: string;
  eventId: string;
  name: string;
  tier: 'realizacao' | 'patrocinio' | 'apoio';
  logoUrl: string;
  website: string | null;
  sortOrder: number;
}

export interface NewsItem {
  id: string;
  eventId: string;
  slug: string;
  title: LocalizedText;
  excerpt: LocalizedText | null;
  bodyMd: LocalizedText;
  coverImageUrl: string | null;
  status: NewsStatus;
  isPinned: boolean;
  publishedAt: string | null; // ISO
}

export interface FeeTier {
  id: string;
  eventId: string;
  category: ParticipantCategory;
  modality: Modality;
  label: LocalizedText;
  amountCents: number;
  validFrom: string; // ISO
  validUntil: string; // ISO
}

/** A published proceedings item of an edition: full anais PDF, per-track file, or external link. */
export interface AnaisEntry {
  id: string;
  eventId: string;
  title: string;
  url: string;
  sortOrder: number;
}

/** A downloadable file attached to an edital: the official PDF, a paper template, a slide template or an external link. */
export interface EditalAttachment {
  label: LocalizedText;
  url: string;
  format: 'pdf' | 'docx' | 'pptx' | 'link';
}

/** A call (edital) of an edition, published as an HTML page with its official files. */
export interface Edital {
  id: string;
  eventId: string;
  slug: string;
  title: LocalizedText;
  summary: LocalizedText | null;
  /** Official text. Editais are legal documents, so the body is usually pt-BR only. */
  bodyMd: LocalizedText;
  attachments: EditalAttachment[];
  publishedAt: string; // ISO
  sortOrder: number;
}

export interface RegistrationInput {
  fullName: string;
  email: string;
  cpf?: string;
  passport?: string;
  country: string;
  institution?: string;
  category: ParticipantCategory;
  modality: Modality;
  password: string;
}

export interface Registration {
  id: string;
  eventId: string;
  userId: string;
  category: ParticipantCategory;
  modality: Modality;
  status: RegistrationStatus;
  createdAt: string; // ISO
}
