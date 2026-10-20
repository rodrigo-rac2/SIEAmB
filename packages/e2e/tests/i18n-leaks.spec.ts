import { expect, test, type Page } from '@playwright/test';

/**
 * Guard against Portuguese leaking into the other languages (#83).
 * For every public route, render it in pt-BR and in the target locale, collect the visible
 * text nodes, and fail on any string that is identical in both renders and looks Portuguese.
 * Proper names, URLs, numbers, codes and institution acronyms are allowed through.
 */

const ROUTES = [
  '/2027/',
  '/2027/o-evento',
  '/2027/organizacao',
  '/2027/areas-tematicas',
  '/2027/programacao',
  '/2027/submissoes',
  '/2027/inscricoes',
  '/2027/inscricoes/nova',
  '/2027/datas-importantes',
  '/2027/avisos',
  '/2027/avisos/site-do-ii-sieamb-no-ar',
  '/2027/local',
  '/2027/contato',
  '/2027/nao-existe',
  '/edicoes-anteriores',
  '/2025/',
  '/2025/o-evento',
  '/2025/organizacao',
  '/2025/anais',
  '/2025/datas-importantes',
];

const LOCALES = ['en', 'es', 'zh-CN'] as const;

/** Strings that look Portuguese: typical diacritics or very common function/content words. */
const LOOKS_PORTUGUESE =
  /[ãõç]|ção|ções|\b(de|da|do|das|dos|em|para|com|não|são|até|será|serão|edição|evento|inscri\w*|submiss\w*|trabalho\w*|programa\w*|comissão|equipe|revis\w*|pesquisa\w*|professor\w*|doutor\w*|mestr\w*|realização|contato)\b/i;

/** Allowed to stay identical: proper names, links, numbers, codes, acronyms and the event's official names. */
const ALLOWED = [
  /^https?:/i,
  /^[\d\s.,:/()–-]+$/,
  /@/,
  /^(SIEAmB|UFCG|UFPB|UnB|USP|UFF|UFMG|UFRGS|UFPel|UEPB|UNICAMP|Unicamp|IFPB|IREL|PPG[A-Z&/ ]*|CTRN|CEHAM|UERJ|UNDB|CECLA|GECHINA|GEA|ESALQ|CNPq|CAPES|CASS|AT-\d+)/,
  /Seminário Internacional de Estudos Ambientais/, // official event names stay in Portuguese
  /^(Dra?\.|Ma?\.|Me\.|Prof\.)\s/, // person names with honorifics
  /^(Lara|Daniela|Luana|Pollyanna|Arthur|Flávia|Najara|Thays|Zhou|Laura|Viviane|José|Niklas|Alex|Fernando|Ana|Hirdan|Dou|Rodrigo|Alyne|Ellora)\b/, // names without honorific
  /^[A-Z][a-z]+ [A-Z][a-z]+( [A-Z][a-z]+)*$/, // two or more capitalised words: names, places
  /^Evento online$/, // venue text comes from data on the 404 page before the event loads
];

/** Only the document, scripts, styles and data are needed to read the text: images, fonts and media would just add load on the deployment (#93). */
const TEXT_ONLY = new Set(['document', 'script', 'stylesheet', 'fetch', 'xhr', 'other']);

async function visibleTexts(page: Page, locale: string, route: string): Promise<string[]> {
  await page.route('**/*', (r) => (TEXT_ONLY.has(r.request().resourceType()) ? r.continue() : r.abort()));
  await page.addInitScript((l) => localStorage.setItem('sieamb-locale', l), locale);
  await page.goto(route, { waitUntil: 'networkidle' });
  return page.evaluate(() => {
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
      const el = node.parentElement;
      if (!text || !el) continue;
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TITLE'].includes(el.tagName)) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      out.push(text);
    }
    return out;
  });
}

test.describe('no Portuguese leaks in the other languages @smoke', () => {
  test('every public page in en, es and zh-CN', async ({ browser, isMobile }) => {
    test.skip(isMobile, 'text content is viewport-independent; desktop run covers it');
    test.setTimeout(240_000);
    const leaks: string[] = [];
    for (const route of ROUTES) {
      // One pt-BR reference render per route, shared by the three locales.
      const ptCtx = await browser.newContext();
      const pt = new Set(await visibleTexts(await ptCtx.newPage(), 'pt-BR', route));
      await ptCtx.close();
      for (const locale of LOCALES) {
        const ctx = await browser.newContext();
        const texts = await visibleTexts(await ctx.newPage(), locale, route);
        await ctx.close();
        for (const text of new Set(texts)) {
          if (!pt.has(text) || text.length < 4) continue;
          if (!LOOKS_PORTUGUESE.test(text)) continue;
          if (ALLOWED.some((re) => re.test(text))) continue;
          leaks.push(`${locale} ${route}: "${text.slice(0, 100)}"`);
        }
      }
    }
    expect(leaks, `Portuguese text shown in another language:\n${leaks.join('\n')}`).toEqual([]);
  });
});
