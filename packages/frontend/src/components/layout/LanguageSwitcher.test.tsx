import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { LanguageSwitcher } from './LanguageSwitcher';

describe('LanguageSwitcher', () => {
  afterEach(async () => {
    await i18n.changeLanguage('pt-BR');
  });

  it('shows a readable text code next to every flag, so it works without emoji flags', () => {
    render(<LanguageSwitcher />);
    const group = screen.getByRole('group', { name: 'Idioma' });
    expect(group.textContent).toContain('PT');
    expect(group.textContent).toContain('EN');
    expect(group.textContent).toContain('ES');
    expect(group.textContent).toContain('中文');
  });

  it('marks only the current language as pressed and switches on click', async () => {
    render(<LanguageSwitcher />);
    expect(screen.getByRole('button', { name: 'Português' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    await screen.findByRole('group', { name: 'Language' });
    expect(screen.getByRole('button', { name: 'Português' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'English' })).toHaveClass('is-active');
  });
});
