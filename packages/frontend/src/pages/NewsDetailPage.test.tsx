import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { renderAtEvent } from '../test/render';
import { NewsDetailPage } from './NewsDetailPage';
import { NewsListPage } from './NewsListPage';

function DetailAtSlug() {
  return (
    <Routes>
      <Route path="avisos/:newsSlug" element={<NewsDetailPage />} />
    </Routes>
  );
}

describe('Edital news item (#138)', () => {
  it('is pinned first in the news list, ahead of the August site launch', async () => {
    renderAtEvent('/2027/avisos', <NewsListPage />);
    const titles = (await screen.findAllByRole('heading', { level: 3 })).map((h) => h.textContent);
    expect(titles[0]).toBe('Edital do II SIEAmB publicado');
    expect(screen.getAllByText('Fixado')).toHaveLength(1);
  });

  it('links the edital page and the areas as in-app links, with the key dates', async () => {
    renderAtEvent('/2027/avisos/edital-do-ii-sieamb-publicado', <DetailAtSlug />);
    expect(await screen.findByRole('link', { name: /Leia o edital completo/ })).toHaveAttribute(
      'href',
      '/2027/editais/submissao-e-apresentacao-de-trabalhos',
    );
    const areas = screen.getByRole('link', { name: 'oito áreas temáticas' });
    expect(areas).toHaveAttribute('href', '/2027/areas-tematicas');
    expect(areas).not.toHaveAttribute('target');
    expect(screen.getByText(/de 15\/11\/2026 a 18\/01\/2027/)).toBeInTheDocument();
  });
});
