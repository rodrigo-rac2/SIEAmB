import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { App } from '../../App';
import '../../i18n';

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('PageLayout with an unknown edition slug (#58)', () => {
  it.each(['/1999/', '/1999/o-evento', '/1999/avisos/qualquer', '/nao-existe/inscricoes/nova'])(
    '%s renders the not-found page instead of an empty body',
    async (path) => {
      renderApp(path);
      expect(await screen.findByRole('heading', { name: 'Página não encontrada' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/');
    },
  );

  it('a known edition does not show the not-found page', async () => {
    renderApp('/2027/o-evento');
    expect(await screen.findByRole('heading', { name: 'Esta edição: II SIEAmB' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Página não encontrada' })).toBeNull();
  });
});
