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
  role: 'main',
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
    expect(screen.getByTestId('paper-limits')).toHaveTextContent('Você enviou 0 de 3 trabalhos como autor principal e consta como coautor em 0 de 5.');
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
    expect(card).toHaveTextContent('você é o autor principal');
    expect(within(card).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Maria Clara de Souza', 'João Lima']);
    expect(card).toHaveTextContent('resumo.pdf · 5 páginas');
    expect(within(card).getByRole('link', { name: 'Alterar' })).toHaveAttribute('href', '/2027/meus-trabalhos/paper-1');
  });

  it('gives a co-author the paper to read and download, with no way to change it', async () => {
    stubApi({ mine: { body: mine({ submissions: [paper({ role: 'coauthor', canEdit: false, filePages: null })] }) }, me: account(null) });
    mount(...LIST, <MyPapersPage />);
    const card = await screen.findByTestId('paper-card');
    expect(card).toHaveTextContent('você é coautor (somente consulta)');
    expect(within(card).queryByRole('link', { name: 'Alterar' })).not.toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Retirar o trabalho' })).not.toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Baixar o arquivo' })).toBeInTheDocument();
    expect(card).not.toHaveTextContent('páginas');
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

  it('hides the send button at the limit of three, and says why', async () => {
    stubApi({ mine: { body: mine({ limits: { asMain: 3, maxAsMain: 3, asCoauthor: 0, maxAsCoauthor: 5 } }) }, me: account(null) });
    mount(...LIST, <MyPapersPage />);
    expect(await screen.findByText('Você já enviou os 3 trabalhos permitidos como autor principal.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Enviar trabalho' })).not.toBeInTheDocument();
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

describe('PaperFormPage, new paper', () => {
  const UPLOAD = 'https://storage.example/upload/2027/u/f.pdf?token=t';
  const ok = () => ({
    'upload-url': { body: { path: '2027/u/f.pdf', uploadUrl: UPLOAD } },
    [UPLOAD]: { body: {} },
    save: { status: 201, body: { submission: paper() } },
  });

  it('uploads the file to storage, then saves the paper and goes back to the list', async () => {
    const calls = stubApi(ok());
    mount(...NEW, <PaperFormPage />);
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar coautor' }));
    await userEvent.type(screen.getByLabelText('Nome do coautor 1'), 'João Lima');
    await userEvent.type(screen.getByLabelText('E-mail do coautor 1'), 'joao@ufpb.br');
    await userEvent.upload(screen.getByLabelText('Arquivo do trabalho'), pdfFile());
    await userEvent.click(screen.getByRole('button', { name: 'Enviar trabalho' }));
    expect(await screen.findByTestId('where')).toHaveTextContent('/2027/meus-trabalhos');
    expect(calls.map((c) => `${c.method} ${c.url.split('?')[0]}`)).toEqual([
      'POST /api/v1/submissions/upload-url',
      'PUT https://storage.example/upload/2027/u/f.pdf',
      'POST /api/v1/submissions/save',
    ]);
    expect(calls[0]).toMatchObject({ authorization: 'Bearer access-token-1', body: { eventSlug: '2027', fileName: 'Resumo Maria.pdf', size: 2000 } });
    // The file itself never passes through our server, and carries no login.
    expect(calls[1]!.authorization).toBeNull();
    expect(calls[2]!.body).toEqual({
      title: 'Governança da água no semiárido',
      titleEn: 'Water governance in the semi-arid',
      modality: 'RESUMO_EXPANDIDO',
      areaRef: 'a6',
      abstract: 'Um resumo com mais de cinquenta caracteres, para passar na conferência.',
      keywords: 'água; governança',
      keywordsEn: '',
      coauthors: [{ fullName: 'João Lima', email: 'joao@ufpb.br' }],
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
    expect(calls).toEqual([]);
  });

  it('refuses a file over 10 MB before uploading it', async () => {
    const calls = stubApi(ok());
    mount(...NEW, <PaperFormPage />);
    await fill();
    await userEvent.upload(screen.getByLabelText('Arquivo do trabalho'), pdfFile('grande.pdf', 10 * 1024 * 1024 + 1));
    await userEvent.click(screen.getByRole('button', { name: 'Enviar trabalho' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('O arquivo passa de 10 MB.');
    expect(calls).toEqual([]);
  });

  it('shows the page limits of the chosen modality', async () => {
    stubApi({});
    mount(...NEW, <PaperFormPage />);
    expect(await screen.findByText('De 4 a 6 páginas, contando as referências.')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Modalidade'), 'ARTIGO');
    expect(screen.getByText('De 12 a 15 páginas, contando as referências.')).toBeInTheDocument();
  });

  it('lets four co-authors be added, not a fifth, and one be removed', async () => {
    stubApi({});
    mount(...NEW, <PaperFormPage />);
    const add = await screen.findByRole('button', { name: 'Adicionar coautor' });
    for (let i = 0; i < 4; i += 1) await userEvent.click(add);
    expect(screen.getAllByTestId('coauthor-row')).toHaveLength(4);
    expect(screen.queryByRole('button', { name: 'Adicionar coautor' })).not.toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Remover' })[0]!);
    expect(screen.getAllByTestId('coauthor-row')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Adicionar coautor' })).toBeInTheDocument();
  });

  it('leaves out a co-author row left blank', async () => {
    const calls = stubApi(ok());
    mount(...NEW, <PaperFormPage />);
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar coautor' }));
    await userEvent.upload(screen.getByLabelText('Arquivo do trabalho'), pdfFile());
    await userEvent.click(screen.getByRole('button', { name: 'Enviar trabalho' }));
    await screen.findByTestId('where');
    expect((calls.at(-1)!.body as { coauthors: unknown[] }).coauthors).toEqual([]);
  });

  it.each([
    [{ error: 'wrong_page_count', pages: 9, minPages: 4, maxPages: 6 }, 400, 'O arquivo tem 9 páginas. Nesta modalidade, o edital pede de 4 a 6.'],
    [{ error: 'coauthor_limit', email: 'joao@ufpb.br', max: 5 }, 409, 'joao@ufpb.br já consta como coautor em 5 trabalhos, o limite do edital.'],
    [{ error: 'too_many_as_main', max: 3 }, 409, 'Você já enviou os 3 trabalhos permitidos como autor principal.'],
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

describe('PaperFormPage, changing a paper', () => {
  const EDIT = ['/2027/meus-trabalhos/paper-1', '/:eventSlug/meus-trabalhos/:paperId'] as const;

  it('starts with the paper as it is and saves without a new file', async () => {
    const calls = stubApi({ mine: { body: mine({ submissions: [paper()] }) }, save: { body: { submission: paper() } } });
    mount(...EDIT, <PaperFormPage />);
    const title = await screen.findByLabelText('Título em português');
    expect(title).toHaveValue('Governança da água no semiárido');
    expect(screen.getByLabelText('Palavras-chave')).toHaveValue('água; governança');
    expect(screen.getByLabelText('Nome do coautor 1')).toHaveValue('João Lima');
    expect(screen.getByText(/Arquivo atual: resumo.pdf\./)).toBeInTheDocument();
    await userEvent.clear(title);
    await userEvent.type(title, 'Governança da água: versão revista');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByTestId('where')).toHaveTextContent('/2027/meus-trabalhos');
    const saved = calls.find((c) => c.url.includes('/save'))!.body as Record<string, unknown>;
    expect(saved).toMatchObject({ id: 'paper-1', title: 'Governança da água: versão revista', coauthors: [{ fullName: 'João Lima', email: 'joao@ufpb.br' }] });
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
