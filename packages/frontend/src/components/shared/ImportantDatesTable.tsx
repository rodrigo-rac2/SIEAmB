import { formatDate, formatMonth, type ImportantDate } from '@sieamb/shared';
import { useTranslation } from 'react-i18next';
import { useLocale, useLocalized } from '../../hooks/useLocale';
import './ImportantDatesTable.css';

export function ImportantDatesTable({ dates }: { dates: ImportantDate[] }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const l = useLocalized();

  if (dates.length === 0) return null;

  return (
    <table className="dates-table">
      <tbody>
        {dates.map((d) => (
          <tr key={d.id}>
            <td className="dates-table__date">
              {d.monthOnly ? formatMonth(d.date, locale) : formatDate(d.date, locale)}
              {d.isExtended && <span className="dates-table__badge">{t('dates.extended')}</span>}
            </td>
            <td>{l(d.label)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
