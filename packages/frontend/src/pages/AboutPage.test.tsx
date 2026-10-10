import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '../i18n';
import { renderAtEvent } from '../test/render';
import { AboutPage } from './AboutPage';

describe('AboutPage (fixtures)', () => {
  it('current edition: general text, pending edition text, founders, link to 2025', async () => {
    renderAtEvent('/2026/o-evento', <AboutPage />);
    expect(await screen.findByText(/espaço estratégico voltado para pesquisadores/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Esta edição: II SIEAmB' })).toBeInTheDocument();
    expect(screen.getByText(/será publicado em breve/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Idealizadores' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(4);
    expect(screen.getByRole('link', { name: /1º Seminário Internacional/ })).toHaveAttribute('href', '/2025/o-evento');
  });

  it('archived edition shows its own presentation text instead of the pending line', async () => {
    renderAtEvent('/2025/o-evento', <AboutPage />);
    expect(await screen.findByText(/Governança Ambiental da China e do Brasil/)).toBeInTheDocument();
    expect(screen.queryByText(/será publicado em breve/)).toBeNull();
  });
});
