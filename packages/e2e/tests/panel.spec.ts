import { expect as baseExpect, test, type Page } from '@playwright/test';
import {
  EVENT,
  PASSWORD,
  SERVICE_KEY,
  SUPABASE_URL,
  admin,
  cleanupAccounts,
  createAccount,
  isTestDeployment,
  randomCpf,
  unique,
} from './helpers';

/**
 * The organisation area end to end against a real deployment and the dev
 * database (#219). Skipped without the dev credentials, never run on production.
 */
const expect = baseExpect.configure({ timeout: 30_000 });

const eventId = async (): Promise<string> =>
  (await admin<{ id: string }[]>(`/rest/v1/events?slug=eq.${EVENT}&select=id`))[0]!.id;

async function giveRole(userId: string, role: 'ADMIN' | 'ORGANIZER') {
  await admin('/rest/v1/event_members', {
    method: 'POST',
    body: JSON.stringify({ id: crypto.randomUUID(), event_id: await eventId(), user_id: userId, role }),
  });
}

async function register(email: string, fullName: string): Promise<string> {
  const rows = await admin<{ id: string }[]>('/rest/v1/pre_registrations?select=id', {
    method: 'POST',
    body: JSON.stringify({
      event_id: await eventId(),
      full_name: fullName,
      email,
      cpf: randomCpf(),
      country: 'BR',
      category: 'ESTUDANTE_POS',
      modality: 'ONLINE',
      locale: 'pt-BR',
      consent_at: new Date().toISOString(),
    }),
  });
  return rows[0]!.id;
}

async function logIn(page: Page, email: string) {
  await page.goto(`/${EVENT}/conta/entrar`);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(new RegExp(`/${EVENT}/minha-area$`));
}

const tokenOf = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('sieamb-auth')!).access_token as string);

