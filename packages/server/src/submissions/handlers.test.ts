import { describe, expect, it } from 'vitest';
import { EMAIL_LOCALES } from '../payments/emailTemplates';
import { renderOrganiserEmail, renderSubmissionEmail } from './emails';
import {
  DOWNLOAD_LINK_SECONDS,
  PEOPLE_SEARCHES_PER_HOUR,
  PEOPLE_SUGGESTIONS,
  UPLOADS_PER_HOUR,
  handleSubmissions,
  type SubmissionDeps,
} from './handlers';
import { maskEmail, openEmail, sealEmail } from './people';
import { RULES, areaName, areaRefs, rulesFor, submissionClock, windowState } from './rules';
import { EVENT, MAIN, NOW, ORGANISER, OTHER, call, docx, pdf, setup } from './testing';

interface Answer {
  submission: Record<string, unknown>;
  submissions: Record<string, unknown>[];
  limits: Record<string, number>;
  [key: string]: unknown;
}
const body = async (response: Response) => (await response.json()) as Answer;

const R = rulesFor('2027')!;
const PATH = `2027/${MAIN.id}/3f2b8c1e-9a4d-4e7f-8b21-6c5d4e3f2a10.pdf`;

const ME = { fullName: 'Maria Clara de Souza', email: MAIN.email };

/**
 * What the form sends. `coauthors` is shorthand for "Maria first, then these";
 * `authors` gives the whole list, in order, as the form really sends it.
 */
const paper = (over: Record<string, unknown> = {}) => {
  const { coauthors = [{ fullName: 'João Lima', email: 'Joao@UFPB.br' }], authors, ...rest } = over as {
    coauthors?: unknown[];
    authors?: unknown[];
  } & Record<string, unknown>;
  return {
    eventSlug: '2027',
    title: 'Governança da água no semiárido paraibano',
    titleEn: 'Water governance in the semi-arid region of Paraíba',
    modality: 'RESUMO_EXPANDIDO',
    areaRef: 'a1',
    abstract: 'Este trabalho analisa a governança da água em municípios do semiárido, com base em entrevistas e dados públicos.',
    keywords: ['água', 'governança', 'semiárido'],
    keywordsEn: ['water', 'governance'],
    authors: authors ?? [ME, ...coauthors],
    filePath: PATH,
    fileName: 'Resumo expandido - Maria.pdf',
    locale: 'pt-BR',
    ...rest,
  };
};

/** A context with a 5-page PDF already uploaded by the main author. */
async function ready(pages = 5, options: Parameters<typeof setup>[0] = {}) {
  const ctx = setup(options);
  ctx.files.objects.set(PATH, await pdf(pages));
  const save = (data: Record<string, unknown>, token = ctx.tokens.main) =>
    handleSubmissions(call('POST', 'save', { token, body: data }), 'save', ctx.deps);
  return { ...ctx, save };
}

describe('rules of the edital', () => {
  it('are the ones the edital states', () => {
    expect(R).toMatchObject({
      maxAuthors: 5,
      maxAsMainAuthor: 3,
      maxAsCoauthor: 5,
      maxKeywords: 5,
      formats: ['pdf', 'docx'],
      modalities: { ARTIGO: { minPages: 12, maxPages: 15 }, RESUMO_EXPANDIDO: { minPages: 4, maxPages: 6 } },
    });
    expect(R.opensAt).toBe('2026-11-15T00:00:00-03:00');
    expect(R.closesAt).toBe('2027-01-18T23:59:59-03:00');
  });

  it('opens and closes on the edital dates, to the second', () => {
    expect(windowState(R, new Date('2026-11-14T23:59:59-03:00'))).toBe('not_open');
    expect(windowState(R, new Date('2026-11-15T00:00:00-03:00'))).toBe('open');
    expect(windowState(R, new Date('2027-01-18T23:59:59-03:00'))).toBe('open');
    // The edital's date is what the site shows; it locks nothing unless the switch is on (#233).
    expect(R.locksAtClose).toBe(false);
    expect(windowState(R, new Date('2027-01-19T00:00:00-03:00'))).toBe('open');
    expect(windowState(R, new Date('2027-06-01T00:00:00-03:00'))).toBe('open');
    const locking = { ...R, locksAtClose: true };
    expect(windowState(locking, new Date('2027-01-18T23:59:59-03:00'))).toBe('open');
    expect(windowState(locking, new Date('2027-01-19T00:00:00-03:00'))).toBe('closed');
  });

  it('has rules and areas for the 2027 edition only', () => {
    expect(rulesFor('2025')).toBeNull();
    expect(rulesFor('nope')).toBeNull();
    expect(areaRefs('2027')).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8']);
    expect(areaRefs('nope')).toEqual([]);
    expect(areaName('2027', 'a3')).toBe('Economia e Desenvolvimento Sustentável');
    expect(areaName('2027', 'zz')).toBe('zz');
    expect(RULES).toHaveLength(1);
  });

  it('lets the window clock be moved outside production only', () => {
    const real = new Date('2026-12-01T12:00:00Z');
    expect(submissionClock({ SUBMISSIONS_NOW: '2027-02-01T12:00:00-03:00' }, real).toISOString()).toBe('2027-02-01T15:00:00.000Z');
    expect(submissionClock({ SUBMISSIONS_NOW: '2027-02-01T12:00:00-03:00', VERCEL_ENV: 'production' }, real)).toBe(real);
    expect(submissionClock({ SUBMISSIONS_NOW: 'garbage' }, real)).toBe(real);
    expect(submissionClock({}, real)).toBe(real);
  });
});

describe('router', () => {
  it('answers 404, 405 and 503 like the other functions', async () => {
    const { deps } = setup();
    expect((await handleSubmissions(call('GET', 'nope'), 'nope', deps)).status).toBe(404);
    expect((await handleSubmissions(call('GET', 'save'), 'save', deps)).status).toBe(405);
    expect((await handleSubmissions(call('GET', 'mine'), 'mine', null)).status).toBe(503);
  });

  it('turns an unexpected failure into a 500 without leaking it', async () => {
    const { deps, tokens, store, logs } = setup();
    store.listByAuthorEmail = async () => {
      throw new Error('boom: secret');
    };
    const response = await handleSubmissions(call('GET', 'mine', { token: tokens.main, query: '?eventSlug=2027' }), 'mine', deps);
    expect(response.status).toBe(500);
    expect(await body(response)).toEqual({ error: 'server_error' });
    expect(logs.at(-1)?.event).toBe('submission_request_failed');
  });

  it('says when submissions open and close without a login', async () => {
    const { deps, clock } = setup();
    const get = (d = deps) => handleSubmissions(call('GET', 'rules', { query: '?eventSlug=2027' }), 'rules', d);
    expect(await body(await get())).toEqual({ state: 'open', opensAt: R.opensAt, closesAt: R.closesAt, pastDeadline: false });
    clock.window = new Date('2027-01-19T00:00:01-03:00');
    // Past the published date and still open: the date is postponed by announcement, not by the clock.
    expect(await body(await get())).toMatchObject({ state: 'open', pastDeadline: true });
    const locking = setup({ locksAtClose: true });
    locking.clock.window = new Date('2027-01-19T00:00:01-03:00');
    expect(await body(await get(locking.deps))).toMatchObject({ state: 'closed', pastDeadline: true });
    expect((await handleSubmissions(call('GET', 'rules', { query: '?eventSlug=2025' }), 'rules', deps)).status).toBe(404);
  });
});

