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
  unique,
} from './helpers';

/**
 * Sending a paper end to end against a real deployment, the dev database and the
 * private file storage (#216). Skipped without the dev credentials and never run
 * against production.
 */
const expect = baseExpect.configure({ timeout: 30_000 });

/** A real PDF with the given number of pages, written to a temporary folder. */
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
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(new RegExp(`/${EVENT}/minha-area$`));
}

test.describe('submissions @submissions', () => {
  test.skip(!SUPABASE_URL || !SERVICE_KEY, 'needs SUPABASE_DEV_URL and SUPABASE_DEV_SERVICE_ROLE_KEY');
  test.skip(({ baseURL }) => !isTestDeployment(baseURL), 'runs against dev and preview deployments only');
  test.setTimeout(240_000);

  const made: string[] = [];
  test.afterAll(async () => {
    await cleanupAccounts(made);
  });

  test('send a paper, the co-author sees it, change it, download it and withdraw it', async ({ page, browser }) => {
    const mainEmail = unique('autora');
    const coEmail = unique('coautor');
    made.push(mainEmail, coEmail);
    await createAccount(mainEmail, 'Autora Principal E2E');
    await createAccount(coEmail, 'Coautor E2E');
    const title = `Trabalho de teste E2E ${Date.now()}`;

    // 1. Nothing sent yet; the page says registering can wait.
    await logIn(page, mainEmail);
    await page.getByRole('link', { name: 'Meus trabalhos' }).first().click();
    await expect(page.getByTestId('no-papers')).toBeVisible();
    await expect(page.getByTestId('registration-notice')).toContainText('A inscrição pode ser feita a qualquer momento.');
    await expect(page.getByTestId('paper-limits')).toContainText('Você enviou 0 de 3 trabalhos como autor principal');

    // 2. The form, with a file that has too many pages for an expanded abstract.
    await page.getByRole('link', { name: 'Enviar trabalho' }).click();
    await page.getByLabel('Título em português').fill(title);
    await page.getByLabel('Título em inglês').fill('E2E test paper');
    await page.getByLabel('Área temática').selectOption({ label: 'Saúde e Meio Ambiente' });
    await page.getByLabel('Resumo').fill('Resumo de um trabalho de teste, com mais de cinquenta caracteres para passar na conferência.');
    await page.getByLabel('Palavras-chave').fill('teste; automação');
    await page.getByRole('button', { name: 'Adicionar coautor' }).click();
    await page.getByLabel('Nome do coautor 1').fill('Coautor E2E');
    await page.getByLabel('E-mail do coautor 1').fill(coEmail.toUpperCase());
    await page.getByLabel('Arquivo do trabalho').setInputFiles(await pdfFile(9, 'longo demais.pdf'));
    await page.getByRole('button', { name: 'Enviar trabalho' }).click();
    await expect(page.getByRole('alert')).toContainText('O arquivo tem 9 páginas. Nesta modalidade, o edital pede de 4 a 6.');

    // 3. A file that is not a PDF, named like one.
    const fake = join(mkdtempSync(join(tmpdir(), 'sieamb-e2e-')), 'falso.pdf');
    writeFileSync(fake, 'isto nao e um pdf');
    await page.getByLabel('Arquivo do trabalho').setInputFiles(fake);
    await page.getByRole('button', { name: 'Enviar trabalho' }).click();
    await expect(page.getByRole('alert')).toContainText('Não foi possível ler o arquivo');

    // 4. The right file: the paper is saved and listed with its number.
    await page.getByLabel('Arquivo do trabalho').setInputFiles(await pdfFile(5, 'Resumo expandido E2E.pdf'));
    await page.getByRole('button', { name: 'Enviar trabalho' }).click();
    await expect(page).toHaveURL(new RegExp(`/${EVENT}/meus-trabalhos$`));
    const card = page.getByTestId('paper-card');
    await expect(card).toContainText(title);
    await expect(card).toContainText(/Trabalho nº \d+ · Resumo expandido · Saúde e Meio Ambiente/);
    await expect(card).toContainText('Enviado');
    await expect(card).toContainText('Resumo expandido E2E.pdf · 5 páginas');
    await expect(card.getByRole('listitem')).toHaveText(['Autora Principal E2E', 'Coautor E2E']);
    await expect(page.getByTestId('paper-limits')).toContainText('Você enviou 1 de 3 trabalhos como autor principal');
    await expect(page.getByTestId('registration-notice')).toContainText('só entra na programação se pelo menos um dos autores estiver inscrito');

    // 5. The download is the file that was sent, under the name the author gave.
    const [download] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: 'Baixar o arquivo' }).click()]);
    expect(download.suggestedFilename()).toBe('Resumo expandido E2E.pdf');

    // 6. Sending the same title again is caught.
    await page.getByRole('link', { name: 'Enviar trabalho' }).click();
    await page.getByLabel('Título em português').fill(title.toUpperCase());
    await page.getByLabel('Título em inglês').fill('E2E test paper');
    await page.getByLabel('Área temática').selectOption({ label: 'Saúde e Meio Ambiente' });
    await page.getByLabel('Resumo').fill('Resumo de um trabalho de teste, com mais de cinquenta caracteres para passar na conferência.');
    await page.getByLabel('Palavras-chave').fill('teste');
    await page.getByLabel('Arquivo do trabalho').setInputFiles(await pdfFile(4, 'de novo.pdf'));
    await page.getByRole('button', { name: 'Enviar trabalho' }).click();
    await expect(page.getByRole('alert')).toContainText('Um dos autores já enviou um trabalho com este título');
    await page.goto(`/${EVENT}/meus-trabalhos`);
    await expect(page.getByTestId('paper-card')).toHaveCount(1);

    // 7. The co-author, in another browser: sees the paper, can download it, cannot change it.
    const other = await browser.newContext();
    const coPage = await other.newPage();
    await logIn(coPage, coEmail);
    await coPage.goto(`/${EVENT}/meus-trabalhos`);
    const coCard = coPage.getByTestId('paper-card');
    await expect(coCard).toContainText(title);
    await expect(coCard).toContainText('você é coautor (somente consulta)');
    await expect(coCard.getByRole('link', { name: 'Alterar' })).toHaveCount(0);
    await expect(coCard.getByRole('button', { name: 'Retirar o trabalho' })).toHaveCount(0);
    await expect(coPage.getByTestId('paper-limits')).toContainText('consta como coautor em 1 de 5');
    const [coDownload] = await Promise.all([coPage.waitForEvent('download'), coCard.getByRole('button', { name: 'Baixar o arquivo' }).click()]);
    expect(coDownload.suggestedFilename()).toBe('Resumo expandido E2E.pdf');
    // Typing the edit address by hand gets no form.
    const editHref = await card.getByRole('link', { name: 'Alterar' }).getAttribute('href');
    await coPage.goto(editHref!);
    await expect(coPage.getByRole('alert')).toContainText('Não encontramos esse trabalho');
    await other.close();

    // 8. The main author changes the title and keeps the file.
    await card.getByRole('link', { name: 'Alterar' }).click();
    await expect(page.getByLabel('Título em português')).toHaveValue(title);
    await expect(page.getByLabel('Nome do coautor 1')).toHaveValue('Coautor E2E');
    await page.getByLabel('Título em português').fill(`${title} (revisto)`);
    await page.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(page.getByTestId('paper-card')).toContainText(`${title} (revisto)`);
    await expect(page.getByTestId('paper-card')).toContainText('Resumo expandido E2E.pdf · 5 páginas');

    // 9. Withdraw: gone from the list, the slot is free, and the record is kept.
    await page.getByRole('button', { name: 'Retirar o trabalho' }).click();
    await page.getByRole('button', { name: 'Sim, retirar' }).click();
    await expect(page.getByTestId('no-papers')).toBeVisible();
    await expect(page.getByTestId('paper-limits')).toContainText('Você enviou 0 de 3');
    const rows = await admin<{ deleted_at: string | null; deleted_reason: string | null }[]>(
      `/rest/v1/submissions?title=eq.${encodeURIComponent(`${title} (revisto)`)}&select=deleted_at,deleted_reason`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.deleted_at).not.toBeNull();
    expect(rows[0]!.deleted_reason).toBe('withdrawn by the main author');
  });

  test('a stranger cannot reach a paper or its file', async ({ page, request }) => {
    const ownerEmail = unique('dona');
    const strangerEmail = unique('estranho');
    made.push(ownerEmail, strangerEmail);
    const ownerId = await createAccount(ownerEmail, 'Dona do Trabalho E2E');
    await createAccount(strangerEmail, 'Estranho E2E');
    const eventId = (await admin<{ id: string }[]>(`/rest/v1/events?slug=eq.${EVENT}&select=id`))[0]!.id;
    const [paper] = await admin<{ id: string }[]>('/rest/v1/submissions?select=id', {
      method: 'POST',
      body: JSON.stringify({
        event_id: eventId,
        user_id: ownerId,
        title: `Trabalho privado E2E ${Date.now()}`,
        title_en: 'Private',
        modality: 'RESUMO_EXPANDIDO',
        area_ref: 'a1',
        abstract: 'x'.repeat(80),
        keywords: ['teste'],
        file_path: `${EVENT}/${ownerId}/00000000-0000-4000-8000-000000000000.pdf`,
        file_name: 'privado.pdf',
        file_pages: 5,
      }),
    });
    await admin('/rest/v1/submission_authors', {
      method: 'POST',
      body: JSON.stringify({ submission_id: paper!.id, position: 1, full_name: 'Dona do Trabalho E2E', email: ownerEmail }),
    });

    await logIn(page, strangerEmail);
    await page.goto(`/${EVENT}/meus-trabalhos`);
    await expect(page.getByTestId('no-papers')).toBeVisible();
    const token = await page.evaluate(() => JSON.parse(localStorage.getItem('sieamb-auth')!).access_token as string);
    const headers = { authorization: `Bearer ${token}` };

    const file = await request.get(`/api/v1/submissions/file?id=${paper!.id}`, { headers });
    expect(file.status()).toBe(404);
    const save = await request.post('/api/v1/submissions/save', {
      headers,
      data: { eventSlug: EVENT, id: paper!.id, title: 'Tomado por outra pessoa', titleEn: 'Taken', modality: 'RESUMO_EXPANDIDO', areaRef: 'a1', abstract: 'x'.repeat(80), keywords: ['x1'] },
    });
    expect(save.status()).toBe(404);
    const withdraw = await request.post('/api/v1/submissions/withdraw', { headers, data: { eventSlug: EVENT, id: paper!.id } });
    expect(withdraw.status()).toBe(404);
    // Attaching the owner's file to a paper of one's own is refused too.
    const steal = await request.post('/api/v1/submissions/save', {
      headers,
      data: { eventSlug: EVENT, title: 'Com o arquivo de outra pessoa', titleEn: 'Stolen file', modality: 'RESUMO_EXPANDIDO', areaRef: 'a1', abstract: 'x'.repeat(80), keywords: ['x1'], filePath: `${EVENT}/${ownerId}/00000000-0000-4000-8000-000000000000.pdf`, fileName: 'x.pdf' },
    });
    expect(steal.status()).toBe(400);
    expect(await steal.json()).toEqual({ error: 'file_missing' });
    // Without a login, nothing at all.
    expect((await request.get(`/api/v1/submissions/file?id=${paper!.id}`)).status()).toBe(401);
    const untouched = await admin<{ title: string; deleted_at: string | null }[]>(`/rest/v1/submissions?id=eq.${paper!.id}&select=title,deleted_at`);
    expect(untouched[0]!.title).toContain('Trabalho privado E2E');
    expect(untouched[0]!.deleted_at).toBeNull();
  });

  test('the submissions page offers to send a paper while they are open', async ({ page }) => {
    await page.goto(`/${EVENT}/submissoes`);
    const box = page.getByTestId('submissions-open');
    await expect(box).toContainText('Submissões abertas');
    await box.getByRole('link', { name: 'Enviar trabalho' }).click();
    // Sending needs an account: the visitor is sent to the login and will come back to the form.
    await expect(page).toHaveURL(new RegExp(`/${EVENT}/conta/entrar\\?next=%2F${EVENT}%2Fmeus-trabalhos%2Fnovo`));
  });
});
