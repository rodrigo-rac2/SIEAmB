import { expect, test, type Page } from '@playwright/test';
import { EVENT, isTestDeployment } from './helpers';

/**
 * What the public pages say about sending papers in each state of the window (#306, #324, #335).
 *
 * The window of the shared dev site stays as it is: closing it there would stop the people who
 * are testing. The server's answer is replaced inside this browser only, so nothing here writes
 * to the database and nobody else sees it.
 */
const RULES = '**/api/v1/submissions/rules*';
const WINDOW = { opensAt: '2026-11-15T00:00:00-03:00', closesAt: '2027-01-18T23:59:59-03:00' };

/** Answers the window question with `state`; tells how many times the page asked. */
async function answer(page: Page, state: 'open' | 'closed' | 'not_open' | 'fails') {
  const asked = { times: 0 };
  await page.route(RULES, (route) => {
    asked.times += 1;
    return state === 'fails'
      ? route.fulfill({ status: 500, json: { error: 'internal' } })
      : route.fulfill({ json: { state, ...WINDOW } });
  });
  return asked;
}

async function homeOffersNoSending(page: Page) {
  await page.goto(`/${EVENT}/`);
  // The strip is the plain one, and it only shows once the answer is in.
  await expect(page.getByText('Edital publicado')).toBeVisible();
  await expect(page.getByTestId('edital-strip-waiting')).toHaveCount(0);
  await expect(page.getByTestId('hero-submit-waiting')).toHaveCount(0);
  await expect(page.getByTestId('hero-submit')).toHaveCount(0);
  await expect(page.getByTestId('papers-open-badge')).toHaveCount(0);
  await expect(page.getByTestId('papers-open-cta')).toHaveCount(0);
  await expect(page.getByText('Submissões abertas')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Enviar trabalho' })).toHaveCount(0);
  // Registering is another matter and stays on offer.
  await expect(page.getByRole('link', { name: 'Fazer inscrição' }).first()).toBeVisible();
}

test.describe('the window for sending papers, in each of its states @window', () => {
  // The pages only ask about the window where the submission system is on.
  test.skip(({ baseURL }) => !isTestDeployment(baseURL), 'runs against dev and preview deployments only');

  for (const [state, title] of [
    ['closed', 'Submissões encerradas'],
    ['not_open', 'As submissões ainda não abriram'],
  ] as const) {
    test(`${state}: nothing offers to send a paper, on the home or on Submissões`, async ({ page }) => {
      const asked = await answer(page, state);
      await homeOffersNoSending(page);

      await page.goto(`/${EVENT}/submissoes`);
      const box = page.getByTestId('submissions-open');
      await expect(box.getByRole('heading', { name: title })).toBeVisible();
      await expect(box.getByRole('link', { name: 'Enviar trabalho' })).toHaveCount(0);
      await expect(box.getByRole('link', { name: 'Meus trabalhos' })).toBeVisible();
      await expect(page.getByText('Submissões abertas')).toHaveCount(0);
      // The rules stay one click away whatever the window says.
      await expect(page.getByRole('link', { name: /Ler o edital de submissão/ })).toBeVisible();
      // Both pages asked, and what they showed came from the answer given here.
      expect(asked.times).toBeGreaterThanOrEqual(2);
    });
  }

  test('the server cannot say: the home promises nothing and Submissões says it could not check', async ({ page }) => {
    const asked = await answer(page, 'fails');
    await homeOffersNoSending(page);

    await page.goto(`/${EVENT}/submissoes`);
    const box = page.getByTestId('submissions-unknown');
    await expect(box.getByRole('heading', { name: 'Não foi possível verificar as submissões agora' })).toBeVisible();
    await expect(box.getByRole('link', { name: 'Meus trabalhos' })).toBeVisible();
    await expect(page.getByTestId('submissions-open')).toHaveCount(0);
    await expect(page.getByText(/Submissões (abertas|encerradas)/)).toHaveCount(0);
    await expect(page.getByText('abrem em breve')).toHaveCount(0);
    expect(asked.times).toBeGreaterThanOrEqual(2);
  });

  test('a slow answer: the pages say they are loading and never show a state the answer replaces', async ({ page }) => {
    // The answer is held until the test lets it go.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let asking!: () => void;
    const asked = new Promise<void>((resolve) => (asking = resolve));
    await page.route(RULES, async (route) => {
      asking();
      await held;
      await route.fulfill({ json: { state: 'open', ...WINDOW } });
    });

    await page.goto(`/${EVENT}/`);
    await asked;
    const waiting = page.getByTestId('edital-strip-waiting');
    await expect(waiting).toBeVisible();
    await expect(waiting).toContainText('Carregando…');
    await expect(page.getByTestId('hero-submit-waiting')).toBeAttached();
    // Neither of the two strips the answer could turn into, and no button yet.
    await expect(page.getByText('Edital publicado')).toHaveCount(0);
    await expect(page.getByTestId('papers-open-badge')).toHaveCount(0);
    await expect(page.getByTestId('hero-submit')).toHaveCount(0);
    // The rest of the home is there meanwhile.
    await expect(page.getByRole('link', { name: 'Fazer inscrição' }).first()).toBeVisible();

    release();
    await expect(page.getByTestId('papers-open-badge')).toHaveText('Submissões abertas');
    await expect(page.getByTestId('hero-submit')).toBeVisible();
    await expect(waiting).toHaveCount(0);
    await expect(page.getByTestId('hero-submit-waiting')).toHaveCount(0);
    await expect(page.getByText('Edital publicado')).toHaveCount(0);
  });

  test('a slow answer on Submissões: loading, then the answer, never "abrem em breve"', async ({ page }) => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let asking!: () => void;
    const asked = new Promise<void>((resolve) => (asking = resolve));
    await page.route(RULES, async (route) => {
      asking();
      await held;
      await route.fulfill({ json: { state: 'closed', ...WINDOW } });
    });

    await page.goto(`/${EVENT}/submissoes`);
    await asked;
    await expect(page.getByTestId('submissions-loading')).toContainText('Carregando…');
    await expect(page.getByTestId('submissions-open')).toHaveCount(0);
    await expect(page.getByText('abrem em breve')).toHaveCount(0);

    release();
    await expect(page.getByTestId('submissions-open').getByRole('heading', { name: 'Submissões encerradas' })).toBeVisible();
    await expect(page.getByTestId('submissions-loading')).toHaveCount(0);
  });
});
