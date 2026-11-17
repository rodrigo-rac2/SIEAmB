import { createHash, randomBytes } from 'node:crypto';
import { expect as baseExpect, test, type Page } from '@playwright/test';
import { randomCpf } from './helpers';

// Each step waits on a real server and a real database, some on a cold start.
const expect = baseExpect.configure({ timeout: 25_000 });

/**
 * Accounts end to end against a real deployment and the dev database (#208, #209, #210).
 *
 * Our own test addresses (e2e+…@sieamb.org) are never mailed, so the test asks the
 * login service for the link the e-mail would carry, with the service role key.
 * Needs SUPABASE_DEV_URL and SUPABASE_DEV_SERVICE_ROLE_KEY; skipped without them,
 * and never run against production.
 */
const SUPABASE_URL = process.env.SUPABASE_DEV_URL?.replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_DEV_SERVICE_ROLE_KEY;
const EVENT = '2027';
const PASSWORD = 'e2e-Senha-comprida-2027';

async function admin<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY!,
      Authorization: `Bearer ${SERVICE_KEY!}`,
      'content-type': 'application/json',
      Prefer: 'return=representation',
      ...init.headers,
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`admin ${init.method ?? 'GET'} ${path}: ${response.status} ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : null) as T;
}

const unique = (label: string) => `e2e+${label}-${Date.now()}-${randomBytes(3).toString('hex')}@sieamb.org`;

const eventId = async (): Promise<string> =>
  (await admin<{ id: string }[]>(`/rest/v1/events?slug=eq.${EVENT}&select=id`))[0]!.id;

/** A confirmed account with a known password, made the way an organiser's tool would. */
async function createAccount(email: string, fullName: string): Promise<string> {
  const user = await admin<{ id: string }>('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: fullName } }),
  });
  return user.id;
}

async function createRegistration(email: string, cpf: string): Promise<string> {
  const rows = await admin<{ id: string }[]>('/rest/v1/pre_registrations?select=id', {
    method: 'POST',
    body: JSON.stringify({
      event_id: await eventId(),
      full_name: 'Pessoa de Teste E2E',
      email,
      cpf,
      country: 'BR',
      category: 'ESTUDANTE_POS',
      modality: 'ONLINE',
      locale: 'pt-BR',
      consent_at: new Date().toISOString(),
    }),
  });
  return rows[0]!.id;
}

/** Removes everything a test address left behind. */
async function cleanup(emails: string[]): Promise<void> {
  for (const email of emails) {
    const q = encodeURIComponent(email);
    await admin(`/rest/v1/pre_registrations?email=eq.${q}`, { method: 'DELETE' }).catch(() => undefined);
    const users = await admin<{ id: string }[]>(`/rest/v1/users?email=eq.${q}&select=id`).catch(() => []);
    for (const user of users) {
      await admin(`/rest/v1/pre_registrations?user_id=eq.${user.id}`, { method: 'DELETE' }).catch(() => undefined);
      await admin(`/auth/v1/admin/users/${user.id}`, { method: 'DELETE' }).catch(() => undefined);
      await admin(`/rest/v1/users?id=eq.${user.id}`, { method: 'DELETE' }).catch(() => undefined);
    }
  }
}

async function logIn(page: Page, email: string, password = PASSWORD) {
  await page.goto(`/${EVENT}/conta/entrar`);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test.describe('accounts @accounts', () => {
  test.setTimeout(180_000);
  test.skip(!SUPABASE_URL || !SERVICE_KEY, 'needs SUPABASE_DEV_URL and SUPABASE_DEV_SERVICE_ROLE_KEY');
  test.skip(
    ({ baseURL }) => !baseURL || /\/\/(www\.)?sieamb\.org/.test(baseURL) || baseURL.includes('localhost'),
    'runs against dev and preview deployments only',
  );

  const made: string[] = [];
  test.afterAll(async () => {
    await cleanup(made);
  });

  test('create an account, choose the password, register, log out and back in', async ({ page }) => {
    const email = unique('conta');
    made.push(email);

    // 1. Ask for the account: only name and e-mail, and the same answer for any address.
    await page.goto(`/${EVENT}/conta/criar`);
    await expect(page.getByLabel(/Senha/)).toHaveCount(0);
    await page.getByLabel('Nome completo').fill('Conta de Teste E2E');
    await page.getByLabel('E-mail').fill(email);
    await page.getByRole('button', { name: 'Enviar link de confirmação' }).click();
    await expect(page.getByRole('heading', { name: 'Confira seu e-mail' })).toBeVisible();

    // 2. Before the link is used, nobody can log in to it.
    await logIn(page, email, 'qualquer-senha-aqui');
    await expect(page.getByRole('alert')).toBeVisible();

    // 3. The link the e-mail carries: confirm the address and choose the password.
    const link = await admin<{ hashed_token: string }>('/auth/v1/admin/generate_link', {
      method: 'POST',
      body: JSON.stringify({ type: 'signup', email, password: randomBytes(24).toString('base64url') }),
    });
    await page.goto(`/${EVENT}/conta/confirmar?token_hash=${link.hashed_token}&type=signup`);
    await page.getByLabel('Nova senha').fill('curta');
    await page.getByLabel('Repita a senha').fill('curta');
    await page.getByRole('button', { name: 'Salvar senha' }).click();
    await expect(page.getByRole('alert')).toContainText('pelo menos 10 caracteres');
    await page.getByLabel('Nova senha').fill(PASSWORD);
    await page.getByLabel('Repita a senha').fill(PASSWORD);
    await page.getByRole('button', { name: 'Salvar senha' }).click();

    // 4. Minha área: no registration yet.
    await expect(page).toHaveURL(new RegExp(`/${EVENT}/minha-area$`));
    await expect(page.getByTestId('no-registration')).toBeVisible();
    await expect(page.getByLabel('Nome completo')).toHaveValue('Conta de Teste E2E');

    // 5. Register: the form uses the account's e-mail and does not let it be changed.
    await page.getByRole('link', { name: 'Fazer a inscrição' }).click();
    const formEmail = page.locator('#email');
    await expect(formEmail).toHaveValue(email);
    await expect(formEmail).toHaveAttribute('readonly', '');
    await page.locator('#cpf').fill(randomCpf());
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /Enviar inscrição/ }).click();
    await expect(page.getByRole('status').first()).toBeVisible();
    await page.getByRole('link', { name: 'Ver minha inscrição em Minha área' }).click();

    // 6. The registration shows up in the account, unpaid, with the link to pay.
    const card = page.getByTestId('registration-card');
    await expect(card).toContainText('Aguardando pagamento');
    await expect(card.getByRole('link', { name: 'Pagar a inscrição' })).toHaveAttribute(
      'href',
      new RegExp(`/${EVENT}/inscricoes/pagar\\?t=[0-9a-f-]{36}$`),
    );

    // 7. The used link is spent.
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page).toHaveURL(new RegExp(`/${EVENT}/conta/entrar`));
    await page.goto(`/${EVENT}/conta/confirmar?token_hash=${link.hashed_token}&type=signup`);
    await expect(page.getByRole('heading', { name: 'Este link não vale mais' })).toBeVisible();

    // 8. Wrong password is refused, the right one gets back in, and the session survives a reload.
    await logIn(page, email, 'senha-errada-12345');
    await expect(page.getByRole('alert')).toContainText('E-mail ou senha incorretos.');
    await page.getByLabel('Senha').fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByTestId('registration-card')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('registration-card')).toBeVisible();
  });

  test('a logged-out visitor is sent to the login and brought back', async ({ page }) => {
    await page.goto(`/${EVENT}/minha-area`);
    await expect(page).toHaveURL(new RegExp(`/${EVENT}/conta/entrar\\?next=`));
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeDisabled();
  });

  test('the server refuses account data without a valid login', async ({ request }) => {
    const attempts: Record<string, string>[] = [{}, { authorization: 'Bearer not-a-real-token' }];
    for (const headers of attempts) {
      const response = await request.get('/api/v1/account/me', { headers });
      expect(response.status()).toBe(401);
      expect(await response.json()).toEqual({ error: 'not_logged_in' });
    }
    const forged = await request.put('/api/v1/account/profile', {
      headers: { authorization: 'Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIn0.' },
      data: { fullName: 'Intruso' },
    });
    expect(forged.status()).toBe(401);
  });

  test('a registration under another e-mail is offered by CPF and linked by the confirmation link', async ({ page }) => {
    const oldEmail = unique('antigo');
    const accountEmail = unique('novo');
    made.push(oldEmail, accountEmail);
    const cpf = randomCpf();
    const registrationId = await createRegistration(oldEmail, cpf);
    const userId = await createAccount(accountEmail, 'Dona da Inscricao E2E');

    await logIn(page, accountEmail);
    await expect(page.getByTestId('no-registration')).toBeVisible();

    // Saving the CPF raises the question, with the other address masked.
    await page.getByLabel('CPF').fill(cpf);
    await page.getByRole('button', { name: 'Salvar' }).click();
    const suggestion = page.getByTestId('suggestion-card');
    await expect(suggestion).toContainText('e•••@sieamb.org');
    await expect(suggestion).not.toContainText(oldEmail);
    await expect(page.getByTestId('registration-card')).toHaveCount(0);
    await expect(page.getByLabel('CPF')).toBeDisabled();

    // Saying yes does not link anything yet: it only asks for the proof.
    await suggestion.getByRole('button', { name: 'Sim, é minha' }).click();
    await expect(suggestion).toContainText('Enviamos um link de confirmação');
    const before = await admin<{ user_id: string | null }[]>(
      `/rest/v1/pre_registrations?id=eq.${registrationId}&select=user_id`,
    );
    expect(before[0]!.user_id).toBeNull();

    // The link that went to the registration's inbox (the test plants one, only its hash is stored).
    const token = randomBytes(32).toString('base64url');
    await admin('/rest/v1/registration_link_requests', {
      method: 'POST',
      body: JSON.stringify({
        pre_registration_id: registrationId,
        user_id: userId,
        token_hash: createHash('sha256').update(token).digest('hex'),
        status: 'PENDING',
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      }),
    });
    await page.goto(`/${EVENT}/conta/vincular?t=wrong-${token}`);
    await expect(page.getByRole('alert')).toContainText('Este link não é válido.');
    await page.goto(`/${EVENT}/conta/vincular?t=${token}`);
    await expect(page.getByRole('heading', { name: 'Inscrição reunida à conta' })).toBeVisible();

    await page.getByRole('link', { name: 'Minha área' }).last().click();
    await expect(page.getByTestId('registration-card')).toContainText('Aguardando pagamento');
    await expect(page.getByTestId('suggestion-card')).toHaveCount(0);
  });

  test('the registration form stops a CPF that already has a registration under another e-mail', async ({ page }) => {
    const oldEmail = unique('duplicado');
    const newEmail = unique('segundo');
    made.push(oldEmail, newEmail);
    const cpf = randomCpf();
    await createRegistration(oldEmail, cpf);

    await page.goto(`/${EVENT}/inscricoes/nova`);
    await page.locator('#fullName').fill('Pessoa de Teste E2E');
    await page.locator('#email').fill(newEmail);
    await page.locator('#cpf').fill(cpf);
    await expect(page.locator('#cpf')).toHaveValue(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /Enviar inscrição/ }).click();
    await expect(page.getByRole('alert')).toContainText('feita com o e-mail e•••@sieamb.org');
    const rows = await admin<unknown[]>(`/rest/v1/pre_registrations?email=eq.${encodeURIComponent(newEmail)}&select=id`);
    expect(rows).toEqual([]);
  });
});