describe('who is asking', () => {
  it.each([
    ['GET', 'mine', '?eventSlug=2027'],
    ['GET', 'file', '?id=sub-1'],
    ['POST', 'upload-url', ''],
    ['POST', 'save', ''],
    ['POST', 'withdraw', ''],
  ] as const)('%s %s needs a login', async (method, action, query) => {
    const { deps, store, files, outbox } = setup();
    for (const token of [undefined, 'forged']) {
      const options = method === 'GET' ? { token, query } : { token, body: paper() };
      const response = await handleSubmissions(call(method, action, options), action, deps);
      expect(response.status).toBe(401);
    }
    expect(store.submissions).toEqual([]);
    expect(files.uploadUrls).toEqual([]);
    expect(outbox.rows).toEqual([]);
  });

  it('refuses an account whose e-mail is not confirmed', async () => {
    const { deps, auth } = setup();
    const token = auth.login({ ...MAIN, id: 'unconfirmed', emailConfirmed: false }, 'tok-unconfirmed');
    const response = await handleSubmissions(call('POST', 'save', { token, body: paper() }), 'save', deps);
    expect(response.status).toBe(403);
  });

  it('answers 404 for an edition with no submission rules', async () => {
    const { deps, tokens } = setup();
    const response = await handleSubmissions(call('POST', 'save', { token: tokens.main, body: paper({ eventSlug: '2025' }) }), 'save', deps);
    expect(response.status).toBe(404);
    expect(await body(response)).toEqual({ error: 'event_not_found' });
  });
});

describe('upload-url', () => {
  const ask = (deps: SubmissionDeps, token: string, data: Record<string, unknown>) =>
    handleSubmissions(call('POST', 'upload-url', { token, body: { eventSlug: '2027', ...data } }), 'upload-url', deps);

  it('hands out a place in the person’s own folder, with a name of ours', async () => {
    const { deps, tokens, files } = setup();
    const response = await ask(deps, tokens.main, { fileName: '../../Trabalho Final (1).PDF', size: 300_000 });
    expect(response.status).toBe(200);
    const data = await body(response);
    expect(data.path).toMatch(new RegExp(`^2027/${MAIN.id}/[0-9a-f-]{36}\\.pdf$`));
    expect(data.uploadUrl).toBe(`https://storage.example/upload/${data.path as string}?token=t`);
    expect(files.uploadUrls).toEqual([data.path]);
  });

  it.each([
    ['a .doc', { fileName: 'x.doc', size: 10 }, 'wrong_file_type'],
    ['an executable', { fileName: 'x.pdf.exe', size: 10 }, 'wrong_file_type'],
    ['no name', { size: 10 }, 'wrong_file_type'],
    ['no size', { fileName: 'x.pdf' }, 'file_missing'],
    ['an empty file', { fileName: 'x.pdf', size: 0 }, 'file_missing'],
    ['a size that is not a number', { fileName: 'x.pdf', size: '12' }, 'file_missing'],
    ['a file one byte over 10 MB', { fileName: 'x.pdf', size: 10 * 1024 * 1024 + 1 }, 'file_too_large'],
  ])('refuses %s', async (_name, data, error) => {
    const { deps, tokens, files } = setup();
    const response = await ask(deps, tokens.main, data);
    expect(response.status).toBe(400);
    expect((await body(response)).error).toBe(error);
    expect(files.uploadUrls).toEqual([]);
  });

  it('accepts exactly 10 MB', async () => {
    const { deps, tokens } = setup();
    expect((await ask(deps, tokens.main, { fileName: 'x.docx', size: 10 * 1024 * 1024 })).status).toBe(200);
  });

  it(`stops after ${UPLOADS_PER_HOUR} links in an hour for one person, not for another`, async () => {
    const { deps, tokens } = setup();
    for (let i = 0; i < UPLOADS_PER_HOUR; i += 1) await ask(deps, tokens.main, { fileName: 'x.pdf', size: 10 });
    expect((await ask(deps, tokens.main, { fileName: 'x.pdf', size: 10 })).status).toBe(429);
    expect((await ask(deps, tokens.other, { fileName: 'x.pdf', size: 10 })).status).toBe(200);
  });

  it.each([
    ['before they open', '2026-11-14T23:00:00-03:00', 'submissions_not_open'],
    ['after they close, when the date locks', '2027-01-19T00:00:01-03:00', 'submissions_closed'],
  ])('hands out nothing %s', async (_name, when, error) => {
    const { deps, tokens, clock, files } = setup({ locksAtClose: true });
    clock.window = new Date(when);
    const response = await ask(deps, tokens.main, { fileName: 'x.pdf', size: 10 });
    expect(response.status).toBe(409);
    expect(await body(response)).toEqual({ error });
    expect(files.uploadUrls).toEqual([]);
  });
});

