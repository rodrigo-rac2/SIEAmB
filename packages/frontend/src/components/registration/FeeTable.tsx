import {
  formatDate,
  formatMoney,
  type FeeTier,
  type Locale,
  type ParticipantCategory,
} from '@sieamb/shared';
import { useTranslation } from 'react-i18next';
import './FeeTable.css';

const CATEGORY_ORDER: ParticipantCategory[] = [
  'ESTUDANTE_GRADUACAO',
  'ESTUDANTE_POS',
  'PROFESSOR',
  'PROFISSIONAL',
  'COMUNIDADE_UFCG',
];

interface Lot {
  label: string;
  validFrom: string;
  validUntil: string;
}

/** Distinct lots (by label) ordered by start date. */
export function lotsOf(tiers: FeeTier[]): Lot[] {
  const byLabel = new Map<string, Lot>();
  for (const t of tiers) {
    const lot = byLabel.get(t.label);
    if (!lot) byLabel.set(t.label, { label: t.label, validFrom: t.validFrom, validUntil: t.validUntil });
    else {
      if (t.validFrom < lot.validFrom) lot.validFrom = t.validFrom;
      if (t.validUntil > lot.validUntil) lot.validUntil = t.validUntil;
    }
  }
  return [...byLabel.values()].sort((a, b) => a.validFrom.localeCompare(b.validFrom));
}

/** Fee matrix: one row per category, one column per lot. Modality is a detail inside the cell when an edition has more than one. */
export function FeeTable({ tiers }: { tiers: FeeTier[] }) {
  const { t, i18n } = useTranslation();
  const locale = (i18n.resolvedLanguage ?? 'pt-BR') as Locale;

  const categories = CATEGORY_ORDER.filter((c) => tiers.some((f) => f.category === c));
  if (categories.length === 0) return null;
  const lots = lotsOf(tiers);
  const multiModality = new Set(tiers.map((f) => f.modality)).size > 1;

  return (
    <div className="fee-table-wrap">
      <table className="fee-table">
        <thead>
          <tr>
            <th scope="col">{t('registration.category')}</th>
            {lots.map((lot) => (
              <th key={lot.label} scope="col">
                {lot.label}
                <span className="fee-table__range">
                  {t('registration.lotRange', {
                    from: formatDate(lot.validFrom, locale),
                    until: formatDate(lot.validUntil, locale),
                  })}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((c) => (
            <tr key={c}>
              <th scope="row">{t(`registration.categories.${c}`)}</th>
              {lots.map((lot) => {
                const cell = tiers.filter((f) => f.category === c && f.label === lot.label);
                return (
                  <td key={lot.label}>
                    {cell.length === 0
                      ? '—'
                      : cell.map((f) => (
                          <div key={f.id}>
                            {multiModality && (
                              <span className="fee-table__modality">
                                {t(`registration.modalities.${f.modality}`)}:{' '}
                              </span>
                            )}
                            {formatMoney(f.amountCents, locale)}
                          </div>
                        ))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
