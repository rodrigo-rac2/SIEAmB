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
  unique,
} from './helpers';

/**
 * The bell and announcements end to end against a real deployment and the dev
 * database (#221). Skipped without the dev credentials, never run on production.
 */
const expect = baseExpect.configure({ timeout: 30_000 });

const eventId = async (): Promise<string> =>
  (await admin<{ id: string }[]>(`/rest/v1/events?slug=eq.${EVENT}&select=id`))[0]!.id;

async function giveRole(userId: string, role: 'ORGANIZER' | 'REVIEWER') {
  await admin('/rest/v1/event_members', {
    method: 'POST',
    body: JSON.stringify({ id: crypto.randomUUID(), event_id: await eventId(), user_id: userId, role }),
  });
}

async function logIn(page: Page, email: string) {
  await page.goto(`/${EVENT}/conta/entrar`);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(new RegExp(`/${EVENT}/minha-area$`));
}

test.describe('notifications and announcements @notifications', () => {
  test.skip(!SUPABASE_URL || !SERVICE_KEY, 'needs SUPABASE_DEV_URL and SUPABASE_DEV_SERVICE_ROLE_KEY');
  test.skip(({ baseURL }) => !isTestDeployment(baseURL), 'runs against dev and preview deployments only');
  test.setTimeout(240_000);

  const made: string[] = [];
  const senders: string[] = [];
  test.afterAll(async () => {
    for (const id of senders) {
      await admin(`/rest/v1/announcements?sender_id=eq.${id}`, { method: 'DELETE' }).catch(() => undefined);
      await admin(`/rest/v1/audit_logs?actor_id=eq.${id}`, { method: 'DELETE' }).catch(() => undefined);
    }
    for (const email of made) {
      await admin(`/rest/v1/outbox_emails?to_email=eq.${encodeURIComponent(email)}`, { method: 'DELETE' }).catch(() => undefined);
    }
    await cleanupAccounts(made);
  });

  test('an organiser sends an announcement to the reviewers, and a reviewer finds it under the bell', async ({ page, browser }) => {
    const organiserEmail = unique('organizadora');
    const reviewerEmail = unique('avaliadora');
    const outsiderEmail = unique('defora');
    made.push(organiserEmail, reviewerEmail, outsiderEmail);
    const organiserId = await createAccount(organiserEmail, 'Organizadora E2E');
    const reviewerId = await createAccount(reviewerEmail, 'Avaliadora E2E');
    const outsiderId = await createAccount(outsiderEmail, 'Pessoa de Fora E2E');
    senders.push(organiserId);
    await giveRole(organiserId, 'ORGANIZER');
    await giveRole(reviewerId, 'REVIEWER');
    const subject = `Comunicado de teste E2E ${Date.now()}`;

    // 1. The organiser writes it; the screen says how many people before anything is sent.
    await logIn(page, organiserEmail);
    await page.goto(`/${EVENT}/painel/comunicados`);
    await page.getByLabel('Quem recebe').selectOption('reviewers');
    await page.getByLabel('Assunto').fill(subject);
    await page.getByLabel('Mensagem').fill('Primeiro parágrafo do comunicado.\n\nSegundo parágrafo, com <b>marcação</b> que deve aparecer como texto.');
    await page.getByRole('button', { name: 'Revisar e enviar' }).click();
    await expect(page.getByRole('alert')).toContainText(/Este comunicado vai para \d+ pessoas? \(Só os avaliadores\)/);
    expect(await admin<unknown[]>(`/rest/v1/announcements?sender_id=eq.${organiserId}&select=id`)).toEqual([]);
    await page.getByRole('button', { name: /^Enviar para \d+ pessoas?$/ }).click();
    await expect(page.getByRole('status')).toContainText('Comunicado registrado para');

    // 2. The record: who sent it, to which group, to whom.
    const card = page.getByTestId('announcement-card').filter({ hasText: subject });
    await expect(card).toContainText('Organizadora E2E · Só os avaliadores');
    const [record] = await admin<{ id: string; audience: string; recipients: string[] }[]>(
      `/rest/v1/announcements?sender_id=eq.${organiserId}&select=id,audience,recipients`,
    );
    expect(record!.audience).toBe('reviewers');
    expect(record!.recipients).toContain(reviewerEmail);
    expect(record!.recipients).not.toContain(outsiderEmail);
    expect(record!.recipients).not.toContain(organiserEmail);
    // One e-mail owed to the reviewer, in the outbox, and none to the outsider.
    // Other runs may be announcing to the same group at this moment: look at this announcement only.
    const mine = encodeURIComponent(`announcement:${record!.id}:*`);
    const owed = await admin<{ subject: string }[]>(
      `/rest/v1/outbox_emails?to_email=eq.${encodeURIComponent(reviewerEmail)}&dedupe_key=like.${mine}&select=subject`,
    );
    expect(owed).toHaveLength(1);
    expect(owed[0]!.subject).toBe(`${subject} (II SIEAmB)`);
    expect(await admin<unknown[]>(`/rest/v1/outbox_emails?to_email=eq.${encodeURIComponent(outsiderEmail)}&dedupe_key=like.${mine}&select=id`)).toEqual([]);

    // 3. The reviewer, in another browser: the bell counts it, the page shows it as text, then the bell clears.
    const other = await browser.newContext();
    const reviewer = await other.newPage();
    await logIn(reviewer, reviewerEmail);
    const bell = reviewer.getByTestId('bell');
    // At least this one; a run in parallel may have announced to the reviewers too.
    await expect(bell).toHaveAttribute('aria-label', /^Notificações: \d+ não lidas?$/);
    await bell.click();
    const notice = reviewer.getByTestId('notification').filter({ hasText: subject });
    await expect(notice).toContainText('Primeiro parágrafo do comunicado.');
    await expect(notice).toContainText('<b>marcação</b>');
    await expect(notice.locator('b')).toHaveCount(0);
    await expect(notice).toContainText('nova');
    await reviewer.goto(`/${EVENT}/minha-area`);
    await expect(reviewer.getByTestId('bell')).toHaveAttribute('aria-label', 'Notificações');
    await reviewer.goto(`/${EVENT}/notificacoes`);
    await expect(reviewer.getByTestId('notification').filter({ hasText: subject })).not.toContainText('nova');
    // A reviewer has no panel.
    await reviewer.goto(`/${EVENT}/painel/comunicados`);
    await expect(reviewer.getByRole('heading', { name: /não encontrada/i })).toBeVisible();
    const reviewerToken = await reviewer.evaluate(() => JSON.parse(localStorage.getItem('sieamb-auth')!).access_token as string);
    const refused = await reviewer.request.post('/api/v1/admin/announce', {
      headers: { authorization: `Bearer ${reviewerToken}` },
      data: { eventSlug: EVENT, audience: 'all', subject: 'De quem não pode', body: 'Não deveria sair.' },
    });
    expect(refused.status()).toBe(404);
    await other.close();

    // 4. The outsider got nothing.
    const notices = await admin<unknown[]>(`/rest/v1/notifications?user_id=eq.${outsiderId}&select=id`);
    expect(notices).toEqual([]);
  });

  test('the bell is not there for a logged-out visitor, and the server keeps notices private', async ({ page, request }) => {
    await page.goto(`/${EVENT}/`);
    await expect(page.getByRole('link', { name: 'Entrar' })).toBeVisible();
    await expect(page.getByTestId('bell')).toHaveCount(0);
    expect((await request.get('/api/v1/account/notifications')).status()).toBe(401);
    expect((await request.post('/api/v1/account/notifications-read', { data: {} })).status()).toBe(401);
    await page.goto(`/${EVENT}/notificacoes`);
    await expect(page).toHaveURL(new RegExp(`/${EVENT}/conta/entrar\\?next=`));
  });
});
