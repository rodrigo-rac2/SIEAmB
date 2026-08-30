import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FeeTier } from '@sieamb/shared';
import '../../i18n';
import { FeeTable } from './FeeTable';

const tiers: FeeTier[] = [
  {
    id: 'f1',
    eventId: 'evt-1',
    category: 'ESTUDANTE_POS',
    modality: 'PRESENCIAL',
    label: 'Lote 1',
    amountCents: 8000,
    validFrom: '2026-05-01T00:00:00-03:00',
    validUntil: '2026-09-30T23:59:00-03:00',
  },
  {
    id: 'f2',
    eventId: 'evt-1',
    category: 'ESTUDANTE_POS',
    modality: 'ONLINE',
    label: 'Lote 1',
    amountCents: 5000,
    validFrom: '2026-05-01T00:00:00-03:00',
    validUntil: '2026-09-30T23:59:00-03:00',
  },
];

describe('FeeTable', () => {
  it('renders a row per category with formatted BRL amounts', () => {
    render(<FeeTable tiers={tiers} />);
    expect(screen.getByRole('rowheader')).toHaveTextContent(/Pós-Graduação/);
    // BRL uses non-breaking space between R$ and value
    expect(screen.getByText(/R\$\s*80,00/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*50,00/)).toBeInTheDocument();
  });

  it('renders nothing when there are no tiers', () => {
    const { container } = render(<FeeTable tiers={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