test.describe('organisation panel @panel', () => {
  test.skip(!SUPABASE_URL || !SERVICE_KEY, 'needs SUPABASE_DEV_URL and SUPABASE_DEV_SERVICE_ROLE_KEY');
  test.skip(({ baseURL }) => !isTestDeployment(baseURL), 'runs against dev and preview deployments only');
  test.setTimeout(240_000);

  const made: string[] = [];
  test.afterAll(async () => {
    for (const email of made) {
      await admin(`/rest/v1/event_member_invites?email=eq.${encodeURIComponent(email)}`, { method: 'DELETE' }).catch(() => undefined);
    }
    await cleanupAccounts(made);
  });

  test('an administrator changes, deletes, restores and creates registrations, and gives a role', async ({ page }) => {
    const adminEmail = unique('admin');
    const personEmail = unique('inscrita');
    const manualEmail = unique('manual');
    const reviewerEmail = unique('avaliador');
    made.push(adminEmail, personEmail, manualEmail, reviewerEmail);
    const adminId = await createAccount(adminEmail, 'Administradora E2E');
    await giveRole(adminId, 'ADMIN');
    const personName = `Pessoa Inscrita E2E ${Date.now()}`;
    const registrationId = await register(personEmail, personName);

    // 1. Minha área offers the panel; the registration is listed as unpaid.
    await logIn(page, adminEmail);
    await page.getByTestId('panel-link').click();
    await expect(page).toHaveURL(new RegExp(`/${EVENT}/painel$`));
    await page.getByLabel('Buscar').fill(personName);
    const row = page.getByTestId('registration-row');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(personEmail);
    await expect(row).toContainText('Não paga');

    // 1b. A reminder at the click of a button (#225). Our test addresses are never mailed, so the
    // screen says it was not sent; the reminder is still owed once, and a second one today is refused.
    await expect(row).toContainText('nenhum');
    await row.getByRole('button', { name: 'Enviar lembrete' }).click();
    await expect(row.getByRole('status')).toContainText('Não enviado: este endereço não recebe e-mails');
    const owed = await admin<{ kind: string; dedupe_key: string; status: string }[]>(
      `/rest/v1/payment_emails?pre_registration_id=eq.${registrationId}&kind=eq.REMINDER&select=kind,dedupe_key,status`,
    );
    expect(owed).toHaveLength(1);
    expect(owed[0]!.dedupe_key).toMatch(new RegExp(`^manual:${registrationId}:\\d{4}-\\d{2}-\\d{2}$`));
    expect(owed[0]!.status).toBe('SKIPPED');
    const again = await page.request.post('/api/v1/admin/remind', {
      headers: { authorization: `Bearer ${await tokenOf(page)}` },
      data: { eventSlug: EVENT, id: registrationId },
    });
    expect(again.status()).toBe(409);
    expect(await again.json()).toEqual({ error: 'already_reminded' });

    // 2. A change without a reason is refused; with one, it is applied and shown.
    await row.getByRole('button', { name: 'Alterar situação' }).click();
    await row.getByRole('button', { name: 'Salvar' }).click();
    await expect(row.getByRole('alert')).toContainText('Escreva o motivo');
    await row.locator('form select').selectOption('EXEMPT');
    await row.getByLabel('Motivo').fill('palestrante convidada (teste E2E)');
    await row.getByRole('button', { name: 'Salvar' }).click();
    await expect(row).toContainText('Isenta');
    await expect(row).toContainText('Motivo: palestrante convidada (teste E2E)');
    // The payment is still shown as it is.
    await expect(row.locator('td').nth(2)).toContainText('Não paga');

    // Once exempt, there is nothing to remind about.
    await expect(row.getByRole('button', { name: 'Enviar lembrete' })).toHaveCount(0);

    // 3. Delete: hidden from the list, kept in the database, shown again on request, restored as it was.
    await row.getByRole('button', { name: 'Apagar' }).click();
    await row.getByLabel('Motivo').fill('apagada no teste E2E');
    await row.getByRole('button', { name: 'Apagar inscrição' }).click();
    await expect(page.getByTestId('registration-row')).toHaveCount(0);
    const kept = await admin<{ deleted_at: string | null; deleted_by: string | null; manual_status: string | null }[]>(
      `/rest/v1/pre_registrations?id=eq.${registrationId}&select=deleted_at,deleted_by,manual_status`,
    );
    expect(kept[0]).toMatchObject({ deleted_by: adminId, manual_status: 'EXEMPT' });
    expect(kept[0]!.deleted_at).not.toBeNull();
    await page.getByLabel(/Mostrar as apagadas/).check();
    await expect(row).toContainText('apagada no teste E2E');
    await row.getByRole('button', { name: 'Restaurar' }).click();
    await page.getByLabel(/Mostrar as apagadas/).uncheck();
    await expect(row).toContainText('Isenta');

    // 4. Register someone by hand.
    const manualName = `Cadastro Manual E2E ${Date.now()}`;
    await page.getByRole('button', { name: 'Cadastrar inscrição' }).click();
    const form = page.getByTestId('new-registration');
    await form.getByLabel('Nome completo').fill(manualName);
    await form.getByLabel('E-mail').fill(manualEmail);
    await form.getByLabel('CPF').fill(randomCpf());
    await form.getByLabel('Categoria').selectOption('PROFISSIONAL');
    await form.getByRole('button', { name: 'Cadastrar', exact: true }).click();
    await expect(form).toHaveCount(0);
    await page.getByLabel('Buscar').fill(manualName);
    await expect(row).toContainText('cadastrada pela organização');
    await expect(row).toContainText('Não paga');
    // The same e-mail again is refused.
    await page.getByRole('button', { name: 'Cadastrar inscrição' }).click();
    await form.getByLabel('Nome completo').fill(manualName);
    await form.getByLabel('E-mail').fill(manualEmail);
    await form.getByLabel('CPF').fill(randomCpf());
    await form.getByRole('button', { name: 'Cadastrar', exact: true }).click();
    await expect(form.getByRole('alert')).toContainText('Já existe uma inscrição com esse e-mail');

    // 5. A role for an address without an account waits for the account.
    await page.getByRole('link', { name: 'Pessoas e papéis' }).click();
    // The tab has loaded when its role lists are there; the form of the previous tab is gone by then.
    await expect(page.getByTestId('role-REVIEWER')).toBeVisible();
    await page.getByLabel('E-mail').fill(reviewerEmail);
    await page.getByLabel('Papel').selectOption('REVIEWER');
    await page.getByRole('button', { name: 'Dar o papel' }).click();
    await expect(page.getByRole('status')).toContainText('Essa pessoa ainda não tem conta.');
    await expect(page.getByTestId('role-REVIEWER')).toContainText(`${reviewerEmail} (ainda sem conta)`);
    // Removing one's own administrator role is refused.
    await page.getByTestId('role-ADMIN').getByRole('listitem').filter({ hasText: adminEmail }).getByRole('button', { name: 'Remover' }).click();
    await expect(page.getByRole('alert')).toContainText('Você não pode remover o seu próprio papel de administrador.');

    // 6. Every change left a line in the audit log, with who did it.
    const audit = await admin<{ action: string }[]>(`/rest/v1/audit_logs?actor_id=eq.${adminId}&select=action&order=created_at.asc`);
    expect(audit.map((a) => a.action)).toEqual([
      'registration.remind',
      'registration.remind',
      'registration.status',
      'registration.delete',
      'registration.restore',
      'registration.create',
      'member.add',
    ]);
    await admin(`/rest/v1/audit_logs?actor_id=eq.${adminId}`, { method: 'DELETE' }).catch(() => undefined);
  });

  test('a role given before the account exists applies on the first login', async ({ page }) => {
    const email = unique('convidada');
    made.push(email);
    await admin('/rest/v1/event_member_invites', {
      method: 'POST',
      body: JSON.stringify({ event_id: await eventId(), email, role: 'ORGANIZER' }),
    });
    await createAccount(email, 'Organizadora Convidada E2E');
    await logIn(page, email);
    await expect(page.getByTestId('panel-link')).toBeVisible();
    // The same door is in the top bar, on every page (#252).
    await expect(page.getByTestId('topbar-panel')).toHaveAttribute('href', `/${EVENT}/painel`);
    await page.getByTestId('topbar-panel').click();
    await expect(page.getByTestId('panel-counts')).toBeVisible();
    // An organiser sees the list and can do nothing to it.
    await expect(page.getByRole('button', { name: 'Cadastrar inscrição' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Alterar situação' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Pedidos' })).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('CPF ');
    const invites = await admin<unknown[]>(`/rest/v1/event_member_invites?email=eq.${encodeURIComponent(email)}&select=id`);
    expect(invites).toEqual([]);

    // The server refuses what the screen does not offer.
    const headers = { authorization: `Bearer ${await tokenOf(page)}` };
    const create = await page.request.post('/api/v1/admin/registration-create', {
      headers,
      data: { eventSlug: EVENT, fullName: 'Feita por organizadora', email: unique('nao'), cpf: randomCpf(), category: 'PROFISSIONAL' },
    });
    expect(create.status()).toBe(403);
    const promote = await page.request.post('/api/v1/admin/member-add', { headers, data: { eventSlug: EVENT, email, role: 'ADMIN' } });
    expect(promote.status()).toBe(403);
    const list = await (await page.request.get(`/api/v1/admin/registrations?eventSlug=${EVENT}`, { headers })).json();
    expect(JSON.stringify(list)).not.toMatch(/"cpf"/);

    // People and roles: an organiser manages reviewers and is not told who the administrators are (#264).
    await page.goto(`/${EVENT}/painel/pessoas`);
    await expect(page.getByTestId('role-REVIEWER')).toBeVisible();
    await expect(page.getByTestId('role-ORGANIZER')).toContainText(email);
    await expect(page.getByTestId('role-ADMIN')).toHaveCount(0);
    const people = await (await page.request.get(`/api/v1/admin/members?eventSlug=${EVENT}`, { headers })).json();
    expect(people.members.length).toBeGreaterThan(0);
    expect(people.members.filter((m: { role: string }) => m.role === 'ADMIN')).toEqual([]);
    expect(people.invites.filter((i: { role: string }) => i.role === 'ADMIN')).toEqual([]);
  });

  test('someone with no role finds no panel, in the site or in the server', async ({ page }) => {
    const email = unique('semcargo');
    made.push(email);
    await createAccount(email, 'Pessoa Sem Papel E2E');
    await logIn(page, email);
    await expect(page.getByLabel('Nome completo')).toBeVisible();
    await expect(page.getByTestId('panel-link')).toHaveCount(0);
    await page.goto(`/${EVENT}/painel`);
    await expect(page.getByRole('heading', { name: /não encontrada/i })).toBeVisible();
    const headers = { authorization: `Bearer ${await tokenOf(page)}` };
    for (const action of ['registrations', 'submissions', 'members', 'link-requests']) {
      const response = await page.request.get(`/api/v1/admin/${action}?eventSlug=${EVENT}`, { headers });
      expect(response.status(), action).toBe(404);
    }
    expect((await page.request.get(`/api/v1/admin/registrations?eventSlug=${EVENT}`)).status()).toBe(401);
  });
});
