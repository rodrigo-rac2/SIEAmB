import { expect, test } from '@playwright/test';

test.describe('public site @smoke', () => {
  test('root redirects to the current event home', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/2027\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Seminário Internacional de Estudos Ambientais',
    );
  });

  test('home renders hero, quick links, dates and news', async ({ page }) => {
    await page.goto('/2027/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Committee request: days written out on the home page, compact range elsewhere.
    await expect(page.locator('.hero__meta')).toContainText('24, 25 e 26 de março de 2027');
    await expect(page.locator('.topbar')).toContainText(/24\s?[–-]\s?26 de março de 2027/);
    await expect(page.getByRole('link', { name: /Datas Importantes/i }).first()).toBeVisible();
    await expect(page.getByText('Últimos Avisos')).toBeVisible();
  });

  test('navigates to every public page', async ({ page, isMobile }) => {
    const routes = [
      ['/2027/o-evento', 'O Evento'],
      ['/2027/organizacao', 'Equipe'],
      ['/2027/areas-tematicas', 'Áreas Temáticas'],
      ['/2027/submissoes', 'Submissão de Trabalhos'],
      ['/2027/inscricoes', 'Inscrições'],
      ['/2027/datas-importantes', 'Datas Importantes'],
      ['/2027/avisos', 'Avisos'],
      ['/2027/local', 'Local'],
      ['/2027/contato', 'Contato'],
      ['/edicoes-anteriores', 'Edições Anteriores'],
    ] as const;

    test.skip(isMobile, 'direct-URL coverage is enough on one viewport');

    for (const [path, heading] of routes) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toContainText(heading);
    }
  });

  test('news list → detail works', async ({ page }) => {
    await page.goto('/2027/avisos');
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
      '1º Seminário Internacional de Estudos Ambientais',
    );
  });

  test('archived edition recap: committee and anais', async ({ page, isMobile }) => {
    test.skip(isMobile, 'nav links are in the drawer on mobile; covered on desktop');
    await page.goto('/2025/');
    // Archived nav is reduced: no registration/submissions, anais present.
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Anais' })).toBeVisible();
    await expect(
      page.getByRole('navigation').getByRole('link', { name: 'Inscrições' }),
    ).toHaveCount(0);

    await page.goto('/2025/organizacao');
    await expect(page.getByRole('heading', { name: 'Equipe Organizadora' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Palestrantes' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Me. Alex Souza Felix' })).toBeVisible();

    await page.goto('/2025/anais');
    await expect(
      page.getByRole('link', { name: /Journal of Ecoinnovation/ }),
    ).toHaveAttribute('href', /editoraverde\.org/);
    await expect(page.getByRole('link', { name: /eduCAPES/ })).toHaveAttribute(
      'href',
      /educapes\.capes\.gov\.br/,
    );

    // First edition: nothing before it, so no editions-index link in the header (the footer keeps one).
    await expect(page.locator('.topbar').getByRole('link', { name: 'Edições Anteriores' })).toHaveCount(0);
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Edições Anteriores' })).toHaveCount(0);
  });

  test('editions cross-link: archived banner and top bar link', async ({ page }) => {
    // Archived edition shows a banner pointing to the current edition.
    await page.goto('/2025/');
    const banner = page.getByRole('note');
    await expect(banner).toContainText('edição anterior');
    await banner.getByRole('link').click();
    await expect(page).toHaveURL(/\/2027\/$/);

    // Current edition reaches the editions index from the top bar (visible on every viewport).
    await page.locator('.topbar').getByRole('link', { name: 'Edições Anteriores' }).click();
    await expect(page).toHaveURL(/\/edicoes-anteriores$/);
    await expect(page.getByRole('link', { name: /^1º Seminário Internacional/ })).toBeVisible();
  });

  test('each edition renders its own palette', async ({ page }) => {
    const topbarColor = async (path: string) => {
      await page.goto(path);
      return page
        .locator('.topbar')
        .evaluate((el) => getComputedStyle(el).backgroundColor);
    };
    // 2026 uses the official II SIEAmB dark brown; 2025 keeps its archived first-edition palette.
    expect(await topbarColor('/2027/')).toBe('rgb(57, 33, 16)');
    expect(await topbarColor('/2025/')).toBe('rgb(16, 31, 58)');
  });

  test('2026 renders the official identity: lockup, texture, fonts', async ({ page }) => {
    await page.goto('/2027/');
    const hero = page.locator('.hero');
    await expect(hero).toHaveClass(/hero--light/);
    await expect(hero.locator('img.hero__brand-logo')).toBeVisible();
    await expect(hero.locator('.brand-title__l3')).toHaveText('Estudos Ambientais');
    // Accessible title survives the image lockup.
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'II Seminário Internacional de Estudos Ambientais',
    );
    const fonts = await page.locator('h1').evaluate((el) => {
      const cs = getComputedStyle(el);
      return { heading: cs.fontFamily, body: getComputedStyle(document.querySelector('main')!).fontFamily };
    });
    expect(fonts.heading).toContain('Garet');
    expect(fonts.body).toContain('Lora');
    await expect(page.locator('.site-header__logo-img')).toHaveAttribute('src', /brand\/2027\/logo\.png/);
  });

  test('unknown route shows the 404 page', async ({ page }) => {
    await page.goto('/2027/nao-existe');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Página não encontrada');
  });
});

