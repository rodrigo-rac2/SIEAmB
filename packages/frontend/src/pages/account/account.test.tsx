import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RegistrationForm } from '../../components/registration/RegistrationForm';
import { TopBar } from '../../components/layout/TopBar';
import { AuthContext, type AuthState } from '../../contexts/AuthContext';
import { EventProvider } from '../../contexts/EventContext';
import type { Account } from '../../services/account';
import { LinkPage } from './LinkPage';
import { LoginPage, safeNext } from './LoginPage';
import { MyAreaPage } from './MyAreaPage';
import { PasswordPage } from './PasswordPage';
import { SignupPage } from './SignupPage';

const auth = (over: Partial<AuthState> = {}): AuthState => ({
  enabled: true,
  loading: false,
  email: null,
  accessToken: null,
  signIn: vi.fn(async () => null),
  signOut: vi.fn(async () => undefined),
  verifyLink: vi.fn(async () => true),
  ...over,
});

const LOGGED_IN = { email: 'maria@ufcg.edu.br', accessToken: 'access-token-1' };

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

/** Mounts a page at a path under /:eventSlug with a given login state; other paths show where we landed. */
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

interface Call {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
  authorization: string | null;
}

/** Answers /api/v1/account/<action> from a table; records every call. */
function stubApi(answers: Record<string, { status?: number; body: unknown } | (() => { status?: number; body: unknown })>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const action = input.slice(input.lastIndexOf('/') + 1);
      const headers = new Headers(init.headers);
      calls.push({
        url: input,
        method: init.method ?? 'GET',
        body: init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : null,
        authorization: headers.get('authorization'),
      });
      const entry = answers[action];
      const answer = typeof entry === 'function' ? entry() : entry;
      if (!answer) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
      return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200 });
    }),
  );
  return calls;
}

const account = (over: Partial<Account> = {}): Account => ({
  user: {
    email: 'maria@ufcg.edu.br',
    fullName: 'Maria Clara de Souza',
    cpf: null,
    passport: null,
    country: 'BR',
    institution: null,
    documentLocked: false,
  },
  registrations: [],
  suggestions: [],
  ...over,
});

