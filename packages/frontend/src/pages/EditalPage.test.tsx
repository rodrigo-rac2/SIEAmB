import { act, screen, within } from '@testing-library/react';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { renderAtEvent } from '../test/render';
import { EditaisPage } from './EditaisPage';
import { EditalPage } from './EditalPage';
import { SubmissionsPage } from './SubmissionsPage';

const SLUG = '/2027/editais/submissao-e-apresentacao-de-trabalhos';
const PUBLIC = resolve(__dirname, '../../public');

function renderEdital() {
  return renderAtEvent(SLUG, <EditalPageAtSlug />);
}

// renderAtEvent mounts /:eventSlug/*; the detail page reads :editalSlug from its own route.
function EditalPageAtSlug() {
  return (
    <Routes>
      <Route path="editais/:editalSlug" element={<EditalPage />} />
    </Routes>
  );
}

describe('Editais (#11)', () => {
  afterEach(async () => {
    await act(() => i18n.changeLanguage('pt-BR'));
  });

  it('2027 lists the published edital, 2025 says none were published', async () => {
    renderAtEvent('/2027/editais', <EditaisPage />);
    expect(
      await screen.findByRole('link', { name: 'Edital de submissão e apresentação de trabalhos' }),
    ).toHaveAttribute('href', SLUG);
  });

  it('archived edition without editais shows the empty state', async () => {
    renderAtEvent('/2025/editais', <EditaisPage />);
    expect(await screen.findByRole('status')).toHaveTextContent(/serão publicados em breve/);
  });

  it('detail page: all 21 sections, files box with the PDF and the three templates', async () => {
    renderEdital();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Edital de submissão e apresentação de trabalhos' }),
    ).toBeInTheDocument();
    const sections = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(sections.filter((s) => /^\d+\. /.test(s ?? ''))).toHaveLength(21);
    expect(sections.at(-1)).toBe('21. Das disposições finais');

    const files = within(screen.getByRole('complementary'));
    const pdf = files.getByRole('link', { name: /Edital completo/ });
    expect(pdf).toHaveAttribute('href', '/docs/2027/edital-ii-sieamb.pdf');
    expect(pdf).toHaveAttribute('target', '_blank');
    const article = files.getByRole('link', { name: /Modelo de Artigo Científico/ });
    expect(article).toHaveAttribute('download');
    expect(files.getByRole('link', { name: /Modelo de apresentação no Canva/ })).toHaveAttribute(
      'href',
      'https://canva.link/dg7c1eypxds4k1j',
    );
  });

  it('body links to the templates resolve to site files, not to SPA routes under the edital', async () => {
    renderEdital();
    const link = await screen.findByRole('link', { name: 'Resumo Expandido (.docx)' });
    expect(link).toHaveAttribute('href', '/docs/2027/modelo-resumo-expandido-ii-sieamb.docx');
    expect(screen.getByRole('link', { name: '@sieamb_ppgegrn' })).toHaveAttribute('target', '_blank');
  });

  it('every file the edital points to exists under public/ (a typo would serve index.html on Vercel)', async () => {
    renderEdital();
    await screen.findByRole('heading', { level: 1 });
    const hrefs = screen
      .getAllByRole('link')
      .map((a) => a.getAttribute('href') ?? '')
      .filter((h) => h.startsWith('/docs/'));
    expect(new Set(hrefs).size).toBe(4);
    const missing = hrefs.filter((h) => !existsSync(resolve(PUBLIC, `.${h}`)));
    expect(missing).toEqual([]);
  });

  it('in English the official text stays Portuguese, marked lang=pt-BR, with a notice', async () => {
    await act(() => i18n.changeLanguage('en'));
    renderEdital();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Call for papers: submission and presentation of works' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/official text of this call is in Portuguese/);
    const body = screen.getByRole('heading', { name: '1. Apresentação' }).closest('[lang]');
    expect(body).toHaveAttribute('lang', 'pt-BR');
    expect(within(screen.getByRole('complementary')).getByRole('link', { name: /Expanded abstract template/ })).toBeInTheDocument();
  });

  it('in Portuguese there is no translation notice', async () => {
    renderEdital();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('unknown edital slug shows not found with a way back', async () => {
    renderAtEvent('/2027/editais/nao-existe', <EditalPageAtSlug />);
    expect(await screen.findByRole('link', { name: /Todos os editais/ })).toHaveAttribute('href', '/2027/editais');
  });

  it('submissions page points to the edital and offers the templates but not the PDF twice', async () => {
    renderAtEvent('/2027/submissoes', <SubmissionsPage />);
    expect(await screen.findByRole('link', { name: /Ler o edital de submissão/ })).toHaveAttribute('href', SLUG);
    expect(screen.getByRole('link', { name: /Modelo de Resumo Expandido/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Edital completo/ })).toBeNull();
  });
});
