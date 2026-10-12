import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { useLocale, useLocalized } from './useLocale';

const venue = { 'pt-BR': 'Evento online', en: 'Online event' };

function Probe() {
  const locale = useLocale();
  const l = useLocalized();
  return (
    <p>
      {locale}|{l(venue)}|{l('só pt')}|{String(l(null))}
    </p>
  );
}

describe('useLocale / useLocalized', () => {
  afterEach(async () => {
    await i18n.changeLanguage('pt-BR');
  });

  it('resolves in the active locale and re-renders when the language changes', async () => {
    render(<Probe />);
    expect(screen.getByText('pt-BR|Evento online|só pt|null')).toBeInTheDocument();
    await act(() => i18n.changeLanguage('en'));
    expect(screen.getByText('en|Online event|só pt|null')).toBeInTheDocument();
    await act(() => i18n.changeLanguage('es'));
    // No es translation: falls back to pt-BR, never blank.
    expect(screen.getByText('es|Evento online|só pt|null')).toBeInTheDocument();
  });
});
