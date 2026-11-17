import { q, type RestClient } from '../core/rest';
import type { Modality } from './rules';
import type {
  Author,
  FileStorage,
  Organiser,
  Person,
  Submission,
  SubmissionInput,
  SubmissionStatus,
  SubmissionStore,
} from './store';

interface Row {
  id: string;
  number: number;
  event_id: string;
  user_id: string;
  title: string;
  title_en: string;
  modality: Modality;
  area_ref: string;
  abstract: string;
  keywords: string[];
  keywords_en: string[];
  file_path: string;
  file_name: string;
  file_pages: number | null;
  status: SubmissionStatus;
  locale: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  submission_authors?: { position: number; full_name: string; email: string }[];
}

const COLUMNS =
  'id,number,event_id,user_id,title,title_en,modality,area_ref,abstract,keywords,keywords_en,file_path,file_name,file_pages,status,locale,created_at,updated_at,deleted_at';
const WITH_AUTHORS = `${COLUMNS},submission_authors(position,full_name,email)`;

const toSubmission = (row: Row): Submission => ({
  id: row.id,
  number: row.number,
  eventId: row.event_id,
  userId: row.user_id,
  title: row.title,
  titleEn: row.title_en,
  modality: row.modality,
  areaRef: row.area_ref,
  abstract: row.abstract,
  keywords: row.keywords,
  keywordsEn: row.keywords_en,
  filePath: row.file_path,
  fileName: row.file_name,
  filePages: row.file_pages,
  status: row.status,
  locale: row.locale,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
  authors: (row.submission_authors ?? [])
    .map((a) => ({ position: a.position, fullName: a.full_name, email: a.email }))
    .sort((a, b) => a.position - b.position),
});

const fields = (input: SubmissionInput) => ({
  title: input.title,
  title_en: input.titleEn,
  modality: input.modality,
  area_ref: input.areaRef,
  abstract: input.abstract,
  keywords: input.keywords,
  keywords_en: input.keywordsEn,
  file_path: input.filePath,
  file_name: input.fileName,
  file_pages: input.filePages,
  locale: input.locale,
});

export class SupabaseSubmissionStore implements SubmissionStore {
  constructor(private readonly rest: RestClient) {}

  async findEvent(slug: string) {
    const rows = await this.rest.request<{ id: string; slug: string; name: string }[]>(
      `events?slug=eq.${q(slug)}&select=id,slug,name&limit=1`,
    );
    return rows[0] ?? null;
  }

  async listByAuthorEmail(eventId: string, email: string): Promise<Submission[]> {
    const links = await this.rest.request<{ submission_id: string }[]>(
      `submission_authors?email=eq.${q(email.toLowerCase())}&select=submission_id&limit=200`,
    );
    if (links.length === 0) return [];
    const ids = [...new Set(links.map((l) => l.submission_id))].map(q).join(',');
    const rows = await this.rest.request<Row[]>(
      `submissions?id=in.(${ids})&event_id=eq.${q(eventId)}&deleted_at=is.null&select=${WITH_AUTHORS}&order=created_at.asc`,
    );
    return rows.map(toSubmission);
  }

  async findById(id: string): Promise<Submission | null> {
    const rows = await this.rest.request<Row[]>(
      `submissions?id=eq.${q(id)}&select=${WITH_AUTHORS}&limit=1`,
    );
    return rows[0] ? toSubmission(rows[0]) : null;
  }

  async searchPeople(eventId: string, query: string, limit: number): Promise<Person[]> {
    const rows = await this.rest.request<{ full_name: string; email: string; institution: string | null }[]>(
      'rpc/search_people',
      { method: 'POST', body: JSON.stringify({ p_event_id: eventId, p_query: query, p_limit: limit }) },
    );
    return rows.map((r) => ({ fullName: r.full_name, email: r.email, institution: r.institution }));
  }

  private async writeAuthors(submissionId: string, authors: Author[]): Promise<void> {
    await this.rest.request<unknown[]>('submission_authors?select=id', {
      method: 'POST',
      body: JSON.stringify(
        authors.map((a) => ({
          submission_id: submissionId,
          position: a.position,
          full_name: a.fullName,
          email: a.email,
        })),
      ),
    });
  }

  async insert(eventId: string, userId: string, input: SubmissionInput, now: Date): Promise<Submission> {
    const iso = now.toISOString();
    const rows = await this.rest.request<Row[]>(`submissions?select=${COLUMNS}`, {
      method: 'POST',
      body: JSON.stringify({
        ...fields(input),
        event_id: eventId,
        user_id: userId,
        created_at: iso,
        updated_at: iso,
      }),
    });
    const row = rows[0]!;
    try {
      await this.writeAuthors(row.id, input.authors);
    } catch (error) {
      // A paper without its authors must not exist: undo the first half.
      await this.rest
        .request<unknown>(`submissions?id=eq.${q(row.id)}`, { method: 'DELETE' })
        .catch(() => undefined);
      throw error;
    }
    return { ...toSubmission(row), authors: input.authors };
  }

  async update(id: string, input: SubmissionInput, now: Date): Promise<Submission> {
    const rows = await this.rest.request<Row[]>(
      `submissions?id=eq.${q(id)}&deleted_at=is.null&select=${COLUMNS}`,
      { method: 'PATCH', body: JSON.stringify({ ...fields(input), updated_at: now.toISOString() }) },
    );
    if (!rows[0]) throw new Error('submission_not_found');
    await this.rest.request<unknown>(`submission_authors?submission_id=eq.${q(id)}`, {
      method: 'DELETE',
    });
    await this.writeAuthors(id, input.authors);
    return { ...toSubmission(rows[0]), authors: input.authors };
  }

