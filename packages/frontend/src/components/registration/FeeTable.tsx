import {
  formatMoney,
  type FeeTier,
  type Locale,
  type Modality,
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

const MODALITIES: Modality[] = ['PRESENCIAL', 'ONLINE'];

export function FeeTable({ tiers }: { tiers: FeeTier[] }) {
  const { t, i18n } = useTranslation();
  const locale = (i18n.resolvedLanguage ?? 'pt-BR') as Locale;

  const categories = CATEGORY_ORDER.filter((c) => tiers.some((f) => f.category === c));
  if (categories.length === 0) return null;

  const find = (category: ParticipantCategory, modality: Modality) =>
    tiers.find((f) => f.category === category && f.modality === modality);

  return (
    <div className="fee-table-wrap">
      <table className="fee-table">
        <thead>
          <tr>
            <th scope="col">{t('registration.category')}</th>
            {MODALITIES.map((m) => (
              <th key={m} scope="col">
                {t(`registration.modalities.${m}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((c) => (
            <tr key={c}>
              <th scope="row">{t(`registration.categories.${c}`)}</th>
              {MODALITIES.map((m) => {
                const tier = find(c, m);
                return (
                  <td key={m}>{tier ? formatMoney(tier.amountCents, locale) : '—'}</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
