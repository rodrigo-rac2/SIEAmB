import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderAtEvent } from '../test/render';
import { HomePage } from './HomePage';

describe('HomePage', () => {
  it('spells the event days out in the hero, as the committee asked', async () => {
    renderAtEvent('/2027/', <HomePage />);
    expect(await screen.findByText('24, 25 e 26 de março de 2027')).toBeInTheDocument();
    expect(screen.queryByText(/24\s?[–-]\s?26 de março/)).not.toBeInTheDocument();
  });
});
