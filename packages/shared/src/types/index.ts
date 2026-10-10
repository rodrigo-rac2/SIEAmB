export type Locale = 'pt-BR' | 'en' | 'es' | 'zh-CN';

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
  /** Presentation text of this edition (markdown, pt-BR). Shown on the About page under the general text. */
  aboutMd: string | null;
  venue: string | null;
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
  label: string;
  date: string; // ISO
  isExtended: boolean;
  sortOrder: number;
}

export interface ThematicArea {
  id: string;
  eventId: string;
  code: string;
  name: string;
  description: string | null;
  sortOrder: number;
}

/** Site-wide content that does not belong to one edition. */
export interface SiteContent {
  /** General presentation of the SIEAmB (markdown, pt-BR). */
  aboutMd: string;
}

/** The founders of the seminar: a fixed group shown on every edition. */
export interface Founder {
  id: string;
  name: string;
  /** Short line under the name, e.g. institution or position. */
  affiliation: string | null;
  bioMd: string;
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
  /** Group label shown as the section heading (pt-BR content), e.g. "Comitê Científico". */
  role: string;
  /** Flagged members get the coordination badge inside their group. */
  isCoordinator: boolean;
  institution: string | null;
  bioMd: string | null;
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
  title: string;
  excerpt: string | null;
  bodyMd: string;
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
  label: string;
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
