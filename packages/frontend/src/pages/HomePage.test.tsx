import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderAtEvent } from '../test/render';
import { HomePage } from './HomePage';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('HomePage', () => {
  it('offers to send a paper beside the registration, where the submission system is on (#244)', async () => {
    vi.stubEnv('VITE_ACCOUNTS_ENABLED', 'true');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    renderAtEvent('/2027/', <HomePage />);
    expect(await screen.findByTestId('hero-submit')).toHaveAttribute('href', '/2027/submissoes');
    expect(screen.getByTestId('hero-submit')).toHaveTextContent('Enviar trabalho');
  });

  it('offers no way into the submission system where it is off', async () => {
    vi.stubEnv('VITE_ACCOUNTS_ENABLED', 'false');
    renderAtEvent('/2027/', <HomePage />);
    await screen.findByText('24, 25 e 26 de março de 2027');
    expect(screen.queryByTestId('hero-submit')).not.toBeInTheDocument();
  });

  it('spells the event days out in the hero, as the committee asked', async () => {
    renderAtEvent('/2027/', <HomePage />);
    expect(await screen.findByText('24, 25 e 26 de março de 2027')).toBeInTheDocument();
    expect(screen.queryByText(/24\s?[–-]\s?26 de março/)).not.toBeInTheDocument();
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