describe('sending a paper', () => {
  it('saves it with the authors in the order given, numbers it and answers with what the author sees', async () => {
    const { save, store } = await ready();
    const response = await save(paper());
    expect(response.status).toBe(201);
    const { submission } = await body(response);
    expect(submission).toMatchObject({
      title: 'Governança da água no semiárido paraibano',
      modality: 'RESUMO_EXPANDIDO',
      areaRef: 'a1',
      fileName: 'Resumo expandido - Maria.pdf',
      filePages: 5,
      status: 'SUBMITTED',
      position: 1,
      sentByMe: true,
      canEdit: true,
      authors: [
        { position: 1, fullName: 'Maria Clara de Souza', email: MAIN.email },
        { position: 2, fullName: 'João Lima', email: 'joao@ufpb.br' },
      ],
    });
    expect(submission.number).toEqual(expect.any(Number));
    expect(JSON.stringify(submission)).not.toContain(PATH);
    expect(store.submissions).toHaveLength(1);
    expect(store.submissions[0]).toMatchObject({ userId: MAIN.id, eventId: EVENT.id, filePath: PATH });
  });

  it('tells every author and every organiser, by e-mail and in the site', async () => {
    const { save, store, sent, outbox } = await ready();
    store.organisers = [{ userId: ORGANISER.id, email: ORGANISER.email, fullName: 'Viviane Farias' }];
    await save(paper({ coauthors: [{ fullName: 'João Lima', email: OTHER.email }, { fullName: 'Sem Conta', email: 'semconta@ufrn.br' }] }));
    expect(sent.map((m) => m.to).sort()).toEqual([OTHER.email, MAIN.email, 'semconta@ufrn.br', ORGANISER.email].sort());
    const toAuthor = sent.find((m) => m.to === OTHER.email)!;
    expect(toAuthor.subject).toMatch(/^Trabalho nº \d+ recebido \(II SIEAmB\)$/);
    expect(toAuthor.text).toContain('Olá, João.');
    expect(toAuthor.text).toContain('enviado por Maria Clara de Souza');
    expect(toAuthor.text).toContain('https://dev.sieamb.org/2027/meus-trabalhos');
    const toOrganiser = sent.find((m) => m.to === ORGANISER.email)!;
    expect(toOrganiser.subject).toContain('Novo trabalho nº');
    expect(toOrganiser.text).toContain('Resumo expandido · Governança, Políticas Públicas e Direito Ambiental');
    expect(toOrganiser.text).toContain('Autores: Maria Clara de Souza; João Lima; Sem Conta');
    expect(toOrganiser.text).toContain('https://dev.sieamb.org/2027/painel/trabalhos');
    // In the site: the authors who have an account, and the organiser.
    expect(outbox.notifications.map((n) => `${n.userId}:${n.kind}`).sort()).toEqual(
      [`${MAIN.id}:submission.received`, `${OTHER.id}:submission.received`, `${ORGANISER.id}:organiser.submission.received`].sort(),
    );
  });

  it('is still saved when the e-mails or the notices fail', async () => {
    const ctx = setup({ failSends: true });
    ctx.files.objects.set(PATH, await pdf(5));
    ctx.outbox.failNotifications = true;
    const response = await handleSubmissions(call('POST', 'save', { token: ctx.tokens.main, body: paper() }), 'save', ctx.deps);
    expect(response.status).toBe(201);
    expect(ctx.store.submissions).toHaveLength(1);
    // The e-mails wait in the outbox for the background job.
    expect(ctx.outbox.rows.every((r) => r.status === 'PENDING')).toBe(true);
    expect(ctx.outbox.rows).toHaveLength(2);
  });

  it.each([
    ['a four-letter title', { title: 'Água' }, 'invalid_title'],
    ['a title over 300 characters', { title: 'a'.repeat(301) }, 'invalid_title'],
    ['no English title', { titleEn: '' }, 'invalid_title_en'],
    ['an unknown modality', { modality: 'POSTER' }, 'invalid_modality'],
    ['an area of another edition', { areaRef: 'a2025-01' }, 'invalid_area'],
    ['a 49-character abstract', { abstract: 'x'.repeat(49) }, 'invalid_abstract'],
    ['an abstract over 5000 characters', { abstract: 'x'.repeat(5001) }, 'invalid_abstract'],
    ['no keywords', { keywords: [] }, 'invalid_keywords'],
    ['six keywords', { keywords: ['a1', 'b2', 'c3', 'd4', 'e5', 'f6'] }, 'invalid_keywords'],
    ['six English keywords', { keywordsEn: ['a1', 'b2', 'c3', 'd4', 'e5', 'f6'] }, 'invalid_keywords'],
    ['a one-letter keyword', { keywords: ['a'] }, 'invalid_keywords'],
    ['an author without an e-mail', { coauthors: [{ fullName: 'João Lima' }] }, 'invalid_author'],
    ['an author with a bad e-mail', { coauthors: [{ fullName: 'João Lima', email: 'joao@' }] }, 'invalid_author'],
    ['an author without a name', { coauthors: [{ fullName: 'J', email: 'j@ufpb.br' }] }, 'invalid_author'],
    ['an author picked with a reference we did not seal', { coauthors: [{ fullName: 'João Lima', ref: 'bm90LW91cnMtYXQtYWxsLW5vdC1vdXJzLWF0LWFsbC1ub3Qtb3Vycw' }] }, 'invalid_author'],
    ['no authors at all', { authors: [] }, 'sender_not_listed'],
    ['a list without the person who is sending it', { authors: [{ fullName: 'João Lima', email: 'joao@ufpb.br' }] }, 'sender_not_listed'],
    ['a list that is not a list', { authors: 'Maria' }, 'sender_not_listed'],
    ['the sender listed twice', { coauthors: [{ fullName: 'Maria', email: MAIN.email.toUpperCase() }] }, 'duplicate_author'],
    ['the same co-author twice', { coauthors: [{ fullName: 'João Lima', email: 'j@ufpb.br' }, { fullName: 'Joao L.', email: 'J@ufpb.br' }] }, 'duplicate_author'],
  ])('refuses %s', async (_name, over, error) => {
    const { save, store, sent } = await ready();
    const response = await save(paper(over));
    expect(response.status).toBe(400);
    expect((await body(response)).error).toBe(error);
    expect(store.submissions).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('accepts keywords typed as one line separated by semicolons, without repeats', async () => {
    const { save, store } = await ready();
    expect((await save(paper({ keywords: 'água; Governança ;água;  semiárido', keywordsEn: '' }))).status).toBe(201);
    expect(store.submissions[0]).toMatchObject({ keywords: ['água', 'Governança', 'semiárido'], keywordsEn: [] });
  });

  it('accepts four co-authors and refuses the fifth (five authors in all)', async () => {
    const people = (n: number) => Array.from({ length: n }, (_, i) => ({ fullName: `Coautor ${i}`, email: `c${i}@ufpb.br` }));
    const four = await ready();
    expect((await four.save(paper({ coauthors: people(4) }))).status).toBe(201);
    expect(four.store.submissions[0]!.authors).toHaveLength(5);
    const five = await ready();
    const response = await five.save(paper({ coauthors: people(5) }));
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ error: 'too_many_authors', max: 5 });
  });

  it('accepts a paper with no co-author', async () => {
    const { save, store } = await ready();
    expect((await save(paper({ coauthors: [] }))).status).toBe(201);
    expect(store.submissions[0]!.authors).toHaveLength(1);
  });
});

