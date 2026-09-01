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
  name: string;
  fullName: string;
  edition: number;
  startsAt: string; // ISO
  endsAt: string; // ISO
  venue: string | null;
  isCurrent: boolean;
  isArchived: boolean;
  heroImageUrl: string | null;
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

export interface CommitteeMember {
  id: string;
  eventId: string;
  name: string;
  role: string;
  institution: string | null;
  photoUrl: string | null;
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