test.describe('registration form @smoke', () => {
  test('blocks an invalid CPF and submits with a valid one', async ({ page }) => {
    await page.goto('/2027/inscricoes/nova');

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
    await page.goto('/2027/');
    await expect(page.getByRole('link', { name: 'Inscrições', exact: true }).first()).toBeVisible();
    await context.close();
  });

  test('flag buttons switch the language', async ({ page }) => {
    await page.goto('/2027/');
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.getByRole('link', { name: 'Registration', exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: '中文' }).click();
    await expect(page.getByRole('link', { name: '会议注册' }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Português' }).click();
    await expect(
      page.getByRole('link', { name: 'Inscrições', exact: true }).first(),
    ).toBeVisible();
  });

  test('content from the data files follows the language: venue, dates, team, fees, areas, news, bios, about', async ({ browser }) => {
    const context = await browser.newContext();
    await context.addInitScript(() => localStorage.setItem('sieamb-locale', 'en'));
    const page = await context.newPage();
    await page.goto('/2027/');
    await expect(page.locator('.hero__meta')).toContainText('Online event');
    await expect(page.locator('.hero__meta')).not.toContainText('Evento online');
    await page.goto('/2027/datas-importantes');
    await expect(page.getByRole('row', { name: /Call for papers released/ })).toBeVisible();
    await expect(page.getByText('Lançamento do edital')).toHaveCount(0);
    await page.goto('/2027/organizacao');
    await expect(page.getByRole('heading', { name: 'Scientific Committee' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Reviewers' })).toBeVisible();
    await page.goto('/2027/inscricoes');
    await expect(page.getByRole('columnheader').nth(1)).toContainText('Lot 1');
    await page.goto('/2027/local');
    await expect(page.getByRole('heading', { name: 'Online event' })).toBeVisible();
    await page.goto('/2027/areas-tematicas');
    await expect(page.getByRole('heading', { name: 'Water Resources Management' })).toBeVisible();
    await page.goto('/2027/avisos');
    await page.getByRole('link', { name: 'The II SIEAmB website is live' }).first().click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('The II SIEAmB website is live');
    await expect(page.getByText(/official portal/)).toBeVisible();
    await page.goto('/2027/o-evento');
    await expect(page.getByText(/International Seminar on Environmental Studies/).first()).toBeVisible();
    await expect(page.getByText(/Ecological Civilisation/)).toBeVisible();
    await expect(page.getByText(/Civilização Ecológica/)).toHaveCount(0);
    await page.goto('/2025/o-evento');
    await expect(page.getByText(/Environmental Governance in China and Brazil/)).toBeVisible();
    await context.close();
  });

  test('about page shows the general text, the edition section and the founders', async ({ page }) => {
    await page.goto('/2027/o-evento');
    await expect(page.getByText(/Seminário Internacional de Estudos Ambientais do PPGEGRN/)).toBeVisible();
    await expect(page.getByRole('heading', { name: /Esta edição: II SIEAmB/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Idealizadores' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ma. Najara Escarião Agripino' })).toBeVisible();
    await page.goto('/2025/o-evento');
    await expect(page.getByText(/Governança Ambiental da China e do Brasil/)).toBeVisible();
  });

  test('team page groups the 2027 team with coordination badges and the founders block', async ({ page, isMobile }) => {
    await page.goto('/2027/');
    if (!isMobile) {
      await expect(page.getByRole('navigation').getByRole('link', { name: 'Equipe' })).toBeVisible();
    }
    await page.goto('/2027/organizacao');
    await expect(page.getByRole('heading', { name: 'Idealizadores' })).toBeVisible();
    for (const group of ['Comitê Científico', 'Equipe de Revisores', 'Equipe de Mídias']) {
      await expect(page.getByRole('heading', { name: group })).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: /Thays Alves da Silva/ })).toContainText(
      'Coordenação da equipe',
    );
    await expect(page.getByRole('heading', { name: 'Arthur Lobato de Andrade' })).toBeVisible();
    await expect(page.locator('img[src*="team/arthur-lobato"]')).toBeVisible();
    // Najara is a founder, on the scientific committee and a reviewer: name three times, bio once.
    await expect(page.getByRole('heading', { name: 'Ma. Najara Escarião Agripino' })).toHaveCount(3);
    await expect(page.getByText(/Civilização Ecológica/)).toHaveCount(1);
    await expect(page.getByRole('link', { name: /Conheça os idealizadores/ })).toHaveCount(0);
  });

  test('desktop menu stays on one line at laptop width', async ({ page, isMobile }) => {
    test.skip(isMobile, 'mobile uses the drawer');
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/2027/');
    const items = page.getByRole('navigation').getByRole('link');
    const tops = await items.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
    expect(new Set(tops.map((t) => Math.round(t))).size).toBe(1);
  });

  test('registration page shows the fee matrix by lot', async ({ page }) => {
    await page.goto('/2027/inscricoes');
    const headers = page.getByRole('columnheader');
    await expect(headers.nth(1)).toContainText('Lote 1');
    await expect(headers.nth(1)).toContainText('10 de novembro de 2026');
    await expect(headers.nth(2)).toContainText('Lote 2');
    const pros = page.getByRole('row', { name: /Professores e demais profissionais/ });
    await expect(pros).toContainText(/R\$\s?70,00/);
    await expect(pros).toContainText(/R\$\s?90,00/);
  });

  test('legacy /2026/ links redirect to the 2027 slug, keeping the rest of the path', async ({ page }) => {
    await page.goto('/2026/organizacao?x=1#equipe');
    await expect(page).toHaveURL(/\/2027\/organizacao\?x=1#equipe$/);
    await expect(page.getByRole('heading', { name: 'Comitê Científico' })).toBeVisible();
  });

  test('schedule shows the programme release as a month-only date', async ({ page }) => {
    await page.goto('/2027/datas-importantes');
    const row = page.getByRole('row', { name: /Divulgação da programação/ });
    await expect(row).toContainText('dezembro de 2026');
    await expect(row).not.toContainText('1 de dezembro');
  });
});
