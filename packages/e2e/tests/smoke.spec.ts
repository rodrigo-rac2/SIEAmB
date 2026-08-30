import { expect, test } from '@playwright/test';

test.describe('public site @smoke', () => {
  test('root redirects to the current event home', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/2026\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Seminário Internacional de Estudos Ambientais',
    );
  });

  test('home renders hero, quick links, dates and news', async ({ page }) => {
    await page.goto('/2026/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /Datas Importantes/i }).first()).toBeVisible();
    await expect(page.getByText('Últimos Avisos')).toBeVisible();
  });

  test('navigates to every public page', async ({ page, isMobile }) => {
    const routes = [
      ['/2026/o-evento', 'O Evento'],
      ['/2026/areas-tematicas', 'Áreas Temáticas'],
      ['/2026/submissoes', 'Submissão de Trabalhos'],
      ['/2026/inscricoes', 'Inscrições'],
      ['/2026/datas-importantes', 'Datas Importantes'],
      ['/2026/avisos', 'Avisos'],
      ['/2026/local', 'Local'],
      ['/2026/contato', 'Contato'],
      ['/edicoes-anteriores', 'Edições Anteriores'],
    ] as const;

    test.skip(isMobile, 'direct-URL coverage is enough on one viewport');

    for (const [path, heading] of routes) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toContainText(heading);
    }
  });

  test('news list → detail works', async ({ page }) => {
    await page.goto('/2026/avisos');
    await page
      .getByRole('link', { name: 'Site do II SIEAmB está no ar' })
      .first()
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Site do II SIEAmB está no ar',
    );
    await expect(page.getByText(/portal oficial/)).toBeVisible();
  });

  test('archived edition is reachable via its slug', async ({ page }) => {
    await page.goto('/2025/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'I Seminário Internacional de Estudos Ambientais',
    );
  });

  test('unknown route shows the 404 page', async ({ page }) => {
    await page.goto('/2026/nao-existe');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Página não encontrada');
  });
});

test.describe('registration form @smoke', () => {
  test('blocks an invalid CPF and submits with a valid one', async ({ page }) => {
    await page.goto('/2026/inscricoes/nova');

    await page.getByLabel(/Nome completo/).fill('Maria da Silva Santos');
    await page.getByLabel(/E-mail/).fill('maria@example.com');
    await page.getByLabel('CPF').fill('111.111.111-11');
    await page.getByLabel(/^Senha/).fill('senha-segura-123');
    await page.getByRole('button', { name: /Enviar pré-inscrição/ }).click();
    await expect(page.getByText('CPF inválido. Confira os dígitos.')).toBeVisible();

    await page.getByLabel('CPF').fill('529.982.247-25');
    await page.getByRole('button', { name: /Enviar pré-inscrição/ }).click();
    await expect(page.getByText('Pré-inscrição recebida!')).toBeVisible();
  });
});

test.describe('i18n @smoke', () => {
  test('defaults to pt-BR regardless of browser language', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' });
    const page = await context.newPage();
    await page.goto('/2026/');
    await expect(page.getByRole('link', { name: 'Inscrições', exact: true }).first()).toBeVisible();
    await context.close();
  });

  test('flag buttons switch the language', async ({ page }) => {
    await page.goto('/2026/');
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.getByRole('link', { name: 'Registration', exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: '中文' }).click();
    await expect(page.getByRole('link', { name: '会议注册' }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Português' }).click();
    await expect(
      page.getByRole('link', { name: 'Inscrições', exact: true }).first(),
    ).toBeVisible();
  });
});
