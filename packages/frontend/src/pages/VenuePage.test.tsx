import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '../i18n';
import { renderAtEvent } from '../test/render';
import { VenuePage } from './VenuePage';

describe('VenuePage (fixtures)', () => {
  it('online edition: streaming text and a YouTube link, no campus address', async () => {
    renderAtEvent('/2027/local', <VenuePage />);
    expect(await screen.findByRole('heading', { name: 'Evento online' })).toBeInTheDocument();
    expect(screen.getByText(/transmissão ao vivo/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /YouTube/ })).toHaveAttribute('href', expect.stringContaining('youtube.com'));
    expect(screen.queryByText(/Aprígio Veloso/)).toBeNull();
  });
});
