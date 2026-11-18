import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RegistrationForm } from '../../components/registration/RegistrationForm';
import { TopBar } from '../../components/layout/TopBar';
import { AuthContext, type AuthState } from '../../contexts/AuthContext';
import { EventProvider } from '../../contexts/EventContext';
import { saveProfile, type Account } from '../../services/account';
import { LinkPage } from './LinkPage';
import { LoginPage, safeNext } from './LoginPage';
import { MyAreaPage } from './MyAreaPage';
import { PasswordPage } from './PasswordPage';
import { rememberNext, takeNext } from './nextPage';
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
function stubApi(
  answers: Record<string, { status?: number; body: unknown } | (() => { status?: number; body: unknown } | Promise<{ status?: number; body: unknown }>)>,
) {
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
      const answer = typeof entry === 'function' ? await entry() : entry;
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
  localStorage.clear();
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
    expect(screen.queryByRole('link', { name: 'Entrar ou criar conta' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('topbar-account')).not.toBeInTheDocument();
  });
});

/** The account answer waits until the test gives it; every other call is answered "not found" at once. */
function slowAccount() {
  let give: (response: Response) => void = () => undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) =>
      input.endsWith('/account/me')
        ? new Promise<Response>((resolve) => (give = resolve))
        : Promise.resolve(new Response(JSON.stringify({ error: 'not_found' }), { status: 404 })),
    ),
  );
  return (body: Account) => give(new Response(JSON.stringify(body), { status: 200 }));
}

