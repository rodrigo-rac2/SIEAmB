/**
 * Sample data for the team's test on dev (#225): registrations in every payment
 * situation, a few papers, and two real orders opened at the Mercado Pago TEST
 * account, so the organisers' panel can be judged with something to look at.
 *
 *   SUPABASE_DEV_URL=… SUPABASE_DEV_SERVICE_ROLE_KEY=… npm run seed:demo -w @sieamb/e2e
 *
 * Safe to run again: it first removes what it created before. Everything it makes
 * uses addresses at example.com, which the site never e-mails, and carries
 * "(demonstração)" in the institution. It refuses to run against anything but the
 * dev database.
 */
import { PDFDocument, StandardFonts } from 'pdf-lib';

const URL_ = process.env.SUPABASE_DEV_URL?.replace(/\/+$/, '');
const KEY = process.env.SUPABASE_DEV_SERVICE_ROLE_KEY;
const DEV_REF = process.env.SUPABASE_DEV_PROJECT_REF;
const SITE = (process.env.DEMO_SITE_URL ?? 'https://dev.sieamb.org').replace(/\/+$/, '');
const BYPASS = process.env.E2E_BYPASS_TOKEN;
const EVENT = '2027';
const DOMAIN = 'example.com';
const TAG = '(demonstração)';

