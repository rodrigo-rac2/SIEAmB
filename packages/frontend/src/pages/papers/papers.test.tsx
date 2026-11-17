import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from '../../contexts/AuthContext';
import { EventProvider } from '../../contexts/EventContext';
import { browser, type MyPapers, type Paper } from '../../services/submissions';
import { SubmissionsPage } from '../SubmissionsPage';
import { MyPapersPage } from './MyPapersPage';
import { PaperFormPage } from './PaperFormPage';

const auth = (over: Partial<AuthState> = {}): AuthState => ({
  enabled: true,
  loading: false,
  email: 'maria@ufcg.edu.br',
  accessToken: 'access-token-1',
  signIn: vi.fn(async () => null),
  signOut: vi.fn(async () => undefined),
  verifyLink: vi.fn(async () => true),
  ...over,
});

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

function mount(path: string, pattern: string, element: ReactElement, state: AuthState = auth()) {
  return render(
    <AuthContext.Provider value={state}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={pattern} element={<EventProvider>{element}</EventProvider>} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

interface Call {
  url: string;
  method: string;
  body: unknown;
  authorization: string | null;
}
type Answer = { status?: number; body: unknown };

/** Answers by the last path segment (`mine`, `save`, `me`…) or by full URL; records every call. */
function stubApi(answers: Record<string, Answer | (() => Answer)>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const key = answers[input] ? input : input.split('?')[0]!.split('/').pop()!;
      calls.push({
        url: input,
        method: init.method ?? 'GET',
        body: typeof init.body === 'string' ? JSON.parse(init.body) : (init.body ?? null),
        authorization: new Headers(init.headers).get('authorization'),
      });
      const entry = answers[key];
      const answer = typeof entry === 'function' ? entry() : entry;
      if (!answer) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
      return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200 });
    }),
  );
  return calls;
}

const paper = (over: Partial<Paper> = {}): Paper => ({
  id: 'paper-1',
  number: 12,
  title: 'Governança da água no semiárido',
  titleEn: 'Water governance in the semi-arid',
  modality: 'RESUMO_EXPANDIDO',
  areaRef: 'a1',
  abstract: 'x'.repeat(80),
  keywords: ['água', 'governança'],
  keywordsEn: ['water'],
  fileName: 'resumo.pdf',
  filePages: 5,
  status: 'SUBMITTED',
  createdAt: '2026-12-01T15:00:00.000Z',
  updatedAt: '2026-12-01T15:00:00.000Z',
  authors: [
    { position: 1, fullName: 'Maria Clara de Souza', email: 'maria@ufcg.edu.br' },
    { position: 2, fullName: 'João Lima', email: 'joao@ufpb.br' },
  ],
  position: 1,
  sentByMe: true,
  canEdit: true,
  ...over,
});

const mine = (over: Partial<MyPapers> = {}): MyPapers => ({
  state: 'open',
  closesAt: '2027-01-18T23:59:59-03:00',
  limits: { asMain: 0, maxAsMain: 3, asCoauthor: 0, maxAsCoauthor: 5 },
  submissions: [],
  ...over,
});

