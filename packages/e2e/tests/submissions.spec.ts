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

  test('any author sends a paper: suggested and typed authors, in order; another author changes it; withdraw', async ({ page, browser }) => {
    // The sender is the second author. The first is a professor with no account,
    // typed by hand; the third already has an account and is picked from the suggestions.
    const senderEmail = unique('autora');
    const knownEmail = unique('conhecida');
    const profEmail = unique('professor');
    made.push(senderEmail, knownEmail, profEmail);
    const stamp = Date.now().toString(36);
    const knownName = `Conhecida Sugerida ${stamp}`;
    await createAccount(senderEmail, 'Autora Que Envia E2E');
    await createAccount(knownEmail, knownName);
    const title = `Trabalho de teste E2E ${Date.now()}`;

    // 1. Nothing sent yet; the page says registering can wait.
    await logIn(page, senderEmail);
    await page.getByRole('link', { name: 'Meus trabalhos' }).first().click();
    await expect(page.getByTestId('no-papers')).toBeVisible();
    await expect(page.getByTestId('registration-notice')).toContainText('A inscrição pode ser feita a qualquer momento.');
    await expect(page.getByTestId('paper-limits')).toContainText('Você é o primeiro autor em 0 de 3 trabalhos e consta nas demais posições em 0 de 5.');

    // 2. The form starts with the sender alone, by the name of the account.
    await page.getByRole('link', { name: 'Enviar trabalho' }).click();
    await expect(page.getByLabel('Nome do autor 1 (você)')).toHaveValue('Autora Que Envia E2E');
    await expect(page.getByLabel('E-mail do autor 1')).toHaveValue(senderEmail);
    await page.getByLabel('Título em português').fill(title);
    await page.getByLabel('Título em inglês').fill('E2E test paper');
    await page.getByLabel('Área temática').selectOption({ label: 'Saúde e Meio Ambiente' });
    await page.getByLabel('Resumo').fill('Resumo de um trabalho de teste, com mais de cinquenta caracteres para passar na conferência.');
    await page.getByLabel('Palavras-chave').fill('teste; automação');

    // 3. Someone already in the system: typed without the accent-free care of a person
    //    in a hurry (lower case), suggested with a masked e-mail, picked with a click.
    await page.getByRole('button', { name: 'Adicionar autor' }).click();
    await page.getByLabel('Nome do autor 2').pressSequentially(`conhecida sugerida ${stamp}`, { delay: 20 });
    const suggestion = page.getByRole('listbox', { name: 'Pessoas já cadastradas com esse nome' }).getByRole('option');
    await expect(suggestion).toHaveCount(1);
    await expect(suggestion).toContainText(knownName);
    await expect(suggestion).toContainText('e•••@sieamb.org');
    await suggestion.click();
    await expect(page.getByLabel('Nome do autor 2')).toHaveValue(knownName);
    await expect(page.getByLabel('E-mail do autor 2')).toHaveValue('e•••@sieamb.org');
    // The address of the person suggested is nowhere in the page.
    expect(await page.content()).not.toContain(knownEmail);

    // 4. The professor, typed by hand, then moved up to be the first author.
    await page.getByRole('button', { name: 'Adicionar autor' }).click();
    await page.getByLabel('Nome do autor 3').fill('Prof. Sem Conta E2E');
    await page.getByLabel('E-mail do autor 3').fill(profEmail.toUpperCase());
    await page.getByRole('button', { name: 'Subir autor 3' }).click();
    await page.getByRole('button', { name: 'Subir autor 2' }).click();
    await expect(page.getByLabel('Nome do autor 1')).toHaveValue('Prof. Sem Conta E2E');
    await expect(page.getByLabel('Nome do autor 2 (você)')).toHaveValue('Autora Que Envia E2E');
    await expect(page.getByLabel('Nome do autor 3')).toHaveValue(knownName);

    // 5. A file with too many pages for an expanded abstract, then one that is not a PDF.
    await page.getByLabel('Arquivo do trabalho').setInputFiles(await pdfFile(9, 'longo demais.pdf'));
    await page.getByRole('button', { name: 'Enviar trabalho' }).click();
    await expect(page.getByRole('alert')).toContainText('O arquivo tem 9 páginas. Nesta modalidade, o edital pede de 4 a 6.');
    const fake = join(mkdtempSync(join(tmpdir(), 'sieamb-e2e-')), 'falso.pdf');
    writeFileSync(fake, 'isto nao e um pdf');
    await page.getByLabel('Arquivo do trabalho').setInputFiles(fake);
    await page.getByRole('button', { name: 'Enviar trabalho' }).click();
    await expect(page.getByRole('alert')).toContainText('Não foi possível ler o arquivo');
    // The authors survived both refusals, pick included.
    await expect(page.getByLabel('E-mail do autor 3')).toHaveValue('e•••@sieamb.org');

    // 6. The right file: the paper is saved with the authors in that order.
    await page.getByLabel('Arquivo do trabalho').setInputFiles(await pdfFile(5, 'Resumo expandido E2E.pdf'));
    await page.getByRole('button', { name: 'Enviar trabalho' }).click();
    await expect(page).toHaveURL(new RegExp(`/${EVENT}/meus-trabalhos$`));
    const card = page.getByTestId('paper-card');
    await expect(card).toContainText(title);
    await expect(card).toContainText(/Trabalho nº \d+ · Resumo expandido · Saúde e Meio Ambiente/);
    await expect(card).toContainText('Enviado');
    await expect(card).toContainText('você é o 2º autor');
    await expect(card).toContainText('Resumo expandido E2E.pdf · 5 páginas');
    await expect(card.getByRole('listitem')).toHaveText(['Prof. Sem Conta E2E', 'Autora Que Envia E2E', knownName]);
    await expect(page.getByTestId('paper-limits')).toContainText('Você é o primeiro autor em 0 de 3 trabalhos e consta nas demais posições em 1 de 5.');
    await expect(page.getByTestId('registration-notice')).toContainText('só entra na programação se pelo menos um dos autores estiver inscrito');
    // In the database: the real addresses, lower-cased, in the order of the paper.
    const saved = await admin<{ submission_authors: { position: number; email: string }[] }[]>(
      `/rest/v1/submissions?title=eq.${encodeURIComponent(title)}&select=submission_authors(position,email)`,
    );
    expect(saved[0]!.submission_authors.sort((x, y) => x.position - y.position).map((x) => x.email)).toEqual([
      profEmail.toLowerCase(),
      senderEmail,
      knownEmail,
    ]);

    // 7. The download is the file that was sent, under the name the author gave.
    const [download] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: 'Baixar o arquivo' }).click()]);
    expect(download.suggestedFilename()).toBe('Resumo expandido E2E.pdf');

    // 8. Sending the same title again is caught.
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

    // 9. The third author, in another browser: the same paper, and she can change it.
    const other = await browser.newContext();
    const coPage = await other.newPage();
    await logIn(coPage, knownEmail);
    await coPage.goto(`/${EVENT}/meus-trabalhos`);
    const coCard = coPage.getByTestId('paper-card');
    await expect(coCard).toContainText(title);
    await expect(coCard).toContainText('você é o 3º autor');
    await expect(coPage.getByTestId('paper-limits')).toContainText('consta nas demais posições em 1 de 5');
    const [coDownload] = await Promise.all([coPage.waitForEvent('download'), coCard.getByRole('button', { name: 'Baixar o arquivo' }).click()]);
    expect(coDownload.suggestedFilename()).toBe('Resumo expandido E2E.pdf');
    await coCard.getByRole('link', { name: 'Alterar' }).click();
    await expect(coPage.getByLabel('Título em português')).toHaveValue(title);
    await expect(coPage.getByLabel('Nome do autor 1')).toHaveValue('Prof. Sem Conta E2E');
    await expect(coPage.getByLabel('Nome do autor 3 (você)')).toHaveValue(knownName);
    await coPage.getByLabel('Título em português').fill(`${title} (revisto)`);
    await coPage.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(coPage.getByTestId('paper-card')).toContainText(`${title} (revisto)`);
    await expect(coPage.getByTestId('paper-card')).toContainText('Resumo expandido E2E.pdf · 5 páginas');
    await other.close();

    // 10. The sender sees the change, and withdraws: gone from the list, the record is kept.
    await page.reload();
    await expect(page.getByTestId('paper-card')).toContainText(`${title} (revisto)`);
    await page.getByRole('button', { name: 'Retirar o trabalho' }).click();
    await page.getByRole('button', { name: 'Sim, retirar' }).click();
    await expect(page.getByTestId('no-papers')).toBeVisible();
    await expect(page.getByTestId('paper-limits')).toContainText('consta nas demais posições em 0 de 5');
    const rows = await admin<{ deleted_at: string | null; deleted_reason: string | null }[]>(
      `/rest/v1/submissions?title=eq.${encodeURIComponent(`${title} (revisto)`)}&select=deleted_at,deleted_reason`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.deleted_at).not.toBeNull();
    expect(rows[0]!.deleted_reason).toBe('withdrawn by one of its authors');
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
      data: { eventSlug: EVENT, title: 'Com o arquivo de outra pessoa', titleEn: 'Stolen file', modality: 'RESUMO_EXPANDIDO', areaRef: 'a1', abstract: 'x'.repeat(80), keywords: ['x1'], authors: [{ fullName: 'Estranho E2E', email: strangerEmail }], filePath: `${EVENT}/${ownerId}/00000000-0000-4000-8000-000000000000.pdf`, fileName: 'x.pdf' },
    });
    expect(steal.status()).toBe(400);
    expect(await steal.json()).toEqual({ error: 'file_missing' });
    // Without a login, nothing at all.
    expect((await request.get(`/api/v1/submissions/file?id=${paper!.id}`)).status()).toBe(401);
    const untouched = await admin<{ title: string; deleted_at: string | null }[]>(`/rest/v1/submissions?id=eq.${paper!.id}&select=title,deleted_at`);
    expect(untouched[0]!.title).toContain('Trabalho privado E2E');
    expect(untouched[0]!.deleted_at).toBeNull();
  });

  test('an organiser gives a paper a reviewer, who sees and downloads it; taken off, the reviewer loses it', async ({ page, browser }) => {
    const stamp = Date.now().toString(36);
    const authorEmail = unique('autora-av');
    const organiserEmail = unique('organizadora-av');
    const reviewerEmail = unique('avaliadora');
    made.push(authorEmail, organiserEmail, reviewerEmail);
    const reviewerName = `Avaliadora E2E ${stamp}`;
    await createAccount(authorEmail, 'Autora Avaliada E2E');
    const organiserId = await createAccount(organiserEmail, 'Organizadora E2E');
    const reviewerId = await createAccount(reviewerEmail, reviewerName);
    const eventId = (await admin<{ id: string }[]>(`/rest/v1/events?slug=eq.${EVENT}&select=id`))[0]!.id;
    for (const [userId, role] of [[organiserId, 'ORGANIZER'], [reviewerId, 'REVIEWER']] as const) {
      await admin('/rest/v1/event_members', {
        method: 'POST',
        body: JSON.stringify({ id: crypto.randomUUID(), event_id: eventId, user_id: userId, role }),
      });
    }
    const title = `Trabalho para avaliar E2E ${stamp}`;

    // 1. The author sends a paper.
    const authorContext = await browser.newContext();
    const authorPage = await authorContext.newPage();
    await logIn(authorPage, authorEmail);
    await authorPage.goto(`/${EVENT}/meus-trabalhos/novo`);
    await expect(authorPage.getByLabel('Nome do autor 1 (você)')).toHaveValue('Autora Avaliada E2E');
    await authorPage.getByLabel('Título em português').fill(title);
    await authorPage.getByLabel('Título em inglês').fill('E2E paper to review');
    await authorPage.getByLabel('Área temática').selectOption({ label: 'Saúde e Meio Ambiente' });
    await authorPage.getByLabel('Resumo').fill('Resumo de um trabalho de teste, com mais de cinquenta caracteres para passar na conferência.');
    await authorPage.getByLabel('Palavras-chave').fill('teste; avaliação');
    await authorPage.getByLabel('Arquivo do trabalho').setInputFiles(await pdfFile(5, 'Para avaliar E2E.pdf'));
    await authorPage.getByRole('button', { name: 'Enviar trabalho' }).click();
    await expect(authorPage.getByTestId('paper-card')).toContainText(title);
    const number = Number((await authorPage.getByTestId('paper-card').textContent())!.match(/Trabalho nº (\d+)/)![1]);

    // 2. The reviewer has nothing yet: no link in Minha área, an empty list.
    const reviewerContext = await browser.newContext();
    const reviewerPage = await reviewerContext.newPage();
    await logIn(reviewerPage, reviewerEmail);
    await expect(reviewerPage.getByLabel('Nome completo')).toBeVisible();
    await expect(reviewerPage.getByTestId('reviewing-link')).toHaveCount(0);
    await reviewerPage.goto(`/${EVENT}/avaliacoes`);
    await expect(reviewerPage.getByTestId('nothing-to-review')).toBeVisible();

    // 3. The organiser chooses the reviewer for that paper: one is enough.
    await logIn(page, organiserEmail);
    await page.goto(`/${EVENT}/painel/trabalhos`);
    await page.getByLabel('Buscar').fill(title);
    const row = page.getByTestId('paper-row');
    await expect(row).toHaveCount(1);
    await expect(row.getByTestId('paper-reviewers')).toContainText('Sem avaliador');
    await expect(row).toContainText('Enviado');
    await row.getByRole('combobox', { name: `Indicar avaliador para o trabalho nº ${number}` }).selectOption({ label: reviewerName });
    await row.getByRole('button', { name: `Indicar para o trabalho nº ${number}` }).click();
    await expect(row.getByTestId('paper-reviewers')).toContainText(reviewerName);
    await expect(row).toContainText('Em avaliação');
    // The author is not offered as a reviewer of her own paper, whatever her roles: the server says so.
    await admin('/rest/v1/event_members', {
      method: 'POST',
      body: JSON.stringify({ id: crypto.randomUUID(), event_id: eventId, user_id: (await admin<{ id: string }[]>(`/rest/v1/users?email=eq.${encodeURIComponent(authorEmail)}&select=id`))[0]!.id, role: 'REVIEWER' }),
    });
    const organiserToken = await page.evaluate(() => JSON.parse(localStorage.getItem('sieamb-auth')!).access_token as string);
    const paperId = (await admin<{ id: string }[]>(`/rest/v1/submissions?title=eq.${encodeURIComponent(title)}&select=id`))[0]!.id;
    const authorId = (await admin<{ id: string }[]>(`/rest/v1/users?email=eq.${encodeURIComponent(authorEmail)}&select=id`))[0]!.id;
    const own = await page.request.post('/api/v1/admin/reviewer-assign', {
      headers: { authorization: `Bearer ${organiserToken}` },
      data: { eventSlug: EVENT, submissionId: paperId, userId: authorId },
    });
    expect(own.status()).toBe(409);
    expect(await own.json()).toEqual({ error: 'reviewer_is_author' });

    // 4. The reviewer is told in the site, finds the paper with the authors' names, and downloads it.
    await reviewerPage.goto(`/${EVENT}/minha-area`);
    await expect(reviewerPage.getByTestId('reviewing-link')).toContainText('Trabalhos para avaliar (1)');
    await reviewerPage.getByTestId('reviewing-link').click();
    const review = reviewerPage.getByTestId('review-card');
    await expect(review).toHaveCount(1);
    await expect(review).toContainText(title);
    await expect(review.getByRole('listitem')).toHaveText(['Autora Avaliada E2E']);
    expect(await reviewerPage.content()).not.toContain(authorEmail);
    const [download] = await Promise.all([reviewerPage.waitForEvent('download'), review.getByRole('button', { name: 'Baixar o arquivo' }).click()]);
    expect(download.suggestedFilename()).toBe('Para avaliar E2E.pdf');
    const notices = await admin<{ kind: string }[]>(`/rest/v1/notifications?user_id=eq.${reviewerId}&select=kind`);
    expect(notices.map((n) => n.kind)).toContain('review.assigned');

    // 5. The author sees it under review and can no longer change or withdraw it.
    await authorPage.reload();
    const card = authorPage.getByTestId('paper-card');
    await expect(card).toContainText('Em avaliação');
    await expect(card.getByRole('link', { name: 'Alterar' })).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Retirar o trabalho' })).toHaveCount(0);

    // 6. Taken off the paper, the reviewer loses the paper and the way into its file; the paper is "enviado" again.
    await row.getByRole('button', { name: `Tirar ${reviewerName} do trabalho nº ${number}` }).click();
    await expect(row.getByTestId('paper-reviewers')).toContainText('Sem avaliador');
    await expect(row).toContainText('Enviado');
    await reviewerPage.reload();
    await expect(reviewerPage.getByTestId('nothing-to-review')).toBeVisible();
    const reviewerToken = await reviewerPage.evaluate(() => JSON.parse(localStorage.getItem('sieamb-auth')!).access_token as string);
    const file = await reviewerPage.request.get(`/api/v1/submissions/file?id=${paperId}`, { headers: { authorization: `Bearer ${reviewerToken}` } });
    expect(file.status()).toBe(404);
    await authorPage.reload();
    await expect(authorPage.getByTestId('paper-card').getByRole('link', { name: 'Alterar' })).toBeVisible();

    await admin(`/rest/v1/audit_logs?actor_id=eq.${organiserId}`, { method: 'DELETE' }).catch(() => undefined);
    await authorContext.close();
    await reviewerContext.close();
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