if (!URL_ || !KEY) throw new Error('Set SUPABASE_DEV_URL and SUPABASE_DEV_SERVICE_ROLE_KEY.');
// The one database this may write to. The production project has another address.
if (!DEV_REF || !URL_.includes(DEV_REF)) throw new Error('Refusing to run: the URL is not the dev project (SUPABASE_DEV_PROJECT_REF).');
if (process.env.SUPABASE_PROD_URL && URL_ === process.env.SUPABASE_PROD_URL.replace(/\/+$/, '')) {
  throw new Error('Refusing to run against production.');
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${URL_}${path}`, {
    ...init,
    headers: {
      apikey: KEY!,
      Authorization: `Bearer ${KEY!}`,
      ...(typeof init.body === 'string' ? { 'content-type': 'application/json', Prefer: 'return=representation' } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${response.status} ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : null) as T;
}

/** A CPF with valid check digits, the same for the same seed, so reruns do not change the data. */
function cpf(seed: number): string {
  const digits = String(100000000 + ((seed * 7919) % 899999999)).split('').map(Number);
  const check = (base: number[]) => {
    const rest = (base.reduce((acc, d, i) => acc + d * (base.length + 1 - i), 0) * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  const d1 = check(digits);
  return [...digits, d1, check([...digits, d1])].join('');
}

const daysAgo = (days: number, hour = 14) => {
  const date = new Date(Date.now() - days * 86_400_000);
  date.setUTCHours(hour, 12, 0, 0);
  return date.toISOString();
};

type Category = 'ESTUDANTE_GRADUACAO' | 'ESTUDANTE_POS' | 'PROFISSIONAL';
const FEE: Record<Category, { ref: string; cents: number }> = {
  ESTUDANTE_GRADUACAO: { ref: 'f1', cents: 3000 },
  ESTUDANTE_POS: { ref: 'f2', cents: 5000 },
  PROFISSIONAL: { ref: 'f3', cents: 7000 },
};

interface Person {
  key: string;
  name: string;
  institution: string;
  category: Category;
  days: number;
  /** What the payments table should say; nothing for someone who never started a payment. */
  payment?: { status: 'APPROVED' | 'PENDING' | 'CREATED'; mpStatus: string; detail: string; method: 'cartão' | 'boleto' };
  manual?: { status: 'CONFIRMED' | 'EXEMPT' | 'CANCELLED'; reason: string };
  deleted?: string;
  /** Open a real order at the Mercado Pago test account for this one. */
  sandboxOrder?: boolean;
  /** Has an account, so they can be the main author of a paper. */
  account?: boolean;
}

const PEOPLE: Person[] = [
  { key: 'helena', name: 'Helena Barbosa de Queiroz', institution: 'UFCG', category: 'ESTUDANTE_POS', days: 20, account: true, payment: { status: 'APPROVED', mpStatus: 'processed', detail: 'accredited', method: 'cartão' } },
  { key: 'tiago', name: 'Tiago Medeiros Vasconcelos', institution: 'UFPB', category: 'ESTUDANTE_GRADUACAO', days: 18, payment: { status: 'APPROVED', mpStatus: 'processed', detail: 'accredited', method: 'boleto' } },
  { key: 'luana', name: 'Luana Ferreira Pontes', institution: 'UFRN', category: 'PROFISSIONAL', days: 15, account: true, payment: { status: 'APPROVED', mpStatus: 'processed', detail: 'accredited', method: 'cartão' } },
  { key: 'rafael', name: 'Rafael Antunes Sobreira', institution: 'UEPB', category: 'ESTUDANTE_POS', days: 12, payment: { status: 'APPROVED', mpStatus: 'processed', detail: 'accredited', method: 'cartão' } },
  { key: 'beatriz', name: 'Beatriz Lacerda Moura', institution: 'UFPE', category: 'ESTUDANTE_POS', days: 9, payment: { status: 'APPROVED', mpStatus: 'processed', detail: 'accredited', method: 'boleto' } },
  { key: 'caio', name: 'Caio Henrique Dantas', institution: 'UFCG', category: 'ESTUDANTE_GRADUACAO', days: 6, payment: { status: 'PENDING', mpStatus: 'action_required', detail: 'waiting_payment', method: 'boleto' } },
  { key: 'marina', name: 'Marina Figueiredo Sales', institution: 'IFPB', category: 'ESTUDANTE_POS', days: 4, payment: { status: 'PENDING', mpStatus: 'action_required', detail: 'waiting_payment', method: 'boleto' } },
  { key: 'otavio', name: 'Otávio Guimarães Leal', institution: 'UFC', category: 'PROFISSIONAL', days: 2, payment: { status: 'PENDING', mpStatus: 'in_review', detail: 'pending_review_manual', method: 'cartão' } },
  { key: 'sofia', name: 'Sofia Nóbrega Tavares', institution: 'UFCG', category: 'ESTUDANTE_POS', days: 14, account: true, sandboxOrder: true },
  { key: 'diego', name: 'Diego Cavalcanti Rolim', institution: 'UFAL', category: 'ESTUDANTE_GRADUACAO', days: 8, sandboxOrder: true },
  { key: 'isabela', name: 'Isabela Trindade Maia', institution: 'UFS', category: 'ESTUDANTE_POS', days: 3 },
  { key: 'gustavo', name: 'Gustavo Pimentel Aragão', institution: 'UFBA', category: 'PROFISSIONAL', days: 5, payment: { status: 'CREATED', mpStatus: 'action_required', detail: 'waiting_retry', method: 'cartão' } },
  { key: 'vera', name: 'Vera Lúcia Sarmento', institution: 'UFRJ', category: 'PROFISSIONAL', days: 16, manual: { status: 'EXEMPT', reason: 'Palestrante convidada' } },
  { key: 'paulo', name: 'Paulo Roberto Gadelha', institution: 'UFCG', category: 'ESTUDANTE_POS', days: 11, manual: { status: 'CONFIRMED', reason: 'Pagou por transferência à empresa júnior' } },
  { key: 'renata', name: 'Renata Coutinho Alves', institution: 'UFMA', category: 'ESTUDANTE_GRADUACAO', days: 13, manual: { status: 'CANCELLED', reason: 'Pediu o cancelamento' } },
  { key: 'duplicado', name: 'Tiago Medeiros Vasconcelos', institution: 'UFPB', category: 'ESTUDANTE_GRADUACAO', days: 17, deleted: 'Inscrição duplicada' },
];

const email = (key: string) => `demo.${key}@${DOMAIN}`;

interface Paper {
  main: string;
  coauthors: { name: string; email: string }[];
  title: string;
  titleEn: string;
  modality: 'ARTIGO' | 'RESUMO_EXPANDIDO';
  area: string;
  pages: number;
  days: number;
  withdrawn?: boolean;
}

const PAPERS: Paper[] = [
  { main: 'helena', coauthors: [{ name: 'Rafael Antunes Sobreira', email: email('rafael') }], title: 'Governança da água em municípios do semiárido paraibano', titleEn: 'Water governance in municipalities of the semi-arid region of Paraíba', modality: 'ARTIGO', area: 'a1', pages: 13, days: 10 },
  { main: 'helena', coauthors: [], title: 'Indicadores de justiça climática para pequenos municípios', titleEn: 'Climate justice indicators for small municipalities', modality: 'RESUMO_EXPANDIDO', area: 'a2', pages: 5, days: 7 },
  { main: 'luana', coauthors: [{ name: 'Érica Monteiro Paz', email: `demo.erica@${DOMAIN}` }, { name: 'Sofia Nóbrega Tavares', email: email('sofia') }], title: 'Sensoriamento remoto e inteligência artificial no monitoramento da caatinga', titleEn: 'Remote sensing and artificial intelligence for monitoring the caatinga', modality: 'ARTIGO', area: 'a5', pages: 15, days: 6 },
  { main: 'sofia', coauthors: [], title: 'Educação ambiental em escolas do campo: um relato de experiência', titleEn: 'Environmental education in rural schools: an experience report', modality: 'RESUMO_EXPANDIDO', area: 'a7', pages: 4, days: 3 },
  { main: 'sofia', coauthors: [{ name: 'Diego Cavalcanti Rolim', email: email('diego') }], title: 'Resíduos sólidos e saúde pública em cidades médias', titleEn: 'Solid waste and public health in mid-sized cities', modality: 'RESUMO_EXPANDIDO', area: 'a6', pages: 6, days: 2, withdrawn: true },
];

async function pdf(title: string, pages: number): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i += 1) {
    const page = document.addPage([595, 842]);
    // Plain ASCII only: the standard font has no accents.
    page.drawText(`Arquivo de demonstracao - pagina ${i} de ${pages}`, { x: 60, y: 780, size: 14, font });
    page.drawText(title.normalize('NFD').replace(/[^\x20-\x7e]/g, '').slice(0, 80), { x: 60, y: 750, size: 11, font });
  }
  return document.save();
}

async function clean(): Promise<void> {
  const like = encodeURIComponent(`demo.*@${DOMAIN}`);
  const users = await api<{ id: string }[]>(`/rest/v1/users?email=like.${like}&select=id`);
  for (const user of users) {
    const papers = await api<{ file_path: string }[]>(`/rest/v1/submissions?user_id=eq.${user.id}&select=file_path`);
    if (papers.length) {
      await api('/storage/v1/object/submissions', { method: 'DELETE', body: JSON.stringify({ prefixes: papers.map((p) => p.file_path) }) }).catch(() => undefined);
    }
    await api(`/rest/v1/submissions?user_id=eq.${user.id}`, { method: 'DELETE' });
  }
  const registrations = await api<{ id: string }[]>(`/rest/v1/pre_registrations?email=like.${like}&select=id`);
  if (registrations.length) {
    const ids = registrations.map((r) => r.id).join(',');
    await api(`/rest/v1/payments?pre_registration_id=in.(${ids})`, { method: 'DELETE' });
    await api(`/rest/v1/pre_registrations?id=in.(${ids})`, { method: 'DELETE' });
  }
  for (const user of users) {
    await api(`/auth/v1/admin/users/${user.id}`, { method: 'DELETE' }).catch(() => undefined);
    await api(`/rest/v1/users?id=eq.${user.id}`, { method: 'DELETE' });
  }
  await api(`/rest/v1/outbox_emails?to_email=like.${like}`, { method: 'DELETE' });
}

async function main(): Promise<void> {
  const event = (await api<{ id: string }[]>(`/rest/v1/events?slug=eq.${EVENT}&select=id`))[0];
  if (!event) throw new Error(`No event ${EVENT} in this database.`);
  await clean();

  // Accounts for the people who will be main authors.
  const accounts = new Map<string, string>();
  for (const person of PEOPLE.filter((p) => p.account)) {
    const user = await api<{ id: string }>('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email: email(person.key),
        password: crypto.randomUUID() + crypto.randomUUID(),
        email_confirm: true,
        user_metadata: { full_name: person.name },
      }),
    });
    accounts.set(person.key, user.id);
  }

  let sandbox = 0;
  for (const [index, person] of PEOPLE.entries()) {
    const created = daysAgo(person.days);
    const [row] = await api<{ id: string; pay_token: string }[]>('/rest/v1/pre_registrations?select=id,pay_token', {
      method: 'POST',
      body: JSON.stringify({
        event_id: event.id,
        full_name: person.name,
        // The duplicate has its own address: one live registration per e-mail.
        email: email(person.key),
        cpf: cpf(person.key === 'duplicado' ? 2 : index + 1),
        country: 'BR',
        institution: `${person.institution} ${TAG}`,
        category: person.category,
        modality: 'ONLINE',
        locale: 'pt-BR',
        consent_at: created,
        created_at: created,
        user_id: accounts.get(person.key) ?? null,
        ...(person.manual
          ? { manual_status: person.manual.status, manual_reason: person.manual.reason, manual_at: daysAgo(person.days - 1) }
          : {}),
        ...(person.deleted ? { deleted_at: daysAgo(person.days - 1), deleted_reason: person.deleted } : {}),
      }),
    });
    if (person.payment) {
      const fee = FEE[person.category];
      const paid = person.payment.status === 'APPROVED';
      await api('/rest/v1/payments?select=id', {
        method: 'POST',
        body: JSON.stringify({
          event_id: event.id,
          pre_registration_id: row!.id,
          status: person.payment.status,
          amount_cents: fee.cents,
          fee_tier_ref: fee.ref,
          // Not an order that exists at Mercado Pago: sample data, marked as such.
          mp_order_id: `DEMO-${person.key.toUpperCase()}`,
          mp_status: person.payment.mpStatus,
          mp_status_detail: person.payment.detail,
          order_snapshot: { demo: true, method: person.payment.method },
          paid_at: paid ? daysAgo(person.days - 1, 16) : null,
          created_at: daysAgo(person.days, 15),
          updated_at: daysAgo(Math.max(person.days - 1, 0), 16),
        }),
      });
    }
    if (person.sandboxOrder) {
      // A real order at the Mercado Pago test account, opened the way the pay button opens it.
      const response = await fetch(`${SITE}/api/v1/payments/orders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(BYPASS ? { 'x-sieamb-e2e': BYPASS } : {}) },
        body: JSON.stringify({ token: row!.pay_token }),
      });
      if (response.ok) sandbox += 1;
      else console.warn(`Mercado Pago test order for ${person.key}: ${response.status} ${(await response.text()).slice(0, 120)}`);
    }
  }

  for (const paper of PAPERS) {
    const userId = accounts.get(paper.main)!;
    const main = PEOPLE.find((p) => p.key === paper.main)!;
    const path = `${EVENT}/${userId}/${crypto.randomUUID()}.pdf`;
    const bytes = await pdf(paper.title, paper.pages);
    const upload = await fetch(`${URL_}/storage/v1/object/submissions/${path}`, {
      method: 'POST',
      headers: { apikey: KEY!, Authorization: `Bearer ${KEY!}`, 'content-type': 'application/pdf' },
      body: new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: 'application/pdf' }),
    });
    if (!upload.ok) throw new Error(`upload ${path}: ${upload.status} ${(await upload.text()).slice(0, 120)}`);
    const sent = daysAgo(paper.days);
    const [row] = await api<{ id: string }[]>('/rest/v1/submissions?select=id', {
      method: 'POST',
      body: JSON.stringify({
        event_id: event.id,
        user_id: userId,
        title: paper.title,
        title_en: paper.titleEn,
        modality: paper.modality,
        area_ref: paper.area,
        abstract: `Resumo de demonstração do trabalho "${paper.title}", criado para o teste da área da organização. Não é um trabalho real.`,
        keywords: ['demonstração', 'teste'],
        keywords_en: ['demo'],
        file_path: path,
        file_name: `${paper.modality === 'ARTIGO' ? 'artigo' : 'resumo-expandido'}-demonstracao.pdf`,
        file_pages: paper.pages,
        created_at: sent,
        updated_at: sent,
        ...(paper.withdrawn ? { deleted_at: daysAgo(paper.days - 1), deleted_by: userId, deleted_reason: 'withdrawn by the main author' } : {}),
      }),
    });
    await api('/rest/v1/submission_authors?select=id', {
      method: 'POST',
      body: JSON.stringify([
        { submission_id: row!.id, position: 1, full_name: main.name, email: email(main.key) },
        ...paper.coauthors.map((c, i) => ({ submission_id: row!.id, position: i + 2, full_name: c.name, email: c.email })),
      ]),
    });
  }

  console.log(
    `Sample data on dev: ${PEOPLE.length} registrations (${PEOPLE.filter((p) => p.payment?.status === 'APPROVED').length} paid, ` +
      `${PEOPLE.filter((p) => p.payment?.status === 'PENDING').length} with a payment in progress, ${PEOPLE.filter((p) => p.manual).length} decided by hand, ` +
      `${PEOPLE.filter((p) => p.deleted).length} deleted), ${PAPERS.length} papers (${PAPERS.filter((p) => p.withdrawn).length} withdrawn), ` +
      `${sandbox} real orders opened at the Mercado Pago test account.`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