describe('the file', () => {
  it.each([
    ['expanded abstract', 'RESUMO_EXPANDIDO', 3, 4, 6],
    ['expanded abstract', 'RESUMO_EXPANDIDO', 7, 4, 6],
    ['article', 'ARTIGO', 11, 12, 15],
    ['article', 'ARTIGO', 16, 12, 15],
  ])('refuses an %s (%s) with %i pages', async (_name, modality, pages, minPages, maxPages) => {
    const { save, store } = await ready(pages);
    const response = await save(paper({ modality }));
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ error: 'wrong_page_count', pages, minPages, maxPages });
    expect(store.submissions).toEqual([]);
  });

  it.each([
    ['RESUMO_EXPANDIDO', 4],
    ['RESUMO_EXPANDIDO', 6],
    ['ARTIGO', 12],
    ['ARTIGO', 15],
  ])('accepts %s with %i pages', async (modality, pages) => {
    const { save } = await ready(pages);
    expect((await save(paper({ modality }))).status).toBe(201);
  });

  it('checks a Word file by the page count Word wrote in it', async () => {
    const path = PATH.replace('.pdf', '.docx');
    const tooLong = setup();
    tooLong.files.objects.set(path, docx(9));
    const refused = await handleSubmissions(call('POST', 'save', { token: tooLong.tokens.main, body: paper({ filePath: path, fileName: 'r.docx' }) }), 'save', tooLong.deps);
    expect(await body(refused)).toMatchObject({ error: 'wrong_page_count', pages: 9 });
    const fine = setup();
    fine.files.objects.set(path, docx(5));
    expect((await handleSubmissions(call('POST', 'save', { token: fine.tokens.main, body: paper({ filePath: path, fileName: 'r.docx' }) }), 'save', fine.deps)).status).toBe(201);
  });

  it('accepts a Word file that does not say its page count, and records that it is unknown', async () => {
    const path = PATH.replace('.pdf', '.docx');
    const ctx = setup();
    ctx.files.objects.set(path, docx(null));
    const response = await handleSubmissions(call('POST', 'save', { token: ctx.tokens.main, body: paper({ filePath: path, fileName: 'r.docx' }) }), 'save', ctx.deps);
    expect(response.status).toBe(201);
    expect(ctx.store.submissions[0]!.filePages).toBeNull();
  });

  it('refuses a file that is not what its name says', async () => {
    const ctx = setup();
    ctx.files.objects.set(PATH, docx(5));
    const response = await handleSubmissions(call('POST', 'save', { token: ctx.tokens.main, body: paper() }), 'save', ctx.deps);
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ error: 'unreadable_file' });
  });

  it.each([
    ['no file at all', { filePath: undefined }],
    ['a path where nothing was uploaded', { filePath: `2027/${MAIN.id}/00000000-0000-4000-8000-000000000000.pdf` }],
    ['a file in someone else’s folder', { filePath: `2027/${OTHER.id}/3f2b8c1e-9a4d-4e7f-8b21-6c5d4e3f2a10.pdf` }],
    ['a path that climbs out of the folder', { filePath: `2027/${MAIN.id}/../${OTHER.id}/x.pdf` }],
    ['a file of another edition', { filePath: `2025/${MAIN.id}/3f2b8c1e-9a4d-4e7f-8b21-6c5d4e3f2a10.pdf` }],
    ['a path with no accepted extension', { filePath: `2027/${MAIN.id}/x.exe` }],
  ])('refuses %s', async (_name, over) => {
    const { save, files, store } = await ready();
    files.objects.set(`2027/${OTHER.id}/3f2b8c1e-9a4d-4e7f-8b21-6c5d4e3f2a10.pdf`, await pdf(5));
    files.objects.set(`2027/${OTHER.id}/x.pdf`, await pdf(5));
    const response = await save(paper(over));
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ error: 'file_missing' });
    expect(store.submissions).toEqual([]);
  });

  it('keeps the name the author gave, without anything that could break a download', async () => {
    const { save, store } = await ready();
    await save(paper({ fileName: '../a\\b/c"d\r\ne.pdf' }));
    expect(store.submissions[0]!.fileName).toBe('.._a_b_c_d e.pdf');
    const unnamed = await ready();
    await unnamed.save(paper({ fileName: '' }));
    expect(unnamed.store.submissions[0]!.fileName).toBe('trabalho.pdf');
  });
});

describe('limits of the edital', () => {
  it('lets a person send three papers as main author and refuses the fourth', async () => {
    const { save, store } = await ready();
    for (let i = 1; i <= 3; i += 1) store.seed({ title: `Trabalho anterior ${i}` });
    const response = await save(paper());
    expect(response.status).toBe(409);
    expect(await body(response)).toEqual({ error: 'too_many_as_main', name: 'Maria Clara de Souza', max: 3 });
    expect(store.submissions).toHaveLength(3);
  });

  it('counts the first-author limit for whoever is first in the list, not for who sends', async () => {
    const { save, store } = await ready();
    const prof = { fullName: 'Profa. Ana Reis', email: 'ana@ufrn.br' };
    for (let i = 1; i <= 3; i += 1) {
      store.seed({ title: `Da professora ${i}`, userId: 'someone', authors: [{ position: 1, ...prof }] });
    }
    // Maria sends, the professor is first: the professor's three are what counts.
    const refused = await save(paper({ authors: [prof, ME] }));
    expect(refused.status).toBe(409);
    expect(await body(refused)).toEqual({ error: 'too_many_as_main', name: 'Profa. Ana Reis', max: 3 });
    // With the professor second, it goes: three as first author do not count against other places.
    expect((await save(paper({ authors: [ME, prof] }))).status).toBe(201);
  });

  it('counts a sender in second place against the other-places limit, not the first-author one', async () => {
    const { save, store } = await ready();
    for (let i = 1; i <= 3; i += 1) store.seed({ title: `Trabalho anterior ${i}` });
    // Maria already has three as first author; as second author she can still be in more.
    expect((await save(paper({ authors: [{ fullName: 'Profa. Ana Reis', email: 'ana@ufrn.br' }, ME] }))).status).toBe(201);
    expect(store.submissions.at(-1)!.authors.map((a) => a.email)).toEqual(['ana@ufrn.br', MAIN.email]);
  });

  it('does not count a withdrawn paper, nor papers where the person is only a co-author', async () => {
    const { save, store } = await ready();
    store.seed({ title: 'Um' });
    store.seed({ title: 'Dois' });
    store.seed({ title: 'Retirado', deletedAt: NOW.toISOString() });
    store.seed({
      title: 'De outra pessoa',
      userId: OTHER.id,
      authors: [{ position: 1, fullName: 'João Lima', email: OTHER.email }, { position: 2, fullName: 'Maria', email: MAIN.email }],
    });
    expect((await save(paper({ coauthors: [] }))).status).toBe(201);
  });

  it('refuses a co-author who already is a co-author in five papers, and names them', async () => {
    const { save, store } = await ready();
    for (let i = 1; i <= 5; i += 1) {
      store.seed({
        title: `Trabalho ${i} de outra pessoa`,
        userId: 'someone',
        authors: [{ position: 1, fullName: 'Alguém', email: 'alguem@ufrn.br' }, { position: 2, fullName: 'João Lima', email: OTHER.email }],
      });
    }
    const response = await save(paper({ coauthors: [{ fullName: 'João Lima', email: OTHER.email }] }));
    expect(response.status).toBe(409);
    const answer = await body(response);
    expect(answer).toEqual({ error: 'coauthor_limit', name: 'João Lima', max: 5 });
    // The answer never repeats an address: it may have come from a suggestion.
    expect(JSON.stringify(answer)).not.toContain(OTHER.email);
  });

  it('does not count the papers a co-author sent as main author', async () => {
    const { save, store } = await ready();
    for (let i = 1; i <= 3; i += 1) {
      store.seed({ title: `Do João ${i}`, userId: OTHER.id, authors: [{ position: 1, fullName: 'João Lima', email: OTHER.email }] });
    }
    for (let i = 1; i <= 4; i += 1) {
      store.seed({
        title: `Com o João ${i}`,
        userId: 'someone',
        authors: [{ position: 1, fullName: 'Alguém', email: 'alguem@ufrn.br' }, { position: 2, fullName: 'João Lima', email: OTHER.email }],
      });
    }
    expect((await save(paper({ coauthors: [{ fullName: 'João Lima', email: OTHER.email }] }))).status).toBe(201);
  });

  it('warns when one of the authors already sent a paper with the same title, and goes on if confirmed', async () => {
    const { save, store } = await ready();
    const earlier = store.seed({
      title: 'GOVERNANCA da Agua, no semi-arido   paraibano!',
      userId: OTHER.id,
      authors: [{ position: 1, fullName: 'João Lima', email: OTHER.email }],
    });
    const data = paper({ title: 'Governança da água no semiárido paraibano', coauthors: [{ fullName: 'João Lima', email: OTHER.email }] });
    const warned = await save(data);
    expect(warned.status).toBe(409);
    expect(await body(warned)).toEqual({ error: 'duplicate_title', number: earlier.number });
    expect(store.submissions).toHaveLength(1);
    expect((await save({ ...data, confirmDuplicate: true })).status).toBe(201);
  });

  it('does not warn about a title sent by people who are not among the authors', async () => {
    const { save, store } = await ready();
    store.seed({ title: 'Governança da água no semiárido paraibano', userId: 'stranger', authors: [{ position: 1, fullName: 'X', email: 'x@y.org' }] });
    expect((await save(paper())).status).toBe(201);
  });
});

