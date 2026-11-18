import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationsBell } from '../../components/layout/NotificationsBell';
import { AuthContext, type AuthState } from '../../contexts/AuthContext';
import { EventProvider } from '../../contexts/EventContext';
import type { SiteNotification } from '../../services/account';
import { PanelPage } from '../panel/PanelPage';
import { NotificationsPage, noticeLink } from './NotificationsPage';

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

const notice = (over: Partial<SiteNotification> = {}): SiteNotification => ({
  id: 'n1',
  kind: 'submission.received',
  data: { number: 12, title: 'Governança da água', mainAuthor: 'Maria Souza' },
  eventSlug: '2027',
  readAt: null,
  createdAt: '2026-12-01T15:00:00.000Z',
  ...over,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('bell', () => {
  it('shows nothing to a logged-out visitor and asks the server nothing', async () => {
    const calls = stubApi({});
    mount('/2027/', <NotificationsBell slug="2027" />, auth({ accessToken: null }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByTestId('bell')).not.toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it('shows the number of unread notices and leads to the notifications', async () => {
    const calls = stubApi({ notifications: { body: { unread: 3, items: [] } } });
    mount('/2027/', <NotificationsBell slug="2027" />);
    const bell = await screen.findByRole('link', { name: 'Notificações: 3 não lidas' });
    expect(bell).toHaveAttribute('href', '/2027/notificacoes');
    expect(bell).toHaveTextContent('3');
    expect(calls[0]).toMatchObject({ url: '/api/v1/account/notifications', authorization: 'Bearer access-token-1' });
  });

  it('says "1 não lida" for one, caps at 99+, and shows no number when all are read', async () => {
    stubApi({ notifications: { body: { unread: 1, items: [] } } });
    const one = mount('/2027/', <NotificationsBell slug="2027" />);
    expect(await screen.findByRole('link', { name: 'Notificações: 1 não lida' })).toBeInTheDocument();
    one.unmount();
    stubApi({ notifications: { body: { unread: 100, items: [] } } });
    const many = mount('/2027/', <NotificationsBell slug="2027" />);
    await waitFor(() => expect(screen.getByTestId('bell')).toHaveTextContent('99+'));
    many.unmount();
    stubApi({ notifications: { body: { unread: 0, items: [] } } });
    mount('/2027/', <NotificationsBell slug="2027" />);
    expect(await screen.findByRole('link', { name: 'Notificações' })).not.toHaveTextContent(/\d/);
  });

  it('stays quiet when the server cannot be reached', async () => {
    stubApi({ notifications: { status: 500, body: { error: 'server_error' } } });
    mount('/2027/', <NotificationsBell slug="2027" />);
    expect(await screen.findByRole('link', { name: 'Notificações' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('NotificationsPage', () => {
  it('asks a logged-out visitor to log in', async () => {
    mount('/2027/notificacoes', <NotificationsPage />, auth({ accessToken: null }));
    expect(await screen.findByTestId('where')).toHaveTextContent('/2027/conta/entrar?next=%2F2027%2Fnotificacoes');
  });

  it('says so when there is nothing, and marks nothing as read', async () => {
    const calls = stubApi({ notifications: { body: { unread: 0, items: [] } } });
    mount('/2027/notificacoes', <NotificationsPage />);
    expect(await screen.findByTestId('no-notifications')).toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith('notifications-read'))).toBe(false);
  });

  it('writes each kind of notice in the site’s language, with where it leads', async () => {
    stubApi({
      notifications: {
        body: {
          unread: 2,
          items: [
            notice(),
            notice({ id: 'n2', kind: 'organiser.registration.new', data: { fullName: 'Paula Nunes' } }),
            notice({ id: 'n3', kind: 'member.added', data: { role: 'ORGANIZER' }, readAt: '2026-12-01T16:00:00.000Z' }),
            notice({ id: 'n4', kind: 'organiser.submission.withdrawn', readAt: '2026-12-01T16:00:00.000Z' }),
            notice({ id: 'n5', kind: 'something.from.the.future', data: {}, readAt: '2026-12-01T16:00:00.000Z' }),
          ],
        },
      },
      'notifications-read': { body: { ok: true } },
    });
    mount('/2027/notificacoes', <NotificationsPage />);
    const cards = await screen.findAllByTestId('notification');
    expect(cards[0]).toHaveTextContent('O trabalho nº 12, "Governança da água", foi recebido.');
    expect(within(cards[0]!).getByRole('link', { name: 'Abrir' })).toHaveAttribute('href', '/2027/meus-trabalhos');
    expect(cards[0]).toHaveAttribute('data-unread', 'true');
    expect(cards[1]).toHaveTextContent('Nova inscrição: Paula Nunes.');
    expect(within(cards[1]!).getByRole('link', { name: 'Abrir' })).toHaveAttribute('href', '/2027/painel');
    expect(cards[2]).toHaveTextContent('Você recebeu o papel de Organizador.');
    expect(cards[2]).not.toHaveAttribute('data-unread');
    expect(cards[3]).toHaveTextContent('foi retirado por Maria Souza.');
    expect(within(cards[3]!).getByRole('link', { name: 'Abrir' })).toHaveAttribute('href', '/2027/painel/trabalhos');
    // A kind this version does not know still reads as a sentence.
    expect(cards[4]).toHaveTextContent('Há uma novidade para você.');
    expect(within(cards[4]!).queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows an announcement with its subject and paragraphs, as text', async () => {
    stubApi({
      notifications: { body: { unread: 1, items: [notice({ kind: 'announcement', data: { subject: 'Prazo <b>prorrogado</b>', body: 'Primeiro parágrafo.\n\nSegundo parágrafo.' } })] } },
      'notifications-read': { body: { ok: true } },
    });
    mount('/2027/notificacoes', <NotificationsPage />);
    const card = await screen.findByTestId('notification');
    expect(within(card).getByRole('heading', { name: 'Prazo <b>prorrogado</b>' })).toBeInTheDocument();
    expect(card.querySelectorAll('p')).toHaveLength(3);
    expect(card.querySelector('b')).toBeNull();
  });

  it('marks them as read once shown, and keeps the "nova" mark for this visit', async () => {
    const calls = stubApi({ notifications: { body: { unread: 1, items: [notice()] } }, 'notifications-read': { body: { ok: true } } });
    mount('/2027/notificacoes', <NotificationsPage />);
    expect(await screen.findByTestId('notification')).toHaveTextContent('nova');
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('notifications-read'))).toBe(true));
    expect(calls.find((c) => c.url.endsWith('notifications-read'))).toMatchObject({ method: 'POST', authorization: 'Bearer access-token-1' });
  });

  it('leads nowhere for a notice with no edition', () => {
    expect(noticeLink(notice({ eventSlug: null }))).toBeNull();
    expect(noticeLink(notice({ kind: 'link.approved' }))).toBe('/2027/minha-area');
    expect(noticeLink(notice({ kind: 'review.assigned' }))).toBe('/2027/avaliacoes');
    expect(noticeLink(notice({ kind: 'review.unassigned' }))).toBe('/2027/avaliacoes');
    expect(noticeLink(notice({ kind: 'announcement' }))).toBeNull();
  });
});

describe('announcements tab', () => {
  const members = { body: { role: 'ORGANIZER', canManage: ['REVIEWER'], members: [], invites: [] } };
  const audiences = { body: { counts: { all: 5, registered: 3, authors: 2, reviewers: 0, organisers: 1 } } };
  const open = () => mount('/2027/painel/comunicados', <PanelPage tab="announcements" />);

  it('says how many people each group has, and asks for a confirmation with that number before sending', async () => {
    let sent = false;
    const calls = stubApi({
      members,
      audiences,
      announcements: () => ({
        body: { announcements: sent ? [{ id: 'a1', audience: 'authors', subject: 'Prazo prorrogado', body: 'Novo prazo.\n\nAté 15/02.', recipients: 2, senderName: 'Viviane Farias', createdAt: '2026-12-01T15:00:00.000Z' }] : [] },
      }),
      announce: () => {
        sent = true;
        return { status: 201, body: { ok: true, recipients: 2, sentNow: 1, waiting: 1 } };
      },
    });
    open();
    const select = await screen.findByLabelText('Quem recebe');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Todos (5)',
      'Só os inscritos (3)',
      'Só os autores (2)',
      'Só os avaliadores (0)',
      'Só os organizadores (1)',
    ]);
    expect(screen.getByTestId('no-announcements')).toBeInTheDocument();
    await userEvent.selectOptions(select, 'authors');
    await userEvent.type(screen.getByLabelText('Assunto'), 'Prazo prorrogado');
    await userEvent.type(screen.getByLabelText('Mensagem'), 'Novo prazo.');
    await userEvent.click(screen.getByRole('button', { name: 'Revisar e enviar' }));
    // Nothing has been sent yet.
    expect(calls.some((c) => c.url.endsWith('announce'))).toBe(false);
    expect(screen.getByRole('alert')).toHaveTextContent('Este comunicado vai para 2 pessoas (Só os autores)');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar para 2 pessoas' }));
    // How many left now, and how many are still queued (#281).
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Comunicado registrado para 2 pessoas. 1 e-mail(s) enviado(s) agora. 1 ainda na fila: saem na próxima passada do sistema, o que pode levar algumas horas.',
    );
    expect(calls.find((c) => c.url.endsWith('announce'))!.body).toEqual({ eventSlug: '2027', audience: 'authors', subject: 'Prazo prorrogado', body: 'Novo prazo.' });
    const card = await screen.findByTestId('announcement-card');
    expect(card).toHaveTextContent('Viviane Farias · Só os autores · 2 pessoas');
    expect(screen.getByLabelText('Assunto')).toHaveValue('');
  });

  it('cancelling the confirmation sends nothing', async () => {
    const calls = stubApi({ members, audiences, announcements: { body: { announcements: [] } } });
    open();
    await userEvent.type(await screen.findByLabelText('Assunto'), 'Um assunto');
    await userEvent.type(screen.getByLabelText('Mensagem'), 'Uma mensagem qualquer.');
    await userEvent.click(screen.getByRole('button', { name: 'Revisar e enviar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('button', { name: 'Revisar e enviar' })).toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith('announce'))).toBe(false);
  });

  it('cannot be sent to a group with nobody, nor without a subject and a message', async () => {
    stubApi({ members, audiences, announcements: { body: { announcements: [] } } });
    open();
    const button = await screen.findByRole('button', { name: 'Revisar e enviar' });
    expect(button).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Assunto'), 'Um assunto');
    await userEvent.type(screen.getByLabelText('Mensagem'), 'Uma mensagem qualquer.');
    expect(button).toBeEnabled();
    await userEvent.selectOptions(screen.getByLabelText('Quem recebe'), 'reviewers');
    expect(button).toBeDisabled();
  });

  it('explains a refusal and keeps what was written', async () => {
    stubApi({ members, audiences, announcements: { body: { announcements: [] } }, announce: { status: 429, body: { error: 'too_many_attempts' } } });
    open();
    await userEvent.type(await screen.findByLabelText('Assunto'), 'Um assunto');
    await userEvent.type(screen.getByLabelText('Mensagem'), 'Uma mensagem qualquer.');
    await userEvent.click(screen.getByRole('button', { name: 'Revisar e enviar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enviar para 5 pessoas' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Muitos comunicados em pouco tempo.');
    expect(screen.getByLabelText('Mensagem')).toHaveValue('Uma mensagem qualquer.');
  });
});