  async softDelete(id: string, userId: string, reason: string, now: Date): Promise<void> {
    await this.rest.request<unknown[]>(`submissions?id=eq.${q(id)}&deleted_at=is.null&select=id`, {
      method: 'PATCH',
      body: JSON.stringify({
        deleted_at: now.toISOString(),
        deleted_by: userId,
        deleted_reason: reason.slice(0, 200),
      }),
    });
  }

  async listOrganisers(eventId: string): Promise<Organiser[]> {
    const rows = await this.rest.request<
      { user: { id: string; email: string; full_name: string } | null }[]
    >(
      `event_members?event_id=eq.${q(eventId)}&role=in.(ADMIN,ORGANIZER)&select=user:users(id,email,full_name)`,
    );
    const seen = new Map<string, Organiser>();
    for (const { user } of rows) {
      if (user) seen.set(user.id, { userId: user.id, email: user.email, fullName: user.full_name });
    }
    return [...seen.values()];
  }

  async isOrganiser(eventId: string, userId: string): Promise<boolean> {
    // A platform administrator stands as an administrator in every edition.
    const users = await this.rest.request<{ is_platform_admin: boolean }[]>(
      `users?id=eq.${q(userId)}&select=is_platform_admin&limit=1`,
    );
    if (users[0]?.is_platform_admin) return true;
    const rows = await this.rest.request<{ id: string }[]>(
      `event_members?event_id=eq.${q(eventId)}&user_id=eq.${q(userId)}&role=in.(ADMIN,ORGANIZER)&select=id&limit=1`,
    );
    return rows.length > 0;
  }

  async findUsersByEmail(emails: string[]): Promise<{ id: string; email: string }[]> {
    if (emails.length === 0) return [];
    const list = emails.map((e) => `"${e.toLowerCase().replace(/["\\]/g, '')}"`).join(',');
    return this.rest.request<{ id: string; email: string }[]>(
      `users?email=in.(${q(list)})&select=id,email`,
    );
  }
}

export const BUCKET = 'submissions';

/** The papers live in a private Supabase Storage bucket; nothing in it has a public address. */
export class SupabaseFileStorage implements FileStorage {
  private ready: Promise<void> | null = null;

  constructor(
    private readonly rest: RestClient,
    private readonly maxBytes: number,
  ) {}

  private call(path: string, init: RequestInit = {}): Promise<Response> {
    return this.rest.fetchImpl(`${this.rest.origin}/storage/v1/${path}`, {
      ...init,
      headers: {
        apikey: this.rest.serviceRoleKey,
        Authorization: `Bearer ${this.rest.serviceRoleKey}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  }

  /** Creates the bucket the first time it is needed; "already exists" is the normal answer. */
  private ensureBucket(): Promise<void> {
    this.ready ??= (async () => {
      const response = await this.call('bucket', {
        method: 'POST',
        body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: this.maxBytes }),
      });
      if (response.ok) return;
      const text = await response.text();
      if (response.status === 409 || /already exists|Duplicate/i.test(text)) return;
      this.ready = null;
      throw new Error(`storage_bucket_failed: ${response.status}`);
    })();
    return this.ready;
  }

  /** The service answers with an unencoded address; only its token is taken from it. */
  private static tokenOf(address: string | undefined): string | null {
    const match = /[?&]token=([A-Za-z0-9._-]+)/.exec(address ?? '');
    return match ? match[1]! : null;
  }

  private static objectPath(path: string): string {
    return path.split('/').map(encodeURIComponent).join('/');
  }

  async createUploadUrl(path: string): Promise<string> {
    await this.ensureBucket();
    const response = await this.call(`object/upload/sign/${BUCKET}/${SupabaseFileStorage.objectPath(path)}`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const answer = (await response.json().catch(() => ({}))) as { url?: string };
    const token = SupabaseFileStorage.tokenOf(answer.url);
    if (!response.ok || !token) throw new Error(`storage_upload_url_failed: ${response.status}`);
    return `${this.rest.origin}/storage/v1/object/upload/sign/${BUCKET}/${SupabaseFileStorage.objectPath(path)}?token=${token}`;
  }

  async download(path: string): Promise<Uint8Array | null> {
    const response = await this.call(`object/${BUCKET}/${SupabaseFileStorage.objectPath(path)}`);
    if (response.status === 404 || response.status === 400) return null;
    if (!response.ok) throw new Error(`storage_download_failed: ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }

  async createDownloadUrl(path: string, fileName: string, seconds: number): Promise<string> {
    const response = await this.call(`object/sign/${BUCKET}/${SupabaseFileStorage.objectPath(path)}`, {
      method: 'POST',
      body: JSON.stringify({ expiresIn: seconds }),
    });
    const answer = (await response.json().catch(() => ({}))) as { signedURL?: string };
    const token = SupabaseFileStorage.tokenOf(answer.signedURL);
    if (!response.ok || !token) throw new Error(`storage_download_url_failed: ${response.status}`);
    return `${this.rest.origin}/storage/v1/object/sign/${BUCKET}/${SupabaseFileStorage.objectPath(path)}?token=${token}&download=${encodeURIComponent(fileName)}`;
  }
}
