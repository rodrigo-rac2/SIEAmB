import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from '../../contexts/AuthContext';
import { EventProvider } from '../../contexts/EventContext';
import { toCsv, type PanelRegistration } from '../../services/admin';
import { browser } from '../../services/submissions';
import { MyAreaPage } from '../account/MyAreaPage';
import { PanelPage, type PanelTab } from './PanelPage';

const auth = (over: Partial<AuthState> = {}): AuthState => ({
  enabled: true,
  loading: false,
  email: 'najara@ufcg.edu.br',
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

function mount(path: string, element: ReactElement, state: AuthState = auth()) {
  const pattern = path.replace(/^\/[^/]+/, '/:eventSlug');
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

const panel = (tab: PanelTab, state?: AuthState) =>
  mount({ registrations: '/2027/painel', papers: '/2027/painel/trabalhos', people: '/2027/painel/pessoas', requests: '/2027/painel/pedidos' }[tab], <PanelPage tab={tab} />, state);

interface Call {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
  authorization: string | null;
}
type Answer = { status?: number; body: unknown };

function stubApi(answers: Record<string, Answer | (() => Answer)>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const key = input.split('?')[0]!.split('/').pop()!;
      calls.push({
        url: input,
        method: init.method ?? 'GET',
        body: typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null,
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

const registration = (over: Partial<PanelRegistration> = {}): PanelRegistration => ({
  id: 'reg-1',
  fullName: 'Paula Nunes',
  email: 'paula@outlook.com',
  cpf: '52998224725',
  passport: null,
  country: 'BR',
  institution: 'UFCG',
  category: 'ESTUDANTE_POS',
  createdAt: '2026-11-10T12:00:00.000Z',
  hasAccount: false,
  byOrganiser: false,
  state: 'UNPAID',
  payment: 'UNPAID',
  paidCents: null,
  paidAt: null,
  manual: null,
  deleted: null,
  ...over,
});

const members = (role: 'ADMIN' | 'ORGANIZER' = 'ADMIN') => ({
  body: {
    role,
    canManage: role === 'ADMIN' ? ['ADMIN', 'ORGANIZER', 'REVIEWER'] : ['REVIEWER'],
    members: [
      { userId: 'u1', email: 'najara@ufcg.edu.br', fullName: 'Najara Escarião', role: 'ADMIN' },
      { userId: 'u2', email: 'viviane@ufcg.edu.br', fullName: 'Viviane Farias', role: 'ORGANIZER' },
    ],
    invites: [{ email: 'futuro@ufpb.br', role: 'REVIEWER' }],
  },
});

const list = (rows: PanelRegistration[], role: 'ADMIN' | 'ORGANIZER' = 'ADMIN') => ({
  body: {
    role,
    counts: { total: rows.filter((r) => !r.deleted).length, confirmed: 1, pending: 0, unpaid: 1, cancelled: 0, deleted: rows.filter((r) => r.deleted).length },
    registrations: rows,
  },
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('who sees the panel', () => {
  it('does not exist where the submission system is off', async () => {
    const calls = stubApi({});
    panel('registrations', auth({ enabled: false }));
    expect(await screen.findByRole('heading', { name: /não encontrada|404/i })).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it('asks a logged-out visitor to log in, and comes back', async () => {
    panel('papers', auth({ accessToken: null }));
    expect(await screen.findByTestId('where')).toHaveTextContent('/2027/conta/entrar?next=%2F2027%2Fpainel%2Ftrabalhos');
  });

  it('is "not found" for someone with no role in the edition', async () => {
    stubApi({ members: { status: 404, body: { error: 'not_found' } }, registrations: { status: 404, body: { error: 'not_found' } } });
    panel('registrations');
    expect(await screen.findByRole('heading', { name: /não encontrada|404/i })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Painel da organização' })).not.toBeInTheDocument();
  });

  it('offers the Pedidos tab to an administrator only', async () => {
    stubApi({ members: members('ADMIN'), registrations: list([]) });
    const admin = panel('registrations');
    expect(await screen.findByRole('link', { name: 'Pedidos' })).toHaveAttribute('href', '/2027/painel/pedidos');
    admin.unmount();
    stubApi({ members: members('ORGANIZER'), registrations: list([], 'ORGANIZER') });
    panel('registrations');
    await screen.findByTestId('panel-counts');
    expect(screen.queryByRole('link', { name: 'Pedidos' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Inscrições' })).toHaveAttribute('aria-current', 'page');
  });

  it('Minha área links to the panel only for someone who may open it', async () => {
    const me = (panels: { platformAdmin: boolean; slugs: string[] }) => ({
      body: { panels, user: { email: 'a@b.org', fullName: 'A', cpf: null, passport: null, country: 'BR', institution: null, documentLocked: false }, registrations: [], suggestions: [] },
    });
    for (const [panels, shown] of [
      [{ platformAdmin: false, slugs: [] }, false],
      [{ platformAdmin: false, slugs: ['2025'] }, false],
      [{ platformAdmin: false, slugs: ['2027'] }, true],
      [{ platformAdmin: true, slugs: [] }, true],
    ] as const) {
      stubApi({ me: me({ platformAdmin: panels.platformAdmin, slugs: [...panels.slugs] }) });
      const view = mount('/2027/minha-area', <MyAreaPage />);
      await screen.findByLabelText('Nome completo');
      expect(Boolean(screen.queryByTestId('panel-link'))).toBe(shown);
      view.unmount();
    }
  });
});

describe('registrations tab', () => {
  const rows = [
    registration(),
    registration({ id: 'reg-2', fullName: 'Yuri Batista', email: 'yuri@gmail.com', state: 'PAID', payment: 'PAID', paidCents: 5000, hasAccount: true }),
    registration({ id: 'reg-3', fullName: 'Convidada Ilustre', email: 'conv@ufrj.br', state: 'EXEMPT', manual: { status: 'EXEMPT', reason: 'palestrante', by: 'u1', at: '2026-11-12T12:00:00.000Z' }, byOrganiser: true }),
    registration({ id: 'reg-4', fullName: 'Teste Apagado', email: 'teste@x.org', deleted: { at: '2026-11-16T12:00:00.000Z', by: 'u1', reason: 'inscrição de teste' } }),
  ];

  it('shows totals, each registration with payment and what was decided by hand, and hides deleted ones', async () => {
    stubApi({ members: members(), registrations: list(rows) });
    panel('registrations');
    expect(await screen.findByTestId('panel-counts')).toHaveTextContent('3 inscrições: 1 confirmadas');
    const shown = screen.getAllByTestId('registration-row');
    expect(shown).toHaveLength(3);
    expect(shown[0]).toHaveTextContent('Paula Nunes');
    expect(shown[0]).toHaveTextContent('CPF 529.982.247-25');
    expect(shown[0]).toHaveTextContent('Não paga');
    expect(shown[1]).toHaveTextContent(/Paga · R\$\s50,00/);
    expect(shown[1]).toHaveTextContent('tem conta');
    expect(shown[2]).toHaveTextContent('Isenta');
    expect(shown[2]).toHaveTextContent('Motivo: palestrante');
    expect(shown[2]).toHaveTextContent('cadastrada pela organização');
    expect(screen.queryByText('Teste Apagado')).not.toBeInTheDocument();
  });

  it('filters by text and by status', async () => {
    stubApi({ members: members(), registrations: list(rows) });
    panel('registrations');
    await screen.findByTestId('panel-counts');
    await userEvent.type(screen.getByLabelText('Buscar'), 'yuri');
    expect(screen.getAllByTestId('registration-row')).toHaveLength(1);
    await userEvent.clear(screen.getByLabelText('Buscar'));
    await userEvent.selectOptions(screen.getByLabelText('Situação'), 'EXEMPT');
    expect(screen.getAllByTestId('registration-row')).toHaveLength(1);
    expect(screen.getByTestId('registration-row')).toHaveTextContent('Convidada Ilustre');
    await userEvent.selectOptions(screen.getByLabelText('Situação'), 'CANCELLED');
    expect(screen.getByText('Nada para mostrar com esses filtros.')).toBeInTheDocument();
  });

  it('gives an organiser the list without documents and without any action', async () => {
    stubApi({ members: members('ORGANIZER'), registrations: list([registration({ cpf: undefined, passport: undefined })], 'ORGANIZER') });
    panel('registrations');
    const row = await screen.findByTestId('registration-row');
    expect(row).not.toHaveTextContent('CPF');
    expect(screen.queryByRole('button', { name: 'Alterar situação' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apagar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cadastrar inscrição' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Mostrar as apagadas/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Baixar planilha' })).toBeInTheDocument();
  });

  it('changes the status with a reason, and shows the list again', async () => {
    const calls = stubApi({ members: members(), registrations: list([registration()]), 'registration-status': { body: { ok: true } } });
    panel('registrations');
    await userEvent.click(await screen.findByRole('button', { name: 'Alterar situação' }));
    await userEvent.selectOptions(screen.getByLabelText('Situação', { selector: 'form select' }), 'EXEMPT');
    await userEvent.type(screen.getByLabelText('Motivo'), 'palestrante convidada');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(calls.filter((c) => c.url.includes('/registrations')).length).toBeGreaterThan(1));
    expect(calls.find((c) => c.url.endsWith('registration-status'))).toMatchObject({
      method: 'POST',
      authorization: 'Bearer access-token-1',
      body: { eventSlug: '2027', id: 'reg-1', status: 'EXEMPT', reason: 'palestrante convidada' },
    });
  });

  it('can hand a registration back to the payment', async () => {
    const calls = stubApi({
      members: members(),
      registrations: list([registration({ state: 'CONFIRMED', manual: { status: 'CONFIRMED', reason: 'engano', by: 'u1', at: null } })]),
      'registration-status': { body: { ok: true } },
    });
    panel('registrations');
    await userEvent.click(await screen.findByRole('button', { name: 'Alterar situação' }));
    await userEvent.selectOptions(screen.getByLabelText('Situação', { selector: 'form select' }), '');
    await userEvent.type(screen.getByLabelText('Motivo'), 'marcada por engano');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('registration-status'))).toBe(true));
    expect(calls.find((c) => c.url.endsWith('registration-status'))!.body).toMatchObject({ status: null });
  });

  it('shows why a change was refused and keeps the form open', async () => {
    stubApi({ members: members(), registrations: list([registration()]), 'registration-status': { status: 400, body: { error: 'reason_required' } } });
    panel('registrations');
    await userEvent.click(await screen.findByRole('button', { name: 'Alterar situação' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Escreva o motivo (pelo menos 5 letras).');
    expect(screen.getByLabelText('Motivo')).toBeInTheDocument();
  });

  it('deleting a paid registration needs the extra confirmation', async () => {
    let attempts = 0;
    const calls = stubApi({
      members: members(),
      registrations: list([registration({ state: 'PAID', payment: 'PAID', paidCents: 5000 })]),
      'registration-delete': () => {
        attempts += 1;
        return attempts === 1 ? { status: 409, body: { error: 'registration_paid' } } : { body: { ok: true } };
      },
    });
    panel('registrations');
    await userEvent.click(await screen.findByRole('button', { name: 'Apagar' }));
    await userEvent.type(screen.getByLabelText('Motivo'), 'duplicada');
    await userEvent.click(screen.getByRole('button', { name: 'Apagar inscrição' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta inscrição foi paga.');
    await userEvent.click(screen.getByLabelText('Esta inscrição foi paga. Apagar mesmo assim.'));
    await userEvent.click(screen.getByRole('button', { name: 'Apagar inscrição' }));
    await waitFor(() => expect(attempts).toBe(2));
    const sent = calls.filter((c) => c.url.endsWith('registration-delete')).map((c) => c.body!.confirmPaid);
    expect(sent).toEqual([false, true]);
  });

  it('does not offer the paid confirmation for an unpaid registration', async () => {
    stubApi({ members: members(), registrations: list([registration()]) });
    panel('registrations');
    await userEvent.click(await screen.findByRole('button', { name: 'Apagar' }));
    expect(screen.queryByLabelText(/Apagar mesmo assim/)).not.toBeInTheDocument();
  });

  it('shows the deleted ones on request, with the reason and a way to restore', async () => {
    const calls = stubApi({ members: members(), registrations: list(rows), 'registration-restore': { body: { ok: true } } });
    panel('registrations');
    await userEvent.click(await screen.findByLabelText('Mostrar as apagadas (1)'));
    const row = screen.getByTestId('registration-row');
    expect(row).toHaveTextContent('Teste Apagado');
    expect(row).toHaveTextContent(/Apagada em .*: inscrição de teste/);
    expect(within(row).queryByRole('button', { name: 'Alterar situação' })).not.toBeInTheDocument();
    await userEvent.click(within(row).getByRole('button', { name: 'Restaurar' }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('registration-restore'))).toBe(true));
    expect(calls.find((c) => c.url.endsWith('registration-restore'))!.body).toEqual({ eventSlug: '2027', id: 'reg-4' });
  });

  it('registers someone by hand, already exempt, with the reason', async () => {
    const calls = stubApi({ members: members(), registrations: list([]), 'registration-create': { status: 201, body: {} } });
    panel('registrations');
    await userEvent.click(await screen.findByRole('button', { name: 'Cadastrar inscrição' }));
    const form = screen.getByTestId('new-registration');
    await userEvent.type(within(form).getByLabelText('Nome completo'), 'Fulano de Tal');
    await userEvent.type(within(form).getByLabelText('E-mail'), 'fulano@ufcg.edu.br');
    await userEvent.type(within(form).getByLabelText('CPF'), '52998224725');
    await userEvent.selectOptions(within(form).getByLabelText('Categoria'), 'PROFISSIONAL');
    await userEvent.selectOptions(within(form).getByLabelText('Situação'), 'EXEMPT');
    await userEvent.type(within(form).getByLabelText('Motivo'), 'palestrante convidado');
    await userEvent.click(within(form).getByRole('button', { name: 'Cadastrar' }));
    await waitFor(() => expect(screen.queryByTestId('new-registration')).not.toBeInTheDocument());
    expect(calls.find((c) => c.url.endsWith('registration-create'))!.body).toMatchObject({
      eventSlug: '2027',
      fullName: 'Fulano de Tal',
      email: 'fulano@ufcg.edu.br',
      cpf: '529.982.247-25',
      category: 'PROFISSIONAL',
      manualStatus: 'EXEMPT',
      reason: 'palestrante convidado',
    });
  });

  it('says when the e-mail already has a registration', async () => {
    stubApi({ members: members(), registrations: list([]), 'registration-create': { status: 409, body: { error: 'registration_exists' } } });
    panel('registrations');
    await userEvent.click(await screen.findByRole('button', { name: 'Cadastrar inscrição' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Já existe uma inscrição com esse e-mail nesta edição.');
  });
});

describe('spreadsheet', () => {
  it('quotes every cell, doubles quotes, and starts with the mark Excel needs for accents', () => {
    const csv = toCsv([['Nome', 'Valor'], ['José "Zé" Lima; UFCG', 50], [null, undefined]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('"Nome";"Valor"\r\n"José ""Zé"" Lima; UFCG";"50"\r\n"";""');
  });

  it('neutralises a value that a spreadsheet would run as a formula', () => {
    const csv = toCsv([['=HYPERLINK("http://evil","x")', '+1+1', '-2', '@SUM(A1)', 'normal']]);
    expect(csv.slice(1)).toBe(`"'=HYPERLINK(""http://evil"",""x"")";"'+1+1";"'-2";"'@SUM(A1)";"normal"`);
  });
});

describe('papers tab', () => {
  const papers = {
    body: {
      role: 'ORGANIZER',
      counts: { total: 1, withdrawn: 1 },
      submissions: [
        { id: 'p1', number: 12, title: 'Governança da água', modality: 'ARTIGO', areaRef: 'a1', status: 'SUBMITTED', fileName: 'artigo.pdf', filePages: 13, createdAt: '2026-12-01T12:00:00Z', deletedAt: null, authors: [{ position: 1, fullName: 'Maria Souza', email: 'maria@ufcg.edu.br' }], authorRegistered: false },
        { id: 'p2', number: 13, title: 'Trabalho retirado', modality: 'RESUMO_EXPANDIDO', areaRef: 'a6', status: 'SUBMITTED', fileName: 'r.docx', filePages: null, createdAt: '2026-12-02T12:00:00Z', deletedAt: '2026-12-03T12:00:00Z', authors: [{ position: 1, fullName: 'João Lima', email: 'joao@ufpb.br' }], authorRegistered: true },
      ],
    },
  };

  it('lists every paper with authors, whether one of them is registered, and withdrawn ones marked', async () => {
    stubApi({ members: members('ORGANIZER'), submissions: papers });
    panel('papers');
    expect(await screen.findByTestId('panel-counts')).toHaveTextContent('1 trabalhos enviados, 1 retirados.');
    const [first, second] = screen.getAllByTestId('paper-row');
    expect(first).toHaveTextContent('12');
    expect(first).toHaveTextContent('Artigo científico · Governança, Políticas Públicas e Direito Ambiental');
    expect(first).toHaveTextContent('Maria Souza (maria@ufcg.edu.br)');
    expect(first).toHaveTextContent('Nenhum autor com inscrição confirmada.');
    expect(first).toHaveTextContent('Enviado');
    expect(first).toHaveTextContent('13 páginas');
    expect(second).toHaveTextContent('Retirado pelo autor');
    expect(second).toHaveTextContent('Há autor com inscrição confirmada.');
  });

  it('opens a file through a link asked from the server', async () => {
    const calls = stubApi({ members: members('ORGANIZER'), submissions: papers, file: { body: { url: 'https://storage.example/signed' } } });
    const open = vi.spyOn(browser, 'open').mockImplementation(() => undefined);
    panel('papers');
    await userEvent.click(await screen.findByRole('button', { name: 'artigo.pdf' }));
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://storage.example/signed'));
    expect(calls.find((c) => c.url.includes('/file'))!.url).toBe('/api/v1/submissions/file?id=p1');
  });

  it('searches by number, title or author', async () => {
    stubApi({ members: members('ORGANIZER'), submissions: papers });
    panel('papers');
    await screen.findByTestId('panel-counts');
    await userEvent.type(screen.getByLabelText('Buscar'), 'joao@ufpb');
    expect(screen.getAllByTestId('paper-row')).toHaveLength(1);
    expect(screen.getByTestId('paper-row')).toHaveTextContent('Trabalho retirado');
  });
});

describe('people tab', () => {
  it('lists who has each role and who is still without an account', async () => {
    stubApi({ members: members() });
    panel('people');
    expect(within(await screen.findByTestId('role-ADMIN')).getByText(/Najara Escarião/)).toBeInTheDocument();
    expect(within(screen.getByTestId('role-ORGANIZER')).getByText(/Viviane Farias/)).toBeInTheDocument();
    const reviewers = screen.getByTestId('role-REVIEWER');
    expect(reviewers).toHaveTextContent('futuro@ufpb.br (ainda sem conta)');
  });

  it('gives a role by e-mail and says when the person still has to create the account', async () => {
    const calls = stubApi({ members: members(), 'member-add': { body: { ok: true, invited: true } } });
    panel('people');
    await userEvent.type(await screen.findByLabelText('E-mail'), ' novo@ufpb.br ');
    await userEvent.selectOptions(screen.getByLabelText('Papel'), 'ORGANIZER');
    await userEvent.click(screen.getByRole('button', { name: 'Dar o papel' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Essa pessoa ainda não tem conta.');
    expect(calls.find((c) => c.url.endsWith('member-add'))!.body).toEqual({ eventSlug: '2027', email: 'novo@ufpb.br', role: 'ORGANIZER' });
    expect(screen.getByLabelText('E-mail')).toHaveValue('');
  });

  it('lets an organiser manage reviewers only', async () => {
    const calls = stubApi({ members: members('ORGANIZER'), 'member-remove': { body: { ok: true } } });
    panel('people');
    const role = await screen.findByLabelText('Papel');
    expect(within(role).getAllByRole('option').map((o) => o.textContent)).toEqual(['Avaliador']);
    expect(within(screen.getByTestId('role-ADMIN')).queryByRole('button', { name: 'Remover' })).not.toBeInTheDocument();
    expect(within(screen.getByTestId('role-ORGANIZER')).queryByRole('button', { name: 'Remover' })).not.toBeInTheDocument();
    await userEvent.click(within(screen.getByTestId('role-REVIEWER')).getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('member-remove'))).toBe(true));
    expect(calls.find((c) => c.url.endsWith('member-remove'))!.body).toEqual({ eventSlug: '2027', email: 'futuro@ufpb.br', role: 'REVIEWER' });
  });

  it('explains a refusal', async () => {
    stubApi({ members: members(), 'member-remove': { status: 409, body: { error: 'cannot_remove_self' } } });
    panel('people');
    await userEvent.click(within(await screen.findByTestId('role-ADMIN')).getByRole('button', { name: 'Remover' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Você não pode remover o seu próprio papel de administrador.');
  });
});

describe('requests tab', () => {
  const requests = (rows: unknown[]) => ({ body: { requests: rows } });
  const one = { id: 'link-1', createdAt: '2026-12-01T12:00:00Z', registrationName: 'Maria Antiga', registrationEmail: 'antigo@outlook.com', accountName: 'Maria Nova', accountEmail: 'nova@gmail.com' };

  it('shows both sides of a request and approves it', async () => {
    let decided = false;
    const calls = stubApi({
      members: members(),
      'link-requests': () => requests(decided ? [] : [one]),
      'link-decide': () => {
        decided = true;
        return { body: { ok: true } };
      },
    });
    panel('requests');
    const card = await screen.findByTestId('request-card');
    expect(card).toHaveTextContent('Maria Nova (nova@gmail.com) pede a inscrição feita em nome de Maria Antiga com o e-mail antigo@outlook.com.');
    await userEvent.click(within(card).getByRole('button', { name: 'Aprovar' }));
    expect(await screen.findByTestId('no-requests')).toBeInTheDocument();
    expect(calls.find((c) => c.url.endsWith('link-decide'))!.body).toEqual({ eventSlug: '2027', id: 'link-1', approve: true });
  });

  it('refuses with approve false, and explains when it cannot be linked', async () => {
    const calls = stubApi({ members: members(), 'link-requests': requests([one]), 'link-decide': { status: 409, body: { error: 'cannot_link' } } });
    panel('requests');
    await userEvent.click(await screen.findByRole('button', { name: 'Recusar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Não foi possível reunir/);
    expect(calls.find((c) => c.url.endsWith('link-decide'))!.body).toMatchObject({ approve: false });
  });
});
