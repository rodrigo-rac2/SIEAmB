import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FeeTier } from '@sieamb/shared';
import '../../i18n';
import { FeeTable, lotsOf } from './FeeTable';

const tier = (id: string, category: FeeTier['category'], label: string, amountCents: number, from: string, until: string, modality: FeeTier['modality'] = 'ONLINE'): FeeTier => ({
  id,
  eventId: 'evt-x',
  category,
  modality,
  label,
  amountCents,
  validFrom: from,
  validUntil: until,
});

const lot1 = ['2026-11-10T00:00:00-03:00', '2027-01-01T23:59:00-03:00'] as const;
const lot2 = ['2027-01-02T00:00:00-03:00', '2027-03-20T23:59:00-03:00'] as const;
const tiers: FeeTier[] = [
  tier('a', 'ESTUDANTE_POS', 'Lote 2', 7000, ...lot2),
  tier('b', 'ESTUDANTE_POS', 'Lote 1', 5000, ...lot1),
  tier('c', 'PROFISSIONAL', 'Lote 1', 7000, ...lot1),
  tier('d', 'PROFISSIONAL', 'Lote 2', 9000, ...lot2),
];

describe('lotsOf', () => {
  it('returns distinct lots ordered by start date regardless of input order', () => {
    expect(lotsOf(tiers).map((l) => l.label)).toEqual(['Lote 1', 'Lote 2']);
  });
});

describe('FeeTable', () => {
  it('renders one column per lot with its date range and one row per category', () => {
    render(<FeeTable tiers={tiers} />);
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers[1]).toMatch(/Lote 1.*10 de novembro de 2026.*1 de janeiro de 2027/);
    expect(headers[2]).toMatch(/Lote 2.*2 de janeiro de 2027.*20 de março de 2027/);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getByRole('rowheader').textContent)).toEqual([
      'Estudante de Pós-Graduação',
      'Professores e demais profissionais',
    ]);
    expect(within(rows[1]!).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      expect.stringMatching(/R\$\s?70,00/),
      expect.stringMatching(/R\$\s?90,00/),
    ]);
  });

  it('shows a dash when a category has no price in a lot', () => {
    render(<FeeTable tiers={tiers.slice(0, 1)} />);
    // Only Lote 2 exists here, so there is one price column and no dash; add a lot-1-only category.
    render(<FeeTable tiers={[tiers[1]!, tier('e', 'ESTUDANTE_GRADUACAO', 'Lote 2', 5000, ...lot2)]} />);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('labels the modality inside the cell only when an edition mixes modalities', () => {
    const { container } = render(<FeeTable tiers={[...tiers, tier('p', 'PROFISSIONAL', 'Lote 1', 15000, ...lot1, 'PRESENCIAL')]} />);
    expect(container.querySelectorAll('.fee-table__modality').length).toBeGreaterThan(0);
  });

  it('renders nothing when there are no tiers', () => {
    const { container } = render(<FeeTable tiers={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
