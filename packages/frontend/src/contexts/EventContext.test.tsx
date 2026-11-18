import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { StaticDataProvider } from '../services/StaticDataProvider';
import { resetDataProvider } from '../services';
import '../i18n';
import { EventProvider, useEvent } from './EventContext';

afterEach(() => {
  vi.restoreAllMocks();
  resetDataProvider();
});

function Probe() {
  const { event, loading, notFound } = useEvent();
  const { pathname, search } = useLocation();
  return (
    <p data-testid="probe">
      {loading ? 'loading' : notFound ? 'not found' : (event?.slug ?? 'none')} at {pathname}
      {search}
    </p>
  );
}

function renderProbe(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/:eventSlug/*" element={<EventProvider><Probe /></EventProvider>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** A provider that cannot tell the editions without asking. */
const mustAsk = () => vi.spyOn(StaticDataProvider.prototype, 'now', 'get').mockReturnValue(undefined);

describe('EventProvider: the edition is there for the first paint (#329)', () => {
  // No awaiting in these: what is asserted is what the very first render drew.
  it('a known edition is known at once, with no waiting state in between', () => {
    renderProbe('/2027/o-evento');
    expect(screen.getByTestId('probe')).toHaveTextContent('2027 at /2027/o-evento');
  });

  it('an unknown slug is not found at once', () => {
    renderProbe('/1999/o-evento');
    expect(screen.getByTestId('probe')).toHaveTextContent('not found at /1999/o-evento');
  });

  it('an old slug of an edition goes to its page at once, keeping the rest of the address', () => {
    renderProbe('/2026/inscricoes?x=1');
    expect(screen.getByTestId('probe')).toHaveTextContent('2027 at /2027/inscricoes?x=1');
  });

  it('the whole page is drawn on the first render: no empty main between the menu and the footer', () => {
    render(
      <MemoryRouter initialEntries={['/2027/o-evento']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole('main')).not.toBeEmptyDOMElement();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('/ goes to the current edition on the first render', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole('main')).not.toBeEmptyDOMElement();
    expect(screen.getByTestId('hero-motto')).toHaveTextContent('Diálogos globais sobre governança climática');
  });

  it('an archived edition has the link to the current one from the first render', () => {
    render(
      <MemoryRouter initialEntries={['/2025/']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole('note')).toContainElement(screen.getByRole('link', { name: /II SIEAmB.*→/ }));
  });
});

describe('EventProvider with a provider that has to ask', () => {
  it('waits, then knows the edition', async () => {
    mustAsk();
    renderProbe('/2027/o-evento');
    expect(screen.getByTestId('probe')).toHaveTextContent('loading at /2027/o-evento');
    expect(await screen.findByText('2027 at /2027/o-evento')).toBeInTheDocument();
  });

  it('waits, then says an unknown slug is not found', async () => {
    mustAsk();
    renderProbe('/1999/');
    expect(screen.getByTestId('probe')).toHaveTextContent('loading');
    expect(await screen.findByText(/not found at \/1999\//)).toBeInTheDocument();
  });

  it('waits, then follows an old slug', async () => {
    mustAsk();
    renderProbe('/2026/inscricoes');
    expect(await screen.findByText('2027 at /2027/inscricoes')).toBeInTheDocument();
  });

  it('a failed answer ends as not found, never as an endless wait', async () => {
    mustAsk();
    vi.spyOn(StaticDataProvider.prototype, 'getEvents').mockRejectedValue(new Error('down'));
    renderProbe('/2027/');
    expect(await screen.findByText(/not found at \/2027\//)).toBeInTheDocument();
  });

  it('the app still reaches the current edition from /', async () => {
    mustAsk();
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('hero-motto')).toHaveTextContent('Diálogos globais sobre governança climática');
  });
});
