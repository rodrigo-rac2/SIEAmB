import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderAtEvent } from '../test/render';
import { HomePage } from './HomePage';

describe('HomePage', () => {
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

  it('shows no theme for an edition that has none', async () => {
    renderAtEvent('/2025/', <HomePage />);
    await screen.findAllByRole('heading');
    expect(screen.queryByTestId('hero-motto')).not.toBeInTheDocument();
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