describe('anyone among the authors can send', () => {
  const PROF = { fullName: 'Prof. Carlos Meira', email: 'carlos.meira@ufcg.edu.br' };
  const JOAO = { fullName: 'João Lima', email: OTHER.email };
  const THEIRS = `2027/${OTHER.id}/cccccccc-0000-4000-8000-000000000003.pdf`;

  it('takes a paper sent by the second author, with a first author who has no account', async () => {
    const { save, store, files, tokens, sent: mails, outbox, deps } = await ready();
    files.objects.set(THEIRS, await pdf(5));
    const response = await save(paper({ authors: [PROF, JOAO], filePath: THEIRS }), tokens.other);
    expect(response.status).toBe(201);
    expect((await body(response)).submission).toMatchObject({
      position: 2,
      sentByMe: true,
      canEdit: true,
      authors: [
        { position: 1, ...PROF },
        { position: 2, ...JOAO },
      ],
    });
    expect(store.submissions[0]).toMatchObject({ userId: OTHER.id });
    // The professor is told by e-mail who sent it; only João has an account to be told in the site.
    expect(mails.map((m) => m.to).sort()).toEqual([PROF.email, OTHER.email].sort());
    expect(mails.find((m) => m.to === PROF.email)!.text).toContain('enviado por João Lima');
    expect(outbox.notifications.map((n) => n.userId)).toEqual([OTHER.id]);
    // It counts for João in "other places", not as first author.
    const list = await body(await handleSubmissions(call('GET', 'mine', { token: tokens.other, query: '?eventSlug=2027' }), 'mine', deps));
    expect(list.limits).toMatchObject({ asMain: 0, asCoauthor: 1 });
  });

  it('shows the paper to the first author once they create an account with that e-mail', async () => {
    const { save, files, tokens, auth, deps } = await ready();
    files.objects.set(THEIRS, await pdf(5));
    await save(paper({ authors: [PROF, JOAO], filePath: THEIRS }), tokens.other);
    const token = auth.login({ id: 'user-prof', email: PROF.email, emailConfirmed: true }, 'tok-prof');
    const list = await body(await handleSubmissions(call('GET', 'mine', { token, query: '?eventSlug=2027' }), 'mine', deps));
    expect(list.submissions).toHaveLength(1);
    expect(list.submissions[0]).toMatchObject({ position: 1, sentByMe: false, canEdit: true });
    expect(list.limits).toMatchObject({ asMain: 1, asCoauthor: 0 });
  });

  it('keeps the sender wherever they put themselves among five authors', async () => {
    const { save, store } = await ready();
    const others = Array.from({ length: 4 }, (_, i) => ({ fullName: `Autor ${i}`, email: `a${i}@ufpb.br` }));
    expect((await save(paper({ authors: [others[0], others[1], ME, others[2], others[3]] }))).status).toBe(201);
    expect(store.submissions[0]!.authors.map((a) => a.position)).toEqual([1, 2, 3, 4, 5]);
    expect(store.submissions[0]!.authors[2]).toMatchObject({ email: MAIN.email, position: 3 });
  });

  it('takes the name typed for the sender, since the list is what goes in the proceedings', async () => {
    const { save, store } = await ready();
    await save(paper({ authors: [{ fullName: 'Maria C. de Souza', email: MAIN.email.toUpperCase() }] }));
    expect(store.submissions[0]!.authors).toEqual([{ position: 1, fullName: 'Maria C. de Souza', email: MAIN.email }]);
  });
});

