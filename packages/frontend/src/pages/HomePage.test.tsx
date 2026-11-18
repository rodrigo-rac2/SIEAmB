import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderAtEvent } from '../test/render';
import { HomePage } from './HomePage';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('HomePage', () => {
  const on = (state: 'open' | 'closed' | 'not_open' | 'fails') => {
    vi.stubEnv('VITE_ACCOUNTS_ENABLED', 'true');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    const fetchMock = vi.fn(async () =>
      state === 'fails'
        ? new Response('{}', { status: 500 })
        : new Response(JSON.stringify({ state, opensAt: '2026-11-15T00:00:00-03:00', closesAt: '2027-01-18T23:59:59-03:00' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  it('while papers can be sent: a button in the hero and a "Submissões abertas" call-out with the deadline (#244, #306)', async () => {
    on('open');
    renderAtEvent('/2027/', <HomePage />);
    expect(await screen.findByTestId('hero-submit')).toHaveAttribute('href', '/2027/meus-trabalhos/novo');
    expect(screen.getByTestId('hero-submit')).toHaveTextContent('Enviar trabalho');
    const strip = screen.getByTestId('papers-open-badge').closest('section')!;
    expect(screen.getByTestId('papers-open-badge')).toHaveTextContent('Submissões abertas');
    expect(within(strip).getByRole('heading', { name: 'Envie seu trabalho ao II SIEAmB' })).toBeInTheDocument();
    expect(strip).toHaveTextContent('Artigo científico ou resumo expandido, até 18 de janeiro de 2027.');
    expect(within(strip).getByTestId('papers-open-cta')).toHaveAttribute('href', '/2027/meus-trabalhos/novo');
    // The edital stays one click away, as a secondary link.
    expect(within(strip).getByRole('link', { name: 'Ler o edital' })).toHaveAttribute('href', '/2027/editais/submissao-e-apresentacao-de-trabalhos');
    expect(within(strip).getByRole('link', { name: 'Edital em PDF' })).toBeInTheDocument();
    expect(strip).not.toHaveTextContent('Edital publicado');
    // Nothing about more time than the published date.
    expect(strip).not.toHaveTextContent(/prorrog/i);
  });

  it.each([
    ['open', 'Submissões abertas'],
    ['closed', 'Edital publicado'],
  ] as const)('while the server is asked, shows neither strip; then only the %s one (#324)', async (state, shown) => {
    vi.stubEnv('VITE_ACCOUNTS_ENABLED', 'true');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    let give!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => (give = resolve))));
    renderAtEvent('/2027/', <HomePage />);
    const waiting = await screen.findByTestId('edital-strip-waiting');
    expect(waiting).toHaveTextContent('Carregando…');
    expect(waiting).toHaveAttribute('aria-busy', 'true');
    // Nothing that the answer could replace is on the page yet.
    expect(screen.queryByText('Edital publicado')).not.toBeInTheDocument();
    expect(screen.queryByTestId('papers-open-badge')).not.toBeInTheDocument();
    expect(screen.queryByTestId('hero-submit')).not.toBeInTheDocument();
    // The hero keeps the place of the button, hidden from screen readers and not a link.
    const ghost = screen.getByTestId('hero-submit-waiting');
    expect(ghost).toHaveAttribute('aria-hidden', 'true');
    expect(ghost.tagName).toBe('SPAN');
    expect(screen.getByRole('link', { name: 'Fazer inscrição' })).toBeInTheDocument();
    give(new Response(JSON.stringify({ state, opensAt: '2026-11-15T00:00:00-03:00', closesAt: '2027-01-18T23:59:59-03:00' }), { status: 200 }));
    expect(await screen.findByText(shown)).toBeInTheDocument();
    expect(screen.queryByTestId('edital-strip-waiting')).not.toBeInTheDocument();
    expect(screen.queryByTestId('hero-submit-waiting')).not.toBeInTheDocument();
    expect(screen.queryByText(state === 'open' ? 'Edital publicado' : 'Submissões abertas')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('hero-submit')).toHaveLength(state === 'open' ? 1 : 0);
  });

  it.each(['closed', 'not_open', 'fails'] as const)('submissions %s: no button to send, and the strip is the plain "Edital publicado"', async (state) => {
    const fetchMock = on(state);
    renderAtEvent('/2027/', <HomePage />);
    expect(await screen.findByText('Edital publicado')).toBeInTheDocument();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByTestId('hero-submit')).not.toBeInTheDocument();
    expect(screen.queryByTestId('papers-open-badge')).not.toBeInTheDocument();
    expect(screen.queryByTestId('papers-open-cta')).not.toBeInTheDocument();
  });

  it('offers no way into the submission system where it is off, and does not ask the server', async () => {
    vi.stubEnv('VITE_ACCOUNTS_ENABLED', 'false');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderAtEvent('/2027/', <HomePage />);
    await screen.findByText('24, 25 e 26 de março de 2027');
    expect(screen.queryByTestId('hero-submit')).not.toBeInTheDocument();
    expect(screen.queryByTestId('papers-open-badge')).not.toBeInTheDocument();
    // Nothing is asked, so nothing waits: the strip is there from the start.
    expect(await screen.findByText('Edital publicado')).toBeInTheDocument();
    expect(screen.queryByTestId('edital-strip-waiting')).not.toBeInTheDocument();
    expect(screen.queryByTestId('hero-submit-waiting')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('spells the event days out in the hero, as the committee asked', async () => {
    renderAtEvent('/2027/', <HomePage />);
    expect(await screen.findByText('24, 25 e 26 de março de 2027')).toBeInTheDocument();
    expect(screen.queryByText(/24\s?[–-]\s?26 de março/)).not.toBeInTheDocument();
  });

  it('shows the theme of the edition under its name (#298)', async () => {
    renderAtEvent('/2027/', <HomePage />);
    expect(await screen.findByTestId('hero-motto')).toHaveTextContent(
      'Tema: Diálogos globais sobre governança climática: desafios na gestão de desastres naturais',
    );
  });

  it('shows each edition its own theme: last edition\'s line is not on 2027 (#308)', async () => {
    renderAtEvent('/2027/', <HomePage />);
    expect(await screen.findByTestId('hero-motto')).not.toHaveTextContent('Ciência, gestão e sustentabilidade');
    expect(screen.queryByText(/Ciência, gestão e sustentabilidade dos recursos naturais/)).not.toBeInTheDocument();
  });

  it('keeps the 2025 theme on the 2025 archive', async () => {
    renderAtEvent('/2025/', <HomePage />);
    expect(await screen.findByTestId('hero-motto')).toHaveTextContent('Tema: Ciência, gestão e sustentabilidade dos recursos naturais');
  });

  it('calls out the published edital under the hero, with the read link, the PDF and an Editais card first (#137)', async () => {
    renderAtEvent('/2027/', <HomePage />);
    const strip = within(await screen.findByRole('region', { name: 'Edital de submissão e apresentação de trabalhos' }));
    expect(strip.getByText('Edital publicado')).toBeInTheDocument();
    expect(strip.getByRole('link', { name: /Ler o edital/ })).toHaveAttribute(
      'href',
      '/2027/editais/submissao-e-apresentacao-de-trabalhos',
    );
    expect(strip.getByRole('link', { name: 'Edital em PDF' })).toHaveAttribute('href', '/docs/2027/edital-ii-sieamb.pdf');
    const cards = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(cards.indexOf('Editais')).toBe(cards.indexOf('Edital de submissão e apresentação de trabalhos') + 1);
  });

  it('an edition without editais shows no call-out and no Editais card', async () => {
    renderAtEvent('/2025/', <HomePage />);
    // Dates load in the same batch as the editais, so once they show the strip had its chance.
    await screen.findAllByRole('row');
    expect(screen.queryByText('Edital publicado')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Editais' })).toBeNull();
  });

  it('announces open registrations under the hero, with a button straight to the form (#174)', async () => {
    renderAtEvent('/2027/', <HomePage />);
    const callout = within(await screen.findByRole('region', { name: 'Garanta sua vaga no II SIEAmB' }));
    expect(callout.getByText('Inscrições abertas')).toBeInTheDocument();
    expect(callout.getByRole('link', { name: /Fazer inscrição/ })).toHaveAttribute('href', '/2027/inscricoes/nova');
    expect(callout.getByRole('link', { name: 'Ver valores' })).toHaveAttribute('href', '/2027/inscricoes');
  });

  it('an edition with registrations closed shows no registration call-out', async () => {
    renderAtEvent('/2025/', <HomePage />);
    await screen.findAllByRole('row');
    expect(screen.queryByText('Inscrições abertas')).toBeNull();
    expect(screen.queryByRole('link', { name: /Fazer inscrição/ })).toBeNull();
  });
});
