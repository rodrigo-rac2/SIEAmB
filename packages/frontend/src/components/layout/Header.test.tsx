import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '../../i18n';
import { renderAtEvent } from '../../test/render';
import { Header } from './Header';
import { TopBar } from './TopBar';

describe('Header + TopBar (fixtures)', () => {
  it('current edition: Equipe in the menu, editions link only in the top bar', async () => {
    renderAtEvent(
      '/2027/',
      <>
        <TopBar />
        <Header />
      </>,
    );
    const nav = await screen.findByRole('navigation', { name: 'principal' });
    const labels = within(nav).getAllByRole('link').map((a) => a.textContent);
    expect(labels).toContain('Equipe');
    expect(labels).not.toContain('Edições Anteriores');
    expect(labels.indexOf('Equipe')).toBe(labels.indexOf('O Evento') + 1);
    expect(screen.getByRole('link', { name: 'Edições Anteriores' })).toHaveAttribute('href', '/edicoes-anteriores');
  });

  it('first edition: no editions link anywhere in the header', async () => {
    renderAtEvent(
      '/2025/',
      <>
        <TopBar />
        <Header />
      </>,
    );
    const nav = await screen.findByRole('navigation', { name: 'principal' });
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Início',
      'Equipe',
      'Anais',
      'Datas Importantes',
      'Contato',
    ]);
    expect(screen.queryByRole('link', { name: 'Edições Anteriores' })).toBeNull();
  });

  it('top bar shows the edition dates and venue', async () => {
    renderAtEvent('/2027/', <TopBar />);
    expect(await screen.findByText(/24\s?[–-]\s?26 de março de 2027/)).toBeInTheDocument();
    expect(screen.getByText('Evento online')).toBeInTheDocument();
  });
});