describe('name suggestions for the author list', () => {
  const search = (deps: SubmissionDeps, token: string | undefined, q: string) =>
    handleSubmissions(
      call('GET', 'people', { token, query: `?eventSlug=2027&q=${encodeURIComponent(q)}` }),
      'people',
      deps,
    );
  const known = [
    { fullName: 'Rodrigo Alves Costa', email: 'rodrigo.costa@ufcg.edu.br', institution: 'UFCG' },
    { fullName: 'Rodrigo Antônio Lima', email: 'ral@ufpb.br', institution: null },
    { fullName: 'João Lima', email: OTHER.email, institution: 'UFPB' },
    { fullName: 'Maria Clara de Souza', email: MAIN.email, institution: 'UFCG' },
  ];

  it('needs a login', async () => {
    const { deps, store } = setup();
    expect((await search(deps, undefined, 'Rodrigo')).status).toBe(401);
    expect(store.searches).toEqual([]);
  });

  it('suggests people by name with a masked e-mail, and never the address itself', async () => {
    const { deps, tokens, store } = setup();
    store.people = known;
    const response = await search(deps, tokens.main, 'Rodrigo');
    expect(response.status).toBe(200);
    const raw = await response.text();
    const { people } = JSON.parse(raw) as { people: { fullName: string; institution: string | null; emailHint: string; ref: string }[] };
    expect(people.map((p) => [p.fullName, p.institution, p.emailHint])).toEqual([
      ['Rodrigo Alves Costa', 'UFCG', 'r•••@ufcg.edu.br'],
      ['Rodrigo Antônio Lima', null, 'r•••@ufpb.br'],
    ]);
    expect(raw).not.toContain('rodrigo.costa@');
    expect(raw).not.toContain('ral@');
    // The reference is ours to open, and differs each time it is sealed.
    expect(openEmail(people[0]!.ref, deps.pepper)).toBe('rodrigo.costa@ufcg.edu.br');
    expect(openEmail(people[0]!.ref, 'another-pepper')).toBeNull();
    expect(sealEmail('a@b.co', deps.pepper)).not.toBe(sealEmail('a@b.co', deps.pepper));
  });

  it.each(['', 'R', 'Ro', ' R o ', '  '])('does not search for "%s": three letters at least', async (q) => {
    const { deps, tokens, store } = setup();
    store.people = known;
    expect(await body(await search(deps, tokens.main, q))).toEqual({ people: [] });
    expect(store.searches).toEqual([]);
  });

  it('finds a name typed without its accents, and leaves the person asking out of the list', async () => {
    const { deps, tokens, store } = setup();
    store.people = known;
    const antonio = await body(await search(deps, tokens.main, 'antonio'));
    expect((antonio.people as { fullName: string }[]).map((p) => p.fullName)).toEqual(['Rodrigo Antônio Lima']);
    const maria = await body(await search(deps, tokens.main, 'Maria Clara'));
    expect(maria.people).toEqual([]);
  });

  it(`gives at most ${PEOPLE_SUGGESTIONS} suggestions`, async () => {
    const { deps, tokens, store } = setup();
    store.people = Array.from({ length: 20 }, (_, i) => ({ fullName: `Ana Souza ${i}`, email: `ana${i}@ufcg.edu.br`, institution: null }));
    const { people } = await body(await search(deps, tokens.main, 'Ana'));
    expect(people).toHaveLength(PEOPLE_SUGGESTIONS);
  });

  it(`stops after ${PEOPLE_SEARCHES_PER_HOUR} searches in an hour for one person, not for another`, async () => {
    const { deps, tokens } = setup();
    for (let i = 0; i < PEOPLE_SEARCHES_PER_HOUR; i += 1) await search(deps, tokens.main, 'Rodrigo');
    expect((await search(deps, tokens.main, 'Rodrigo')).status).toBe(429);
    expect((await search(deps, tokens.other, 'Rodrigo')).status).toBe(200);
  });

  it('does not find an edition that does not exist', async () => {
    const { deps, tokens } = setup();
    const response = await handleSubmissions(call('GET', 'people', { token: tokens.main, query: '?eventSlug=1999&q=Rodrigo' }), 'people', deps);
    expect(response.status).toBe(404);
  });

  it('saves a picked person with their real e-mail, and tells them', async () => {
    const { save, store, deps, tokens, sent: mails } = await ready();
    store.people = known;
    const { people } = (await body(await search(deps, tokens.main, 'Rodrigo Alves'))) as unknown as { people: { fullName: string; ref: string }[] };
    const response = await save(paper({ authors: [ME, { fullName: people[0]!.fullName, ref: people[0]!.ref }] }));
    expect(response.status).toBe(201);
    expect(store.submissions[0]!.authors[1]).toEqual({ position: 2, fullName: 'Rodrigo Alves Costa', email: 'rodrigo.costa@ufcg.edu.br' });
    expect(mails.map((m) => m.to)).toContain('rodrigo.costa@ufcg.edu.br');
  });

  it('refuses the same person picked and typed, without giving the address away', async () => {
    const { save, deps } = await ready();
    const ref = sealEmail('rodrigo.costa@ufcg.edu.br', deps.pepper);
    const response = await save(paper({ authors: [ME, { fullName: 'Rodrigo Alves Costa', ref }, { fullName: 'R. Costa', ref: sealEmail('rodrigo.costa@ufcg.edu.br', deps.pepper) }] }));
    expect(response.status).toBe(400);
    const raw = await response.text();
    expect(JSON.parse(raw)).toEqual({ error: 'duplicate_author', name: 'R. Costa' });
    expect(raw).not.toContain('rodrigo.costa@');
  });

  it('masks an address without giving more than its first letter', () => {
    expect(maskEmail('rodrigo.costa@gmail.com')).toBe('r•••@gmail.com');
    expect(maskEmail('a@b.co')).toBe('a•••@b.co');
    expect(maskEmail('not-an-address')).toBe('•••');
  });
});

