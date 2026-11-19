import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { CountrySelect } from './CountrySelect';

afterEach(async () => {
  await i18n.changeLanguage('pt-BR');
});

const names = () => screen.getAllByRole('option').map((o) => o.textContent);
const codes = () => screen.getAllByRole('option').map((o) => (o as HTMLOptionElement).value);

describe('CountrySelect', () => {
  it('starts with nothing chosen and lists the countries by name, in the order of the language', () => {
    render(<CountrySelect aria-label="País" value="" onChange={() => undefined} />);
    expect(screen.getByRole('combobox', { name: 'País' })).toHaveValue('');
    expect(names()[0]).toBe('Selecione o país');
    const listed = names().slice(1);
    expect(listed).toContain('Portugal');
    expect(listed).toContain('Estados Unidos');
    // Accents are sorted as a reader expects: Áustria with the A, not after the Z.
    expect(listed.indexOf('Áustria')).toBeLessThan(listed.indexOf('Bélgica'));
    expect(listed).toEqual([...listed].sort(new Intl.Collator('pt-BR').compare));
  });

  it('never offers Brazil, and gives every country a real two-letter code', () => {
    render(<CountrySelect aria-label="País" value="" onChange={() => undefined} />);
    expect(codes()).not.toContain('BR');
    expect(names()).not.toContain('Brasil');
    expect(codes().slice(1).every((code) => /^[A-Z]{2}$/.test(code))).toBe(true);
    expect(new Set(codes()).size).toBe(codes().length);
    expect(codes().length).toBe(250);
  });

  it('tells the code of what is chosen, and shows the one it is given', () => {
    const onChange = vi.fn();
    const { rerender } = render(<CountrySelect aria-label="País" value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'PT' } });
    expect(onChange).toHaveBeenCalledWith('PT');
    rerender(<CountrySelect aria-label="País" value="PT" onChange={onChange} />);
    expect(screen.getByRole('combobox')).toHaveValue('PT');
    expect((screen.getByRole('option', { name: 'Portugal' }) as HTMLOptionElement).selected).toBe(true);
  });

  it('follows the language of the page', async () => {
    render(<CountrySelect aria-label="País" value="DE" onChange={() => undefined} />);
    expect(screen.getByRole('option', { name: 'Alemanha' })).toBeInTheDocument();
    await i18n.changeLanguage('en');
    expect(await screen.findByRole('option', { name: 'Germany' })).toBeInTheDocument();
    expect(names()[0]).toBe('Choose the country');
    expect(screen.getByRole('combobox')).toHaveValue('DE');
  });

  it('passes the usual field attributes through', () => {
    render(<CountrySelect id="pais" aria-label="País" value="" onChange={() => undefined} disabled required />);
    const select = screen.getByRole('combobox');
    expect(select).toHaveAttribute('id', 'pais');
    expect(select).toBeDisabled();
    expect(select).toBeRequired();
  });
});
