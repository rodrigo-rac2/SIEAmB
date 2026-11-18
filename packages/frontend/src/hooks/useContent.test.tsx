import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import '../i18n';
import { resetDataProvider } from '../services';
import { StaticDataProvider } from '../services/StaticDataProvider';
import { useContent } from './useContent';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetDataProvider();
});

/** A provider that cannot tell its content without asking. */
const mustAsk = () => vi.spyOn(StaticDataProvider.prototype, 'now', 'get').mockReturnValue(undefined);

describe('useContent with content that ships with the site (#331)', () => {
  // No awaiting: what is asserted is what the first render had.
  it('has the answer on the first render', () => {
    const { result } = renderHook(() => useContent('getImportantDates', 'evt-2027'));
    expect(result.current!.length).toBeGreaterThan(0);
    expect(result.current!.every((d) => d.eventId === 'evt-2027')).toBe(true);
  });

  it('is undefined only while an argument is missing, and answers as soon as it is there', () => {
    const { result, rerender } = renderHook(({ id }: { id?: string }) => useContent('getThematicAreas', id), {
      initialProps: {},
    });
    expect(result.current).toBeUndefined();
    rerender({ id: 'evt-2027' });
    expect(result.current!.length).toBeGreaterThan(0);
  });

  it('follows its arguments: another edition, another answer, on the same render', () => {
    const { result, rerender } = renderHook(({ id }) => useContent('getCommittee', id), { initialProps: { id: 'evt-2027' } });
    const first = result.current!;
    rerender({ id: 'evt-2025' });
    expect(result.current).not.toBe(first);
    expect(result.current!.every((m) => m.eventId === 'evt-2025')).toBe(true);
  });

  it('keeps the same answer between renders, so effects that depend on it do not run again', () => {
    const { result, rerender } = renderHook(() => useContent('getFeeTiers', 'evt-2027'));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('tells "found nothing" (null, empty) apart from "not known yet" (undefined)', () => {
    expect(renderHook(() => useContent('getEditalBySlug', 'evt-2027', 'nao-existe')).result.current).toBeNull();
    expect(renderHook(() => useContent('getAnais', 'evt-0000')).result.current).toEqual([]);
  });
});

describe('useContent with a provider that has to ask', () => {
  it('is undefined first, then has the answer', async () => {
    mustAsk();
    const { result } = renderHook(() => useContent('getImportantDates', 'evt-2027'));
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current!.length).toBeGreaterThan(0));
  });

  it('does not ask while an argument is missing', async () => {
    mustAsk();
    const ask = vi.spyOn(StaticDataProvider.prototype, 'getThematicAreas');
    const { result, rerender } = renderHook(({ id }: { id?: string }) => useContent('getThematicAreas', id), {
      initialProps: {},
    });
    expect(ask).not.toHaveBeenCalled();
    rerender({ id: 'evt-2027' });
    await waitFor(() => expect(result.current!.length).toBeGreaterThan(0));
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith('evt-2027');
  });

  it('never shows the answer of one edition as the answer of another', async () => {
    mustAsk();
    const { result, rerender } = renderHook(({ id }) => useContent('getCommittee', id), { initialProps: { id: 'evt-2027' } });
    await waitFor(() => expect(result.current).toBeDefined());
    rerender({ id: 'evt-2025' });
    // On the render with the new edition the old answer is already gone.
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current!.every((m) => m.eventId === 'evt-2025')).toBe(true));
  });

  it('a slow answer to old arguments does not overwrite the answer to the new ones', async () => {
    mustAsk();
    let giveOld!: (value: never[]) => void;
    const real = StaticDataProvider.prototype.getCommittee;
    vi.spyOn(StaticDataProvider.prototype, 'getCommittee').mockImplementation(function (this: StaticDataProvider, id: string) {
      return id === 'evt-2027' ? new Promise((resolve) => (giveOld = resolve)) : real.call(this, id);
    });
    const { result, rerender } = renderHook(({ id }) => useContent('getCommittee', id), { initialProps: { id: 'evt-2027' } });
    rerender({ id: 'evt-2025' });
    await waitFor(() => expect(result.current).toBeDefined());
    const answer = result.current;
    giveOld([]);
    await Promise.resolve();
    expect(result.current).toBe(answer);
  });

  it('a read that fails leaves the page waiting and does not throw', async () => {
    mustAsk();
    vi.spyOn(StaticDataProvider.prototype, 'getAnais').mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useContent('getAnais', 'evt-2027'));
    await Promise.resolve();
    expect(result.current).toBeUndefined();
  });
});

describe('every public page is drawn whole on its first render (#331)', () => {
  // Each line: a page and something that used to arrive one frame after the title.
  it.each([
    ['/2027/', () => screen.getAllByRole('row').length > 1],
    ['/2027/o-evento', () => screen.getByRole('heading', { name: 'Esta edição: II SIEAmB' })],
    ['/2027/organizacao', () => screen.getAllByRole('listitem').length > 10],
    ['/2027/areas-tematicas', () => document.querySelectorAll('.areas-list__item').length > 0],
    ['/2027/datas-importantes', () => screen.getAllByRole('row').length > 1],
    ['/2027/inscricoes', () => screen.getAllByRole('row').length > 1],
    ['/2027/editais', () => document.querySelectorAll('.news-card').length > 0],
    ['/2027/editais/submissao-e-apresentacao-de-trabalhos', () => screen.getByRole('heading', { level: 1, name: /Edital de submissão/ })],
    ['/2027/submissoes', () => screen.getByRole('link', { name: /Ler o edital de submissão/ })],
    ['/2025/', () => screen.getByTestId('hero-motto')],
    ['/edicoes-anteriores', () => screen.getByRole('link', { name: /I Seminário/ })],
  ] as const)('%s', (path, there) => {
    vi.stubEnv('VITE_ACCOUNTS_ENABLED', 'false');
    render(
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>,
    );
    expect(there()).toBeTruthy();
    expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
  });
});