describe('changing a paper', () => {
  const sent = async (options: Parameters<typeof setup>[0] = {}) => {
    const ctx = await ready(5, options);
    const first = await body(await ctx.save(paper()));
    ctx.sent.length = 0;
    ctx.outbox.notifications.length = 0;
    return { ...ctx, id: first.submission.id as string, number: first.submission.number as number };
  };

  it('lets the main author change the text and the authors and keep the file', async () => {
    const { save, id, store, sent: mails, number } = await sent();
    const response = await save(paper({ id, filePath: undefined, title: 'Governança da água: versão revista', coauthors: [{ fullName: 'Ana Reis', email: 'ana@ufrn.br' }] }));
    expect(response.status).toBe(200);
    expect(store.submissions).toHaveLength(1);
    expect(store.submissions[0]).toMatchObject({ title: 'Governança da água: versão revista', filePath: PATH, filePages: 5, number });
    expect(store.submissions[0]!.authors.map((a) => a.email)).toEqual([MAIN.email, 'ana@ufrn.br']);
    expect(mails.map((m) => m.subject)).toEqual(expect.arrayContaining([`Trabalho nº ${number} alterado (II SIEAmB)`]));
    expect(mails.map((m) => m.to).sort()).toEqual([MAIN.email, 'ana@ufrn.br'].sort());
  });

  it('checks the kept file against the new modality', async () => {
    const { save, id, store } = await sent();
    const response = await save(paper({ id, filePath: undefined, modality: 'ARTIGO' }));
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ error: 'wrong_page_count', pages: 5, minPages: 12, maxPages: 15 });
    expect(store.submissions[0]!.modality).toBe('RESUMO_EXPANDIDO');
  });

  it('replaces the file when a new one is sent', async () => {
    const { save, id, store, files } = await sent();
    const next = `2027/${MAIN.id}/aaaaaaaa-0000-4000-8000-000000000001.pdf`;
    files.objects.set(next, await pdf(13));
    expect((await save(paper({ id, filePath: next, fileName: 'artigo.pdf', modality: 'ARTIGO' }))).status).toBe(200);
    expect(store.submissions[0]).toMatchObject({ filePath: next, fileName: 'artigo.pdf', filePages: 13, modality: 'ARTIGO' });
  });

  it('does not count the paper being changed against the limit or as its own duplicate', async () => {
    const { save, id, store } = await sent();
    store.seed({ title: 'Outro A' });
    store.seed({ title: 'Outro B' });
    expect((await save(paper({ id, filePath: undefined }))).status).toBe(200);
  });

  it('lets any of the authors change it, in their own name, with a file of their own', async () => {
    const { save, id, store, tokens, files, sent: mails } = await sent();
    const theirs = `2027/${OTHER.id}/bbbbbbbb-0000-4000-8000-000000000002.pdf`;
    files.objects.set(theirs, await pdf(6));
    const response = await save(
      paper({ id, filePath: theirs, fileName: 'versao-do-joao.pdf', title: 'Título revisto pelo segundo autor' }),
      tokens.other,
    );
    expect(response.status).toBe(200);
    expect((await body(response)).submission).toMatchObject({ position: 2, sentByMe: false, canEdit: true });
    // Still the paper Maria sent; the change is told to everyone with João's name on it.
    expect(store.submissions[0]).toMatchObject({ userId: MAIN.id, title: 'Título revisto pelo segundo autor', filePath: theirs });
    expect(mails.find((m) => m.to === MAIN.email)!.text).toContain('foi alterado por João Lima');
  });

  it('lets an author change the order and drop another author, but not leave the list', async () => {
    const { save, id, store, tokens } = await sent();
    const joao = { fullName: 'João Lima', email: OTHER.email };
    // João puts himself first.
    expect((await save(paper({ id, filePath: undefined, authors: [joao, ME] }), tokens.other)).status).toBe(200);
    expect(store.submissions[0]!.authors.map((a) => [a.position, a.email])).toEqual([[1, OTHER.email], [2, MAIN.email]]);
    // He cannot save a list he is not in.
    const without = await save(paper({ id, filePath: undefined, authors: [ME] }), tokens.other);
    expect(without.status).toBe(400);
    expect(await body(without)).toEqual({ error: 'sender_not_listed' });
    expect(store.submissions[0]!.authors).toHaveLength(2);
    // He can drop Maria, who then no longer finds the paper.
    expect((await save(paper({ id, filePath: undefined, authors: [joao] }), tokens.other)).status).toBe(200);
    const gone = await save(paper({ id, filePath: undefined }), tokens.main);
    expect(gone.status).toBe(404);
  });

  it('does not let an author attach a file from another author’s folder', async () => {
    const { save, id, tokens, store } = await sent();
    const response = await save(paper({ id, filePath: PATH, title: 'Com o arquivo da Maria' }), tokens.other);
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ error: 'file_missing' });
    expect(store.submissions[0]!.title).toBe('Governança da água no semiárido paraibano');
  });

  it.each([
    ['an organiser', 'organiser'],
    ['someone who is not an author', 'stranger'],
  ] as const)('does not let %s change it', async (_name, who) => {
    const { save, id, store, tokens, auth } = await sent();
    store.organisers = [{ userId: ORGANISER.id, email: ORGANISER.email, fullName: 'Viviane' }];
    const stranger = auth.login({ id: 'user-stranger', email: 'estranho@ufrn.br', emailConfirmed: true }, 'tok-stranger');
    const token = who === 'stranger' ? stranger : tokens[who];
    const response = await save(paper({ id, filePath: undefined, title: 'Título trocado por outra pessoa' }), token);
    expect(response.status).toBe(404);
    expect(store.submissions[0]!.title).toBe('Governança da água no semiárido paraibano');
  });

  it('does not find a paper that does not exist or was withdrawn', async () => {
    const { save, id, store } = await sent();
    expect((await save(paper({ id: 'sub-does-not-exist', filePath: undefined }))).status).toBe(404);
    store.submissions[0]!.deletedAt = NOW.toISOString();
    expect((await save(paper({ id, filePath: undefined }))).status).toBe(404);
  });

  it('can still be changed after the published date, which locks nothing', async () => {
    const late = await sent();
    late.clock.window = new Date('2027-02-10T12:00:00-03:00');
    const response = await late.save(paper({ id: late.id, filePath: undefined, title: 'Governança da água: depois do prazo' }));
    expect(response.status).toBe(200);
    expect(late.store.submissions[0]!.title).toBe('Governança da água: depois do prazo');
    // And a new paper can be sent too.
    late.files.objects.set(PATH, await pdf(5));
    expect((await late.save(paper({ title: 'Outro trabalho, enviado depois do prazo' }))).status).toBe(201);
  });

  it('is locked once submissions close (when the date locks), and once it is under review', async () => {
    const closed = await sent({ locksAtClose: true });
    closed.clock.window = new Date('2027-01-19T00:00:01-03:00');
    const afterClose = await closed.save(paper({ id: closed.id, filePath: undefined }));
    expect(afterClose.status).toBe(409);
    expect(await body(afterClose)).toEqual({ error: 'submissions_closed' });

    const reviewing = await sent();
    reviewing.store.submissions[0]!.status = 'UNDER_REVIEW';
    const underReview = await reviewing.save(paper({ id: reviewing.id, filePath: undefined }));
    expect(underReview.status).toBe(409);
    expect(await body(underReview)).toEqual({ error: 'submission_locked' });
  });
});

describe('withdrawing a paper', () => {
  const sent = async (options: Parameters<typeof setup>[0] = {}) => {
    const ctx = await ready(5, options);
    ctx.store.organisers = [{ userId: ORGANISER.id, email: ORGANISER.email, fullName: 'Viviane' }];
    const first = await body(await ctx.save(paper({ coauthors: [{ fullName: 'João Lima', email: OTHER.email }] })));
    ctx.sent.length = 0;
    const withdraw = (token: string, id = first.submission.id as string) =>
      handleSubmissions(call('POST', 'withdraw', { token, body: { eventSlug: '2027', id } }), 'withdraw', ctx.deps);
    return { ...ctx, withdraw, id: first.submission.id as string };
  };

  it('marks it as deleted, keeps the record, and tells authors and organisers', async () => {
    const { withdraw, tokens, store, sent: mails, deps } = await sent();
    expect((await withdraw(tokens.main)).status).toBe(200);
    expect(store.submissions).toHaveLength(1);
    expect(store.submissions[0]!.deletedAt).not.toBeNull();
    expect(store.deletions).toEqual([{ id: store.submissions[0]!.id, userId: MAIN.id, reason: 'withdrawn by one of its authors' }]);
    expect(mails.map((m) => m.to).sort()).toEqual([OTHER.email, MAIN.email, ORGANISER.email].sort());
    expect(mails.every((m) => m.subject.includes('retirado'))).toBe(true);
    // Gone from Meus trabalhos, and the slot is free again.
    const list = await body(await handleSubmissions(call('GET', 'mine', { token: tokens.main, query: '?eventSlug=2027' }), 'mine', deps));
    expect(list.submissions).toEqual([]);
    expect(list.limits.asMain).toBe(0);
    expect((await withdraw(tokens.main)).status).toBe(404);
  });

  it('can be done by any of the authors, and everyone is told who did it', async () => {
    const { withdraw, tokens, store, sent: mails } = await sent();
    expect((await withdraw(tokens.other)).status).toBe(200);
    expect(store.deletions).toEqual([{ id: store.submissions[0]!.id, userId: OTHER.id, reason: 'withdrawn by one of its authors' }]);
    expect(mails.map((m) => m.to).sort()).toEqual([OTHER.email, MAIN.email, ORGANISER.email].sort());
    expect(mails.find((m) => m.to === MAIN.email)!.text).toContain('foi retirado por João Lima');
  });

  it('cannot be done by an organiser, nor by someone who is not an author', async () => {
    const { withdraw, tokens, store, auth } = await sent();
    expect((await withdraw(tokens.organiser)).status).toBe(404);
    const stranger = auth.login({ id: 'user-stranger', email: 'estranho@ufrn.br', emailConfirmed: true }, 'tok-stranger');
    expect((await withdraw(stranger)).status).toBe(404);
    expect(store.submissions[0]!.deletedAt).toBeNull();
  });

  it('cannot be done after submissions close, when the date locks', async () => {
    const { withdraw, tokens, clock, store } = await sent({ locksAtClose: true });
    clock.window = new Date('2027-01-19T00:00:01-03:00');
    expect((await withdraw(tokens.main)).status).toBe(409);
    expect(store.submissions[0]!.deletedAt).toBeNull();
  });

  it('can be done after the published date, which locks nothing', async () => {
    const { withdraw, tokens, clock, store } = await sent();
    clock.window = new Date('2027-02-10T12:00:00-03:00');
    expect((await withdraw(tokens.main)).status).toBe(200);
    expect(store.submissions[0]!.deletedAt).not.toBeNull();
  });
});

