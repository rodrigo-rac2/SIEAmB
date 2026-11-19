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

describe('RegistrationForm: passport and its country (ADR-010)', () => {
  const SEND = { name: /Enviar inscrição/ };
  const open = async () => {
    const onSuccess = vi.fn();
    renderAtEvent('/2027/inscricoes/nova', <RegistrationForm onSuccess={onSuccess} />);
    await userEvent.type(await screen.findByLabelText(/Nome completo/), 'Joana Silva Pereira');
    await userEvent.type(screen.getByLabelText(/E-mail/), 'joana@uc.pt');
    await userEvent.click(screen.getByRole('checkbox'));
    return onSuccess;
  };
  const country = () => screen.queryByRole('combobox', { name: 'País do passaporte' });

  it('asks for the country only once a passport is typed, from a list without Brazil', async () => {
    await open();
    expect(country()).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Passaporte'), 'AB123456');
    expect(country()).toBeInTheDocument();
    expect(country()).toHaveValue('');
    expect(screen.queryByRole('option', { name: 'Brasil' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Portugal' })).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Passaporte'));
    expect(country()).not.toBeInTheDocument();
  });

  it('does not send a passport without its country, and says so', async () => {
    const onSuccess = await open();
    await userEvent.type(screen.getByLabelText('Passaporte'), 'AB123456');
    await userEvent.click(screen.getByRole('button', SEND));
    expect(await screen.findByText('Selecione o país do passaporte.')).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
    // Choosing it clears the message.
    await userEvent.selectOptions(country()!, 'Portugal');
    await vi.waitFor(() => expect(screen.queryByText('Selecione o país do passaporte.')).not.toBeInTheDocument());
  });

  it('refuses a passport that is too short', async () => {
    const onSuccess = await open();
    await userEvent.type(screen.getByLabelText('Passaporte'), 'A1');
    await userEvent.selectOptions(country()!, 'Portugal');
    await userEvent.click(screen.getByRole('button', SEND));
    expect(await screen.findByText('Passaporte inválido.')).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('registers a foreigner with the passport in its stored shape and the country chosen', async () => {
    const { getDataProvider } = await import('../../services');
    const create = vi.spyOn(getDataProvider(), 'createRegistration');
    const onSuccess = await open();
    await userEvent.type(screen.getByLabelText('Passaporte'), 'ab 123-456');
    await userEvent.selectOptions(country()!, 'Portugal');
    await userEvent.click(screen.getByRole('button', SEND));
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(create.mock.calls[0]![1]).toMatchObject({ passport: 'AB123456', country: 'PT', cpf: undefined });
    create.mockRestore();
  });

  it('registers with a CPF and a passport together, and with a CPF alone as Brazil', async () => {
    const { getDataProvider } = await import('../../services');
    const create = vi.spyOn(getDataProvider(), 'createRegistration');
    const onSuccess = await open();
    await userEvent.type(screen.getByLabelText('CPF'), '52998224725');
    await userEvent.type(screen.getByLabelText('Passaporte'), 'ZZ999999');
    await userEvent.selectOptions(country()!, 'Estados Unidos');
    await userEvent.click(screen.getByRole('button', SEND));
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0]![1]).toMatchObject({ cpf: '52998224725', passport: 'ZZ999999', country: 'US' });
    // The passport cleared: the country goes with it.
    await userEvent.clear(screen.getByLabelText('Passaporte'));
    await userEvent.click(screen.getByRole('button', SEND));
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[1]![1]).toMatchObject({ cpf: '52998224725', passport: undefined, country: 'BR' });
    create.mockRestore();
  });
});
