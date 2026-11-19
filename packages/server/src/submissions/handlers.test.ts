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
import { cpfFrom } from '../account/testing';
import { NO_DOCUMENT } from '../core/document';
import {
  EVENT,
  MAIN,
  MAIN_CPF,
  NOW,
  ORGANISER,
  OTHER,
  OTHER_CPF,
  SPARE_CPF,
  call,
  cpfOnly,
  docx,
  line,
  passportOnly,
  pdf,
  setup,
} from './testing';

/** A suggestion as it is sealed for Maria, in this edition, now. */
const FOR_MAIN = { userId: MAIN.id, eventId: EVENT.id, now: NOW };

/** A different valid CPF for each number: the document typed for an author who has no account. */
const cpfOf = (n: number): string => cpfFrom(String(300400500 + n * 17));

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
    store.listByIdentity = async () => {
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
    expect(await body(await get())).toEqual({ state: 'open', opensAt: R.opensAt, closesAt: R.closesAt, pastDeadline: false, closedAt: null });
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
    await save(paper({ coauthors: [{ fullName: 'João Lima', email: OTHER.email }, { fullName: 'Sem Conta', email: 'semconta@ufrn.br', cpf: cpfOf(1) }] }));
    expect(sent.map((m) => m.to).sort()).toEqual([OTHER.email, MAIN.email, 'semconta@ufrn.br', ORGANISER.email].sort());
    const toAuthor = sent.find((m) => m.to === OTHER.email)!;
    expect(toAuthor.subject).toMatch(/^Trabalho nº \d+ recebido \(II SIEAmB\)$/);
    expect(toAuthor.text).toContain('Olá, João.');
    expect(toAuthor.text).toContain('enviado por Maria Clara de Souza');
    expect(toAuthor.text).toContain('https://dev.sieamb.org/2027/meus-trabalhos');
    expect(toAuthor.text).not.toContain('Criar conta');
    // An author with no account is offered to create one, and then lands on Meus trabalhos (#292).
    const toNewcomer = sent.find((m) => m.to === 'semconta@ufrn.br')!;
    expect(toNewcomer.text).toContain('Para acompanhar o trabalho, crie uma conta com este e-mail e com o seu documento (CPF ou passaporte).');
    expect(toNewcomer.html).toContain('Criar conta com este e-mail');
    expect(toNewcomer.text).toContain('https://dev.sieamb.org/2027/conta/criar?next=%2F2027%2Fmeus-trabalhos');
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
    const people = (n: number) => Array.from({ length: n }, (_, i) => ({ fullName: `Coautor ${i}`, email: `c${i}@ufpb.br`, cpf: cpfOf(10 + i) }));
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
    const prof = { fullName: 'Profa. Ana Reis', email: 'ana@ufrn.br', cpf: cpfOf(2) };
    for (let i = 1; i <= 3; i += 1) {
      store.seed({ title: `Da professora ${i}`, userId: 'someone', authors: [line(1, prof.fullName, prof.email, cpfOnly(prof.cpf))] });
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
    expect((await save(paper({ authors: [{ fullName: 'Profa. Ana Reis', email: 'ana@ufrn.br', cpf: cpfOf(2) }, ME] }))).status).toBe(201);
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
  const PROF_CPF = cpfOf(3);
  /** As the form sends him: with the document the sender typed. */
  const PROF_TYPED = { ...PROF, cpf: PROF_CPF };
  const JOAO = { fullName: 'João Lima', email: OTHER.email };
  const THEIRS = `2027/${OTHER.id}/cccccccc-0000-4000-8000-000000000003.pdf`;

  it('takes a paper sent by the second author, with a first author who has no account', async () => {
    const { save, store, files, tokens, sent: mails, outbox, deps } = await ready();
    files.objects.set(THEIRS, await pdf(5));
    const response = await save(paper({ authors: [PROF_TYPED, JOAO], filePath: THEIRS }), tokens.other);
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
    const { save, files, tokens, auth, deps, store } = await ready();
    files.objects.set(THEIRS, await pdf(5));
    await save(paper({ authors: [PROF_TYPED, JOAO], filePath: THEIRS }), tokens.other);
    const prof = { id: 'user-prof', email: PROF.email, emailConfirmed: true };
    // The account is made with the same address and the same document the sender typed.
    store.addUser(prof, cpfOnly(PROF_CPF));
    const token = auth.login(prof, 'tok-prof');
    const list = await body(await handleSubmissions(call('GET', 'mine', { token, query: '?eventSlug=2027' }), 'mine', deps));
    expect(list.submissions).toHaveLength(1);
    // He sees it, as first author, and it is the sender who changes it (#250).
    expect(list.submissions[0]).toMatchObject({ position: 1, sentByMe: false, canEdit: false });
    expect(list.limits).toMatchObject({ asMain: 1, asCoauthor: 0 });
  });

  it('keeps the sender wherever they put themselves among five authors', async () => {
    const { save, store } = await ready();
    const others = Array.from({ length: 4 }, (_, i) => ({ fullName: `Autor ${i}`, email: `a${i}@ufpb.br`, cpf: cpfOf(20 + i) }));
    expect((await save(paper({ authors: [others[0], others[1], ME, others[2], others[3]] }))).status).toBe(201);
    expect(store.submissions[0]!.authors.map((a) => a.position)).toEqual([1, 2, 3, 4, 5]);
    expect(store.submissions[0]!.authors[2]).toMatchObject({ email: MAIN.email, position: 3 });
  });

  it('takes the name typed for the sender, since the list is what goes in the proceedings', async () => {
    const { save, store } = await ready();
    await save(paper({ authors: [{ fullName: 'Maria C. de Souza', email: MAIN.email.toUpperCase() }] }));
    // The document is the account's, whatever the form sent.
    expect(store.submissions[0]!.authors).toEqual([line(1, 'Maria C. de Souza', MAIN.email, cpfOnly(MAIN_CPF))]);
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
    expect(openEmail(people[0]!.ref, deps.pepper, FOR_MAIN)).toBe('rodrigo.costa@ufcg.edu.br');
    expect(openEmail(people[0]!.ref, 'another-pepper', FOR_MAIN)).toBeNull();
    expect(sealEmail('a@b.co', deps.pepper, FOR_MAIN)).not.toBe(sealEmail('a@b.co', deps.pepper, FOR_MAIN));
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

  describe('by address: is a document already on record? (#363)', () => {
    const ask = (deps: SubmissionDeps, token: string | undefined, email: string) =>
      handleSubmissions(call('GET', 'people', { token, query: `?eventSlug=2027&email=${encodeURIComponent(email)}` }), 'people', deps);

    it('needs a login', async () => {
      const { deps } = setup();
      expect((await ask(deps, undefined, 'alguem@ufpb.br')).status).toBe(401);
    });

    it('says yes only for an account that has a document, and says nothing else', async () => {
      const { deps, tokens, store } = setup();
      store.addUser({ id: 'user-com', email: 'com.documento@ufpb.br', emailConfirmed: true }, cpfOnly(SPARE_CPF));
      store.addUser({ id: 'user-sem', email: 'sem.documento@ufpb.br', emailConfirmed: true });
      for (const [email, known] of [
        ['com.documento@ufpb.br', true],
        ['  COM.Documento@UFPB.br ', true],
        ['sem.documento@ufpb.br', false],
        ['ninguem@ufpb.br', false],
        ['isto-nao-e-email', false],
        // Their own line never asks: the answer about oneself is always no.
        [MAIN.email, false],
      ] as const) {
        const response = await ask(deps, tokens.main, email);
        expect(response.status).toBe(200);
        expect(await response.json(), email).toEqual({ known });
      }
    });

    it('counts against the hourly limit of the name search', async () => {
      const { deps, tokens } = setup();
      let allowed = true;
      deps.hitRateLimit = async () => allowed;
      expect((await ask(deps, tokens.main, 'alguem@ufpb.br')).status).toBe(200);
      allowed = false;
      const refused = await ask(deps, tokens.main, 'alguem@ufpb.br');
      expect(refused.status).toBe(429);
      expect(await refused.json()).toEqual({ error: 'too_many_attempts' });
    });
  });

  it('does not find an edition that does not exist', async () => {
    const { deps, tokens } = setup();
    const response = await handleSubmissions(call('GET', 'people', { token: tokens.main, query: '?eventSlug=1999&q=Rodrigo' }), 'people', deps);
    expect(response.status).toBe(404);
  });

  it('saves a picked person with their real e-mail, and tells them', async () => {
    const { save, store, deps, tokens, sent: mails } = await ready();
    store.people = known;
    // He has an account that says who he is: nothing is typed for him.
    store.addUser({ id: 'user-rodrigo', email: 'rodrigo.costa@ufcg.edu.br', emailConfirmed: true }, cpfOnly(SPARE_CPF));
    const { people } = (await body(await search(deps, tokens.main, 'Rodrigo Alves'))) as unknown as { people: { fullName: string; ref: string; hasDocument: boolean }[] };
    expect(people[0]!.hasDocument).toBe(true);
    const response = await save(paper({ authors: [ME, { fullName: people[0]!.fullName, ref: people[0]!.ref }] }));
    expect(response.status).toBe(201);
    expect(store.submissions[0]!.authors[1]).toEqual(line(2, 'Rodrigo Alves Costa', 'rodrigo.costa@ufcg.edu.br', cpfOnly(SPARE_CPF)));
    // His document is in the answer to nobody.
    expect(JSON.stringify(await body(response))).not.toContain(SPARE_CPF);
    expect(mails.map((m) => m.to)).toContain('rodrigo.costa@ufcg.edu.br');
  });

  it('refuses the same person picked and typed, without giving the address away', async () => {
    const { save, deps } = await ready();
    const ref = sealEmail('rodrigo.costa@ufcg.edu.br', deps.pepper, FOR_MAIN);
    const response = await save(paper({ authors: [ME, { fullName: 'Rodrigo Alves Costa', ref }, { fullName: 'R. Costa', ref: sealEmail('rodrigo.costa@ufcg.edu.br', deps.pepper, FOR_MAIN) }] }));
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
    const response = await save(paper({ id, filePath: undefined, title: 'Governança da água: versão revista', coauthors: [{ fullName: 'Ana Reis', email: 'ana@ufrn.br', cpf: cpfOf(4) }] }));
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

  it('does not let another author of the paper change it: only whoever sent it (#250)', async () => {
    const { save, id, store, tokens, files, sent: mails } = await sent();
    const theirs = `2027/${OTHER.id}/bbbbbbbb-0000-4000-8000-000000000002.pdf`;
    files.objects.set(theirs, await pdf(6));
    // João is the second author. Neither the text, nor the order, nor the file are his to change.
    for (const change of [
      { title: 'Título trocado pelo segundo autor' },
      { authors: [{ fullName: 'João Lima', email: OTHER.email }, ME] },
      { filePath: theirs, fileName: 'versao-do-joao.pdf' },
    ]) {
      const response = await save(paper({ id, filePath: undefined, ...change }), tokens.other);
      expect(response.status).toBe(404);
      expect(await body(response)).toEqual({ error: 'submission_not_found' });
    }
    expect(store.submissions[0]).toMatchObject({ userId: MAIN.id, title: 'Governança da água no semiárido paraibano', filePath: PATH });
    expect(store.submissions[0]!.authors.map((a) => a.email)).toEqual([MAIN.email, OTHER.email]);
    expect(mails).toEqual([]);
  });

  it('lets the sender change the order and drop an author, but not leave the list', async () => {
    const { save, id, store } = await sent();
    const joao = { fullName: 'João Lima', email: OTHER.email };
    expect((await save(paper({ id, filePath: undefined, authors: [joao, ME] }))).status).toBe(200);
    expect(store.submissions[0]!.authors.map((a) => [a.position, a.email])).toEqual([[1, OTHER.email], [2, MAIN.email]]);
    const without = await save(paper({ id, filePath: undefined, authors: [joao] }));
    expect(without.status).toBe(400);
    expect(await body(without)).toEqual({ error: 'sender_not_listed' });
    expect(store.submissions[0]!.authors).toHaveLength(2);
    expect((await save(paper({ id, filePath: undefined, authors: [ME] }))).status).toBe(200);
    expect(store.submissions[0]!.authors.map((a) => a.email)).toEqual([MAIN.email]);
  });

  it('lets an organiser change any paper, without being one of its authors, and says who did it (#250)', async () => {
    const { save, id, store, tokens, sent: mails } = await sent();
    store.organisers = [{ userId: ORGANISER.id, email: ORGANISER.email, fullName: 'Viviane' }];
    const response = await save(paper({ id, filePath: undefined, title: 'Título corrigido pela organização' }), tokens.organiser);
    expect(response.status).toBe(200);
    expect((await body(response)).submission).toMatchObject({ position: null, sentByMe: false, canEdit: true, asOrganiser: true });
    // Still the sender's paper, with its authors as they were.
    expect(store.submissions[0]).toMatchObject({ userId: MAIN.id, title: 'Título corrigido pela organização' });
    expect(store.submissions[0]!.authors.map((a) => a.email)).toEqual([MAIN.email, OTHER.email]);
    // The authors are told, and the organiser is named by the role, not by their address.
    const toAuthor = mails.find((m) => m.to === MAIN.email)!;
    expect(toAuthor.text).toContain('foi alterado por Comissão organizadora');
    expect(toAuthor.text).not.toContain(ORGANISER.email);
  });

  it('does not let an organiser who is not an administrator change a paper (#265)', async () => {
    const { save, id, store, tokens, sent: mails } = await sent();
    store.organisers = [{ userId: ORGANISER.id, email: ORGANISER.email, fullName: 'Viviane' }];
    store.notAdmins.add(ORGANISER.id);
    const before = JSON.stringify(store.submissions[0]);
    const response = await save(paper({ id, filePath: undefined, title: 'Alterado por quem não pode' }), tokens.organiser);
    // The same answer as for a stranger: it is not theirs to change.
    expect(response.status).toBe(404);
    expect(await body(response)).toEqual({ error: 'submission_not_found' });
    expect(JSON.stringify(store.submissions[0])).toBe(before);
    expect(mails).toEqual([]);
  });

  it('lets an organiser change a paper under review, and after submissions close', async () => {
    const reviewing = await sent();
    reviewing.store.organisers = [{ userId: ORGANISER.id, email: ORGANISER.email, fullName: 'Viviane' }];
    reviewing.store.submissions[0]!.status = 'UNDER_REVIEW';
    expect((await reviewing.save(paper({ id: reviewing.id, filePath: undefined, title: 'Corrigido em avaliação' }), reviewing.tokens.organiser)).status).toBe(200);
    expect(reviewing.store.submissions[0]).toMatchObject({ title: 'Corrigido em avaliação', status: 'UNDER_REVIEW' });

    const closed = await sent();
    closed.store.organisers = [{ userId: ORGANISER.id, email: ORGANISER.email, fullName: 'Viviane' }];
    closed.store.closedAt = NOW.toISOString();
    expect((await closed.save(paper({ id: closed.id, filePath: undefined, title: 'Corrigido com as submissões encerradas' }), closed.tokens.organiser)).status).toBe(200);
    // Closed is still closed for a new paper, organiser or not.
    expect((await closed.save(paper({ title: 'Um trabalho novo da organizadora', authors: [{ fullName: 'Viviane', email: ORGANISER.email }] }), closed.tokens.organiser)).status).toBe(409);
  });

  it('does not let an organiser empty the author list', async () => {
    const { save, id, store, tokens } = await sent();
    store.organisers = [{ userId: ORGANISER.id, email: ORGANISER.email, fullName: 'Viviane' }];
    const response = await save(paper({ id, filePath: undefined, authors: [] }), tokens.organiser);
    expect(response.status).toBe(400);
    expect(store.submissions[0]!.authors).toHaveLength(2);
  });

  it('does not let someone who is neither the sender nor an organiser change it', async () => {
    const { save, id, store, auth } = await sent();
    const stranger = auth.login({ id: 'user-stranger', email: 'estranho@ufrn.br', emailConfirmed: true }, 'tok-stranger');
    const response = await save(paper({ id, filePath: undefined, title: 'Título trocado por outra pessoa' }), stranger);
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
    expect(store.deletions).toEqual([{ id: store.submissions[0]!.id, userId: MAIN.id, reason: 'withdrawn by its sender' }]);
    expect(mails.map((m) => m.to).sort()).toEqual([OTHER.email, MAIN.email, ORGANISER.email].sort());
    expect(mails.every((m) => m.subject.includes('retirado'))).toBe(true);
    // Gone from Meus trabalhos, and the slot is free again.
    const list = await body(await handleSubmissions(call('GET', 'mine', { token: tokens.main, query: '?eventSlug=2027' }), 'mine', deps));
    expect(list.submissions).toEqual([]);
    expect(list.limits.asMain).toBe(0);
    expect((await withdraw(tokens.main)).status).toBe(404);
  });

  it('cannot be done by another author of the paper, nor by a stranger: only by whoever sent it (#250)', async () => {
    const { withdraw, tokens, store, auth, sent: mails } = await sent();
    store.organisers = [];
    expect((await withdraw(tokens.other)).status).toBe(404);
    const stranger = auth.login({ id: 'user-stranger', email: 'estranho@ufrn.br', emailConfirmed: true }, 'tok-stranger');
    expect((await withdraw(stranger)).status).toBe(404);
    expect(store.submissions[0]!.deletedAt).toBeNull();
    expect(store.deletions).toEqual([]);
    expect(mails).toEqual([]);
  });

  it('cannot be done by an organiser who is not an administrator (#265)', async () => {
    const { withdraw, tokens, store, sent: mails } = await sent();
    store.notAdmins.add(ORGANISER.id);
    const response = await withdraw(tokens.organiser);
    expect(response.status).toBe(404);
    expect(store.submissions[0]!.deletedAt).toBeNull();
    expect(store.deletions).toEqual([]);
    expect(mails).toEqual([]);
  });

  it('can be done by an organiser, at any time, and the authors are told (#250)', async () => {
    const { withdraw, tokens, store, sent: mails } = await sent();
    store.submissions[0]!.status = 'UNDER_REVIEW';
    store.closedAt = NOW.toISOString();
    expect((await withdraw(tokens.organiser)).status).toBe(200);
    expect(store.deletions).toEqual([{ id: store.submissions[0]!.id, userId: ORGANISER.id, reason: 'withdrawn by the organisers' }]);
    expect(mails.find((m) => m.to === MAIN.email)!.text).toContain('foi retirado por Comissão organizadora');
    // The sender cannot while it is under review or closed.
    const again = await sent();
    again.store.submissions[0]!.status = 'UNDER_REVIEW';
    expect((await again.withdraw(again.tokens.main)).status).toBe(409);
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
      ['Do João comigo', 2, false, false],
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
    expect(data.submissions[0]).toMatchObject({ position: 2, sentByMe: false, canEdit: false });
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
    expect(logs.at(-1)).toEqual({ event: 'submission_file_opened', data: { submissionId: s.id, as: 'organiser' } });
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

  it('gives it to someone chosen to review the paper, and to no other reviewer', async () => {
    const { deps, tokens, store, logs } = setup();
    const s = store.seed();
    const mineToo = store.seed({ title: 'Outro' });
    store.reviewers.set(s.id, [OTHER.id]);
    expect((await open(deps, tokens.other, s.id)).status).toBe(200);
    expect(logs.at(-1)).toEqual({ event: 'submission_file_opened', data: { submissionId: s.id, as: 'reviewer' } });
    // Reviewing one paper opens no other.
    expect((await open(deps, tokens.other, mineToo.id)).status).toBe(404);
    // Once the paper is withdrawn, or the person is taken off it, the way in is gone.
    store.reviewers.set(s.id, []);
    expect((await open(deps, tokens.other, s.id)).status).toBe(404);
    store.reviewers.set(s.id, [OTHER.id]);
    s.deletedAt = NOW.toISOString();
    expect((await open(deps, tokens.other, s.id)).status).toBe(404);
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

describe('papers to review (#232)', () => {
  const reviewing = (deps: SubmissionDeps, token?: string, slug = '2027') =>
    handleSubmissions(call('GET', 'reviewing', { token, query: `?eventSlug=${slug}` }), 'reviewing', deps);

  it('needs a login, and an edition that exists', async () => {
    const { deps, tokens } = setup();
    expect((await reviewing(deps)).status).toBe(401);
    expect((await reviewing(deps, tokens.other, '1999')).status).toBe(404);
  });

  it('lists the papers a person was chosen to review, with the authors’ names and without their e-mails', async () => {
    const { deps, tokens, store } = setup();
    const first = store.seed({ title: 'Para o João avaliar', authors: [{ position: 1, fullName: 'Maria Clara de Souza', email: MAIN.email }, { position: 2, fullName: 'Ana Reis', email: 'ana@ufrn.br' }] });
    const withdrawn = store.seed({ title: 'Retirado', deletedAt: NOW.toISOString() });
    const notMine = store.seed({ title: 'De outro avaliador' });
    store.reviewers.set(first.id, [OTHER.id, 'someone-else']);
    store.reviewers.set(withdrawn.id, [OTHER.id]);
    store.reviewers.set(notMine.id, ['someone-else']);
    const response = await reviewing(deps, tokens.other);
    expect(response.status).toBe(200);
    const raw = await response.text();
    const data = JSON.parse(raw) as { submissions: Record<string, unknown>[] };
    expect(data.submissions).toHaveLength(1);
    expect(data.submissions[0]).toMatchObject({
      id: first.id,
      title: 'Para o João avaliar',
      fileName: 'trabalho.pdf',
      authors: [
        { position: 1, fullName: 'Maria Clara de Souza' },
        { position: 2, fullName: 'Ana Reis' },
      ],
    });
    // Not blind, but no addresses and nothing about where the file is kept.
    expect(raw).not.toContain(MAIN.email);
    expect(raw).not.toContain('ana@ufrn.br');
    expect(raw).not.toContain('seed-');
  });

  it('is an empty list for someone with nothing to review', async () => {
    const { deps, tokens, store } = setup();
    store.seed();
    expect(await body(await reviewing(deps, tokens.main))).toEqual({ submissions: [] });
  });
});

describe('submissions closed by the organisers (#236)', () => {
  const CLOSED = '2026-12-10T18:00:00.000Z';
  const mine = (deps: SubmissionDeps, token: string) =>
    handleSubmissions(call('GET', 'mine', { token, query: '?eventSlug=2027' }), 'mine', deps);

  it('says so to everyone, with when it was closed, though the published date is still ahead', async () => {
    const { deps, store } = setup();
    store.closedAt = CLOSED;
    const response = await handleSubmissions(call('GET', 'rules', { query: '?eventSlug=2027' }), 'rules', deps);
    expect(await body(response)).toEqual({ state: 'closed', opensAt: R.opensAt, closesAt: R.closesAt, pastDeadline: false, closedAt: CLOSED });
  });

  it('takes no new paper, no change, no withdrawal and hands out no upload link', async () => {
    const ctx = await ready();
    const first = await body(await ctx.save(paper()));
    const id = first.submission.id as string;
    ctx.store.closedAt = CLOSED;
    ctx.sent.length = 0;
    const attempts = [
      await ctx.save(paper({ title: 'Um trabalho novo, depois de encerradas' })),
      await ctx.save(paper({ id, filePath: undefined, title: 'Título trocado depois de encerradas' })),
      await handleSubmissions(call('POST', 'withdraw', { token: ctx.tokens.main, body: { eventSlug: '2027', id } }), 'withdraw', ctx.deps),
      await handleSubmissions(call('POST', 'upload-url', { token: ctx.tokens.main, body: { eventSlug: '2027', fileName: 'x.pdf', size: 10 } }), 'upload-url', ctx.deps),
    ];
    for (const response of attempts) {
      expect(response.status).toBe(409);
      expect(await body(response)).toEqual({ error: 'submissions_closed' });
    }
    expect(ctx.store.submissions).toHaveLength(1);
    expect(ctx.store.submissions[0]).toMatchObject({ title: 'Governança da água no semiárido paraibano', deletedAt: null });
    expect(ctx.sent).toEqual([]);
  });

  it('shows the papers as locked, and still lets them be read and downloaded', async () => {
    const { deps, tokens, store } = setup();
    const s = store.seed();
    store.closedAt = CLOSED;
    const data = await body(await mine(deps, tokens.main));
    expect(data).toMatchObject({ state: 'closed', closedAt: CLOSED });
    expect(data.submissions[0]!.canEdit).toBe(false);
    const file = await handleSubmissions(call('GET', 'file', { token: tokens.main, query: `?id=${s.id}` }), 'file', deps);
    expect(file.status).toBe(200);
  });

  it('works again as soon as they are reopened, even past the published date', async () => {
    const ctx = await ready();
    ctx.store.closedAt = CLOSED;
    expect((await ctx.save(paper())).status).toBe(409);
    ctx.store.closedAt = null;
    ctx.clock.window = new Date('2027-02-10T12:00:00-03:00');
    expect((await ctx.save(paper())).status).toBe(201);
    expect((await body(await mine(ctx.deps, ctx.tokens.main))).state).toBe('open');
  });

  it('still says "not open yet" before the opening date, closed by hand or not', async () => {
    const { deps, store, clock } = setup();
    store.closedAt = CLOSED;
    clock.window = new Date('2026-11-14T12:00:00-03:00');
    const response = await handleSubmissions(call('GET', 'rules', { query: '?eventSlug=2027' }), 'rules', deps);
    expect((await body(response)).state).toBe('not_open');
  });
});

describe('one paper, for the form (#250)', () => {
  const one = (deps: SubmissionDeps, token: string | undefined, id: string, slug = '2027') =>
    handleSubmissions(call('GET', 'one', { token, query: `?eventSlug=${slug}&id=${id}` }), 'one', deps);

  it('gives it to an organiser who is not an administrator to look at, not to change (#265)', async () => {
    const { deps, tokens, store } = setup();
    const s = store.seed({ authors: [{ position: 1, fullName: 'Maria', email: MAIN.email }] });
    store.organisers = [{ userId: ORGANISER.id, email: ORGANISER.email, fullName: 'Viviane' }];
    store.notAdmins.add(ORGANISER.id);
    const response = await one(deps, tokens.organiser, s.id);
    expect(response.status).toBe(200);
    expect((await body(response)).submission).toMatchObject({ id: s.id, sentByMe: false, canEdit: false, asOrganiser: false });
    // Their own paper is still theirs to change.
    const own = store.seed({ userId: ORGANISER.id, authors: [{ position: 1, fullName: 'Viviane', email: ORGANISER.email }] });
    expect((await body(await one(deps, tokens.organiser, own.id))).submission).toMatchObject({ sentByMe: true, canEdit: true });
  });

  it('gives it to the sender to change, to another author to look at, and to an organiser to change', async () => {
    const { deps, tokens, store } = setup();
    const s = store.seed({ authors: [{ position: 1, fullName: 'Maria', email: MAIN.email }, { position: 2, fullName: 'João', email: OTHER.email }] });
    store.organisers = [{ userId: ORGANISER.id, email: ORGANISER.email, fullName: 'Viviane' }];
    expect((await body(await one(deps, tokens.main, s.id))).submission).toMatchObject({ id: s.id, sentByMe: true, canEdit: true, asOrganiser: false });
    expect((await body(await one(deps, tokens.other, s.id))).submission).toMatchObject({ position: 2, canEdit: false, asOrganiser: false });
    expect((await body(await one(deps, tokens.organiser, s.id))).submission).toMatchObject({ position: null, canEdit: true, asOrganiser: true });
  });

  it('does not exist for anyone else, nor when withdrawn, nor without a login, nor in another edition', async () => {
    const { deps, tokens, store, auth } = setup();
    const s = store.seed();
    const stranger = auth.login({ id: 'user-stranger', email: 'estranho@ufrn.br', emailConfirmed: true }, 'tok-stranger');
    expect((await one(deps, stranger, s.id)).status).toBe(404);
    expect((await one(deps, undefined, s.id)).status).toBe(401);
    expect((await one(deps, tokens.main, 'sub-none')).status).toBe(404);
    expect((await one(deps, tokens.main, s.id, '1999')).status).toBe(404);
    s.deletedAt = NOW.toISOString();
    expect((await one(deps, tokens.main, s.id)).status).toBe(404);
    // The answer never says where the file is kept.
    s.deletedAt = null;
    expect(JSON.stringify(await body(await one(deps, tokens.main, s.id)))).not.toContain('seed-');
  });
});

describe('a paper of test accounts is announced to test organisers only (#255)', () => {
  const TEST_ORG = { userId: 'user-test-org', email: 'e2e+r1a1-organizadora-x1@sieamb.org', fullName: 'Organizadora E2E' };
  const REAL_ORG = { userId: ORGANISER.id, email: ORGANISER.email, fullName: 'Viviane' };
  const testAuthor = { id: 'user-test-author', email: 'e2e+r1a1-autora-ab12@sieamb.org', emailConfirmed: true };
  const THEIRS = `2027/${testAuthor.id}/dddddddd-0000-4000-8000-000000000004.pdf`;

  it('leaves the real organisers out of every notice about it: sent, changed and withdrawn', async () => {
    const ctx = await ready();
    ctx.store.organisers = [REAL_ORG, TEST_ORG];
    ctx.files.objects.set(THEIRS, await pdf(5));
    const token = ctx.auth.login(testAuthor, 'tok-test-author');
    ctx.store.addUser(testAuthor, cpfOnly(cpfOf(30)));
    const data = paper({ authors: [{ fullName: 'Autora E2E', email: testAuthor.email }, { fullName: 'Coautor E2E', email: 'e2e+r1a1-coautor-cd34@sieamb.org', cpf: cpfOf(31) }], filePath: THEIRS });
    const first = await body(await ctx.save(data, token));
    const id = first.submission.id as string;
    await ctx.save({ ...data, id, filePath: undefined, title: 'Trabalho de teste E2E (revisto)' }, token);
    await handleSubmissions(call('POST', 'withdraw', { token, body: { eventSlug: '2027', id } }), 'withdraw', ctx.deps);
    expect(ctx.store.submissions[0]!.deletedAt).not.toBeNull();
    // Nothing reached a real inbox, and nothing was put in a real organiser's bell.
    expect(ctx.sent).toEqual([]);
    expect(ctx.outbox.notifications.some((n) => n.userId === ORGANISER.id)).toBe(false);
    expect(ctx.outbox.notifications.filter((n) => n.userId === TEST_ORG.userId).map((n) => n.kind)).toEqual([
      'organiser.submission.received',
      'organiser.submission.updated',
      'organiser.submission.withdrawn',
    ]);
  });

  it('tells every organiser as soon as one author is a real person', async () => {
    const ctx = await ready();
    ctx.store.organisers = [REAL_ORG, TEST_ORG];
    ctx.files.objects.set(THEIRS, await pdf(5));
    const token = ctx.auth.login(testAuthor, 'tok-test-author');
    ctx.store.addUser(testAuthor, cpfOnly(cpfOf(30)));
    await ctx.save(paper({ authors: [{ fullName: 'Autora E2E', email: testAuthor.email }, { fullName: 'Ana Reis', email: 'ana@ufrn.br', cpf: cpfOf(4) }], filePath: THEIRS }), token);
    expect(ctx.sent.map((m) => m.to).sort()).toEqual(['ana@ufrn.br', ORGANISER.email].sort());
    // The author has an account, so she is told in the site as well.
    expect(ctx.outbox.notifications.map((n) => n.userId).sort()).toEqual([ORGANISER.id, TEST_ORG.userId, testAuthor.id].sort());
  });
});

// ───────────────────────────── Who each author is (ADR-010) ─────────────────────────────

describe('every author has a document (ADR-010, decision 7)', () => {
  const ANA = { fullName: 'Ana Reis', email: 'ana@ufrn.br' };

  it('refuses to send for an account that has not said who the person is', async () => {
    const { save, store, auth, files } = await ready();
    const fresh = { id: 'user-fresh', email: 'nova@ufcg.edu.br', emailConfirmed: true };
    store.addUser(fresh);
    files.objects.set(`2027/${fresh.id}/x.pdf`, await pdf(5));
    const response = await save(paper({ authors: [{ fullName: 'Nova Pessoa', email: fresh.email }], filePath: `2027/${fresh.id}/x.pdf` }), auth.login(fresh, 'tok-fresh'));
    expect(response.status).toBe(409);
    expect(await body(response)).toEqual({ error: 'document_required' });
    expect(store.submissions).toEqual([]);
  });

  it('stores the document typed for an author without an account, in its stored shape', async () => {
    const { save, store } = await ready();
    expect((await save(paper({ coauthors: [{ ...ANA, cpf: '123.456.789-09' }] }))).status).toBe(201);
    expect(store.submissions[0]!.authors).toEqual([
      line(1, ME.fullName, MAIN.email, cpfOnly(MAIN_CPF)),
      line(2, ANA.fullName, ANA.email, cpfOnly(SPARE_CPF)),
    ]);
  });

  it('takes a passport with its country, or both documents', async () => {
    const { save, store } = await ready();
    await save(paper({ coauthors: [{ ...ANA, passport: 'ab 123-456', country: 'pt' }] }));
    expect(store.submissions[0]!.authors[1]!.document).toEqual(passportOnly('AB123456', 'PT'));
    await save(paper({ title: 'Outro trabalho, com os dois documentos', coauthors: [{ fullName: 'Bia Luz', email: 'bia@ufrn.br', cpf: SPARE_CPF, passport: 'ZZ999999', country: 'US' }] }));
    expect(store.submissions[1]!.authors[1]!.document).toEqual({ cpf: SPARE_CPF, passport: 'ZZ999999', country: 'US' });
  });

  it.each([
    ['no document', {}, 400, 'author_document_required'],
    ['a CPF with wrong check digits', { cpf: '390.533.447-06' }, 400, 'author_invalid_cpf'],
    ['a CPF of repeated digits', { cpf: '00000000000' }, 400, 'author_invalid_cpf'],
    ['a passport without its country', { passport: 'AB123456' }, 400, 'author_invalid_country'],
    ['a passport from Brazil', { passport: 'AB123456', country: 'BR' }, 400, 'author_invalid_country'],
    ['a passport that is too short', { passport: 'A1', country: 'PT' }, 400, 'author_invalid_passport'],
    ['a good passport next to a bad CPF', { cpf: '12345678900', passport: 'AB123456', country: 'PT' }, 400, 'author_invalid_cpf'],
  ])('refuses an author with %s, naming the person, and writes nothing', async (_name, document, status, error) => {
    const { save, store } = await ready();
    const response = await save(paper({ coauthors: [{ ...ANA, ...document }] }));
    expect(response.status).toBe(status);
    expect(await body(response)).toEqual({ error, name: 'Ana Reis' });
    expect(store.submissions).toEqual([]);
  });

  it('an address that has an account takes the account\'s document, whatever was typed for it', async () => {
    const { save, store } = await ready();
    // Typed for João: nothing, then someone else's CPF, then nonsense that is still a valid CPF.
    for (const [i, typed] of [{}, { cpf: SPARE_CPF }, { cpf: cpfOf(40) }].entries()) {
      const response = await save(paper({ title: `Trabalho de número ${i} com o João`, coauthors: [{ fullName: 'João Lima', email: OTHER.email, ...typed }] }));
      expect(response.status).toBe(201);
      expect(store.submissions[i]!.authors[1]!.document).toEqual(cpfOnly(OTHER_CPF));
    }
  });

  it('answers the same whether the document typed for an account holder is right or wrong: nothing to learn by trying', async () => {
    const right = await ready();
    const wrong = await ready();
    const a = await right.save(paper({ coauthors: [{ fullName: 'João Lima', email: OTHER.email, cpf: OTHER_CPF }] }));
    const b = await wrong.save(paper({ coauthors: [{ fullName: 'João Lima', email: OTHER.email, cpf: SPARE_CPF }] }));
    const strip = (answer: Answer) => ({ ...answer.submission, id: 0, number: 0 });
    expect([a.status, strip(await body(a))]).toEqual([b.status, strip(await body(b))]);
  });

  it('refuses a document that belongs to an account under another address, naming that address masked', async () => {
    const { save, store } = await ready();
    const response = await save(paper({ coauthors: [{ fullName: 'João com outro e-mail', email: 'joao.outro@gmail.com', cpf: OTHER_CPF }] }));
    expect(response.status).toBe(409);
    expect(await body(response)).toEqual({ error: 'author_other_email', name: 'João com outro e-mail', maskedEmail: maskEmail(OTHER.email) });
    expect(JSON.stringify(await body(await save(paper({ coauthors: [{ fullName: 'J', email: 'joao.outro@gmail.com', cpf: OTHER_CPF }] }))))).not.toContain(OTHER.email);
    expect(store.submissions).toEqual([]);
  });

  it('does the same for a passport held by an account, and takes the same number from another country', async () => {
    const { save, store } = await ready();
    store.addUser({ id: 'user-pt', email: 'joana@uc.pt', emailConfirmed: true }, passportOnly('AB123456', 'PT'));
    const held = await save(paper({ coauthors: [{ fullName: 'Joana', email: 'joana.silva@gmail.com', passport: 'AB123456', country: 'PT' }] }));
    expect(await body(held)).toEqual({ error: 'author_other_email', name: 'Joana', maskedEmail: maskEmail('joana@uc.pt') });
    expect((await save(paper({ coauthors: [{ fullName: 'Outra pessoa', email: 'outra@uv.es', passport: 'AB123456', country: 'ES' }] }))).status).toBe(201);
  });

  it('the sender cannot list their own document under another address either', async () => {
    const { save } = await ready();
    const response = await save(paper({ coauthors: [{ fullName: 'Maria, de novo', email: 'maria.clara@gmail.com', cpf: MAIN_CPF }] }));
    // Her account holds that CPF: it is refused like any other account's.
    expect(await body(response)).toEqual({ error: 'author_other_email', name: 'Maria, de novo', maskedEmail: maskEmail(MAIN.email) });
  });

  it('refuses the same document twice in one paper, under two addresses', async () => {
    const { save, store } = await ready();
    const response = await save(paper({ coauthors: [{ ...ANA, cpf: SPARE_CPF }, { fullName: 'Ana R.', email: 'ana.reis@gmail.com', cpf: SPARE_CPF }] }));
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ error: 'duplicate_author', name: 'Ana R.' });
    expect(store.submissions).toEqual([]);
  });

  it('refuses the same passport twice, and the same person once by CPF and once by CPF and passport', async () => {
    const { save } = await ready();
    const twice = await save(paper({ coauthors: [{ ...ANA, passport: 'AB123456', country: 'PT' }, { fullName: 'Ana R.', email: 'a2@x.org', passport: 'ab-123456', country: 'pt' }] }));
    expect(await body(twice)).toEqual({ error: 'duplicate_author', name: 'Ana R.' });
    const mixed = await save(paper({ coauthors: [{ ...ANA, cpf: SPARE_CPF }, { fullName: 'Ana R.', email: 'a2@x.org', cpf: SPARE_CPF, passport: 'AB123456', country: 'PT' }] }));
    expect(await body(mixed)).toEqual({ error: 'duplicate_author', name: 'Ana R.' });
  });

  it('two authors with different kinds of document are two people', async () => {
    const { save } = await ready();
    expect((await save(paper({ coauthors: [{ ...ANA, cpf: SPARE_CPF }, { fullName: 'Bia Luz', email: 'bia@uc.pt', passport: 'AB123456', country: 'PT' }] }))).status).toBe(201);
  });

  it('hands the database every author with all that says who they are, to count the limits when it writes', async () => {
    const { save, store } = await ready();
    await save(paper({ coauthors: [{ ...ANA, cpf: SPARE_CPF, passport: 'AB123456', country: 'PT' }] }));
    expect(store.saves).toHaveLength(1);
    expect(store.saves[0]!.check).toEqual({
      maxAsMain: R.maxAsMainAuthor,
      maxAsCoauthor: R.maxAsCoauthor,
      identities: [
        { emails: [MAIN.email], cpfs: [MAIN_CPF], passports: [] },
        { emails: [ANA.email], cpfs: [SPARE_CPF], passports: ['PT:AB123456'] },
      ],
    });
  });

  it(`stops after too many saves in an hour`, async () => {
    const { save, store } = await ready();
    store.submissions = [];
    let last = 0;
    for (let i = 0; i < 61; i += 1) last = (await save(paper({ title: 'x' }))).status;
    expect(last).toBe(429);
  });
});

describe('changing a paper keeps who its authors are', () => {
  const ANA = { fullName: 'Ana Reis', email: 'ana@ufrn.br' };
  const start = async () => {
    const ctx = await ready();
    const first = await body(await ctx.save(paper({ coauthors: [{ ...ANA, cpf: SPARE_CPF }] })));
    return { ...ctx, id: first.submission.id as string };
  };

  it('keeps the document of a line whose address did not change, with nothing typed again', async () => {
    const { save, store, id } = await start();
    const response = await save(paper({ id, filePath: undefined, title: 'Governança da água: versão revista', coauthors: [{ ...ANA, fullName: 'Ana M. Reis' }] }));
    expect(response.status).toBe(200);
    expect(store.submissions[0]!.authors[1]).toEqual(line(2, 'Ana M. Reis', ANA.email, cpfOnly(SPARE_CPF)));
  });

  it('asks for the document again when the address of the line changes', async () => {
    const { save, store, id } = await start();
    const response = await save(paper({ id, filePath: undefined, coauthors: [{ fullName: 'Ana Reis', email: 'ana.nova@ufrn.br' }] }));
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ error: 'author_document_required', name: 'Ana Reis' });
    expect(store.submissions[0]!.authors[1]!.email).toBe(ANA.email);
  });

  it('takes a corrected document typed for the same address', async () => {
    const { save, store, id } = await start();
    expect((await save(paper({ id, filePath: undefined, coauthors: [{ ...ANA, cpf: cpfOf(50) }] }))).status).toBe(200);
    expect(store.submissions[0]!.authors[1]!.document).toEqual(cpfOnly(cpfOf(50)));
  });

  it('tells whoever sent it, and only them, what is on record for each author; never the document itself', async () => {
    const { deps, tokens, store, id, save } = await start();
    await save(paper({ id, filePath: undefined, coauthors: [{ ...ANA }, { fullName: 'João Lima', email: OTHER.email }] }));
    store.submissions[0]!.authors.push(line(4, 'De antes', 'antes@ufrn.br'));
    const one = (token: string) => handleSubmissions(call('GET', 'one', { token, query: `?eventSlug=2027&id=${id}` }), 'one', deps);
    const sender = await body(await one(tokens.main));
    expect(sender.submission.authorDocuments).toEqual([
      { position: 1, state: 'account' },
      // Typed by the sender for someone without an account: a hint, to recognise it.
      { position: 2, state: 'typed', hint: '***.456.789-**' },
      // The document of an account is never shown, not even as a hint.
      { position: 3, state: 'account' },
      { position: 4, state: 'missing' },
    ]);
    const text = JSON.stringify(sender);
    for (const secret of [SPARE_CPF, OTHER_CPF, MAIN_CPF]) expect(text).not.toContain(secret);
    // A co-author sees the paper and nothing about documents.
    const coauthor = await body(await one(tokens.other));
    expect(coauthor.submission).not.toHaveProperty('authorDocuments');
    expect(JSON.stringify(coauthor)).not.toContain('***');
  });

  it('an administrator correcting a paper leaves alone a line from before documents existed, and still needs one for a new line', async () => {
    const { save, store, tokens } = await ready();
    store.organisers = [{ userId: ORGANISER.id, email: ORGANISER.email, fullName: 'Viviane' }];
    const old = store.seed({ authors: [line(1, 'Maria', MAIN.email), line(2, 'Sem Documento', 'antiga@ufrn.br')] });
    const fixed = await save(paper({ id: old.id, filePath: undefined, title: 'Título corrigido pela organização', authors: [{ fullName: 'Maria', email: MAIN.email }, { fullName: 'Sem Documento', email: 'antiga@ufrn.br' }] }), tokens.organiser);
    expect(fixed.status).toBe(200);
    expect(store.submissions[0]!.authors[1]).toEqual(line(2, 'Sem Documento', 'antiga@ufrn.br', NO_DOCUMENT));
    const added = await save(paper({ id: old.id, filePath: undefined, authors: [{ fullName: 'Maria', email: MAIN.email }, { fullName: 'Nova na lista', email: 'nova@ufrn.br' }] }), tokens.organiser);
    expect(await body(added)).toEqual({ error: 'author_document_required', name: 'Nova na lista' });
  });

  it('the sender of a paper from before documents existed must now say who each author is', async () => {
    const { save, store } = await ready();
    const old = store.seed({ authors: [line(1, 'Maria', MAIN.email), line(2, 'Sem Documento', 'antiga@ufrn.br')] });
    const response = await save(paper({ id: old.id, filePath: undefined, authors: [{ fullName: 'Maria', email: MAIN.email }, { fullName: 'Sem Documento', email: 'antiga@ufrn.br' }] }));
    expect(await body(response)).toEqual({ error: 'author_document_required', name: 'Sem Documento' });
  });
});

describe('the limits are counted per person, not per address (ADR-010, decision 8)', () => {
  const ANA = { fullName: 'Ana Reis', email: 'ana@ufrn.br' };

  it('someone listed as first author under three addresses with one CPF cannot be first in a fourth paper', async () => {
    const { save, store } = await ready();
    for (let i = 0; i < R.maxAsMainAuthor; i += 1) {
      store.seed({ title: `Da Ana ${i}`, userId: 'someone', authors: [line(1, 'Ana Reis', `ana${i}@gmail.com`, cpfOnly(SPARE_CPF))] });
    }
    const response = await save(paper({ authors: [{ ...ANA, cpf: SPARE_CPF }, ME] }));
    expect(response.status).toBe(409);
    expect(await body(response)).toEqual({ error: 'too_many_as_main', name: 'Ana Reis', max: R.maxAsMainAuthor });
    expect(store.submissions).toHaveLength(R.maxAsMainAuthor);
  });

  it('the same with a passport and its country; the same number of another country is someone else', async () => {
    const { save, store } = await ready();
    for (let i = 0; i < R.maxAsCoauthor; i += 1) {
      store.seed({ title: `Com a Joana ${i}`, userId: 'someone', authors: [line(1, 'Líder', `lider${i}@x.org`, cpfOnly(cpfOf(60 + i))), line(2, 'Joana', `joana${i}@uc.pt`, passportOnly('AB123456', 'PT'))] });
    }
    const sixth = await save(paper({ coauthors: [{ fullName: 'Joana', email: 'joana@uc.pt', passport: 'ab 123-456', country: 'PT' }] }));
    expect(await body(sixth)).toEqual({ error: 'coauthor_limit', name: 'Joana', max: R.maxAsCoauthor });
    expect((await save(paper({ coauthors: [{ fullName: 'Juana', email: 'juana@uv.es', passport: 'AB123456', country: 'ES' }] }))).status).toBe(201);
  });

  it('an account holder is counted by the address and by the document: papers listing them elsewhere count too', async () => {
    const { save, store } = await ready();
    // João is first author of two papers under his address and of one under another, by his CPF.
    store.seed({ title: 'Do João 1', userId: OTHER.id, authors: [line(1, 'João', OTHER.email, cpfOnly(OTHER_CPF))] });
    store.seed({ title: 'Do João 2', userId: OTHER.id, authors: [line(1, 'João', OTHER.email, cpfOnly(OTHER_CPF))] });
    store.seed({ title: 'Do João, por outro endereço', userId: 'someone', authors: [line(1, 'João', 'joao.lima@gmail.com', cpfOnly(OTHER_CPF))] });
    const response = await save(paper({ authors: [{ fullName: 'João Lima', email: OTHER.email }, ME] }));
    expect(await body(response)).toEqual({ error: 'too_many_as_main', name: 'João Lima', max: R.maxAsMainAuthor });
  });

  it('someone with a CPF and a passport is one person on lines that carry only one of them', async () => {
    const { save, store } = await ready();
    store.addUser({ id: 'user-both', email: 'bia@uc.pt', emailConfirmed: true }, { cpf: SPARE_CPF, passport: 'AB123456', country: 'PT' });
    store.seed({ title: 'Pela CPF', userId: 'someone', authors: [line(1, 'Bia', 'bia1@x.org', cpfOnly(SPARE_CPF))] });
    store.seed({ title: 'Pelo passaporte', userId: 'someone', authors: [line(1, 'Bia', 'bia2@x.org', passportOnly('AB123456', 'PT'))] });
    store.seed({ title: 'Pelo endereço', userId: 'someone', authors: [line(1, 'Bia', 'bia@uc.pt')] });
    const response = await save(paper({ authors: [{ fullName: 'Bia Luz', email: 'bia@uc.pt' }, ME] }));
    expect(await body(response)).toEqual({ error: 'too_many_as_main', name: 'Bia Luz', max: R.maxAsMainAuthor });
  });

  it('a line from before documents existed still counts, by its address', async () => {
    const { save, store } = await ready();
    for (let i = 0; i < R.maxAsMainAuthor; i += 1) store.seed({ title: `Antigo ${i}`, userId: 'someone', authors: [line(1, 'Ana Reis', ANA.email)] });
    expect(await body(await save(paper({ authors: [{ ...ANA, cpf: SPARE_CPF }, ME] })))).toEqual({ error: 'too_many_as_main', name: 'Ana Reis', max: R.maxAsMainAuthor });
  });

  it('withdrawn papers and the paper being changed are not counted', async () => {
    const { save, store } = await ready();
    for (let i = 0; i < R.maxAsMainAuthor; i += 1) store.seed({ title: `Meu ${i}` });
    store.submissions[0]!.deletedAt = NOW.toISOString();
    expect((await save(paper({ coauthors: [] }))).status).toBe(201);
    // Three stand now: changing one of them is not a fourth.
    const id = store.submissions.at(-1)!.id;
    expect((await save(paper({ id, filePath: undefined, title: 'O mesmo, com outro título bem diferente', coauthors: [] }))).status).toBe(200);
    expect(await body(await save(paper({ title: 'Um quarto trabalho como primeira autora', coauthors: [] })))).toMatchObject({ error: 'too_many_as_main' });
  });

  it('the count made when the paper is written decides, even if the early one let it through', async () => {
    const { save, store } = await ready();
    // Another save lands between the early count and the write: the early count sees two, the write sees three.
    const list = store.listByIdentity.bind(store);
    let landed = false;
    store.listByIdentity = async (eventId, who) => {
      const seen = await list(eventId, who);
      if (!landed && who.emails.includes(MAIN.email)) {
        landed = true;
        store.seed({ title: 'Chegou no mesmo instante' });
      }
      return seen;
    };
    store.seed({ title: 'Meu 1' });
    store.seed({ title: 'Meu 2' });
    const response = await save(paper({ coauthors: [] }));
    expect(response.status).toBe(409);
    expect(await body(response)).toEqual({ error: 'too_many_as_main', name: ME.fullName, max: R.maxAsMainAuthor });
    expect(store.submissions).toHaveLength(3);
  });

  it('a paper that vanished between the look and the write is "not found", not a crash', async () => {
    const { save, store } = await ready();
    const first = await body(await save(paper({ coauthors: [] })));
    const real = store.save.bind(store);
    store.save = async (...args) => {
      store.submissions[0]!.deletedAt = NOW.toISOString();
      return real(...args);
    };
    const response = await save(paper({ id: first.submission.id, filePath: undefined, coauthors: [] }));
    expect(response.status).toBe(404);
    expect(await body(response)).toEqual({ error: 'submission_not_found' });
  });
});

describe('the waiting co-author (ADR-010, decision 9)', () => {
  const ANA = { fullName: 'Ana Reis', email: 'ana@ufrn.br' };
  const ana = { id: 'user-ana', email: ANA.email, emailConfirmed: true };
  const mine = async (deps: SubmissionDeps, token: string) =>
    body(await handleSubmissions(call('GET', 'mine', { token, query: '?eventSlug=2027' }), 'mine', deps));
  const start = async (typed: Record<string, unknown> = { cpf: SPARE_CPF }) => {
    const ctx = await ready();
    const first = await body(await ctx.save(paper({ coauthors: [{ ...ANA, ...typed }] })));
    return { ...ctx, id: first.submission.id as string };
  };
  const open = (deps: SubmissionDeps, token: string, action: 'one' | 'file', id: string) =>
    handleSubmissions(call('GET', action, { token, query: `?eventSlug=2027&id=${id}` }), action, deps);

  it('same address and the same CPF: the paper is hers to see, and she opens the file', async () => {
    const { deps, store, auth, id } = await start();
    store.addUser(ana, cpfOnly(SPARE_CPF));
    const token = auth.login(ana, 'tok-ana');
    const list = await mine(deps, token);
    expect(list.submissions).toHaveLength(1);
    expect(list.submissions[0]).toMatchObject({ position: 2, sentByMe: false, canEdit: false, authorIssues: [] });
    expect(list.limits).toMatchObject({ asMain: 0, asCoauthor: 1 });
    expect(list.waiting).toEqual({ otherDocument: 0, otherEmail: [] });
    expect((await open(deps, token, 'one', id)).status).toBe(200);
    expect((await open(deps, token, 'file', id)).status).toBe(200);
  });

  it('same address and the same passport, typed with spaces and small letters on one side', async () => {
    const { deps, store, auth } = await start({ passport: 'ab 123-456', country: 'pt' });
    store.addUser(ana, passportOnly('AB123456', 'PT'));
    expect((await mine(deps, auth.login(ana, 'tok-ana'))).submissions).toHaveLength(1);
  });

  it('same address, another CPF: the paper keeps waiting, counts against her, and she cannot open it', async () => {
    const { deps, store, auth, id } = await start();
    store.addUser(ana, cpfOnly(cpfOf(70)));
    const token = auth.login(ana, 'tok-ana');
    const list = await mine(deps, token);
    expect(list.submissions).toEqual([]);
    expect(list.waiting).toEqual({ otherDocument: 1, otherEmail: [] });
    // The place is hers by the address: it counts.
    expect(list.limits).toMatchObject({ asMain: 0, asCoauthor: 1 });
    // To her the paper does not exist: same answer as for a stranger.
    for (const action of ['one', 'file'] as const) {
      const response = await open(deps, token, action, id);
      expect(response.status).toBe(404);
      expect(await body(response)).toEqual({ error: 'submission_not_found' });
    }
    // Nothing of the paper is in what she is sent.
    expect(JSON.stringify(list)).not.toContain('Governança');
  });

  it('whoever sent it sees which author no longer matches, on that paper only', async () => {
    const { deps, store, tokens, save } = await start();
    await save(paper({ title: 'Outro trabalho, sem problema algum nele', coauthors: [{ fullName: 'João Lima', email: OTHER.email }] }));
    store.addUser(ana, cpfOnly(cpfOf(70)));
    const list = await mine(deps, tokens.main);
    expect(list.submissions.map((s) => s.authorIssues)).toEqual([[{ position: 2, fullName: 'Ana Reis' }], []]);
    // João, a co-author of the second paper, is told nothing about anybody's document.
    const joao = await mine(deps, tokens.other);
    expect(joao.submissions.map((s) => s.authorIssues)).toEqual([[]]);
  });

  it('saving the paper again takes her account\'s document, shows it to her, and counts the limits again', async () => {
    const { deps, store, auth, id, save } = await start();
    store.addUser(ana, cpfOnly(cpfOf(70)));
    const token = auth.login(ana, 'tok-ana');
    expect((await save(paper({ id, filePath: undefined, coauthors: [{ ...ANA }] }))).status).toBe(200);
    expect(store.submissions[0]!.authors[1]!.document).toEqual(cpfOnly(cpfOf(70)));
    const list = await mine(deps, token);
    expect(list.submissions).toHaveLength(1);
    expect(list.waiting).toEqual({ otherDocument: 0, otherEmail: [] });
  });

  it('the correction is refused when, by her real document, she is already at the limit', async () => {
    const { store, id, save } = await start();
    store.addUser(ana, cpfOnly(cpfOf(70)));
    for (let i = 0; i < R.maxAsCoauthor; i += 1) {
      store.seed({ title: `Outros da Ana ${i}`, userId: 'someone', authors: [line(1, 'Líder', `l${i}@x.org`, cpfOnly(cpfOf(80 + i))), line(2, 'Ana', `ana.outra${i}@gmail.com`, cpfOnly(cpfOf(70)))] });
    }
    const response = await save(paper({ id, filePath: undefined, coauthors: [{ ...ANA }] }));
    expect(response.status).toBe(409);
    expect(await body(response)).toEqual({ error: 'coauthor_limit', name: 'Ana Reis', max: R.maxAsCoauthor });
    // The line stays as it was: still waiting.
    expect(store.submissions[0]!.authors[1]!.document).toEqual(cpfOnly(SPARE_CPF));
  });

  it('the same CPF under another address: she signs up, sees no paper, a hint of the address, and it counts', async () => {
    const { deps, store, auth, id } = await start();
    const other = { id: 'user-ana2', email: 'ana.reis@gmail.com', emailConfirmed: true };
    store.addUser(other, cpfOnly(SPARE_CPF));
    const token = auth.login(other, 'tok-ana2');
    const list = await mine(deps, token);
    expect(list.submissions).toEqual([]);
    expect(list.waiting).toEqual({ otherDocument: 0, otherEmail: [{ maskedEmail: maskEmail(ANA.email), count: 1 }] });
    expect(list.limits).toMatchObject({ asCoauthor: 1 });
    expect(JSON.stringify(list)).not.toContain(ANA.email);
    expect((await open(deps, token, 'one', id)).status).toBe(404);
    expect((await open(deps, token, 'file', id)).status).toBe(404);
  });

  it('then the sender must use the address of her account: the old one is refused, the right one attaches', async () => {
    const { deps, store, auth, id, save } = await start();
    const other = { id: 'user-ana2', email: 'ana.reis@gmail.com', emailConfirmed: true };
    store.addUser(other, cpfOnly(SPARE_CPF));
    const again = await save(paper({ id, filePath: undefined, coauthors: [{ ...ANA, cpf: SPARE_CPF }] }));
    expect(await body(again)).toEqual({ error: 'author_other_email', name: 'Ana Reis', maskedEmail: maskEmail(other.email) });
    expect((await save(paper({ id, filePath: undefined, coauthors: [{ fullName: 'Ana Reis', email: other.email }] }))).status).toBe(200);
    expect((await mine(deps, auth.login(other, 'tok-ana2'))).submissions).toHaveLength(1);
  });

  it('an account with a CPF and a passport matches a line that carries either, and not one that carries a wrong other', async () => {
    const both = { cpf: SPARE_CPF, passport: 'AB123456', country: 'PT' };
    for (const [typed, shown] of [
      [{ cpf: SPARE_CPF }, 1],
      [{ passport: 'AB123456', country: 'PT' }, 1],
      [{ cpf: SPARE_CPF, passport: 'AB123456', country: 'PT' }, 1],
      [{ cpf: SPARE_CPF, passport: 'ZZ999999', country: 'PT' }, 0],
      [{ cpf: cpfOf(71), passport: 'AB123456', country: 'PT' }, 0],
    ] as const) {
      const { deps, store, auth } = await start(typed);
      store.addUser(ana, both);
      expect((await mine(deps, auth.login(ana, 'tok-ana'))).submissions, JSON.stringify(typed)).toHaveLength(shown);
    }
  });

  it('a CPF account against a passport line cannot be told to be the same person: it waits, and counts by the address', async () => {
    const { deps, store, auth } = await start({ passport: 'AB123456', country: 'PT' });
    store.addUser(ana, cpfOnly(SPARE_CPF));
    const list = await mine(deps, auth.login(ana, 'tok-ana'));
    expect(list.submissions).toEqual([]);
    expect(list.waiting).toEqual({ otherDocument: 1, otherEmail: [] });
    expect(list.limits).toMatchObject({ asCoauthor: 1 });
  });

  it('an account that has not said who the person is sees no paper that names a document, and is told why', async () => {
    const { deps, store, auth } = await start();
    store.addUser(ana);
    const list = await mine(deps, auth.login(ana, 'tok-ana'));
    expect(list.submissions).toEqual([]);
    expect(list.documentMissing).toBe(true);
    expect(list.waiting).toEqual({ otherDocument: 1, otherEmail: [] });
  });

  it('a line from before documents existed still shows by its address alone', async () => {
    const { deps, store, auth } = await ready();
    store.seed({ authors: [line(1, 'Maria', MAIN.email), line(2, 'Ana', ANA.email)] });
    store.addUser(ana, cpfOnly(SPARE_CPF));
    const list = await mine(deps, auth.login(ana, 'tok-ana'));
    expect(list.submissions).toHaveLength(1);
    expect(list.waiting).toEqual({ otherDocument: 0, otherEmail: [] });
  });

  it('whoever sent a paper always sees it, even if their own line no longer matches their account', async () => {
    const { deps, store, tokens, id } = await start();
    // The owner corrected Maria's document after she sent the paper.
    store.addUser(MAIN, cpfOnly(cpfOf(72)));
    const list = await mine(deps, tokens.main);
    expect(list.submissions).toHaveLength(1);
    expect(list.submissions[0]).toMatchObject({ sentByMe: true, canEdit: true });
    expect((await open(deps, tokens.main, 'one', id)).status).toBe(200);
    expect((await open(deps, tokens.main, 'file', id)).status).toBe(200);
  });

  it('a withdrawn paper waits for nobody and counts for nobody', async () => {
    const { deps, store, auth } = await start();
    store.submissions[0]!.deletedAt = NOW.toISOString();
    store.addUser(ana, cpfOnly(cpfOf(70)));
    const list = await mine(deps, auth.login(ana, 'tok-ana'));
    expect(list.waiting).toEqual({ otherDocument: 0, otherEmail: [] });
    expect(list.limits).toMatchObject({ asMain: 0, asCoauthor: 0 });
  });

  it('a stranger with no line in the paper sees nothing and waits for nothing', async () => {
    const { deps, store, auth, id } = await start();
    const stranger = { id: 'user-stranger', email: 'estranho@ufrn.br', emailConfirmed: true };
    store.addUser(stranger, cpfOnly(cpfOf(73)));
    const token = auth.login(stranger, 'tok-stranger');
    expect(await mine(deps, token)).toMatchObject({ submissions: [], waiting: { otherDocument: 0, otherEmail: [] }, limits: { asMain: 0, asCoauthor: 0 } });
    expect((await open(deps, token, 'file', id)).status).toBe(404);
  });
});

describe('who is sent an author\'s document (ADR-010, decision 10)', () => {
  it('no answer to an author, a co-author or a reviewer carries any document', async () => {
    const { save, deps, tokens, store } = await ready();
    const first = await body(await save(paper({ coauthors: [{ fullName: 'João Lima', email: OTHER.email }, { fullName: 'Ana Reis', email: 'ana@ufrn.br', cpf: SPARE_CPF, passport: 'AB123456', country: 'PT' }] })));
    const id = first.submission.id as string;
    store.reviewers.set(id, [ORGANISER.id]);
    const answers = [
      first,
      await body(await handleSubmissions(call('GET', 'mine', { token: tokens.main, query: '?eventSlug=2027' }), 'mine', deps)),
      await body(await handleSubmissions(call('GET', 'mine', { token: tokens.other, query: '?eventSlug=2027' }), 'mine', deps)),
      await body(await handleSubmissions(call('GET', 'one', { token: tokens.other, query: `?eventSlug=2027&id=${id}` }), 'one', deps)),
      await body(await handleSubmissions(call('GET', 'reviewing', { token: tokens.organiser, query: '?eventSlug=2027' }), 'reviewing', deps)),
    ];
    for (const answer of answers) {
      const text = JSON.stringify(answer);
      for (const secret of [SPARE_CPF, MAIN_CPF, OTHER_CPF, 'AB123456', '"cpf"', '"passport"', '"document"']) expect(text).not.toContain(secret);
    }
  });

  it('no e-mail and no notice about a paper carries a document', async () => {
    const { save, store, sent, outbox } = await ready();
    store.organisers = [{ userId: ORGANISER.id, email: ORGANISER.email, fullName: 'Viviane Farias' }];
    await save(paper({ coauthors: [{ fullName: 'Ana Reis', email: 'ana@ufrn.br', cpf: SPARE_CPF }] }));
    const everything = JSON.stringify([sent, outbox.notifications]);
    for (const secret of [SPARE_CPF, MAIN_CPF, '123.456.789']) expect(everything).not.toContain(secret);
  });

  it('a suggestion says whether a person needs a document typed, never the document', async () => {
    const { deps, tokens, store } = await ready();
    store.people = [
      { fullName: 'Rodrigo Com Conta', email: 'rodrigo@ufcg.edu.br', institution: 'UFCG' },
      { fullName: 'Rodrigo Sem Documento', email: 'rodrigo2@ufcg.edu.br', institution: null },
      { fullName: 'Rodrigo Sem Conta', email: 'rodrigo3@ufcg.edu.br', institution: null },
    ];
    store.addUser({ id: 'u-r1', email: 'rodrigo@ufcg.edu.br', emailConfirmed: true }, cpfOnly(SPARE_CPF));
    store.addUser({ id: 'u-r2', email: 'rodrigo2@ufcg.edu.br', emailConfirmed: true });
    const response = await handleSubmissions(call('GET', 'people', { token: tokens.main, query: '?eventSlug=2027&q=Rodrigo' }), 'people', deps);
    const { people } = (await body(response)) as unknown as { people: { fullName: string; hasDocument: boolean }[] };
    expect(people.map((p) => [p.fullName, p.hasDocument])).toEqual([
      ['Rodrigo Com Conta', true],
      ['Rodrigo Sem Documento', false],
      ['Rodrigo Sem Conta', false],
    ]);
    expect(JSON.stringify(people)).not.toContain(SPARE_CPF);
  });
});

describe('a suggestion is for whoever asked, here, for a day (ADR-010, #352)', () => {
  const RODRIGO = 'rodrigo.costa@ufcg.edu.br';
  const DAY = 24 * 60 * 60 * 1000;
  const picked = (ref: string) => paper({ authors: [ME, { fullName: 'Rodrigo Alves Costa', ref, cpf: SPARE_CPF }] });

  it('opens only for the account it was sealed for, in the edition it was sealed for, until it expires', () => {
    const ref = sealEmail(RODRIGO, 'pepper', FOR_MAIN);
    expect(openEmail(ref, 'pepper', FOR_MAIN)).toBe(RODRIGO);
    expect(openEmail(ref, 'pepper', { ...FOR_MAIN, userId: OTHER.id })).toBeNull();
    expect(openEmail(ref, 'pepper', { ...FOR_MAIN, eventId: 'ev-2029' })).toBeNull();
    expect(openEmail(ref, 'pepper', { ...FOR_MAIN, now: new Date(NOW.getTime() + DAY - 1000) })).toBe(RODRIGO);
    expect(openEmail(ref, 'pepper', { ...FOR_MAIN, now: new Date(NOW.getTime() + DAY + 1000) })).toBeNull();
  });

  it('a reference in the old shape, a tampered one and nonsense open for nobody', () => {
    const ref = sealEmail(RODRIGO, 'pepper', FOR_MAIN);
    const flipped = `${ref.slice(0, -2)}${ref.endsWith('A') ? 'B' : 'A'}A`;
    for (const bad of [flipped, ref.slice(0, 20), '', 'not-a-reference', 'a'.repeat(600)]) {
      expect(openEmail(bad, 'pepper', FOR_MAIN), bad.slice(0, 12)).toBeNull();
    }
  });

  it('the server takes the reference it gave this account, and refuses one given to another', async () => {
    const { save, deps } = await ready();
    expect((await save(picked(sealEmail(RODRIGO, deps.pepper, FOR_MAIN)))).status).toBe(201);
    const forJoao = sealEmail(RODRIGO, deps.pepper, { ...FOR_MAIN, userId: OTHER.id });
    const response = await save(picked(forJoao));
    expect(response.status).toBe(400);
    // The same answer as for any reference that is not ours: nothing to learn from it.
    expect(await body(response)).toEqual({ error: 'invalid_author' });
  });

  it('refuses a reference from yesterday, and one sealed for another edition', async () => {
    const { save, deps } = await ready();
    const old = sealEmail(RODRIGO, deps.pepper, { ...FOR_MAIN, now: new Date(NOW.getTime() - DAY - 1000) });
    expect(await body(await save(picked(old)))).toEqual({ error: 'invalid_author' });
    const elsewhere = sealEmail(RODRIGO, deps.pepper, { ...FOR_MAIN, eventId: 'ev-2029' });
    expect(await body(await save(picked(elsewhere)))).toEqual({ error: 'invalid_author' });
  });
});

describe('whoever sent the paper is told when a co-author\'s document does not match (ADR-010, #352)', () => {
  const ANA = { fullName: 'Ana Reis', email: 'ana@ufrn.br' };
  const ana = { id: 'user-ana', email: ANA.email, emailConfirmed: true };
  const mine = (deps: SubmissionDeps, token: string) => handleSubmissions(call('GET', 'mine', { token, query: '?eventSlug=2027' }), 'mine', deps);
  const start = async () => {
    const ctx = await ready();
    await ctx.save(paper({ coauthors: [{ ...ANA, cpf: SPARE_CPF }] }));
    // What sending the paper itself queued is not what these tests are about.
    ctx.sent.length = 0;
    ctx.outbox.notifications.length = 0;
    return ctx;
  };
  const issues = (ctx: Awaited<ReturnType<typeof start>>) => ({
    mails: ctx.sent.filter((m) => m.subject.includes('confira o documento')),
    bells: ctx.outbox.notifications.filter((n) => n.kind === 'submission.author_issue'),
  });

  it('one e-mail and one bell notice, to the sender, naming the author and never a document', async () => {
    const ctx = await start();
    ctx.store.addUser(ana, cpfOnly(cpfOf(70)));
    await mine(ctx.deps, ctx.auth.login(ana, 'tok-ana'));
    const { mails, bells } = issues(ctx);
    expect(mails.map((m) => m.to)).toEqual([MAIN.email]);
    expect(mails[0]!.subject).toBe('Trabalho nº 1: confira o documento de Ana Reis (II SIEAmB)'.replace('nº 1', `nº ${ctx.store.submissions[0]!.number}`));
    expect(mails[0]!.text).toContain('Ana Reis criou uma conta no site com um documento diferente');
    expect(mails[0]!.text).toContain('abra o trabalho e salve de novo');
    expect(mails[0]!.text.length).toBeLessThan(700);
    expect(mails[0]!.text).toContain('https://dev.sieamb.org/2027/meus-trabalhos');
    expect(bells).toEqual([
      { userId: MAIN.id, eventId: EVENT.id, kind: 'submission.author_issue', data: { number: ctx.store.submissions[0]!.number, title: 'Governança da água no semiárido paraibano', authorName: 'Ana Reis' } },
    ]);
    const everything = JSON.stringify([ctx.sent, ctx.outbox.notifications, ctx.outbox.rows]);
    for (const secret of [SPARE_CPF, cpfOf(70), MAIN_CPF]) expect(everything).not.toContain(secret);
  });

  it('is said once, however many times she opens Meus trabalhos', async () => {
    const ctx = await start();
    ctx.store.addUser(ana, cpfOnly(cpfOf(70)));
    const token = ctx.auth.login(ana, 'tok-ana');
    for (let i = 0; i < 4; i += 1) await mine(ctx.deps, token);
    expect(issues(ctx).mails).toHaveLength(1);
    expect(issues(ctx).bells).toHaveLength(1);
  });

  it('is said again if she is then given yet another document, which is another thing to correct', async () => {
    const ctx = await start();
    ctx.store.addUser(ana, cpfOnly(cpfOf(70)));
    const token = ctx.auth.login(ana, 'tok-ana');
    await mine(ctx.deps, token);
    ctx.store.addUser(ana, cpfOnly(cpfOf(71)));
    await mine(ctx.deps, token);
    expect(issues(ctx).mails).toHaveLength(2);
  });

  it('says nothing when the documents match, when she has given none yet, or for a line from before documents', async () => {
    const matching = await start();
    matching.store.addUser(ana, cpfOnly(SPARE_CPF));
    await mine(matching.deps, matching.auth.login(ana, 'tok-ana'));
    expect(issues(matching)).toEqual({ mails: [], bells: [] });

    const none = await start();
    none.store.addUser(ana);
    await mine(none.deps, none.auth.login(ana, 'tok-ana'));
    expect(issues(none)).toEqual({ mails: [], bells: [] });

    const old = await ready();
    old.store.seed({ authors: [line(1, 'Maria', MAIN.email), line(2, 'Ana', ANA.email)] });
    old.store.addUser(ana, cpfOnly(cpfOf(70)));
    await mine(old.deps, old.auth.login(ana, 'tok-ana'));
    expect(issues(old)).toEqual({ mails: [], bells: [] });
  });

  it('says nothing to anyone when she is listed under another address: the sender has nothing wrong to fix yet', async () => {
    const ctx = await start();
    const other = { id: 'user-ana2', email: 'ana.reis@gmail.com', emailConfirmed: true };
    ctx.store.addUser(other, cpfOnly(SPARE_CPF));
    await mine(ctx.deps, ctx.auth.login(other, 'tok-ana2'));
    expect(issues(ctx)).toEqual({ mails: [], bells: [] });
  });

  it('writes in the language the paper was sent in', async () => {
    const ctx = await ready();
    await ctx.save(paper({ locale: 'en', coauthors: [{ ...ANA, cpf: SPARE_CPF }] }));
    ctx.sent.length = 0;
    ctx.store.addUser(ana, cpfOnly(cpfOf(70)));
    await mine(ctx.deps, ctx.auth.login(ana, 'tok-ana'));
    expect(ctx.sent.find((m) => m.to === MAIN.email)!.subject).toContain('check the document of Ana Reis');
  });

  it('a failure to tell the sender never fails her own page', async () => {
    const ctx = await start();
    ctx.store.addUser(ana, cpfOnly(cpfOf(70)));
    ctx.outbox.enqueueOutbox = async () => {
      throw new Error('outbox down');
    };
    const response = await mine(ctx.deps, ctx.auth.login(ana, 'tok-ana'));
    expect(response.status).toBe(200);
    expect((await body(response)).waiting).toEqual({ otherDocument: 1, otherEmail: [] });
  });
});
