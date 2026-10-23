import { expect, test } from '@playwright/test';

/**
 * Behaviour that only exists for real on a deployment (Vercel rewrites, headers, caching)
 * but is also cheap to run locally against the preview server.
 */
test.describe('deployed site @deployed', () => {
  test('deep link and reload are served by the SPA (rewrites)', async ({ page }) => {
    const res = await page.goto('/2027/organizacao');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Comitê Científico' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Comitê Científico' })).toBeVisible();
  });

  test('unknown path under an edition renders the not-found page, not a server error', async ({ page }) => {
    const res = await page.goto('/2027/pagina-que-nao-existe');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/não encontrada/i);
  });

  test('edital files are served as files, not swallowed by the SPA rewrite (#11)', async ({ page, request }) => {
    await page.goto('/2027/editais/submissao-e-apresentacao-de-trabalhos');
    const files = page.locator('.edital__files a[href^="/docs/"]');
    await expect(files).toHaveCount(4);
    // Signatures, not content-type: the local preview server sends none for .docx/.pptx.
    // A missing file would come back as the SPA's index.html with status 200.
    const magic: Record<string, string> = { pdf: '%PDF', docx: 'PK', pptx: 'PK' };
    for (const href of await files.evaluateAll((as) => as.map((a) => a.getAttribute('href')!))) {
      const res = await request.get(href);
      expect(res.status(), href).toBe(200);
      expect(res.headers()['content-type'] ?? '', href).not.toMatch(/text\/html/);
      const body = await res.body();
      expect(body.subarray(0, 4).toString('latin1'), href).toMatch(new RegExp(`^${magic[href.split('.').pop()!]}`));
      expect(body.length, href).toBeGreaterThan(5000);
    }
  });

  test('language choice survives a reload', async ({ page }) => {
    await page.goto('/2027/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => localStorage.getItem('sieamb-locale'))).toBe('en');
    await page.getByRole('button', { name: 'Português' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  });

  test('mobile drawer lists Equipe and closes after navigating', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'drawer only exists on mobile');
    await page.goto('/2027/');
    await page.getByRole('button', { name: /menu/i }).click();
    await page.getByRole('navigation').getByRole('link', { name: 'Equipe' }).click();
    await expect(page).toHaveURL(/\/2027\/organizacao$/);
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Equipe' })).toBeHidden();
  });

  test('team photos are served as images', async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/team/najara-agripino.jpg`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('image/jpeg');
  });

  test('www and dev hosts behave on the real domains', async ({ request, baseURL }) => {
    test.skip(!baseURL?.includes('sieamb.org'), 'only meaningful on the real domains');
    const www = await request.get('https://www.sieamb.org/', { maxRedirects: 0 });
    expect(www.status()).toBe(308);
    expect(www.headers().location).toMatch(/^https:\/\/sieamb\.org\//);
    const dev = await request.get('https://dev.sieamb.org/2027/');
    expect(dev.status()).toBe(200);
  });
});
