import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect as baseExpect, test, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
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
  typedCpf,
  unique,
} from './helpers';

/**
 * A person is identified by a document, not by an e-mail address (ADR-010), end to end
 * against a real deployment and the dev database: the co-author who signs up and finds
 * the paper, the one whose document does not match, the document that already has an
 * account, and the account from before documents were asked for.
 */
const expect = baseExpect.configure({ timeout: 30_000 });

async function pdfFile(pages: number, name: string): Promise<string> {
  const document = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) document.addPage([595, 842]);
  const path = join(mkdtempSync(join(tmpdir(), 'sieamb-e2e-')), name);
  writeFileSync(path, await document.save());
  return path;
}

async function logIn(page: Page, email: string) {
  await page.goto(`/${EVENT}/conta/entrar`);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(new RegExp(`/${EVENT}/minha-area$`));
}

/** A random passport number: two letters and six digits, as many countries print them. */
const randomPassport = (): string => `E${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${String(Math.floor(Math.random() * 900000) + 100000)}`;

type Document = { cpf: string } | { passport: string; country: string; countryName: string };

async function typeDocument(page: Page, document: Document) {
  if ('cpf' in document) {
    await page.getByLabel('CPF').fill(document.cpf);
  } else {
    await page.getByLabel('Passaporte').fill(document.passport);
    await page.getByRole('combobox', { name: 'País do passaporte' }).selectOption({ label: document.countryName });
  }
}

/**
 * Asks for an account on the real form, then follows what the e-mail would carry: the
 * confirmation link, where the password is chosen and the document confirmed. Our test
 * addresses are never mailed, so the link is made through the login service.
 */
async function signUp(page: Page, who: { email: string; name: string; document: Document; next?: string }) {
  await page.goto(`/${EVENT}/conta/criar${who.next ? `?next=${encodeURIComponent(who.next)}` : ''}`);
  await page.getByLabel('Nome completo').fill(who.name);
  await page.getByLabel('E-mail').fill(who.email);
  await typeDocument(page, who.document);
  await page.getByRole('button', { name: 'Enviar link de confirmação' }).click();
  await expect(page.getByRole('heading', { name: 'Confira seu e-mail' })).toBeVisible();
  const link = await admin<{ hashed_token: string }>('/auth/v1/admin/generate_link', {
    method: 'POST',
    body: JSON.stringify({ type: 'signup', email: who.email, password: randomBytes(24).toString('base64url') }),
  });
  await page.goto(`/${EVENT}/conta/confirmar?token_hash=${link.hashed_token}&type=signup${who.next ? `&next=${encodeURIComponent(who.next)}` : ''}`);
  await expect(page.getByTestId('confirm-document')).toBeVisible();
  await page.getByLabel('Nova senha').fill(PASSWORD);
  await page.getByLabel('Repita a senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Salvar senha' }).click();
}

/** Sends a paper as whoever is logged in on `page`, with one co-author typed by hand. Returns the title. */
async function sendPaper(page: Page, coauthor: { name: string; email: string; document: Document }): Promise<string> {
  const title = `Trabalho de identidade E2E ${Date.now()}${Math.floor(Math.random() * 1000)}`;
  await page.goto(`/${EVENT}/meus-trabalhos/novo`);
  await expect(page.getByLabel('Nome do autor 1 (você)')).not.toHaveValue('');
  await page.getByLabel('Título em português').fill(title);
  await page.getByLabel('Título em inglês').fill('E2E identity paper');
  await page.getByLabel('Área temática').selectOption({ label: 'Saúde e Meio Ambiente' });
  await page.getByLabel('Resumo').fill('Resumo de um trabalho de teste, com mais de cinquenta caracteres para passar na conferência.');
  await page.getByLabel('Palavras-chave').fill('teste; identidade');
  await page.getByRole('button', { name: 'Adicionar autor' }).click();
  await page.getByLabel('Nome do autor 2').fill(coauthor.name);
  await page.getByLabel('E-mail do autor 2').fill(coauthor.email);
  if ('cpf' in coauthor.document) {
    await page.getByLabel('CPF do autor 2').fill(coauthor.document.cpf);
  } else {
    await page.getByLabel('Passaporte do autor 2').fill(coauthor.document.passport);
    await page.getByRole('combobox', { name: 'País do passaporte do autor 2' }).selectOption({ label: coauthor.document.countryName });
  }
  await page.getByLabel('Arquivo do trabalho').setInputFiles(await pdfFile(5, 'Identidade E2E.pdf'));
  await page.getByRole('button', { name: 'Enviar trabalho' }).click();
  await expect(page).toHaveURL(new RegExp(`/${EVENT}/meus-trabalhos$`));
  await expect(page.getByTestId('paper-card').filter({ hasText: title })).toBeVisible();
  return title;
}

