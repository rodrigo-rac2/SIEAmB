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
    // The tab has loaded when the accounts are listed; the form of the previous tab is gone by then.
    await expect(page.getByTestId('account-row').first()).toBeVisible();
    await page.getByLabel('E-mail').fill(reviewerEmail);
    await page.getByTestId('invite-role').selectOption('REVIEWER');
    await page.getByRole('button', { name: 'Dar o papel', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Essa pessoa ainda não tem conta.');
    await expect(page.getByTestId('pending-invites')).toContainText(`${reviewerEmail} (Avaliador)`);

    // 5a. An administrator gives Organizador and Avaliador, never Administrador: that is the owner's (#268).
    await expect(page.getByTestId('invite-role').getByRole('option')).toHaveText(['Organizador', 'Avaliador']);
    await page.getByLabel('Buscar').fill(adminEmail);
    const own = page.getByTestId('account-row');
    await expect(own).toHaveCount(1);
    await expect(own.getByTestId('account-roles')).toContainText('Administrador');
    await expect(own.getByRole('button', { name: /Tirar o papel de Administrador/ })).toHaveCount(0);
    const asAdmin = { authorization: `Bearer ${await tokenOf(page)}` };
    const selfRemoval = await page.request.post('/api/v1/admin/member-remove', { headers: asAdmin, data: { eventSlug: EVENT, email: adminEmail, role: 'ADMIN' } });
    expect(selfRemoval.status()).toBe(409);
    expect(await selfRemoval.json()).toEqual({ error: 'cannot_remove_self' });
    const makeAdmin = await page.request.post('/api/v1/admin/member-add', { headers: asAdmin, data: { eventSlug: EVENT, email: reviewerEmail, role: 'ADMIN' } });
    expect(makeAdmin.status()).toBe(403);
    expect(await makeAdmin.json()).toEqual({ error: 'owner_only' });

    // 5b. A role on the line of the person, and off again (#268).
    const listedEmail = unique('pessoa');
    made.push(listedEmail);
    const personId = await createAccount(listedEmail, 'Pessoa Da Lista E2E');
    await page.reload();
    await page.getByLabel('Buscar').fill(listedEmail);
    const person = page.getByTestId('account-row');
    await expect(person).toHaveCount(1);
    await expect(person.getByTestId('account-roles')).toContainText('Sem papel');
    await person.getByRole('combobox', { name: 'Papel para Pessoa Da Lista E2E' }).selectOption('REVIEWER');
    await person.getByRole('button', { name: 'Dar o papel escolhido a Pessoa Da Lista E2E' }).click();
    await expect(person.getByTestId('account-roles')).toContainText('Avaliador');
    await person.getByRole('button', { name: 'Tirar o papel de Avaliador de Pessoa Da Lista E2E' }).click();
    await expect(person.getByTestId('account-roles')).toContainText('Sem papel');

    // 5c. The administrator corrects the person's name and institution; the e-mail is not on offer (#269).
    await person.getByRole('button', { name: 'Editar os dados de Pessoa Da Lista E2E' }).click();
    await expect(person.getByRole('textbox')).toHaveCount(2);
    await person.getByLabel('Nome completo').fill('Pessoa Corrigida E2E');
    await person.getByLabel('Instituição').fill('UFCG');
    await person.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('status')).toContainText('Dados atualizados.');
    await expect(person).toContainText('Pessoa Corrigida E2E');
    await expect(person).toContainText(`${listedEmail} · UFCG`);
    const stored = await admin<{ full_name: string; institution: string | null; email: string }[]>(`/rest/v1/users?id=eq.${personId}&select=full_name,institution,email`);
    expect(stored).toEqual([{ full_name: 'Pessoa Corrigida E2E', institution: 'UFCG', email: listedEmail }]);
    const told = await admin<{ kind: string }[]>(`/rest/v1/notifications?user_id=eq.${personId}&select=kind`);
    expect(told.map((n) => n.kind)).toContain('account.updated');

    // 5d. A new-password link goes to the person's own address, after one more click (#270).
    await person.getByRole('button', { name: 'Enviar link de nova senha a Pessoa Corrigida E2E' }).click();
    await expect(person).toContainText(`Enviar a ${listedEmail} um link para escolher uma nova senha?`);
    await person.getByRole('button', { name: 'Sim, enviar' }).click();
    await expect(page.getByRole('status')).toContainText(`Link enviado para ${listedEmail}.`);
    const queued = await admin<{ subject: string }[]>(`/rest/v1/outbox_emails?to_email=eq.${encodeURIComponent(listedEmail)}&select=subject`);
    expect(queued.map((q) => q.subject).filter((subject) => subject.startsWith('Escolha uma nova senha'))).toHaveLength(1);
    // E-mail, CPF and a typed password are the owner's alone (#272): ignored or refused for an administrator.
    await expect(person.getByRole('button', { name: /Definir a senha/ })).toHaveCount(0);
    const ignored = await page.request.post('/api/v1/admin/account-update', { headers: asAdmin, data: { eventSlug: EVENT, userId: personId, email: unique('tomada'), cpf: randomCpf() } });
    expect(await ignored.json()).toEqual({ ok: true, changed: false });
    const typed = await page.request.post('/api/v1/admin/account-password-set', { headers: asAdmin, data: { eventSlug: EVENT, userId: personId, password: 'e2e-senha-de-administradora' } });
    expect(typed.status()).toBe(403);
    expect(await admin<{ email: string; cpf: string | null }[]>(`/rest/v1/users?id=eq.${personId}&select=email,cpf`)).toEqual([{ email: listedEmail, cpf: null }]);
    // Not for another administrator: that one is the owner's to do.
    const otherAdmin = await admin<{ user_id: string }[]>(`/rest/v1/event_members?event_id=eq.${await eventId()}&role=eq.ADMIN&user_id=neq.${adminId}&select=user_id&limit=1`);
    if (otherAdmin[0]) {
      const refused = await page.request.post('/api/v1/admin/account-update', { headers: asAdmin, data: { eventSlug: EVENT, userId: otherAdmin[0].user_id, fullName: 'Nome Trocado E2E' } });
      expect(refused.status()).toBe(403);
    }

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
      'member.add',
      'member.remove',
      'account.update',
      'account.password_link',
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
    await page.getByTestId('account-menu').click();
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
    await expect(page.getByTestId('account-row').first()).toBeVisible();
    await expect(page.getByTestId('role-legend')).not.toContainText('Administrador:');
    await expect(page.getByTestId('invite-role').getByRole('option')).toHaveText(['Avaliador']);
    await expect(page.getByRole('button', { name: /Editar os dados|Enviar link de nova senha/ })).toHaveCount(0);
    await page.getByLabel('Buscar').fill(email);
    await expect(page.getByTestId('account-row')).toHaveCount(1);
    await expect(page.getByTestId('account-row').getByTestId('account-roles')).toContainText('Organizador');
    const people = await (await page.request.get(`/api/v1/admin/members?eventSlug=${EVENT}`, { headers })).json();
    expect(people.members.length).toBeGreaterThan(0);
    expect(people.members.filter((m: { role: string }) => m.role === 'ADMIN')).toEqual([]);
    expect(people.invites.filter((i: { role: string }) => i.role === 'ADMIN')).toEqual([]);
    // Nor in the list of every account, and nothing there is theirs to edit (#268).
    expect(people.accounts.length).toBeGreaterThan(0);
    expect(people.accounts.filter((a: { roles: string[]; owner: boolean; canEdit: boolean }) => a.roles.includes('ADMIN') || a.owner || a.canEdit)).toEqual([]);
    const someone = people.accounts.find((a: { email: string }) => a.email !== email)!;
    const edit = await page.request.post('/api/v1/admin/account-update', { headers, data: { eventSlug: EVENT, userId: someone.userId, fullName: 'Trocado Pela Organizadora' } });
    expect(edit.status()).toBe(403);
    const link = await page.request.post('/api/v1/admin/account-password-link', { headers, data: { eventSlug: EVENT, userId: someone.userId } });
    expect(link.status()).toBe(403);
  });

  test('the owner changes the e-mail, the CPF and the password of an account, and the person logs in with them (#272)', async ({ page, browser }) => {
    const ownerEmail = unique('dono');
    const oldEmail = unique('antes');
    const newEmail = unique('depois');
    made.push(ownerEmail, oldEmail, newEmail);
    const ownerId = await createAccount(ownerEmail, 'Dono E2E');
    await admin(`/rest/v1/users?id=eq.${ownerId}`, { method: 'PATCH', body: JSON.stringify({ is_platform_admin: true }) });
    const personId = await createAccount(oldEmail, 'Pessoa Do Dono E2E');
    const cpf = randomCpf();
    const newPassword = 'e2e-Outra-senha-2027-do-dono';

    // 1. The owner has no role row and still opens the panel, with the three roles to give.
    await logIn(page, ownerEmail);
    await page.goto(`/${EVENT}/painel/pessoas`);
    await expect(page.getByTestId('account-row').first()).toBeVisible();
    await expect(page.getByTestId('invite-role').getByRole('option')).toHaveText(['Administrador', 'Organizador', 'Avaliador']);
    await page.getByLabel('Buscar').fill(oldEmail);
    const person = page.getByTestId('account-row');
    await expect(person).toHaveCount(1);

    // 2. E-mail and CPF, which nobody else is offered.
    await person.getByRole('button', { name: 'Editar os dados de Pessoa Do Dono E2E' }).click();
    await person.getByLabel('E-mail').fill(newEmail);
    await person.getByLabel('CPF').fill(cpf);
    await person.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('status')).toContainText('Dados atualizados.');
    await page.getByLabel('Buscar').fill(newEmail);
    await expect(person).toHaveCount(1);
    await expect(person).toContainText(newEmail);
    const stored = await admin<{ email: string; cpf: string | null }[]>(`/rest/v1/users?id=eq.${personId}&select=email,cpf`);
    expect(stored).toEqual([{ email: newEmail, cpf: cpf.replace(/\D/g, '') }]);
    const login = await admin<{ email: string; email_confirmed_at: string | null }>(`/auth/v1/admin/users/${personId}`);
    expect(login.email).toBe(newEmail);
    expect(login.email_confirmed_at).not.toBeNull();

    // 3. A password typed by the owner, hidden while typed.
    await person.getByRole('button', { name: 'Definir a senha de Pessoa Do Dono E2E' }).click();
    const field = person.getByLabel('Nova senha de Pessoa Do Dono E2E');
    await expect(field).toHaveAttribute('type', 'password');
    await field.fill(newPassword);
    await person.getByRole('button', { name: 'Definir senha', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Senha de Pessoa Do Dono E2E definida.');

    // 4. The person logs in with the new address and the new password; the old ones no longer work.
    const personContext = await browser.newContext();
    const personPage = await personContext.newPage();
    const attempt = async (email: string, password: string) => {
      await personPage.goto(`/${EVENT}/conta/entrar`);
      await personPage.getByLabel('E-mail').fill(email);
      await personPage.getByLabel('Senha', { exact: true }).fill(password);
      await personPage.getByRole('button', { name: 'Entrar' }).click();
    };
    await attempt(oldEmail, PASSWORD);
    await expect(personPage.getByRole('alert')).toBeVisible();
    await attempt(newEmail, PASSWORD);
    await expect(personPage.getByRole('alert')).toBeVisible();
    await attempt(newEmail, newPassword);
    await expect(personPage).toHaveURL(new RegExp(`/${EVENT}/minha-area$`));
    await personContext.close();

    // 5. Taking the CPF off again, and what the trail kept: the fields, never the number or the password.
    await person.getByRole('button', { name: 'Editar os dados de Pessoa Do Dono E2E' }).click();
    await person.getByLabel('CPF').fill('');
    await person.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('status')).toContainText('Dados atualizados.');
    const cleared = await admin<{ cpf: string | null }[]>(`/rest/v1/users?id=eq.${personId}&select=cpf`);
    expect(cleared).toEqual([{ cpf: null }]);
    const trail = await admin<{ action: string; meta: Record<string, unknown> }[]>(`/rest/v1/audit_logs?actor_id=eq.${ownerId}&select=action,meta&order=created_at.asc`);
    expect(trail.map((a) => a.action)).toEqual(['account.update', 'account.password_set', 'account.update']);
    expect(JSON.stringify(trail)).not.toContain(cpf.replace(/\D/g, ''));
    expect(JSON.stringify(trail)).not.toContain(newPassword);
    await admin(`/rest/v1/audit_logs?actor_id=eq.${ownerId}`, { method: 'DELETE' }).catch(() => undefined);
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
