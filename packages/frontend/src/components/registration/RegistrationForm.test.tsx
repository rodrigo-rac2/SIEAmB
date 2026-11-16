import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderAtEvent } from '../../test/render';
import { RegistrationForm } from './RegistrationForm';

describe('RegistrationForm CPF mask (#179)', () => {
  const cpfField = async () => {
    renderAtEvent('/2027/inscricoes/nova', <RegistrationForm onSuccess={vi.fn()} />);
    return (await screen.findByLabelText('CPF')) as HTMLInputElement;
  };

  it('formats the CPF while it is typed', async () => {
    const cpf = await cpfField();
    await userEvent.type(cpf, '5299822');
    expect(cpf).toHaveValue('529.982.2');
    await userEvent.type(cpf, '4725');
    expect(cpf).toHaveValue('529.982.247-25');
  });

  it('ignores letters and digits past the eleventh', async () => {
    const cpf = await cpfField();
    await userEvent.type(cpf, '529a982b24725999');
    expect(cpf).toHaveValue('529.982.247-25');
  });

  it('formats a pasted value, with or without punctuation', async () => {
    const cpf = await cpfField();
    cpf.focus();
    await userEvent.paste(' 529 982 247/25 ');
    expect(cpf).toHaveValue('529.982.247-25');
  });

  it('lets the user delete back through the punctuation', async () => {
    const cpf = await cpfField();
    await userEvent.type(cpf, '5299');
    expect(cpf).toHaveValue('529.9');
    await userEvent.type(cpf, '{Backspace}{Backspace}');
    expect(cpf).toHaveValue('52');
  });

  it('a masked valid CPF passes validation and an invalid one is still refused', async () => {
    const cpf = await cpfField();
    await userEvent.type(cpf, '11111111111');
    await userEvent.click(screen.getByRole('button', { name: /Enviar inscrição/ }));
    expect(await screen.findByText('CPF inválido. Confira os dígitos.')).toBeInTheDocument();
  });
});
