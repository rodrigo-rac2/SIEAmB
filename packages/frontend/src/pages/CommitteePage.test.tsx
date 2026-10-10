import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '../i18n';
import { renderAtEvent } from '../test/render';
import { CommitteePage } from './CommitteePage';

describe('CommitteePage (fixtures)', () => {
  it('2027: founders first, then the three groups in committee order', async () => {
    renderAtEvent('/2027/organizacao', <CommitteePage />);
    await screen.findByRole('heading', { name: 'Equipe de Mídias' });
    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual([
      'Idealizadores',
      'Comitê Científico',
      'Equipe de Revisores',
      'Equipe de Mídias',
    ]);
  });

  it('repeats photo and name per group but shows a bio only once per person', async () => {
    const { container } = renderAtEvent('/2027/organizacao', <CommitteePage />);
    await screen.findByRole('heading', { name: 'Equipe de Mídias' });
    // Najara: founder + scientific committee + reviewer.
    const najara = screen.getAllByRole('heading', { name: 'Ma. Najara Escarião Agripino' });
    expect(najara).toHaveLength(3);
    expect(screen.getAllByText(/Civilização Ecológica/)).toHaveLength(1);
    // Her bio sits in the first card (the founders block), not in the later ones.
    const firstCard = najara[0]?.closest('li');
    expect(firstCard && within(firstCard).queryByText(/Civilização Ecológica/)).not.toBeNull();
    const lastCard = najara[2]?.closest('li');
    expect(lastCard && within(lastCard).queryByText(/Civilização Ecológica/)).toBeNull();
    // Every appearance keeps the photo.
    expect(container.querySelectorAll('img[src*="najara-agripino"]')).toHaveLength(3);
  });

  it('marks exactly the three coordinators and never a founder', async () => {
    renderAtEvent('/2027/organizacao', <CommitteePage />);
    await screen.findByRole('heading', { name: 'Equipe de Mídias' });
    const badges = screen.getAllByText('Coordenação da equipe');
    expect(badges).toHaveLength(3);
    const names = badges.map((b) => b.closest('h3')?.textContent ?? '');
    expect(names.join(' ')).toMatch(/Thays/);
    expect(names.join(' ')).toMatch(/Lara/);
    expect(names.join(' ')).toMatch(/Daniela/);
  });

  it('has no leftover link to the About page founders', async () => {
    renderAtEvent('/2027/organizacao', <CommitteePage />);
    await screen.findByRole('heading', { name: 'Idealizadores' });
    expect(screen.queryByRole('link', { name: /idealizadores/i })).toBeNull();
  });

  it('2025 recap keeps its own groups and the speakers', async () => {
    renderAtEvent('/2025/organizacao', <CommitteePage />);
    await screen.findByRole('heading', { name: 'Palestrantes' });
    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual([
      'Idealizadores',
      'Equipe Organizadora',
      'Equipe de Revisores',
      'Palestrantes',
    ]);
    expect(screen.getByRole('heading', { name: /Dou Yuehan/ })).toBeInTheDocument();
  });
});
