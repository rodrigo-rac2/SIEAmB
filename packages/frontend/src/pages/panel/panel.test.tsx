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
  const pattern = path.split('?')[0]!.replace(/^\/[^/]+/, '/:eventSlug');
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
  mount({ registrations: '/2027/painel', papers: '/2027/painel/trabalhos', people: '/2027/painel/pessoas', announcements: '/2027/painel/comunicados', requests: '/2027/painel/pedidos' }[tab], <PanelPage tab={tab} />, state);

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

  it('Minha área links to the papers to review only for someone who has some (#232)', async () => {
    const me = {
      body: { panels: { platformAdmin: false, slugs: [] }, user: { email: 'a@b.org', fullName: 'A', cpf: null, passport: null, country: 'BR', institution: null, documentLocked: false }, registrations: [], suggestions: [] },
    };
    const calls = stubApi({ me, reviewing: { body: { submissions: [{ id: 'p1' }, { id: 'p2' }] } } });
    const some = mount('/2027/minha-area', <MyAreaPage />);
    const link = await screen.findByTestId('reviewing-link');
    expect(link).toHaveTextContent('Trabalhos para avaliar (2)');
    expect(link).toHaveAttribute('href', '/2027/avaliacoes');
    expect(calls.find((c) => c.url.includes('reviewing'))!.url).toBe('/api/v1/submissions/reviewing?eventSlug=2027');
    some.unmount();
    for (const reviewing of [{ body: { submissions: [] } }, { status: 500, body: { error: 'server_error' } }]) {
      stubApi({ me, reviewing });
      const none = mount('/2027/minha-area', <MyAreaPage />);
      await screen.findByLabelText('Nome completo');
      expect(screen.queryByTestId('reviewing-link')).not.toBeInTheDocument();
      // A failure here is not the person's problem: the rest of the page is there, with no error.
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      none.unmount();
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
        { id: 'p1', number: 12, title: 'Governança da água', modality: 'ARTIGO', areaRef: 'a1', status: 'SUBMITTED', fileName: 'artigo.pdf', filePages: 13, createdAt: '2026-12-01T12:00:00Z', deletedAt: null, authors: [{ position: 1, fullName: 'Maria Souza', email: 'maria@ufcg.edu.br' }], authorRegistered: false, reviewers: [] },
        { id: 'p2', number: 13, title: 'Trabalho retirado', modality: 'RESUMO_EXPANDIDO', areaRef: 'a6', status: 'SUBMITTED', fileName: 'r.docx', filePages: null, createdAt: '2026-12-02T12:00:00Z', deletedAt: '2026-12-03T12:00:00Z', authors: [{ position: 1, fullName: 'João Lima', email: 'joao@ufpb.br' }], authorRegistered: true, reviewers: [] },
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

  describe('reviewers (#232)', () => {
    const ANA = { userId: 'u7', email: 'ana@ufrn.br', fullName: 'Ana Reis', role: 'REVIEWER' };
    const BRUNO = { userId: 'u8', email: 'bruno@ufpb.br', fullName: 'Bruno Sá', role: 'REVIEWER' };
    const MARIA = { userId: 'u9', email: 'Maria@UFCG.edu.br', fullName: 'Maria Souza', role: 'REVIEWER' };
    const withReviewers = (...people: (typeof ANA)[]) => {
      const base = members('ORGANIZER');
      return { body: { ...base.body, members: [...base.body.members, ...people] } };
    };
    const reviewed = (...reviewers: (typeof ANA)[]) => ({
      body: {
        ...papers.body,
        submissions: papers.body.submissions.map((s) =>
          s.id === 'p1' ? { ...s, status: reviewers.length ? 'UNDER_REVIEW' : 'SUBMITTED', reviewers: reviewers.map(({ userId, email, fullName }) => ({ userId, email, fullName })) } : s,
        ),
      },
    });

    it('says a paper has no reviewer, and where to give the role when nobody has it', async () => {
      stubApi({ members: members('ORGANIZER'), submissions: papers });
      panel('papers');
      const [first] = await screen.findAllByTestId('paper-row');
      expect(within(first!).getByTestId('paper-reviewers')).toHaveTextContent('Sem avaliador');
      expect(await screen.findByTestId('no-reviewers')).toHaveTextContent('Ninguém tem o papel de Avaliador nesta edição.');
      expect(within(screen.getByTestId('no-reviewers')).getByRole('link', { name: 'Pessoas e papéis' })).toHaveAttribute('href', '/2027/painel/pessoas');
      expect(screen.queryByRole('combobox', { name: /Indicar avaliador/ })).not.toBeInTheDocument();
    });

    it('assigns the chosen reviewer and shows the paper under review', async () => {
      let assigned = false;
      const calls = stubApi({
        members: withReviewers(ANA, BRUNO),
        submissions: () => (assigned ? reviewed(ANA) : papers),
        'reviewer-assign': () => {
          assigned = true;
          return { body: { ok: true } };
        },
      });
      panel('papers');
      const choose = await screen.findByRole('combobox', { name: 'Indicar avaliador para o trabalho nº 12' });
      const button = screen.getByRole('button', { name: 'Indicar para o trabalho nº 12' });
      // Nothing is sent until someone is chosen.
      expect(button).toBeDisabled();
      await userEvent.selectOptions(choose, 'Ana Reis');
      await userEvent.click(button);
      const row = (await screen.findAllByTestId('paper-row'))[0]!;
      await waitFor(() => expect(within(row).getByTestId('paper-reviewers')).toHaveTextContent('Ana Reis'));
      expect(row).toHaveTextContent('Em avaliação');
      expect(calls.find((c) => c.url.includes('reviewer-assign'))).toMatchObject({
        method: 'POST',
        authorization: 'Bearer access-token-1',
        body: { eventSlug: '2027', submissionId: 'p1', userId: 'u7' },
      });
      // Ana is on the paper now: only Bruno is left to choose.
      const left = within(screen.getByRole('combobox', { name: 'Indicar avaliador para o trabalho nº 12' })).getAllByRole('option');
      expect(left.map((o) => o.textContent)).toEqual(['Escolha', 'Bruno Sá']);
    });

    it('takes a reviewer off a paper that has several', async () => {
      let removed = false;
      const calls = stubApi({
        members: withReviewers(ANA, BRUNO),
        submissions: () => (removed ? reviewed(BRUNO) : reviewed(ANA, BRUNO)),
        'reviewer-unassign': () => {
          removed = true;
          return { body: { ok: true } };
        },
      });
      panel('papers');
      await userEvent.click(await screen.findByRole('button', { name: 'Tirar Ana Reis do trabalho nº 12' }));
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Tirar Ana Reis do trabalho nº 12' })).not.toBeInTheDocument());
      expect(screen.getByRole('button', { name: 'Tirar Bruno Sá do trabalho nº 12' })).toBeInTheDocument();
      expect(calls.find((c) => c.url.includes('reviewer-unassign'))!.body).toEqual({ eventSlug: '2027', submissionId: 'p1', userId: 'u7' });
    });

    it('does not offer an author of the paper as its reviewer, nor anything on a withdrawn paper', async () => {
      stubApi({ members: withReviewers(MARIA, ANA), submissions: papers });
      panel('papers');
      const choose = await screen.findByRole('combobox', { name: 'Indicar avaliador para o trabalho nº 12' });
      expect(within(choose).getAllByRole('option').map((o) => o.textContent)).toEqual(['Escolha', 'Ana Reis']);
      expect(screen.queryByRole('combobox', { name: 'Indicar avaliador para o trabalho nº 13' })).not.toBeInTheDocument();
    });

    it('says why when the server refuses, and changes nothing', async () => {
      stubApi({
        members: withReviewers(ANA),
        submissions: papers,
        'reviewer-assign': { status: 409, body: { error: 'reviewer_is_author' } },
      });
      panel('papers');
      await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Indicar avaliador para o trabalho nº 12' }), 'Ana Reis');
      await userEvent.click(screen.getByRole('button', { name: 'Indicar para o trabalho nº 12' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Essa pessoa é um dos autores do trabalho e não pode avaliá-lo.');
      expect(within(screen.getAllByTestId('paper-row')[0]!).getByTestId('paper-reviewers')).toHaveTextContent('Sem avaliador');
    });
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

describe('registration and papers side by side, and reminders (#225)', () => {
  it('links each registration to the papers of that person, and says "nenhum" when there are none', async () => {
    stubApi({ members: members('ORGANIZER'), registrations: list([registration({ papers: 2 }), registration({ id: 'reg-2', email: 'sem@x.org', papers: 0 })], 'ORGANIZER') });
    panel('registrations');
    const [first, second] = await screen.findAllByTestId('registration-row');
    expect(within(first!).getByRole('link', { name: '2 trabalhos' })).toHaveAttribute('href', '/2027/painel/trabalhos?autor=paula%40outlook.com');
    expect(within(second!).queryByRole('link', { name: /trabalho/ })).not.toBeInTheDocument();
    expect(second).toHaveTextContent('nenhum');
  });

  it('says "1 trabalho" for one', async () => {
    stubApi({ members: members(), registrations: list([registration({ papers: 1 })]) });
    panel('registrations');
    expect(await screen.findByRole('link', { name: '1 trabalho' })).toBeInTheDocument();
  });

  it('opens the papers list already filtered to the person, with each author’s registration beside the name', async () => {
    stubApi({
      members: members('ORGANIZER'),
      submissions: {
        body: {
          role: 'ORGANIZER',
          counts: { total: 2, withdrawn: 0 },
          submissions: [
            { id: 'p1', number: 1, title: 'Da Paula', modality: 'ARTIGO', areaRef: 'a1', status: 'SUBMITTED', fileName: 'a.pdf', filePages: 13, createdAt: '2026-12-01T12:00:00Z', deletedAt: null, authorRegistered: true, reviewers: [], authors: [{ position: 1, fullName: 'Paula Nunes', email: 'paula@outlook.com', registration: 'PAID' }, { position: 2, fullName: 'Sem Inscrição', email: 'sem@x.org', registration: null }] },
            { id: 'p2', number: 2, title: 'De outra pessoa', modality: 'ARTIGO', areaRef: 'a1', status: 'SUBMITTED', fileName: 'b.pdf', filePages: 12, createdAt: '2026-12-01T12:00:00Z', deletedAt: null, authorRegistered: false, reviewers: [], authors: [{ position: 1, fullName: 'Outra', email: 'outra@x.org', registration: 'UNPAID' }] },
          ],
        },
      },
    });
    mount('/2027/painel/trabalhos?autor=paula%40outlook.com', <PanelPage tab="papers" />);
    const rows = await screen.findAllByTestId('paper-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('Da Paula');
    expect(screen.getByLabelText('Buscar')).toHaveValue('paula@outlook.com');
    expect(within(rows[0]!).getAllByTestId('author-registration').map((e) => e.textContent)).toEqual(['Paga', 'sem inscrição']);
    // Clearing the filter shows everything again.
    await userEvent.clear(screen.getByLabelText('Buscar'));
    expect(screen.getAllByTestId('paper-row')).toHaveLength(2);
  });

  it('lets an organiser send one reminder, and shows what happened in place of the button', async () => {
    const calls = stubApi({ members: members('ORGANIZER'), registrations: list([registration()], 'ORGANIZER'), remind: { body: { ok: true, outcome: 'sent' } } });
    panel('registrations');
    await userEvent.click(await screen.findByRole('button', { name: 'Enviar lembrete' }));
    expect(await screen.findByText('Lembrete enviado agora.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar lembrete' })).not.toBeInTheDocument();
    expect(calls.find((c) => c.url.endsWith('/remind'))).toMatchObject({ method: 'POST', authorization: 'Bearer access-token-1', body: { eventSlug: '2027', id: 'reg-1' } });
  });

  it('explains when the person already got one today', async () => {
    stubApi({ members: members(), registrations: list([registration()]), remind: { status: 409, body: { error: 'already_reminded' } } });
    panel('registrations');
    await userEvent.click(await screen.findByRole('button', { name: 'Enviar lembrete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta pessoa já recebeu um lembrete hoje.');
  });

  it('offers no reminder for someone who paid, was decided by hand or was deleted', async () => {
    stubApi({
      members: members(),
      registrations: list([
        registration({ id: 'a', fullName: 'Paga', state: 'PAID', payment: 'PAID' }),
        registration({ id: 'b', fullName: 'Isenta', state: 'EXEMPT', manual: { status: 'EXEMPT', reason: 'x', by: null, at: null } }),
        registration({ id: 'c', fullName: 'Cancelada', state: 'CANCELLED', manual: { status: 'CANCELLED', reason: 'x', by: null, at: null } }),
      ]),
    });
    panel('registrations');
    await screen.findAllByTestId('registration-row');
    expect(screen.queryByRole('button', { name: 'Enviar lembrete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Enviar lembrete (a|às)/ })).not.toBeInTheDocument();
  });

  it('reminds everyone unpaid among the rows on screen, after a confirmation with the number', async () => {
    const rows = [
      registration({ id: 'u1', fullName: 'Deve Um' }),
      registration({ id: 'u2', fullName: 'Boleto', state: 'PENDING', payment: 'PENDING' }),
      registration({ id: 'p1', fullName: 'Paga', state: 'PAID', payment: 'PAID' }),
      registration({ id: 'u3', fullName: 'Outra Pessoa', email: 'outra@x.org' }),
    ];
    const calls = stubApi({ members: members('ORGANIZER'), registrations: list(rows, 'ORGANIZER'), remind: { body: { ok: true, queued: 2, already: 1 } } });
    panel('registrations');
    await userEvent.click(await screen.findByRole('button', { name: 'Enviar lembrete às 3 pessoas sem pagamento' }));
    expect(calls.some((c) => c.url.endsWith('/remind'))).toBe(false);
    expect(screen.getByRole('alert')).toHaveTextContent('vai para as 3 pessoas da lista que ainda não pagaram');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar para 3 pessoas' }));
    expect(await screen.findByRole('status')).toHaveTextContent('2 lembretes a caminho; saem nos próximos minutos. 1 pessoas já tinham recebido um hoje.');
    expect(calls.find((c) => c.url.endsWith('/remind'))!.body).toEqual({ eventSlug: '2027', ids: ['u1', 'u2', 'u3'] });
  });

  it('with a filter on, the bulk reminder goes only to the rows shown', async () => {
    const rows = [registration({ id: 'u1', fullName: 'Deve Um' }), registration({ id: 'u3', fullName: 'Outra Pessoa', email: 'outra@x.org' })];
    const calls = stubApi({ members: members(), registrations: list(rows), remind: { body: { ok: true, queued: 1, already: 0 } } });
    panel('registrations');
    await userEvent.type(await screen.findByLabelText('Buscar'), 'outra@');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar lembrete a 1 pessoa sem pagamento' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enviar para 1 pessoa' }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/remind'))).toBe(true));
    expect(calls.find((c) => c.url.endsWith('/remind'))!.body).toEqual({ eventSlug: '2027', ids: ['u3'] });
  });
});
