import { formatDate, type ImportantDate, type Locale } from '@sieamb/shared';
import { useTranslation } from 'react-i18next';
import './ImportantDatesTable.css';

export function ImportantDatesTable({ dates }: { dates: ImportantDate[] }) {
  const { t, i18n } = useTranslation();
  const locale = (i18n.resolvedLanguage ?? 'pt-BR') as Locale;

  if (dates.length === 0) return null;

  return (
    <table className="dates-table">
      <tbody>
        {dates.map((d) => (
          <tr key={d.id}>
            <td className="dates-table__date">
              {formatDate(d.date, locale)}
              {d.isExtended && <span className="dates-table__badge">{t('dates.extended')}</span>}
            </td>
            <td>{d.label}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