const account = (state: 'PAID' | 'PENDING' | 'UNPAID' | null) => ({
  body: {
    user: { email: 'maria@ufcg.edu.br', fullName: 'Maria', cpf: null, passport: null, country: 'BR', institution: null, documentLocked: false },
    registrations: state
      ? [{ id: 'r1', eventSlug: '2027', eventName: 'II SIEAmB', category: 'ESTUDANTE_POS', modality: 'ONLINE', createdAt: '2026-11-10T12:00:00Z', state, amountCents: null, payToken: state === 'UNPAID' ? '3f2b8c1e-9a4d-4e7f-8b21-6c5d4e3f2a10' : null, paymentId: null }]
      : [],
    suggestions: [],
  },
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const LIST = ['/2027/meus-trabalhos', '/:eventSlug/meus-trabalhos'] as const;

describe('MyPapersPage', () => {
  it('does not exist where the submission system is off, and asks for a login otherwise', async () => {
    const calls = stubApi({});
    const off = mount(...LIST, <MyPapersPage />, auth({ enabled: false }));
    expect(await screen.findByRole('heading', { name: /não encontrada|404/i })).toBeInTheDocument();
    off.unmount();
    mount(...LIST, <MyPapersPage />, auth({ accessToken: null }));
    expect(await screen.findByTestId('where')).toHaveTextContent('/2027/conta/entrar?next=%2F2027%2Fmeus-trabalhos');
    expect(calls).toEqual([]);
  });

  it('with no paper and no registration, offers to send one and says registering can wait', async () => {
    const calls = stubApi({ mine: { body: mine() }, me: account(null) });
    mount(...LIST, <MyPapersPage />);
    expect(await screen.findByTestId('no-papers')).toBeInTheDocument();
    expect(screen.getByTestId('registration-notice')).toHaveTextContent('A inscrição pode ser feita a qualquer momento.');
    expect(screen.getByRole('link', { name: 'Enviar trabalho' })).toHaveAttribute('href', '/2027/meus-trabalhos/novo');
    expect(screen.getByTestId('paper-limits')).toHaveTextContent('abertas até 18 de janeiro de 2027');
    expect(screen.getByTestId('paper-limits')).toHaveTextContent('Você é o primeiro autor em 0 de 3 trabalhos e consta nas demais posições em 0 de 5.');
    expect(calls.find((c) => c.url.includes('/submissions/mine'))).toMatchObject({ url: '/api/v1/submissions/mine?eventSlug=2027', authorization: 'Bearer access-token-1' });
  });

  it.each([
    [null, /só entra na programação se pelo menos um dos autores estiver inscrito/, 'Fazer a inscrição', '/2027/inscricoes/nova'],
    ['UNPAID', /Aguardando pagamento\. Falta o pagamento/, 'Pagar a inscrição', '/2027/inscricoes/pagar?t=3f2b8c1e-9a4d-4e7f-8b21-6c5d4e3f2a10'],
  ] as const)('with a paper and registration %s, says what is missing', async (state, text, link, href) => {
    stubApi({ mine: { body: mine({ submissions: [paper()] }) }, me: account(state) });
    mount(...LIST, <MyPapersPage />);
    const notice = await screen.findByTestId('registration-notice');
    expect(notice).toHaveTextContent(text);
    expect(within(notice).getByRole('link', { name: link })).toHaveAttribute('href', href);
  });

  it('with a paid registration, shows it as confirmed with nothing to do', async () => {
    stubApi({ mine: { body: mine({ submissions: [paper()] }) }, me: account('PAID') });
    mount(...LIST, <MyPapersPage />);
    const notice = await screen.findByTestId('registration-notice');
    expect(notice).toHaveTextContent('Inscrição confirmada. Nada mais a fazer quanto à inscrição.');
    expect(within(notice).queryByRole('link')).not.toBeInTheDocument();
  });

  it('lists a paper with number, modality, area, status, authors in order and pages', async () => {
    stubApi({ mine: { body: mine({ submissions: [paper()], limits: { asMain: 1, maxAsMain: 3, asCoauthor: 0, maxAsCoauthor: 5 } }) }, me: account('PAID') });
    mount(...LIST, <MyPapersPage />);
    const card = await screen.findByTestId('paper-card');
    expect(card).toHaveTextContent('Trabalho nº 12 · Resumo expandido · Governança, Políticas Públicas e Direito Ambiental');
    expect(card).toHaveTextContent('Enviado');
    expect(card).toHaveTextContent('você é o 1º autor');
    expect(within(card).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Maria Clara de Souza', 'João Lima']);
    expect(card).toHaveTextContent('resumo.pdf · 5 páginas');
    expect(within(card).getByRole('link', { name: 'Alterar' })).toHaveAttribute('href', '/2027/meus-trabalhos/paper-1');
  });

  it('gives an author in any position the same paper, to change or withdraw', async () => {
    stubApi({ mine: { body: mine({ submissions: [paper({ position: 2, sentByMe: false, filePages: null })] }) }, me: account(null) });
    mount(...LIST, <MyPapersPage />);
    const card = await screen.findByTestId('paper-card');
    expect(card).toHaveTextContent('você é o 2º autor');
    expect(card).not.toHaveTextContent(/principal|coautor|somente consulta/i);
    expect(within(card).getByRole('link', { name: 'Alterar' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Retirar o trabalho' })).toBeInTheDocument();
    expect(card).not.toHaveTextContent('páginas');
  });

  it('offers only the download once the paper can no longer be changed', async () => {
    stubApi({ mine: { body: mine({ submissions: [paper({ status: 'UNDER_REVIEW', canEdit: false })] }) }, me: account(null) });
    mount(...LIST, <MyPapersPage />);
    const card = await screen.findByTestId('paper-card');
    expect(within(card).queryByRole('link', { name: 'Alterar' })).not.toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Retirar o trabalho' })).not.toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Baixar o arquivo' })).toBeInTheDocument();
  });

  it('downloads through a link asked from the server at that moment', async () => {
    const calls = stubApi({ mine: { body: mine({ submissions: [paper()] }) }, me: account(null), file: { body: { url: 'https://storage.example/signed?token=t' } } });
    const open = vi.spyOn(browser, 'open').mockImplementation(() => undefined);
    mount(...LIST, <MyPapersPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Baixar o arquivo' }));
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://storage.example/signed?token=t'));
    expect(calls.find((c) => c.url.includes('/file'))).toMatchObject({ url: '/api/v1/submissions/file?id=paper-1', authorization: 'Bearer access-token-1' });
  });

  it('withdraws only after a second click, then shows the list again', async () => {
    let withdrawn = false;
    const calls = stubApi({
      mine: () => ({ body: mine({ submissions: withdrawn ? [] : [paper()] }) }),
      me: account(null),
      withdraw: () => {
        withdrawn = true;
        return { body: { ok: true } };
      },
    });
    mount(...LIST, <MyPapersPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Retirar o trabalho' }));
    expect(calls.some((c) => c.url.includes('withdraw'))).toBe(false);
    expect(screen.getByText('Retirar este trabalho? Ele não será avaliado.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sim, retirar' }));
    expect(await screen.findByTestId('no-papers')).toBeInTheDocument();
    expect(calls.find((c) => c.url.includes('withdraw'))).toMatchObject({ method: 'POST', body: { eventSlug: '2027', id: 'paper-1' } });
  });

  it('cancelling the withdrawal changes nothing', async () => {
    const calls = stubApi({ mine: { body: mine({ submissions: [paper()] }) }, me: account(null) });
    mount(...LIST, <MyPapersPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Retirar o trabalho' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('button', { name: 'Retirar o trabalho' })).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes('withdraw'))).toBe(false);
  });

  it('hides the send button only when both limits of the edital are used up, and says why', async () => {
    stubApi({ mine: { body: mine({ limits: { asMain: 3, maxAsMain: 3, asCoauthor: 5, maxAsCoauthor: 5 } }) }, me: account(null) });
    mount(...LIST, <MyPapersPage />);
    expect(await screen.findByText('Você já consta no número máximo de trabalhos que o edital permite.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Enviar trabalho' })).not.toBeInTheDocument();
  });

  it('still offers to send with three papers as first author: another place may be free', async () => {
    stubApi({ mine: { body: mine({ limits: { asMain: 3, maxAsMain: 3, asCoauthor: 4, maxAsCoauthor: 5 } }) }, me: account(null) });
    mount(...LIST, <MyPapersPage />);
    expect(await screen.findByRole('link', { name: 'Enviar trabalho' })).toBeInTheDocument();
  });

  it('past the published date and still open: offers the send button and names no date', async () => {
    stubApi({ mine: { body: mine({ pastDeadline: true }) }, me: account(null) });
    mount(...LIST, <MyPapersPage />);
    const line = await screen.findByTestId('paper-limits');
    expect(line).toHaveTextContent('As submissões estão abertas.');
    expect(line).not.toHaveTextContent(/janeiro|prorrog|prazo/i);
    expect(screen.getByRole('link', { name: 'Enviar trabalho' })).toBeInTheDocument();
  });

  it.each([
    ['closed', /foram encerradas em 18 de janeiro de 2027/],
    ['not_open', 'As submissões ainda não abriram.'],
  ] as const)('when submissions are %s, says so and offers no send button', async (state, text) => {
    stubApi({ mine: { body: mine({ state, submissions: [paper({ canEdit: false })] }) }, me: account(null) });
    mount(...LIST, <MyPapersPage />);
    expect(await screen.findByTestId('paper-limits')).toHaveTextContent(text);
    expect(screen.queryByRole('link', { name: 'Enviar trabalho' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Alterar' })).not.toBeInTheDocument();
  });

  it('says the session ended when the server refuses the token', async () => {
    stubApi({ mine: { status: 401, body: { error: 'not_logged_in' } }, me: account(null) });
    mount(...LIST, <MyPapersPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sua sessão terminou. Entre de novo.');
  });
});

const NEW = ['/2027/meus-trabalhos/novo', '/:eventSlug/meus-trabalhos/novo'] as const;
const pdfFile = (name = 'Resumo Maria.pdf', size = 2000) => new File([new Uint8Array(size)], name, { type: 'application/pdf' });

async function fill() {
  await userEvent.type(await screen.findByLabelText('Título em português'), 'Governança da água no semiárido');
  await userEvent.type(screen.getByLabelText('Título em inglês'), 'Water governance in the semi-arid');
  await waitFor(() => expect(screen.getByRole('option', { name: 'Saúde e Meio Ambiente' })).toBeInTheDocument());
  await userEvent.selectOptions(screen.getByLabelText('Área temática'), 'a6');
  await userEvent.type(screen.getByLabelText('Resumo'), 'Um resumo com mais de cinquenta caracteres, para passar na conferência.');
  await userEvent.type(screen.getByLabelText('Palavras-chave'), 'água; governança');
}

/** What the form sent to our server, leaving out what it only read (the account, the suggestions). */
const posted = (calls: Call[]) => calls.filter((c) => c.method !== 'GET');
const ME = { fullName: 'Maria', email: 'maria@ufcg.edu.br' };
/** The form is ready once the sender's own row carries the name of their account. */
const ownRow = async () => {
  const name = await screen.findByLabelText('Nome do autor 1 (você)');
  await waitFor(() => expect(name).toHaveValue('Maria'));
  return name;
};

describe('PaperFormPage, new paper', () => {
  const UPLOAD = 'https://storage.example/upload/2027/u/f.pdf?token=t';
  const ok = () => ({
    me: account(null),
    'upload-url': { body: { path: '2027/u/f.pdf', uploadUrl: UPLOAD } },
    [UPLOAD]: { body: {} },
    save: { status: 201, body: { submission: paper() } },
  });

  it('uploads the file to storage, then saves the paper and goes back to the list', async () => {
    const calls = stubApi(ok());
    mount(...NEW, <PaperFormPage />);
    await fill();
    await ownRow();
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar autor' }));
    await userEvent.type(screen.getByLabelText('Nome do autor 2'), 'João Lima');
    await userEvent.type(screen.getByLabelText('E-mail do autor 2'), 'joao@ufpb.br');
    await userEvent.upload(screen.getByLabelText('Arquivo do trabalho'), pdfFile());
    await userEvent.click(screen.getByRole('button', { name: 'Enviar trabalho' }));
    expect(await screen.findByTestId('where')).toHaveTextContent('/2027/meus-trabalhos');
    expect(posted(calls).map((c) => `${c.method} ${c.url.split('?')[0]}`)).toEqual([
      'POST /api/v1/submissions/upload-url',
      'PUT https://storage.example/upload/2027/u/f.pdf',
      'POST /api/v1/submissions/save',
    ]);
    const [upload, put, save] = posted(calls);
    expect(upload).toMatchObject({ authorization: 'Bearer access-token-1', body: { eventSlug: '2027', fileName: 'Resumo Maria.pdf', size: 2000 } });
    // The file itself never passes through our server, and carries no login.
    expect(put!.authorization).toBeNull();
    expect(save!.body).toEqual({
      title: 'Governança da água no semiárido',
      titleEn: 'Water governance in the semi-arid',
      modality: 'RESUMO_EXPANDIDO',
      areaRef: 'a6',
      abstract: 'Um resumo com mais de cinquenta caracteres, para passar na conferência.',
      keywords: 'água; governança',
      keywordsEn: '',
      authors: [ME, { fullName: 'João Lima', email: 'joao@ufpb.br' }],
      confirmDuplicate: false,
      eventSlug: '2027',
      locale: 'pt-BR',
      filePath: '2027/u/f.pdf',
      fileName: 'Resumo Maria.pdf',
    });
  });

  it('asks for the file before calling the server', async () => {
    const calls = stubApi(ok());
    mount(...NEW, <PaperFormPage />);
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar trabalho' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Anexe o arquivo do trabalho.');
    expect(posted(calls)).toEqual([]);
  });

  it('refuses a file over 10 MB before uploading it', async () => {
    const calls = stubApi(ok());
    mount(...NEW, <PaperFormPage />);
    await fill();
    await userEvent.upload(screen.getByLabelText('Arquivo do trabalho'), pdfFile('grande.pdf', 10 * 1024 * 1024 + 1));
    await userEvent.click(screen.getByRole('button', { name: 'Enviar trabalho' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('O arquivo passa de 10 MB.');
    expect(posted(calls)).toEqual([]);
  });

  it('shows the page limits of the chosen modality', async () => {
    stubApi({});
    mount(...NEW, <PaperFormPage />);
    expect(await screen.findByText('De 4 a 6 páginas, contando as referências.')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Modalidade'), 'ARTIGO');
    expect(screen.getByText('De 12 a 15 páginas, contando as referências.')).toBeInTheDocument();
  });

  it('starts with the sender alone, whose e-mail is fixed and who cannot be removed', async () => {
    stubApi(ok());
    mount(...NEW, <PaperFormPage />);
    await ownRow();
    expect(screen.getAllByTestId('author-row')).toHaveLength(1);
    expect(screen.getByLabelText('E-mail do autor 1')).toHaveValue('maria@ufcg.edu.br');
    expect(screen.getByLabelText('E-mail do autor 1')).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: 'Remover autor 1' })).not.toBeInTheDocument();
    expect(screen.queryByText(/principal|coautor/i)).not.toBeInTheDocument();
  });

  it('lets five authors be listed, not a sixth, and one be removed', async () => {
    stubApi(ok());
    mount(...NEW, <PaperFormPage />);
    const add = await screen.findByRole('button', { name: 'Adicionar autor' });
    for (let i = 0; i < 4; i += 1) await userEvent.click(add);
    expect(screen.getAllByTestId('author-row')).toHaveLength(5);
    expect(screen.queryByRole('button', { name: 'Adicionar autor' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remover autor 3' }));
    expect(screen.getAllByTestId('author-row')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Adicionar autor' })).toBeInTheDocument();
  });

  it('sends the authors in the order they were put in, with the sender in second place', async () => {
    const calls = stubApi(ok());
    mount(...NEW, <PaperFormPage />);
    await fill();
    await ownRow();
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar autor' }));
    await userEvent.type(screen.getByLabelText('Nome do autor 2'), 'Prof. Carlos Meira');
    await userEvent.type(screen.getByLabelText('E-mail do autor 2'), 'carlos@ufcg.edu.br');
    expect(screen.getByRole('button', { name: 'Subir autor 1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Descer autor 2' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Subir autor 2' }));
    // The professor is first now, and what was typed moved with the row.
    expect(screen.getByLabelText('Nome do autor 1')).toHaveValue('Prof. Carlos Meira');
    expect(screen.getByLabelText('Nome do autor 2 (você)')).toHaveValue('Maria');
    await userEvent.upload(screen.getByLabelText('Arquivo do trabalho'), pdfFile());
    await userEvent.click(screen.getByRole('button', { name: 'Enviar trabalho' }));
    await screen.findByTestId('where');
    expect((posted(calls).at(-1)!.body as { authors: unknown[] }).authors).toEqual([
      { fullName: 'Prof. Carlos Meira', email: 'carlos@ufcg.edu.br' },
      ME,
    ]);
  });

  it('leaves out an author row left blank', async () => {
    const calls = stubApi(ok());
    mount(...NEW, <PaperFormPage />);
    await fill();
    await ownRow();
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar autor' }));
    await userEvent.upload(screen.getByLabelText('Arquivo do trabalho'), pdfFile());
    await userEvent.click(screen.getByRole('button', { name: 'Enviar trabalho' }));
    await screen.findByTestId('where');
    expect((posted(calls).at(-1)!.body as { authors: unknown[] }).authors).toEqual([ME]);
  });

  it.each([
    [{ error: 'wrong_page_count', pages: 9, minPages: 4, maxPages: 6 }, 400, 'O arquivo tem 9 páginas. Nesta modalidade, o edital pede de 4 a 6.'],
    [{ error: 'coauthor_limit', name: 'João Lima', max: 5 }, 409, 'João Lima já consta em 5 trabalhos fora da primeira posição, o limite do edital.'],
    [{ error: 'too_many_as_main', name: 'Prof. Carlos Meira', max: 3 }, 409, 'Prof. Carlos Meira já é o primeiro autor em 3 trabalhos, o limite do edital.'],
    [{ error: 'duplicate_author', name: 'João Lima' }, 400, 'João Lima aparece mais de uma vez entre os autores.'],
    [{ error: 'sender_not_listed' }, 400, 'Você precisa estar na lista de autores, com o e-mail da sua conta.'],
    [{ error: 'invalid_author' }, 400, 'Confira o nome e o e-mail de cada autor.'],
    [{ error: 'unreadable_file' }, 400, /Não foi possível ler o arquivo/],
    [{ error: 'submissions_closed' }, 409, 'As submissões foram encerradas.'],
    [{ error: 'something_new' }, 500, 'Algo deu errado. Tente de novo em instantes.'],
  ])('explains %j and keeps what was typed', async (answer, status, message) => {
    stubApi({ ...ok(), save: { status, body: answer } });
    mount(...NEW, <PaperFormPage />);
    await fill();
    await userEvent.upload(screen.getByLabelText('Arquivo do trabalho'), pdfFile());
    await userEvent.click(screen.getByRole('button', { name: 'Enviar trabalho' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByLabelText('Título em português')).toHaveValue('Governança da água no semiárido');
    expect(screen.getByRole('button', { name: 'Enviar trabalho' })).toBeEnabled();
  });

  it('says when the upload itself failed', async () => {
    const calls = stubApi({ ...ok(), [UPLOAD]: { status: 400, body: {} } });
    mount(...NEW, <PaperFormPage />);
    await fill();
    await userEvent.upload(screen.getByLabelText('Arquivo do trabalho'), pdfFile());
    await userEvent.click(screen.getByRole('button', { name: 'Enviar trabalho' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Não foi possível enviar o arquivo/);
    expect(calls.some((c) => c.url.includes('/save'))).toBe(false);
  });

  it('warns about a title already sent, and sends anyway only when the person confirms', async () => {
    let attempts = 0;
    const calls = stubApi({
      ...ok(),
      save: () => {
        attempts += 1;
        return attempts === 1 ? { status: 409, body: { error: 'duplicate_title', number: 7 } } : { status: 201, body: { submission: paper() } };
      },
    });
    mount(...NEW, <PaperFormPage />);
    await fill();
    await userEvent.upload(screen.getByLabelText('Arquivo do trabalho'), pdfFile());
    await userEvent.click(screen.getByRole('button', { name: 'Enviar trabalho' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Um dos autores já enviou um trabalho com este título (nº 7).');
    await userEvent.click(screen.getByRole('button', { name: 'É outro trabalho, enviar mesmo assim' }));
    expect(await screen.findByTestId('where')).toHaveTextContent('/2027/meus-trabalhos');
    const saves = calls.filter((c) => c.url.includes('/save')).map((c) => (c.body as { confirmDuplicate: boolean }).confirmDuplicate);
    expect(saves).toEqual([false, true]);
  });
});

describe('PaperFormPage, suggestions of people already in the system', () => {
  const UPLOAD = 'https://storage.example/upload/2027/u/f.pdf?token=t';
  const RODRIGO = { fullName: 'Rodrigo Alves Costa', institution: 'UFCG', emailHint: 'r•••@ufcg.edu.br', ref: 'sealed-ref-rodrigo' };
  const OTHER_RODRIGO = { fullName: 'Rodrigo Antônio Lima', institution: null, emailHint: 'r•••@ufpb.br', ref: 'sealed-ref-antonio' };
  const api = (people: unknown[] = [RODRIGO, OTHER_RODRIGO]) => ({
    me: account(null),
    people: { body: { people } },
    'upload-url': { body: { path: '2027/u/f.pdf', uploadUrl: UPLOAD } },
    [UPLOAD]: { body: {} },
    save: { status: 201, body: { submission: paper() } },
  });
  const searches = (calls: Call[]) => calls.filter((c) => c.url.includes('/submissions/people'));
  // The form has dropdowns of its own, so suggestions are looked for inside their list only.
  const LIST_NAME = 'Pessoas já cadastradas com esse nome';
  const suggestions = async () => within(await screen.findByRole('listbox', { name: LIST_NAME })).getAllByRole('option');
  const noSuggestions = () => expect(screen.queryByRole('listbox', { name: LIST_NAME })).not.toBeInTheDocument();
  const secondAuthor = async () => {
    await ownRow();
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar autor' }));
    return screen.getByLabelText('Nome do autor 2');
  };

  it('suggests people by the name being typed, with a masked e-mail, and picks one on a click', async () => {
    const calls = stubApi(api());
    mount(...NEW, <PaperFormPage />);
    await fill();
    const name = await secondAuthor();
    await userEvent.type(name, 'Rodrigo');
    const options = await suggestions();
    expect(options.map((o) => o.textContent)).toEqual(['Rodrigo Alves CostaUFCG · r•••@ufcg.edu.br', 'Rodrigo Antônio Limar•••@ufpb.br']);
    expect(searches(calls).at(-1)).toMatchObject({ url: '/api/v1/submissions/people?eventSlug=2027&q=Rodrigo', authorization: 'Bearer access-token-1' });
    await userEvent.click(options[0]!);
    expect(name).toHaveValue('Rodrigo Alves Costa');
    noSuggestions();
    // The e-mail is never shown in full: a masked hint that cannot be typed over.
    const email = screen.getByLabelText('E-mail do autor 2');
    expect(email).toHaveValue('r•••@ufcg.edu.br');
    expect(email).toHaveAttribute('readonly');

    await userEvent.upload(screen.getByLabelText('Arquivo do trabalho'), pdfFile());
    await userEvent.click(screen.getByRole('button', { name: 'Enviar trabalho' }));
    await screen.findByTestId('where');
    expect((posted(calls).at(-1)!.body as { authors: unknown[] }).authors).toEqual([
      ME,
      { fullName: 'Rodrigo Alves Costa', ref: 'sealed-ref-rodrigo' },
    ]);
  });

  it('is only a suggestion: a new person can be typed right over it', async () => {
    const calls = stubApi(api());
    mount(...NEW, <PaperFormPage />);
    await fill();
    const name = await secondAuthor();
    await userEvent.type(name, 'Rodrigo Pereira');
    await suggestions();
    // Nothing was picked for them, and Tab moves on to the e-mail as in any form.
    expect(name).toHaveValue('Rodrigo Pereira');
    await userEvent.tab();
    expect(screen.getByLabelText('E-mail do autor 2')).toHaveFocus();
    noSuggestions();
    await userEvent.type(screen.getByLabelText('E-mail do autor 2'), 'rpereira@ufrn.br');
    await userEvent.upload(screen.getByLabelText('Arquivo do trabalho'), pdfFile());
    await userEvent.click(screen.getByRole('button', { name: 'Enviar trabalho' }));
    await screen.findByTestId('where');
    expect((posted(calls).at(-1)!.body as { authors: unknown[] }).authors).toEqual([
      ME,
      { fullName: 'Rodrigo Pereira', email: 'rpereira@ufrn.br' },
    ]);
  });

  it('undoes a pick with one click, back to an empty e-mail to type', async () => {
    stubApi(api());
    mount(...NEW, <PaperFormPage />);
    const name = await secondAuthor();
    await userEvent.type(name, 'Rodrigo');
    await userEvent.click((await suggestions())[0]!);
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer escolha do autor 2' }));
    const email = screen.getByLabelText('E-mail do autor 2');
    expect(email).toHaveValue('');
    expect(email).not.toHaveAttribute('readonly');
    expect(name).toHaveValue('Rodrigo Alves Costa');
  });

  it('lets go of a picked person as soon as their name is typed over', async () => {
    const calls = stubApi(api());
    mount(...NEW, <PaperFormPage />);
    await fill();
    const name = await secondAuthor();
    await userEvent.type(name, 'Rodrigo');
    await userEvent.click((await suggestions())[0]!);
    await userEvent.type(name, ' Filho');
    const email = screen.getByLabelText('E-mail do autor 2');
    expect(email).toHaveValue('');
    expect(email).not.toHaveAttribute('readonly');
    await userEvent.type(email, 'filho@ufcg.edu.br');
    await userEvent.upload(screen.getByLabelText('Arquivo do trabalho'), pdfFile());
    await userEvent.click(screen.getByRole('button', { name: 'Enviar trabalho' }));
    await screen.findByTestId('where');
    // The sealed reference of the person let go is not sent.
    expect(JSON.stringify(posted(calls).at(-1)!.body)).not.toContain('sealed-ref');
  });

  it('picks with the keyboard only after arrowing to a suggestion; Escape dismisses them', async () => {
    stubApi(api());
    mount(...NEW, <PaperFormPage />);
    const name = await secondAuthor();
    await userEvent.type(name, 'Rodrigo');
    await suggestions();
    expect(name).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    noSuggestions();
    expect(name).toHaveValue('Rodrigo');
    await userEvent.type(name, ' A');
    await suggestions();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(name).toHaveValue('Rodrigo Antônio Lima');
    expect(screen.getByLabelText('E-mail do autor 2')).toHaveValue('r•••@ufpb.br');
  });

  it('does not offer again someone already picked in another row', async () => {
    stubApi(api());
    mount(...NEW, <PaperFormPage />);
    const name = await secondAuthor();
    await userEvent.type(name, 'Rodrigo');
    await userEvent.click((await suggestions())[0]!);
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar autor' }));
    await userEvent.type(screen.getByLabelText('Nome do autor 3'), 'Rodrigo');
    const options = await suggestions();
    expect(options.map((o) => o.textContent)).toEqual(['Rodrigo Antônio Limar•••@ufpb.br']);
  });

  it('does not search under three letters, nor for the sender’s own name', async () => {
    const calls = stubApi(api());
    mount(...NEW, <PaperFormPage />);
    const own = await ownRow();
    await userEvent.type(own, ' Clara de Souza');
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar autor' }));
    const name = screen.getByLabelText('Nome do autor 2');
    await userEvent.type(name, 'Ro');
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(searches(calls)).toEqual([]);
    noSuggestions();
  });

  it('shows nothing, and gets in nobody’s way, when the search fails or finds no one', async () => {
    stubApi({ ...api(), people: { status: 500, body: { error: 'server_error' } } });
    mount(...NEW, <PaperFormPage />);
    const name = await secondAuthor();
    await userEvent.type(name, 'Rodrigo');
    await new Promise((resolve) => setTimeout(resolve, 400));
    noSuggestions();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(name).toHaveValue('Rodrigo');
  });
});

describe('PaperFormPage, changing a paper', () => {
  const EDIT = ['/2027/meus-trabalhos/paper-1', '/:eventSlug/meus-trabalhos/:paperId'] as const;

  it('starts with the paper as it is and saves without a new file', async () => {
    const calls = stubApi({ mine: { body: mine({ submissions: [paper()] }) }, save: { body: { submission: paper() } } });
    mount(...EDIT, <PaperFormPage />);
    const title = await screen.findByLabelText('Título em português');
    expect(title).toHaveValue('Governança da água no semiárido');
    expect(screen.getByLabelText('Palavras-chave')).toHaveValue('água; governança');
    expect(screen.getByLabelText('Nome do autor 1 (você)')).toHaveValue('Maria Clara de Souza');
    expect(screen.getByLabelText('Nome do autor 2')).toHaveValue('João Lima');
    expect(screen.getByLabelText('E-mail do autor 2')).toHaveValue('joao@ufpb.br');
    expect(screen.getByText(/Arquivo atual: resumo.pdf\./)).toBeInTheDocument();
    await userEvent.clear(title);
    await userEvent.type(title, 'Governança da água: versão revista');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByTestId('where')).toHaveTextContent('/2027/meus-trabalhos');
    const saved = calls.find((c) => c.url.includes('/save'))!.body as Record<string, unknown>;
    expect(saved).toMatchObject({ id: 'paper-1', title: 'Governança da água: versão revista', authors: [
      { fullName: 'Maria Clara de Souza', email: 'maria@ufcg.edu.br' },
      { fullName: 'João Lima', email: 'joao@ufpb.br' },
    ] });
    expect(saved).not.toHaveProperty('filePath');
    expect(calls.some((c) => c.url.includes('upload-url'))).toBe(false);
  });

  it.each([
    ['is someone else’s or does not exist', mine()],
    ['can no longer be changed', mine({ submissions: [paper({ canEdit: false })] })],
  ])('shows no form when the paper %s', async (_name, data) => {
    stubApi({ mine: { body: data } });
    mount(...EDIT, <PaperFormPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não encontramos esse trabalho, ou ele não pode mais ser alterado.');
    expect(screen.queryByLabelText('Título em português')).not.toBeInTheDocument();
  });
});

describe('SubmissionsPage', () => {
  const PAGE = ['/2027/submissoes', '/:eventSlug/submissoes'] as const;

  it('keeps saying "em breve" where the submission system is off', async () => {
    const calls = stubApi({});
    mount(...PAGE, <SubmissionsPage />, auth({ enabled: false }));
    expect(await screen.findByRole('heading', { name: 'As submissões abrem em breve' })).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it('offers to send a paper when submissions are open', async () => {
    stubApi({ rules: { body: { state: 'open', opensAt: '', closesAt: '' } } });
    mount(...PAGE, <SubmissionsPage />);
    const box = await screen.findByTestId('submissions-open');
    expect(box).toHaveTextContent('Submissões abertas');
    expect(within(box).getByRole('link', { name: 'Enviar trabalho' })).toHaveAttribute('href', '/2027/meus-trabalhos/novo');
    expect(within(box).getByRole('link', { name: 'Meus trabalhos' })).toHaveAttribute('href', '/2027/meus-trabalhos');
  });

  it('offers only Meus trabalhos once they are closed', async () => {
    stubApi({ rules: { body: { state: 'closed', opensAt: '', closesAt: '' } } });
    mount(...PAGE, <SubmissionsPage />);
    const box = await screen.findByTestId('submissions-open');
    expect(box).toHaveTextContent('Submissões encerradas');
    expect(within(box).queryByRole('link', { name: 'Enviar trabalho' })).not.toBeInTheDocument();
  });
});