describe('top bar', () => {
  const list = () => within(screen.getByRole('navigation', { name: 'Sua conta' })).queryByRole('list');
  const openMenu = async () => {
    await userEvent.click(await screen.findByTestId('account-menu'));
    return within(list()!);
  };

  it('keeps the first line as it was: dates, editions and languages; the account has a line of its own (#311)', async () => {
    stubApi({ me: { body: account() } });
    const view = mount('/2027/', <TopBar />, auth(LOGGED_IN));
    await screen.findByTestId('account-menu');
    const first = within(view.container.querySelector<HTMLElement>('.topbar__inner')!);
    expect(first.getByText(/2027/)).toBeInTheDocument();
    expect(first.getByRole('link', { name: 'Edições Anteriores' })).toBeInTheDocument();
    expect(first.getAllByRole('button')).toHaveLength(4);
    expect(first.queryByTestId('account-menu')).not.toBeInTheDocument();
    expect(first.queryByTestId('bell')).not.toBeInTheDocument();
    // Second line: the bell, then the name.
    const second = screen.getByTestId('topbar-account');
    expect(Array.from(second.children).map((el) => el.getAttribute('data-testid') ?? el.className)).toEqual(['bell', 'account-menu']);
  });

  it('offers Entrar when logged out, and the first name with a list of the person\'s pages when logged in', async () => {
    const { unmount } = mount('/2027/', <TopBar />);
    const login = await screen.findByRole('link', { name: 'Entrar ou criar conta' });
    expect(login).toHaveAttribute('href', '/2027/conta/entrar');
    expect(screen.getByTestId('topbar-account')).toContainElement(login);
    expect(screen.queryByTestId('account-menu')).not.toBeInTheDocument();
    unmount();
    stubApi({ me: { body: account() } });
    mount('/2027/', <TopBar />, auth(LOGGED_IN));
    const button = await screen.findByRole('button', { name: 'Maria' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    // Closed: the list is hidden from everyone, screen readers included, and the button points at it.
    expect(list()).not.toBeInTheDocument();
    expect(document.getElementById(button.getAttribute('aria-controls')!)).not.toBeVisible();
    const items = await openMenu();
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(button.getAttribute('aria-controls')!)).toBe(list());
    expect(items.getByRole('link', { name: 'Minha área' })).toHaveAttribute('href', '/2027/minha-area');
    expect(items.getByRole('link', { name: 'Meus trabalhos' })).toHaveAttribute('href', '/2027/meus-trabalhos');
    expect(items.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Minha área', 'Meus trabalhos', 'Sair']);
    // A list of links, not an application menu: no menu roles that would promise arrow keys.
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });

  it('skips a title in the name; "Minha conta" only when the account cannot be read, and never the e-mail', async () => {
    stubApi({ me: { body: account({ user: { ...account().user, fullName: 'Profa. Viviane Farias' } }) } });
    const first = mount('/2027/', <TopBar />, auth(LOGGED_IN));
    expect(await screen.findByRole('button', { name: 'Viviane' })).toBeInTheDocument();
    first.unmount();
    stubApi({ me: { status: 500, body: { error: 'server_error' } } });
    mount('/2027/', <TopBar />, auth(LOGGED_IN));
    expect(await screen.findByRole('button', { name: 'Minha conta' })).toBeInTheDocument();
    expect(screen.getByTestId('topbar-account')).not.toHaveTextContent('@');
  });

  it('says "Carregando…" while the session is read and while the account is read, with nothing to press meanwhile (#319)', async () => {
    // The session is not known yet: neither Entrar nor a name, and the line is already there.
    const early = mount('/2027/', <TopBar />, auth({ loading: true }));
    expect(await screen.findByTestId('topbar-waiting')).toHaveTextContent('Carregando…');
    expect(screen.getByTestId('topbar-account')).toContainElement(screen.getByTestId('topbar-waiting'));
    expect(screen.queryByRole('link', { name: 'Entrar ou criar conta' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-menu')).not.toBeInTheDocument();
    early.unmount();

    // Logged in, the account still on its way.
    const answer = slowAccount();
    mount('/2027/', <TopBar />, auth(LOGGED_IN));
    expect(await screen.findByTestId('topbar-waiting')).toHaveTextContent('Carregando…');
    expect(screen.queryByTestId('account-menu')).not.toBeInTheDocument();
    expect(screen.queryByText('Minha conta')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bell')).not.toBeInTheDocument();
    answer(account({ panels: { platformAdmin: false, slugs: ['2027'] } }));
    // The list is complete from the first time it can be opened: the panel is already in it.
    const items = await openMenu();
    expect(screen.queryByTestId('topbar-waiting')).not.toBeInTheDocument();
    expect(items.getByTestId('topbar-panel')).toBeInTheDocument();
  });

  it('keeps the name and the list when the session is renewed, and forgets them when someone else logs in (#319)', async () => {
    stubApi({ me: { body: account({ panels: { platformAdmin: false, slugs: ['2027'] } }) } });
    const tree = (state: AuthState) => (
      <AuthContext.Provider value={state}>
        <MemoryRouter initialEntries={['/2027/']}>
          <Routes>
            <Route path="/:eventSlug/*" element={<EventProvider><TopBar /></EventProvider>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );
    const view = render(tree(auth(LOGGED_IN)));
    await screen.findByRole('button', { name: 'Maria' });
    // A renewed session: same person, new token, and the answer is slow.
    const answer = slowAccount();
    view.rerender(tree(auth({ ...LOGGED_IN, accessToken: 'access-token-2' })));
    expect(screen.getByRole('button', { name: 'Maria' })).toBeInTheDocument();
    expect(screen.queryByTestId('topbar-waiting')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('account-menu'));
    expect(screen.getByTestId('topbar-panel')).toBeInTheDocument();
    answer(account({ user: { ...account().user, fullName: 'Mariana Souza' } }));
    expect(await screen.findByRole('button', { name: 'Mariana' })).toBeInTheDocument();
    // Someone else: nothing of the previous person stays on screen while theirs is read.
    slowAccount();
    view.rerender(tree(auth({ email: 'outra@ufcg.edu.br', accessToken: 'access-token-3' })));
    expect(await screen.findByTestId('topbar-waiting')).toBeInTheDocument();
    expect(screen.queryByText('Mariana')).not.toBeInTheDocument();
  });

  it('shows a name changed in Minha área at once, without a reload (#313)', async () => {
    const calls = stubApi({
      me: { body: account() },
      profile: { body: account({ user: { ...account().user, fullName: 'Profa. Beatriz Lima' } }) },
    });
    mount('/2027/', <TopBar />, auth(LOGGED_IN));
    await screen.findByRole('button', { name: 'Maria' });
    await act(async () => {
      await saveProfile('access-token-1', { fullName: 'Profa. Beatriz Lima' });
    });
    expect(screen.getByRole('button', { name: 'Beatriz' })).toBeInTheDocument();
    expect(calls.filter((c) => c.url === '/api/v1/account/me')).toHaveLength(1);
  });

  it('a failed save changes nothing in the bar', async () => {
    stubApi({ me: { body: account() }, profile: { status: 400, body: { error: 'invalid_name' } } });
    mount('/2027/', <TopBar />, auth(LOGGED_IN));
    await screen.findByRole('button', { name: 'Maria' });
    await act(async () => {
      await saveProfile('access-token-1', { fullName: 'x' }).catch(() => undefined);
    });
    expect(screen.getByRole('button', { name: 'Maria' })).toBeInTheDocument();
  });

  it('from the archive of an older edition, the account links lead to the current one (#314)', async () => {
    const out = mount('/2025/', <TopBar />);
    expect(await screen.findByRole('link', { name: 'Entrar ou criar conta' })).toHaveAttribute('href', '/2027/conta/entrar');
    out.unmount();
    stubApi({ me: { body: account({ panels: { platformAdmin: false, slugs: ['2027'], reviewing: ['2027'] } }) } });
    mount('/2025/', <TopBar />, auth(LOGGED_IN));
    const items = await openMenu();
    expect(items.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '/2027/minha-area',
      '/2027/meus-trabalhos',
      '/2027/avaliacoes',
      '/2027/painel',
    ]);
    expect(screen.getByTestId('bell')).toHaveAttribute('href', '/2027/notificacoes');
  });

  it.each([
    ['a reviewer of this edition', { platformAdmin: false, slugs: [], reviewing: ['2027'] }, true],
    ['a reviewer of another edition only', { platformAdmin: false, slugs: [], reviewing: ['2029'] }, false],
    ['an organiser who does not review', { platformAdmin: false, slugs: ['2027'], reviewing: [] }, false],
    ['an answer from before the server said it', { platformAdmin: false, slugs: [] }, false],
  ])('offers the papers to review to %s: %j (#315)', async (_name, panels, shown) => {
    stubApi({ me: { body: account({ panels }) } });
    mount('/2027/', <TopBar />, auth(LOGGED_IN));
    const items = await openMenu();
    if (shown) {
      expect(items.getByTestId('topbar-reviewing')).toHaveAttribute('href', '/2027/avaliacoes');
      expect(items.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Minha área', 'Meus trabalhos', 'Trabalhos para avaliar', 'Sair']);
    } else {
      expect(items.queryByTestId('topbar-reviewing')).not.toBeInTheDocument();
    }
  });

  it('closes with Escape (focus back on the name), a press elsewhere, focus leaving, and the button again', async () => {
    stubApi({ me: { body: account() } });
    mount(
      '/2027/',
      <>
        <TopBar />
        <button type="button">fora</button>
      </>,
      auth(LOGGED_IN),
    );
    const items = await openMenu();
    items.getByRole('link', { name: 'Minha área' }).focus();
    await userEvent.keyboard('{Escape}');
    expect(list()).not.toBeInTheDocument();
    expect(screen.getByTestId('account-menu')).toHaveFocus();

    await openMenu();
    await userEvent.click(document.body);
    expect(list()).not.toBeInTheDocument();

    // With the keyboard: Tab goes through the items in order, and past the last one it closes.
    await openMenu();
    await userEvent.tab();
    expect(screen.getByRole('link', { name: 'Minha área' })).toHaveFocus();
    await userEvent.tab();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Sair' })).toHaveFocus();
    expect(list()).toBeInTheDocument();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'fora' })).toHaveFocus();
    expect(list()).not.toBeInTheDocument();

    await openMenu();
    await userEvent.click(screen.getByTestId('account-menu'));
    expect(list()).not.toBeInTheDocument();
    // Escape with the list closed does nothing, and takes no focus.
    screen.getByRole('button', { name: 'fora' }).focus();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'fora' })).toHaveFocus();
  });

  it.each([
    ['an organiser or administrator of this edition', { platformAdmin: false, slugs: ['2027'] }, true],
    ['the platform owner', { platformAdmin: true, slugs: [] }, true],
    ['someone with a role in another edition only', { platformAdmin: false, slugs: ['2025'] }, false],
    ['someone with no role', { platformAdmin: false, slugs: [] }, false],
  ])('has the panel in the list for %s: %j (#252)', async (_name, panels, shown) => {
    const calls = stubApi({ me: { body: account({ panels }) } });
    mount('/2027/', <TopBar />, auth(LOGGED_IN));
    await screen.findByRole('button', { name: 'Maria' });
    expect(calls.some((c) => c.url === '/api/v1/account/me')).toBe(true);
    const items = await openMenu();
    if (shown) {
      const link = items.getByTestId('topbar-panel');
      expect(link).toHaveTextContent('Painel da organização');
      expect(link).toHaveAttribute('href', '/2027/painel');
      expect(items.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Minha área', 'Meus trabalhos', 'Painel da organização', 'Sair']);
    } else {
      expect(items.queryByTestId('topbar-panel')).not.toBeInTheDocument();
    }
  });

  it('closes when a link is chosen, even the one of the page already open (#326)', async () => {
    stubApi({ me: { body: account() } });
    // The top bar sits on Minha área itself: choosing it changes no address.
    mount('/2027/minha-area', <TopBar />, auth(LOGGED_IN));
    const items = await openMenu();
    await userEvent.click(items.getByRole('link', { name: 'Minha área' }));
    expect(list()).not.toBeInTheDocument();
    expect(screen.getByTestId('account-menu')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('where')).not.toBeInTheDocument();
    // A press on the list that is not on a link (its padding, the line above Sair) leaves it open.
    await openMenu();
    await userEvent.click(list()!);
    expect(list()).toBeInTheDocument();
  });

  it('logs out from the list, and has no Sair when logged out (#253)', async () => {
    stubApi({ me: { body: account() } });
    const out = mount('/2027/', <TopBar />);
    await screen.findByRole('link', { name: 'Entrar ou criar conta' });
    expect(screen.queryByText('Sair')).not.toBeInTheDocument();
    out.unmount();
    const state = auth(LOGGED_IN);
    mount('/2027/', <TopBar />, state);
    const items = await openMenu();
    await userEvent.click(items.getByRole('button', { name: 'Sair' }));
    expect(state.signOut).toHaveBeenCalledTimes(1);
    expect(list()).not.toBeInTheDocument();
  });

  it('asks the server nothing when logged out', async () => {
    const calls = stubApi({});
    mount('/2027/', <TopBar />);
    await screen.findByRole('link', { name: 'Entrar ou criar conta' });
    expect(calls.filter((c) => c.url.includes('/account/me'))).toEqual([]);
  });
});

describe('LoginPage', () => {
  it('shows and hides the password without losing what was typed, and still sends it', async () => {
    const state = auth();
    mount('/2027/conta/entrar', <LoginPage />, state);
    const field = await screen.findByLabelText('Senha');
    expect(field).toHaveAttribute('type', 'password');
    await userEvent.type(field, 'uma-senha-longa');
    const show = screen.getByRole('button', { name: 'Mostrar a senha' });
    expect(show).toHaveAttribute('type', 'button');
    expect(show).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(show);
    expect(field).toHaveAttribute('type', 'text');
    expect(field).toHaveValue('uma-senha-longa');
    // The eye never sends the form: only the log-in button does.
    expect(state.signIn).not.toHaveBeenCalled();
    const hide = screen.getByRole('button', { name: 'Ocultar a senha' });
    expect(hide).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(hide);
    expect(field).toHaveAttribute('type', 'password');
    await userEvent.type(screen.getByLabelText('E-mail'), 'maria@ufcg.edu.br');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(state.signIn).toHaveBeenCalledWith('maria@ufcg.edu.br', 'uma-senha-longa');
  });

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

  it('hands the page that asked for the login on to "Criar conta", and remembers it for the e-mail link (#246)', async () => {
    mount('/2027/conta/entrar?next=%2F2027%2Fmeus-trabalhos%2Fnovo', <LoginPage />);
    expect(await screen.findByRole('link', { name: 'Criar conta' })).toHaveAttribute(
      'href',
      '/2027/conta/criar?next=%2F2027%2Fmeus-trabalhos%2Fnovo',
    );
    expect(takeNext('/2027/minha-area')).toBe('/2027/meus-trabalhos/novo');
    // Read once, then forgotten.
    expect(takeNext('/2027/minha-area')).toBe('/2027/minha-area');
  });

  it('remembers nothing without a next, nor one that leaves the site, nor one older than a day', async () => {
    const plain = mount('/2027/conta/entrar', <LoginPage />);
    await screen.findByRole('link', { name: 'Criar conta' });
    expect(screen.getByRole('link', { name: 'Criar conta' })).toHaveAttribute('href', '/2027/conta/criar');
    expect(takeNext('/fallback')).toBe('/fallback');
    plain.unmount();
    for (const evil of ['//evil.example', 'https://evil.example', 'javascript:alert(1)']) {
      rememberNext(evil);
      expect(takeNext('/fallback'), evil).toBe('/fallback');
    }
    localStorage.setItem('sieamb-next', JSON.stringify({ next: '//evil.example/x', at: Date.now() }));
    expect(takeNext('/fallback')).toBe('/fallback');
    localStorage.setItem('sieamb-next', JSON.stringify({ next: '/2027/meus-trabalhos/novo', at: Date.now() - 25 * 60 * 60 * 1000 }));
    expect(takeNext('/fallback')).toBe('/fallback');
    localStorage.setItem('sieamb-next', 'not json');
    expect(takeNext('/fallback')).toBe('/fallback');
  });

  it('logging in forgets a page remembered for someone else’s sign-up', async () => {
    rememberNext('/2027/meus-trabalhos/novo');
    mount('/2027/conta/entrar', <LoginPage />, auth(LOGGED_IN));
    expect(await screen.findByTestId('where')).toHaveTextContent('/2027/minha-area');
    expect(takeNext('/fallback')).toBe('/fallback');
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

  it('tells the server where the person was going, so the e-mail link leads on there (#246)', async () => {
    const calls = stubApi({ signup: { status: 202, body: { ok: true } } });
    mount('/2027/conta/criar?next=%2F2027%2Fmeus-trabalhos%2Fnovo', <SignupPage mode="signup" />);
    await userEvent.type(await screen.findByLabelText('Nome completo'), 'Maria Clara');
    await userEvent.type(screen.getByLabelText('E-mail'), 'maria@ufcg.edu.br');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link de confirmação' }));
    await screen.findByRole('heading', { name: 'Confira seu e-mail' });
    expect(calls[0]!.body).toEqual({ email: 'maria@ufcg.edu.br', fullName: 'Maria Clara', locale: 'pt-BR', eventSlug: '2027', next: '/2027/meus-trabalhos/novo' });
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

  it('shows each of the two passwords on its own', async () => {
    stubApi({ password: { body: { ok: true } } });
    open(auth(LOGGED_IN));
    const first = await screen.findByLabelText('Nova senha');
    const second = screen.getByLabelText('Repita a senha');
    const eyes = screen.getAllByRole('button', { name: 'Mostrar a senha' });
    expect(eyes).toHaveLength(2);
    await userEvent.click(eyes[1]!);
    expect(first).toHaveAttribute('type', 'password');
    expect(second).toHaveAttribute('type', 'text');
    expect(first).toHaveAttribute('autocomplete', 'new-password');
    expect(second).toHaveAttribute('autocomplete', 'new-password');
  });

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

  it('goes on to the page the person was heading to when they had to create the account (#246)', async () => {
    stubApi({ password: { body: { ok: true } } });
    rememberNext('/2027/meus-trabalhos/novo');
    open(auth(LOGGED_IN));
    await userEvent.type(await screen.findByLabelText('Nova senha'), 'uma-senha-bem-longa');
    await userEvent.type(screen.getByLabelText('Repita a senha'), 'uma-senha-bem-longa');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar senha' }));
    expect(await screen.findByTestId('where')).toHaveTextContent('/2027/meus-trabalhos/novo');
  });

  it('follows the page named in the e-mail link, in a browser that remembers nothing, and never one outside the site', async () => {
    stubApi({ password: { body: { ok: true } } });
    const fill = async () => {
      await userEvent.type(await screen.findByLabelText('Nova senha'), 'uma-senha-bem-longa');
      await userEvent.type(screen.getByLabelText('Repita a senha'), 'uma-senha-bem-longa');
      await userEvent.click(screen.getByRole('button', { name: 'Salvar senha' }));
    };
    const good = mount('/2027/conta/confirmar?token_hash=abc123&type=signup&next=%2F2027%2Fmeus-trabalhos%2Fnovo', <PasswordPage type="signup" />, auth(LOGGED_IN));
    await fill();
    expect(await screen.findByTestId('where')).toHaveTextContent('/2027/meus-trabalhos/novo');
    good.unmount();
    mount('/2027/conta/confirmar?token_hash=abc123&type=signup&next=%2F%2Fevil.example', <PasswordPage type="signup" />, auth(LOGGED_IN));
    await fill();
    expect(await screen.findByTestId('where')).toHaveTextContent('/2027/minha-area');
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
    // Meanwhile the page is not blank: its title and "Carregando…" (#324).
    expect(screen.getByRole('heading', { level: 1, name: 'Minha área' })).toBeInTheDocument();
    expect(screen.getByTestId('loading')).toHaveTextContent('Carregando…');
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

  it('opens with the papers: send a new one, or see them (#246)', async () => {
    const calls = stubApi({ me: { body: account() }, 'rules?eventSlug=2027': { body: { state: 'open', opensAt: '', closesAt: '' } } });
    mount('/2027/minha-area', <MyAreaPage />, auth(LOGGED_IN));
    const papers = await screen.findByTestId('area-papers');
    expect(within(papers).getByRole('link', { name: 'Enviar novo trabalho' })).toHaveAttribute('href', '/2027/meus-trabalhos/novo');
    expect(within(papers).getByRole('link', { name: 'Meus trabalhos' })).toHaveAttribute('href', '/2027/meus-trabalhos');
    // In page order: papers, the person's data, and only then the reminder that they are not registered.
    const order = ['area-papers', 'no-registration'].map((id) => screen.getByTestId(id));
    const profile = screen.getByRole('heading', { name: 'Meus dados' });
    expect(order[0]!.compareDocumentPosition(profile) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(profile.compareDocumentPosition(order[1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(calls.some((c) => c.url === '/api/v1/submissions/rules?eventSlug=2027')).toBe(true);
  });

  it('keeps an existing registration, with its pay link, above the person’s data', async () => {
    stubApi({ me: { body: account({ registrations: [registration()] }) } });
    mount('/2027/minha-area', <MyAreaPage />, auth(LOGGED_IN));
    const card = await screen.findByTestId('registration-card');
    const profile = screen.getByRole('heading', { name: 'Meus dados' });
    expect(screen.getByTestId('area-papers').compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.compareDocumentPosition(profile) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole('heading', { name: 'Minha inscrição' })).toHaveLength(1);
  });

  it.each(['closed', 'not_open'])('does not offer to send a paper while submissions are %s', async (state) => {
    stubApi({ me: { body: account() }, 'rules?eventSlug=2027': { body: { state, opensAt: '', closesAt: '' } } });
    mount('/2027/minha-area', <MyAreaPage />, auth(LOGGED_IN));
    const papers = await screen.findByTestId('area-papers');
    await waitFor(() => expect(within(papers).queryByRole('link', { name: 'Enviar novo trabalho' })).not.toBeInTheDocument());
    expect(within(papers).getByRole('link', { name: 'Meus trabalhos' })).toBeInTheDocument();
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

  it('says "Processando…" on the card and the form while their request is on its way (#291)', async () => {
    let releaseLink!: () => void;
    const linkGate = new Promise<void>((r) => (releaseLink = r));
    let releaseSave!: () => void;
    const saveGate = new Promise<void>((r) => (releaseSave = r));
    stubApi({
      me: { body: account({ suggestions: [suggestion(null)] }) },
      'link-request': async () => {
        await linkGate;
        return { status: 202, body: { ok: true, request: 'PENDING', maskedEmail: 'a•••@outlook.com' } };
      },
      profile: async () => {
        await saveGate;
        return { body: account() };
      },
    });
    mount('/2027/minha-area', <MyAreaPage />, auth(LOGGED_IN));
    const card = await screen.findByTestId('suggestion-card');
    await userEvent.click(within(card).getByRole('button', { name: 'Sim, é minha' }));
    expect(await within(card).findByTestId('processing')).toHaveTextContent('Processando…');
    expect(within(card).getByRole('button', { name: 'Sim, é minha' })).toBeDisabled();
    expect(within(card).getByRole('button', { name: 'Não tenho mais acesso a esse e-mail' })).toBeDisabled();
    releaseLink();
    await waitFor(() => expect(within(card).queryByTestId('processing')).not.toBeInTheDocument());

    await userEvent.type(screen.getByLabelText('Instituição'), 'UFCG');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    const form = screen.getByRole('button', { name: 'Salvar' }).closest('form')!;
    expect(await within(form).findByTestId('processing')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    releaseSave();
    await waitFor(() => expect(screen.queryByTestId('processing')).not.toBeInTheDocument());
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

  it('cannot be sent while the session is still being read (#324)', async () => {
    enable();
    stubApi({});
    const view = mount('/2027/inscricoes/nova', <RegistrationForm onSuccess={vi.fn()} />, auth({ loading: true }));
    expect(await screen.findByRole('button', { name: 'Enviar inscrição' })).toBeDisabled();
    view.unmount();
    mount('/2027/inscricoes/nova', <RegistrationForm onSuccess={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'Enviar inscrição' })).toBeEnabled();
  });

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

  it('locks the e-mail to the account at once, keeps what was typed, and registers with the account e-mail (#290)', async () => {
    enable();
    // The account's data never arrives: the e-mail must still be the account's.
    stubApi({ me: { status: 500, body: { error: 'server_error' } }, 'registration-check': { body: { duplicate: false } } });
    const onSuccess = vi.fn();
    mount('/2027/inscricoes/nova', <RegistrationForm onSuccess={onSuccess} />, auth({ email: 'Maria@UFCG.edu.br', accessToken: 'access-token-1' }));
    const email = (await screen.findByLabelText(/E-mail/)) as HTMLInputElement;
    expect(email).toHaveValue('maria@ufcg.edu.br');
    expect(email).toHaveAttribute('readonly');
    await userEvent.type(screen.getByLabelText(/Nome completo/), 'Maria Clara de Souza');
    await userEvent.type(email, 'outro@gmail.com');
    expect(email).toHaveValue('maria@ufcg.edu.br');
    await userEvent.type(screen.getByLabelText('CPF'), '52998224725');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: /Enviar inscrição/ }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onSuccess.mock.calls[0]![1]).toBe('maria@ufcg.edu.br');
  });

  it('fills empty fields from the account and never overwrites what was typed (#290)', async () => {
    enable();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        if (String(input).includes('/account/me')) {
          await gate;
          return new Response(JSON.stringify({ user: { email: 'maria@ufcg.edu.br', fullName: 'Maria da Conta', cpf: '52998224725', passport: null, country: 'BR', institution: 'UFCG' }, registrations: [] }), { status: 200 });
        }
        return new Response('{}', { status: 404 });
      }),
    );
    mount('/2027/inscricoes/nova', <RegistrationForm onSuccess={vi.fn()} />, auth(LOGGED_IN));
    await userEvent.type(await screen.findByLabelText(/Nome completo/), 'Nome Digitado');
    // Not sendable until the account's data has arrived.
    expect(screen.getByRole('button', { name: /Enviar inscrição/ })).toBeDisabled();
    release();
    await waitFor(() => expect(screen.getByRole('button', { name: /Enviar inscrição/ })).toBeEnabled());
    await waitFor(() => expect(screen.getByLabelText('Instituição')).toHaveValue('UFCG'));
    expect(screen.getByLabelText(/Nome completo/)).toHaveValue('Nome Digitado');
    expect(screen.getByLabelText('CPF')).toHaveValue('529.982.247-25');
    expect(screen.getByLabelText(/E-mail/)).toHaveValue('maria@ufcg.edu.br');
  });

  it('keeps the e-mail locked while the session is still being read', async () => {
    enable();
    stubApi({});
    mount('/2027/inscricoes/nova', <RegistrationForm onSuccess={vi.fn()} />, auth({ loading: true }));
    expect(await screen.findByLabelText(/E-mail/)).toHaveAttribute('readonly');
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