const registration = (over: Partial<Account['registrations'][number]> = {}) => ({
  id: 'reg-1',
  eventSlug: '2027',
  eventName: 'II SIEAmB',
  category: 'ESTUDANTE_POS',
  modality: 'ONLINE',
  createdAt: '2026-11-10T12:00:00.000Z',
  state: 'UNPAID' as const,
  amountCents: null,
  payToken: '3f2b8c1e-9a4d-4e7f-8b21-6c5d4e3f2a10',
  paymentId: null,
  ...over,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('accounts switched off', () => {
  it.each([
    ['login', '/2027/conta/entrar', <LoginPage key="1" />],
    ['create account', '/2027/conta/criar', <SignupPage key="2" mode="signup" />],
    ['password', '/2027/conta/confirmar?token_hash=x', <PasswordPage key="3" type="signup" />],
    ['link', '/2027/conta/vincular?t=x', <LinkPage key="4" />],
    ['my area', '/2027/minha-area', <MyAreaPage key="5" />],
  ])('the %s page does not exist', async (_name, path, element) => {
    const calls = stubApi({});
    mount(path, element, auth({ enabled: false }));
    expect(await screen.findByRole('heading', { name: /não encontrada|404/i })).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it('the top bar shows no account link', async () => {
    mount('/2027/', <TopBar />, auth({ enabled: false }));
    await screen.findByText(/2027/);
    expect(screen.queryByRole('link', { name: 'Entrar' })).not.toBeInTheDocument();
  });
});

describe('top bar', () => {
  it('offers Entrar when logged out and Minha área when logged in', async () => {
    const { unmount } = mount('/2027/', <TopBar />);
    expect(await screen.findByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/2027/conta/entrar');
    unmount();
    mount('/2027/', <TopBar />, auth(LOGGED_IN));
    expect(await screen.findByRole('link', { name: 'Minha área' })).toHaveAttribute('href', '/2027/minha-area');
  });
});

describe('LoginPage', () => {
  it('logs in with the e-mail and password typed', async () => {
    const state = auth();
    mount('/2027/conta/entrar', <LoginPage />, state);
    await userEvent.type(await screen.findByLabelText('E-mail'), 'maria@ufcg.edu.br');
    await userEvent.type(screen.getByLabelText('Senha'), 'uma-senha-longa');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(state.signIn).toHaveBeenCalledWith('maria@ufcg.edu.br', 'uma-senha-longa');
  });

  it.each([
    ['invalid_credentials', 'E-mail ou senha incorretos.'],
    ['email_not_confirmed', /ainda não foi confirmado/],
    ['too_many_attempts', /Muitas tentativas/],
    ['generic', /Não foi possível entrar agora/],
  ] as const)('explains %s', async (problem, message) => {
    mount('/2027/conta/entrar', <LoginPage />, auth({ signIn: vi.fn(async () => problem) }));
    await userEvent.type(await screen.findByLabelText('E-mail'), 'maria@ufcg.edu.br');
    await userEvent.type(screen.getByLabelText('Senha'), 'errada');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('cannot be submitted empty', async () => {
    mount('/2027/conta/entrar', <LoginPage />);
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeDisabled();
  });

  it('goes to Minha área when already logged in, or to the page that asked for the login', async () => {
    const { unmount } = mount('/2027/conta/entrar', <LoginPage />, auth(LOGGED_IN));
    expect(await screen.findByTestId('where')).toHaveTextContent('/2027/minha-area');
    unmount();
    mount('/2027/conta/entrar?next=%2F2027%2Fsubmissoes', <LoginPage />, auth(LOGGED_IN));
    expect(await screen.findByTestId('where')).toHaveTextContent('/2027/submissoes');
  });

  it('never follows a next that leaves the site', () => {
    const fallback = '/2027/minha-area';
    expect(safeNext('/2027/submissoes?x=1', fallback)).toBe('/2027/submissoes?x=1');
    for (const evil of ['//evil.example', 'https://evil.example', '/\\evil.example', 'javascript:alert(1)', '', null, '/a b']) {
      expect(safeNext(evil, fallback), String(evil)).toBe(fallback);
    }
  });
});

describe('SignupPage', () => {
  it('asks for name and e-mail only, and says to check the e-mail', async () => {
    const calls = stubApi({ signup: { status: 202, body: { ok: true } } });
    mount('/2027/conta/criar', <SignupPage mode="signup" />);
    expect(screen.queryByLabelText(/Senha/)).not.toBeInTheDocument();
    await userEvent.type(await screen.findByLabelText('Nome completo'), 'Maria Clara');
    await userEvent.type(screen.getByLabelText('E-mail'), ' maria@ufcg.edu.br ');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link de confirmação' }));
    expect(await screen.findByRole('heading', { name: 'Confira seu e-mail' })).toBeInTheDocument();
    expect(calls).toEqual([
      expect.objectContaining({
        method: 'POST',
        url: '/api/v1/account/signup',
        body: { email: 'maria@ufcg.edu.br', fullName: 'Maria Clara', locale: 'pt-BR', eventSlug: '2027' },
      }),
    ]);
  });

  it('starts with the e-mail of the registration just made', async () => {
    mount('/2027/conta/criar?email=maria%40ufcg.edu.br', <SignupPage mode="signup" />);
    expect(await screen.findByLabelText('E-mail')).toHaveValue('maria@ufcg.edu.br');
  });

  it('shows the reason when the server refuses, and stays on the form', async () => {
    stubApi({ signup: { status: 429, body: { error: 'too_many_attempts' } } });
    mount('/2027/conta/criar', <SignupPage mode="signup" />);
    await userEvent.type(await screen.findByLabelText('Nome completo'), 'Maria Clara');
    await userEvent.type(screen.getByLabelText('E-mail'), 'maria@ufcg.edu.br');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link de confirmação' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Muitas tentativas/);
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument();
  });

  it('in recover mode asks only for the e-mail', async () => {
    const calls = stubApi({ recover: { status: 202, body: { ok: true } } });
    mount('/2027/conta/recuperar', <SignupPage mode="recover" />);
    expect(screen.queryByLabelText('Nome completo')).not.toBeInTheDocument();
    await userEvent.type(await screen.findByLabelText('E-mail'), 'maria@ufcg.edu.br');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/Se maria@ufcg.edu.br tiver uma conta/);
    expect(calls[0]!.body).toEqual({ email: 'maria@ufcg.edu.br', locale: 'pt-BR', eventSlug: '2027' });
  });
});

describe('PasswordPage', () => {
  const open = (state: AuthState, type: 'signup' | 'recovery' = 'signup') =>
    mount(
      type === 'signup' ? '/2027/conta/confirmar?token_hash=abc123' : '/2027/conta/nova-senha?token_hash=abc123',
      <PasswordPage type={type} />,
      state,
    );

  it('checks the link, then saves the password and goes to Minha área', async () => {
    const calls = stubApi({ password: { body: { ok: true } } });
    const state = auth(LOGGED_IN);
    open(state);
    await userEvent.type(await screen.findByLabelText('Nova senha'), 'uma-senha-bem-longa');
    await userEvent.type(screen.getByLabelText('Repita a senha'), 'uma-senha-bem-longa');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar senha' }));
    expect(await screen.findByTestId('where')).toHaveTextContent('/2027/minha-area');
    expect(state.verifyLink).toHaveBeenCalledWith('abc123', 'signup');
    // Saving a password ends the session, so the page logs in again with the new one.
    expect(state.signIn).toHaveBeenCalledWith('maria@ufcg.edu.br', 'uma-senha-bem-longa');
    expect(calls).toEqual([
      expect.objectContaining({ url: '/api/v1/account/password', method: 'POST', authorization: 'Bearer access-token-1', body: { password: 'uma-senha-bem-longa' } }),
    ]);
  });

  it('uses the recovery kind for a forgotten password', async () => {
    const state = auth(LOGGED_IN);
    open(state, 'recovery');
    expect(await screen.findByRole('heading', { name: 'Nova senha' })).toBeInTheDocument();
    expect(state.verifyLink).toHaveBeenCalledWith('abc123', 'recovery');
  });

  it.each([
    ['nine characters', '123456789', '123456789', /pelo menos 10 caracteres/],
    ['two different passwords', 'uma-senha-bem-longa', 'outra-senha-bem-longa', 'As duas senhas não são iguais.'],
  ])('refuses %s without calling the server', async (_name, first, second, message) => {
    const calls = stubApi({});
    open(auth(LOGGED_IN));
    await userEvent.type(await screen.findByLabelText('Nova senha'), first);
    await userEvent.type(screen.getByLabelText('Repita a senha'), second);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar senha' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(calls).toEqual([]);
  });

  it('shows what the server refused', async () => {
    stubApi({ password: { status: 400, body: { error: 'weak_password' } } });
    open(auth(LOGGED_IN));
    await userEvent.type(await screen.findByLabelText('Nova senha'), 'maria-2027-xx');
    await userEvent.type(screen.getByLabelText('Repita a senha'), 'maria-2027-xx');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar senha' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/não pode conter o seu e-mail/);
  });

  it('says the link is no longer valid when it was used or expired, with a way to ask again', async () => {
    open(auth({ verifyLink: vi.fn(async () => false) }));
    expect(await screen.findByRole('heading', { name: 'Este link não vale mais' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pedir outro link' })).toHaveAttribute('href', '/2027/conta/criar');
    expect(screen.queryByLabelText('Nova senha')).not.toBeInTheDocument();
  });

  it('says the same when the address has no token at all', async () => {
    const state = auth();
    mount('/2027/conta/confirmar', <PasswordPage type="signup" />, state);
    expect(await screen.findByRole('heading', { name: 'Este link não vale mais' })).toBeInTheDocument();
    expect(state.verifyLink).not.toHaveBeenCalled();
  });
});

describe('LinkPage', () => {
  it('confirms the registration with the token of the link, once', async () => {
    const calls = stubApi({ 'link-confirm': { body: { ok: true } } });
    mount('/2027/conta/vincular?t=token-one', <LinkPage />);
    expect(await screen.findByRole('heading', { name: 'Inscrição reunida à conta' })).toBeInTheDocument();
    expect(calls).toEqual([expect.objectContaining({ method: 'POST', body: { token: 'token-one' }, authorization: null })]);
  });

  it.each([
    ['link_expired', 410, /Este link expirou/],
    ['link_not_found', 404, 'Este link não é válido.'],
    ['cannot_link', 409, /Não foi possível reunir/],
  ])('explains %s', async (error, status, message) => {
    stubApi({ 'link-confirm': { status, body: { error } } });
    mount(`/2027/conta/vincular?t=token-${error}`, <LinkPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('does not call the server without a token', async () => {
    const calls = stubApi({});
    mount('/2027/conta/vincular', <LinkPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Este link não é válido.');
    expect(calls).toEqual([]);
  });
});

describe('MyAreaPage', () => {
  it('sends a logged-out visitor to the login, and back afterwards', async () => {
    const calls = stubApi({});
    mount('/2027/minha-area', <MyAreaPage />);
    expect(await screen.findByTestId('where')).toHaveTextContent('/2027/conta/entrar?next=%2F2027%2Fminha-area');
    expect(calls).toEqual([]);
  });

  it('waits for the stored session before deciding', async () => {
    const calls = stubApi({});
    mount('/2027/minha-area', <MyAreaPage />, auth({ loading: true }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByTestId('where')).not.toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it('shows an unpaid registration with the link to pay', async () => {
    const calls = stubApi({ me: { body: account({ registrations: [registration()] }) } });
    mount('/2027/minha-area', <MyAreaPage />, auth(LOGGED_IN));
    const card = await screen.findByTestId('registration-card');
    expect(card).toHaveTextContent('Aguardando pagamento');
    expect(screen.getByRole('link', { name: 'Pagar a inscrição' })).toHaveAttribute(
      'href',
      '/2027/inscricoes/pagar?t=3f2b8c1e-9a4d-4e7f-8b21-6c5d4e3f2a10',
    );
    expect(calls[0]).toMatchObject({ url: '/api/v1/account/me', authorization: 'Bearer access-token-1' });
    expect(screen.queryByTestId('no-registration')).not.toBeInTheDocument();
  });

  it('shows a paid registration as confirmed, with the amount and no link to pay', async () => {
    stubApi({
      me: { body: account({ registrations: [registration({ state: 'PAID', payToken: null, paymentId: 'pay-1', amountCents: 5000 })] }) },
    });
    mount('/2027/minha-area', <MyAreaPage />, auth(LOGGED_IN));
    const card = await screen.findByTestId('registration-card');
    expect(card).toHaveTextContent('Inscrição confirmada');
    expect(card).toHaveTextContent(/R\$\s50,00/);
    expect(screen.queryByRole('link', { name: 'Pagar a inscrição' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver o pagamento' })).toHaveAttribute('href', '/2027/inscricoes/pagamento?p=pay-1');
  });

  it('offers the registration form to someone with no registration in this edition', async () => {
    stubApi({ me: { body: account({ registrations: [registration({ eventSlug: '2025', eventName: 'I SIEAmB' })] }) } });
    mount('/2027/minha-area', <MyAreaPage />, auth(LOGGED_IN));
    expect(await screen.findByTestId('no-registration')).toHaveTextContent('Você ainda não está inscrito nesta edição.');
    expect(screen.getByRole('link', { name: 'Fazer a inscrição' })).toHaveAttribute('href', '/2027/inscricoes/nova');
    expect(screen.getByRole('heading', { name: 'Outras edições' })).toBeInTheDocument();
  });

  const suggestion = (request: 'PENDING' | 'NEEDS_ORGANISER' | null = null) => ({
    registrationId: 'reg-9',
    eventSlug: '2027',
    eventName: 'II SIEAmB',
    maskedEmail: 'a•••@outlook.com',
    createdAt: '2026-11-01T12:00:00.000Z',
    request,
  });

  it('asks "is it yours?" for a registration under another e-mail and sends the request on yes', async () => {
    let asked = false;
    const calls = stubApi({
      me: () => ({ body: account({ suggestions: [suggestion(asked ? 'PENDING' : null)] }) }),
      'link-request': () => {
        asked = true;
        return { status: 202, body: { ok: true, request: 'PENDING', maskedEmail: 'a•••@outlook.com' } };
      },
    });
    mount('/2027/minha-area', <MyAreaPage />, auth(LOGGED_IN));
    const card = await screen.findByTestId('suggestion-card');
    expect(card).toHaveTextContent('feita com o e-mail a•••@outlook.com. Ela é sua?');
    // A possible match is not "no registration": the form is not pushed while the question is open.
    expect(screen.queryByTestId('no-registration')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sim, é minha' }));
    expect(await screen.findByText(/Enviamos um link de confirmação para a•••@outlook.com/)).toBeInTheDocument();
    expect(calls.find((c) => c.url.endsWith('link-request'))).toMatchObject({
      authorization: 'Bearer access-token-1',
      body: { registrationId: 'reg-9', noAccess: false },
    });
  });

  it('sends the request to the organisers when the person cannot read that inbox', async () => {
    let asked = false;
    const calls = stubApi({
      me: () => ({ body: account({ suggestions: [suggestion(asked ? 'NEEDS_ORGANISER' : null)] }) }),
      'link-request': () => {
        asked = true;
        return { status: 202, body: { ok: true, request: 'NEEDS_ORGANISER' } };
      },
    });
    mount('/2027/minha-area', <MyAreaPage />, auth(LOGGED_IN));
    await userEvent.click(await screen.findByRole('button', { name: 'Não tenho mais acesso a esse e-mail' }));
    expect(await screen.findByText(/encaminhado à organização/)).toBeInTheDocument();
    expect(calls.find((c) => c.url.endsWith('link-request'))!.body).toEqual({ registrationId: 'reg-9', noAccess: true });
    expect(screen.queryByRole('button', { name: 'Sim, é minha' })).not.toBeInTheDocument();
  });

  it('saves the profile with a CPF, and then shows the document as locked', async () => {
    const saved = account({ user: { ...account().user, cpf: '52998224725', institution: 'UFCG', documentLocked: true } });
    const calls = stubApi({ me: { body: account() }, profile: { body: saved } });
    mount('/2027/minha-area', <MyAreaPage />, auth(LOGGED_IN));
    await userEvent.type(await screen.findByLabelText('Instituição'), 'UFCG');
    await userEvent.type(screen.getByLabelText('CPF'), '52998224725');
    expect(screen.getByLabelText('CPF')).toHaveValue('529.982.247-25');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(screen.getByLabelText('CPF')).toBeDisabled());
    // The confirmation must survive the form switching to the locked document (#212).
    expect(screen.getByText('Dados salvos.')).toBeInTheDocument();
    expect(screen.getByLabelText('CPF')).toHaveValue('529.982.247-25');
    expect(calls.find((c) => c.url.endsWith('profile'))).toMatchObject({
      method: 'PUT',
      authorization: 'Bearer access-token-1',
      body: { fullName: 'Maria Clara de Souza', institution: 'UFCG', cpf: '529.982.247-25' },
    });
  });

  it('shows why the profile was not saved', async () => {
    stubApi({ me: { body: account() }, profile: { status: 409, body: { error: 'document_in_use' } } });
    mount('/2027/minha-area', <MyAreaPage />, auth(LOGGED_IN));
    await userEvent.type(await screen.findByLabelText('CPF'), '52998224725');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/já está em outra conta/);
  });

  it('says the session ended when the server no longer accepts the token', async () => {
    stubApi({ me: { status: 401, body: { error: 'not_logged_in' } } });
    mount('/2027/minha-area', <MyAreaPage />, auth(LOGGED_IN));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sua sessão terminou. Entre de novo.');
  });

  it('logs out from the button', async () => {
    stubApi({ me: { body: account() } });
    const state = auth(LOGGED_IN);
    mount('/2027/minha-area', <MyAreaPage />, state);
    await userEvent.click(await screen.findByRole('button', { name: 'Sair' }));
    expect(state.signOut).toHaveBeenCalled();
  });
});

describe('RegistrationForm with accounts (#210)', () => {
  const enable = () => {
    vi.stubEnv('VITE_ACCOUNTS_ENABLED', 'true');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
  };

  const fill = async () => {
    await userEvent.type(await screen.findByLabelText(/Nome completo/), 'Maria Clara de Souza');
    await userEvent.type(screen.getByLabelText(/E-mail/), 'novo@gmail.com');
    await userEvent.type(screen.getByLabelText('CPF'), '52998224725');
    await userEvent.click(screen.getByRole('checkbox'));
  };

  it('stops with a message when the CPF already has a registration under another e-mail', async () => {
    enable();
    const calls = stubApi({ 'registration-check': { body: { duplicate: true, maskedEmail: 'a•••@outlook.com' } } });
    const onSuccess = vi.fn();
    mount('/2027/inscricoes/nova', <RegistrationForm onSuccess={onSuccess} />);
    await fill();
    await userEvent.click(screen.getByRole('button', { name: /Enviar inscrição/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('feita com o e-mail a•••@outlook.com');
    expect(onSuccess).not.toHaveBeenCalled();
    expect(calls[0]!.body).toEqual({ eventSlug: '2027', email: 'novo@gmail.com', cpf: '52998224725', country: 'BR' });
  });

  it('registers as usual when the check finds nothing, or fails', async () => {
    enable();
    stubApi({ 'registration-check': { status: 500, body: { error: 'server_error' } } });
    const onSuccess = vi.fn();
    mount('/2027/inscricoes/nova', <RegistrationForm onSuccess={onSuccess} />);
    await fill();
    await userEvent.click(screen.getByRole('button', { name: /Enviar inscrição/ }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onSuccess.mock.calls[0]![1]).toBe('novo@gmail.com');
  });

  it('does not ask the server at all where accounts are off', async () => {
    const calls = stubApi({});
    const onSuccess = vi.fn();
    mount('/2027/inscricoes/nova', <RegistrationForm onSuccess={onSuccess} />, auth({ enabled: false }));
    await fill();
    await userEvent.click(screen.getByRole('button', { name: /Enviar inscrição/ }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(calls).toEqual([]);
  });

  it('fills the form from the account and locks the e-mail when logged in', async () => {
    enable();
    stubApi({
      me: { body: account({ user: { ...account().user, cpf: '52998224725', institution: 'UFCG', documentLocked: true } }) },
    });
    mount('/2027/inscricoes/nova', <RegistrationForm onSuccess={vi.fn()} />, auth(LOGGED_IN));
    const email = await screen.findByLabelText(/E-mail/);
    await waitFor(() => expect(email).toHaveValue('maria@ufcg.edu.br'));
    expect(email).toHaveAttribute('readonly');
    expect(screen.getByLabelText(/Nome completo/)).toHaveValue('Maria Clara de Souza');
    expect(screen.getByLabelText('CPF')).toHaveValue('529.982.247-25');
    expect(screen.getByLabelText('Instituição')).toHaveValue('UFCG');
    expect(screen.getByText('A inscrição usa o e-mail da sua conta.')).toBeInTheDocument();
  });
});