describe('Meus trabalhos', () => {
  const mine = (deps: SubmissionDeps, token: string) =>
    handleSubmissions(call('GET', 'mine', { token, query: '?eventSlug=2027' }), 'mine', deps);

  it('shows the papers a person sent and the ones where they are a co-author, and nobody else’s', async () => {
    const { deps, tokens, store } = setup();
    store.seed({ title: 'Meu', authors: [{ position: 1, fullName: 'Maria', email: MAIN.email }, { position: 2, fullName: 'João', email: OTHER.email }] });
    store.seed({ title: 'Do João comigo', userId: OTHER.id, authors: [{ position: 1, fullName: 'João', email: OTHER.email }, { position: 2, fullName: 'Maria', email: MAIN.email }] });
    store.seed({ title: 'Só do João', userId: OTHER.id, authors: [{ position: 1, fullName: 'João', email: OTHER.email }] });
    store.seed({ title: 'Retirado', deletedAt: NOW.toISOString() });
    const data = await body(await mine(deps, tokens.main));
    expect(data.submissions.map((s) => [s.title, s.position, s.sentByMe, s.canEdit])).toEqual([
      ['Meu', 1, true, true],
      ['Do João comigo', 2, false, true],
    ]);
    expect(data.limits).toEqual({ asMain: 1, maxAsMain: 3, asCoauthor: 1, maxAsCoauthor: 5 });
    expect(data.state).toBe('open');
    expect(JSON.stringify(data)).not.toContain('Só do João');
    expect(JSON.stringify(data)).not.toContain('seed-');
  });

  it('shows a paper to a co-author who created the account only afterwards', async () => {
    const { deps, auth, store } = setup();
    store.seed({ authors: [{ position: 1, fullName: 'Maria', email: MAIN.email }, { position: 2, fullName: 'Nova', email: 'nova@ufrn.br' }] });
    const token = auth.login({ id: 'user-new', email: 'nova@ufrn.br', emailConfirmed: true }, 'tok-new');
    const data = await body(await mine(deps, token));
    expect(data.submissions).toHaveLength(1);
    expect(data.submissions[0]).toMatchObject({ position: 2, sentByMe: false, canEdit: true });
  });

  it('shows the papers as locked after submissions close', async () => {
    const { deps, tokens, store, clock } = setup({ locksAtClose: true });
    store.seed();
    clock.window = new Date('2027-01-19T00:00:01-03:00');
    const data = await body(await mine(deps, tokens.main));
    expect(data.state).toBe('closed');
    expect(data.submissions[0]!.canEdit).toBe(false);
  });

  it('keeps the papers open after the published date, and says the date has passed', async () => {
    const { deps, tokens, store, clock } = setup();
    store.seed();
    clock.window = new Date('2027-01-19T00:00:01-03:00');
    const data = await body(await mine(deps, tokens.main));
    expect(data).toMatchObject({ state: 'open', pastDeadline: true, closesAt: R.closesAt });
    expect(data.submissions[0]!.canEdit).toBe(true);
  });
});

describe('opening the file', () => {
  const open = (deps: SubmissionDeps, token: string, id: string) =>
    handleSubmissions(call('GET', 'file', { token, query: `?id=${id}` }), 'file', deps);

  it('gives the main author and a co-author a link that lasts a minute, with the original name', async () => {
    const { deps, tokens, store, files } = setup();
    const s = store.seed({ fileName: 'Meu trabalho.pdf', authors: [{ position: 1, fullName: 'Maria', email: MAIN.email }, { position: 2, fullName: 'João', email: OTHER.email }] });
    for (const token of [tokens.main, tokens.other]) {
      const response = await open(deps, token, s.id);
      expect(response.status).toBe(200);
      expect((await body(response)).url).toContain(s.filePath);
    }
    expect(files.downloadUrls[0]).toEqual({ path: s.filePath, fileName: 'Meu trabalho.pdf', seconds: DOWNLOAD_LINK_SECONDS });
  });

  it('gives it to an organiser of the edition, and logs that', async () => {
    const { deps, tokens, store, logs } = setup();
    store.organisers = [{ userId: ORGANISER.id, email: ORGANISER.email, fullName: 'Viviane' }];
    const s = store.seed();
    expect((await open(deps, tokens.organiser, s.id)).status).toBe(200);
    expect(logs.at(-1)).toEqual({ event: 'submission_file_opened', data: { submissionId: s.id, byOrganiser: true } });
  });

  it('answers "not found" to anyone else, the same as for a paper that does not exist', async () => {
    const { deps, tokens, store, files } = setup();
    const s = store.seed();
    const stranger = await open(deps, tokens.other, s.id);
    const missing = await open(deps, tokens.other, 'sub-none');
    expect(stranger.status).toBe(404);
    expect(await body(stranger)).toEqual(await body(missing));
    expect(files.downloadUrls).toEqual([]);
  });

  it('does not open a withdrawn paper for its authors, but still does for an organiser', async () => {
    const { deps, tokens, store } = setup();
    const s = store.seed({ deletedAt: NOW.toISOString() });
    expect((await open(deps, tokens.main, s.id)).status).toBe(404);
    store.organisers = [{ userId: ORGANISER.id, email: ORGANISER.email, fullName: 'Viviane' }];
    expect((await open(deps, tokens.organiser, s.id)).status).toBe(200);
  });
});

describe('submission e-mails', () => {
  const data = { firstName: 'Maria', eventName: 'II SIEAmB', number: 12, title: 'Título <b>x</b>', mainAuthor: 'Maria Souza', url: 'https://sieamb.org/2027/meus-trabalhos' };
  const kinds = ['received', 'updated', 'withdrawn'] as const;

  it.each(EMAIL_LOCALES.flatMap((locale) => kinds.map((kind) => [locale, kind] as const)))(
    '%s / %s has the number, the title and the link, and no placeholder left',
    (locale, kind) => {
      const mail = renderSubmissionEmail(kind, locale, data);
      expect(mail.subject).toContain('12');
      expect(mail.text).toContain('Título <b>x</b>');
      expect(mail.html).toContain('Título &lt;b&gt;x&lt;/b&gt;');
      expect(mail.html).not.toContain('<b>x</b>');
      expect(mail.text).toContain(data.url);
      expect(mail.subject + mail.text + mail.html).not.toMatch(/undefined|\$\{|\[object/);
    },
  );

  it.each(kinds)('the organisers’ %s notice names the paper', (kind) => {
    const mail = renderOrganiserEmail(kind, { ...data, modality: 'Artigo científico', area: 'Saúde e Meio Ambiente', authors: 'A; B' });
    expect(mail.subject).toContain('nº 12');
    expect(mail.text).toContain('Maria Souza');
    expect(mail.subject + mail.text + mail.html).not.toMatch(/undefined|\$\{|\[object/);
  });
});