test.describe('identity by document @identity', () => {
  test.skip(!SUPABASE_URL || !SERVICE_KEY, 'needs SUPABASE_DEV_URL and SUPABASE_DEV_SERVICE_ROLE_KEY');
  test.skip(({ baseURL }) => !isTestDeployment(baseURL), 'runs against dev and preview deployments only');
  test.setTimeout(240_000);

  const made: string[] = [];
  test.afterAll(async () => {
    await cleanupAccounts(made);
  });

  test('a co-author with no account signs up with the same e-mail and passport, and finds the paper', async ({ page, browser }) => {
    const senderEmail = unique('id-remetente');
    const coEmail = unique('id-coautora');
    made.push(senderEmail, coEmail);
    await createAccount(senderEmail, 'Remetente Identidade E2E');
    const passport = { passport: randomPassport(), country: 'PT', countryName: 'Portugal' };

    // 1. The sender lists her by e-mail and passport: typed with small letters and a dash, stored in one shape.
    await logIn(page, senderEmail);
    const typed = { ...passport, passport: `${passport.passport.slice(0, 2).toLowerCase()}-${passport.passport.slice(2)}` };
    const title = await sendPaper(page, { name: 'Coautora Estrangeira E2E', email: coEmail, document: typed });
    const lines = await admin<{ email: string; cpf: string | null; passport: string | null; country: string | null }[]>(
      `/rest/v1/submission_authors?email=eq.${encodeURIComponent(coEmail)}&select=email,cpf,passport,country`,
    );
    expect(lines).toEqual([{ email: coEmail, cpf: null, passport: passport.passport, country: 'PT' }]);
    // Nothing the sender is shown carries the passport.
    expect(await page.content()).not.toContain(passport.passport);

    // 2. She has no account yet: the paper waits. She signs up on her own browser with the same data,
    //    following the link of the notice, which leads on to Meus trabalhos.
    const hers = await browser.newContext();
    const coPage = await hers.newPage();
    await signUp(coPage, { email: coEmail, name: 'Coautora Estrangeira E2E', document: passport, next: `/${EVENT}/meus-trabalhos` });
    await expect(coPage).toHaveURL(new RegExp(`/${EVENT}/meus-trabalhos$`));

    // 3. The paper is there, hers to see and not to change, and it counts in her limits.
    const card = coPage.getByTestId('paper-card').filter({ hasText: title });
    await expect(card).toBeVisible();
    await expect(card).toContainText('você é o 2º autor');
    await expect(card.getByRole('link', { name: 'Alterar' })).toHaveCount(0);
    await expect(coPage.getByTestId('paper-limits')).toContainText('É coautor em 1 de 5');
    for (const id of ['document-missing', 'waiting-other-document', 'waiting-other-email']) {
      await expect(coPage.getByTestId(id)).toHaveCount(0);
    }
    // She opens the file.
    const [download] = await Promise.all([coPage.waitForEvent('download'), card.getByRole('button', { name: 'Baixar o arquivo' }).click()]);
    expect(download.suggestedFilename()).toBe('Identidade E2E.pdf');
    await hers.close();
  });

  test('a co-author who signs up with another document waits, and the sender corrects it by saving again', async ({ page, browser }) => {
    const senderEmail = unique('id-remetente2');
    const coEmail = unique('id-coautor2');
    made.push(senderEmail, coEmail);
    await createAccount(senderEmail, 'Remetente Dois E2E');
    const typedForHim = randomCpf();
    const hisOwn = randomCpf();

    await logIn(page, senderEmail);
    const title = await sendPaper(page, { name: 'Coautor Com Outro CPF E2E', email: coEmail, document: { cpf: typedForHim } });

    // 1. He signs up with the same address and his real CPF, which is not the one typed for him.
    const his = await browser.newContext();
    const coPage = await his.newPage();
    await signUp(coPage, { email: coEmail, name: 'Coautor Com Outro CPF E2E', document: { cpf: hisOwn }, next: `/${EVENT}/meus-trabalhos` });
    await expect(coPage).toHaveURL(new RegExp(`/${EVENT}/meus-trabalhos$`));

    // 2. The paper keeps waiting: he is told why, sees no paper, and the place counts against him.
    await expect(coPage.getByTestId('waiting-other-document')).toHaveText(
      'Você consta em 1 trabalho com outro documento. Peça a correção a quem enviou.',
    );
    await expect(coPage.getByTestId('paper-card')).toHaveCount(0);
    await expect(coPage.getByTestId('paper-limits')).toContainText('É coautor em 1 de 5');
    expect(await coPage.content()).not.toContain(title);
    // The server gives him neither the paper nor its file.
    const token = await coPage.evaluate(() => JSON.parse(localStorage.getItem('sieamb-auth')!).access_token as string);
    const paperId = (await admin<{ id: string }[]>(`/rest/v1/submissions?title=eq.${encodeURIComponent(title)}&select=id`))[0]!.id;
    for (const action of ['one', 'file']) {
      const refused = await coPage.request.get(`/api/v1/submissions/${action}?eventSlug=${EVENT}&id=${paperId}`, { headers: { authorization: `Bearer ${token}` } });
      expect(refused.status(), action).toBe(404);
    }

    // 3. The sender sees which author no longer matches, on that paper.
    await page.goto(`/${EVENT}/meus-trabalhos`);
    const card = page.getByTestId('paper-card').filter({ hasText: title });
    await expect(card.getByTestId('author-issue')).toHaveText(
      'O documento de Coautor Com Outro CPF E2E não confere com o cadastro. Abra o trabalho e salve de novo.',
    );

    // 4. Opening it and saving again is the correction: the line takes the document of his account.
    await card.getByRole('link', { name: 'Alterar' }).click();
    await expect(page.getByTestId('author-document').nth(1)).toHaveText('Documento já cadastrado.');
    await page.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(page).toHaveURL(new RegExp(`/${EVENT}/meus-trabalhos$`));
    await expect(page.getByTestId('paper-card').filter({ hasText: title }).getByTestId('author-issue')).toHaveCount(0);
    expect(await admin<{ cpf: string | null }[]>(`/rest/v1/submission_authors?email=eq.${encodeURIComponent(coEmail)}&select=cpf`)).toEqual([{ cpf: hisOwn }]);

    // 5. Now the paper is his to see.
    await coPage.reload();
    await expect(coPage.getByTestId('paper-card').filter({ hasText: title })).toBeVisible();
    await expect(coPage.getByTestId('waiting-other-document')).toHaveCount(0);
    await his.close();
  });

  test('a document that already has an account is refused at sign-up, with that account’s address masked', async ({ page }) => {
    const holderEmail = unique('id-titular');
    const secondEmail = unique('id-segunda');
    made.push(holderEmail, secondEmail);
    const cpf = randomCpf();
    await createAccount(holderEmail, 'Titular do CPF E2E', { cpf });
    const masked = `${holderEmail[0]}•••@sieamb.org`;

    await page.goto(`/${EVENT}/conta/criar`);
    await page.getByLabel('Nome completo').fill('Segunda Conta E2E');
    await page.getByLabel('E-mail').fill(secondEmail);
    await page.getByLabel('CPF').fill(cpf);
    await page.getByRole('button', { name: 'Enviar link de confirmação' }).click();
    await expect(page.getByRole('alert')).toHaveText(`CPF já cadastrado com o e-mail ${masked}.`);
    // Never the address itself, and what was typed is still there to correct.
    expect(await page.content()).not.toContain(holderEmail);
    await expect(page.getByLabel('CPF')).toHaveValue(typedCpf(cpf));
    await expect(page.getByRole('heading', { name: 'Confira seu e-mail' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Esqueci minha senha' })).toHaveAttribute('href', `/${EVENT}/conta/recuperar`);
    // No account was started for the second address, and nothing waits under it.
    expect(await admin<unknown[]>(`/rest/v1/users?email=eq.${encodeURIComponent(secondEmail)}&select=id`)).toEqual([]);
    expect(await admin<unknown[]>(`/rest/v1/signup_documents?email=eq.${encodeURIComponent(secondEmail)}&select=email`)).toEqual([]);

    // The same in English.
    await page.getByRole('button', { name: 'English' }).click();
    await page.getByRole('button', { name: 'Send confirmation link' }).click();
    await expect(page.getByRole('alert')).toHaveText(`CPF already registered with the e-mail ${masked}.`);
    await page.getByRole('button', { name: 'Português' }).click();
  });

  test('an account from before documents were asked for is stopped at "Enviar trabalho" and goes on after giving one', async ({ page }) => {
    const email = unique('id-antiga');
    made.push(email);
    await createAccount(email, 'Conta Antiga E2E', null);
    await logIn(page, email);

    // 1. Minha área says what is missing.
    await expect(page.getByTestId('document-missing')).toContainText('Informe seu documento');
    // 2. So does the form, which cannot be sent, and the server refuses it too.
    await page.goto(`/${EVENT}/meus-trabalhos/novo`);
    await expect(page.getByTestId('document-missing')).toContainText('Informe seu CPF ou passaporte em Minha área para enviar trabalhos.');
    await expect(page.getByRole('button', { name: 'Enviar trabalho' })).toBeDisabled();
    const token = await page.evaluate(() => JSON.parse(localStorage.getItem('sieamb-auth')!).access_token as string);
    const refused = await page.request.post('/api/v1/submissions/save', {
      headers: { authorization: `Bearer ${token}` },
      data: { eventSlug: EVENT, title: 'Sem documento', titleEn: 'No document', modality: 'RESUMO_EXPANDIDO', areaRef: 'a1', abstract: 'x'.repeat(80), keywords: ['teste'], keywordsEn: [], authors: [{ fullName: 'Conta Antiga E2E', email }], filePath: 'x' },
    });
    expect(refused.status()).toBe(409);
    expect(await refused.json()).toEqual({ error: 'document_required' });

    // 3. She gives it in Minha área, through the link of the notice.
    await page.getByTestId('document-missing').getByRole('link', { name: 'Informar documento' }).click();
    await expect(page).toHaveURL(new RegExp(`/${EVENT}/minha-area#meus-dados$`));
    const cpf = randomCpf();
    await page.getByLabel('CPF').fill(cpf);
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Dados salvos.')).toBeVisible();
    await expect(page.getByLabel('CPF')).toBeDisabled();
    await expect(page.getByTestId('document-missing')).toHaveCount(0);

    // 4. And the form lets her through.
    await page.goto(`/${EVENT}/meus-trabalhos/novo`);
    await expect(page.getByLabel('Nome do autor 1 (você)')).toHaveValue('Conta Antiga E2E');
    await expect(page.getByTestId('document-missing')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Enviar trabalho' })).toBeEnabled();
  });

  test('the same person under another e-mail does not get a fourth paper as first author', async ({ page }) => {
    const senderEmail = unique('id-limite');
    made.push(senderEmail);
    const senderId = await createAccount(senderEmail, 'Remetente do Limite E2E');
    const person = randomCpf();
    const eventId = (await admin<{ id: string }[]>(`/rest/v1/events?slug=eq.${EVENT}&select=id`))[0]!.id;
    // Three papers stand with the same person as first author, each under another address.
    for (let i = 0; i < 3; i += 1) {
      const [paper] = await admin<{ id: string }[]>('/rest/v1/submissions?select=id', {
        method: 'POST',
        body: JSON.stringify({ event_id: eventId, user_id: senderId, title: `Limite E2E ${Date.now()}-${i}`, title_en: 'Limit', modality: 'RESUMO_EXPANDIDO', area_ref: 'a1', abstract: 'x'.repeat(80), keywords: ['teste'], file_path: `${EVENT}/${senderId}/limite-${i}.pdf`, file_name: 'l.pdf', file_pages: 5 }),
      });
      const alias = unique(`id-alias${i}`);
      made.push(alias);
      await admin('/rest/v1/submission_authors', { method: 'POST', body: JSON.stringify({ submission_id: paper!.id, position: 1, full_name: 'Pessoa de Muitos E-mails', email: alias, cpf: person }) });
    }
    // A fourth, under yet another address, with the sender in second place.
    const fourth = unique('id-alias-quarto');
    made.push(fourth);
    await logIn(page, senderEmail);
    await page.goto(`/${EVENT}/meus-trabalhos/novo`);
    await expect(page.getByLabel('Nome do autor 1 (você)')).not.toHaveValue('');
    await page.getByLabel('Título em português').fill(`Quarto trabalho E2E ${Date.now()}`);
    await page.getByLabel('Título em inglês').fill('Fourth paper');
    await page.getByLabel('Área temática').selectOption({ label: 'Saúde e Meio Ambiente' });
    await page.getByLabel('Resumo').fill('Resumo de um trabalho de teste, com mais de cinquenta caracteres para passar na conferência.');
    await page.getByLabel('Palavras-chave').fill('teste; limite');
    await page.getByRole('button', { name: 'Adicionar autor' }).click();
    await page.getByLabel('Nome do autor 2').fill('Pessoa de Muitos E-mails');
    await page.getByLabel('E-mail do autor 2').fill(fourth);
    await page.getByLabel('CPF do autor 2').fill(person);
    await page.getByRole('button', { name: 'Subir autor 2' }).click();
    await page.getByLabel('Arquivo do trabalho').setInputFiles(await pdfFile(5, 'Quarto.pdf'));
    await page.getByRole('button', { name: 'Enviar trabalho' }).click();
    await expect(page.getByRole('alert')).toHaveText('Pessoa de Muitos E-mails já é primeiro autor em 3 trabalhos, o limite do edital.');
    // In second place the same person is within the other limit: the paper goes.
    await page.getByRole('button', { name: 'Descer autor 1' }).click();
    await page.getByRole('button', { name: 'Enviar trabalho' }).click();
    await expect(page).toHaveURL(new RegExp(`/${EVENT}/meus-trabalhos$`));
  });
});
