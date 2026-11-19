import { PASSPORT_COUNTRIES, countryName } from '@sieamb/shared';
import { useMemo, type SelectHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../../hooks/useLocale';

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange' | 'children'> & {
  /** The two-letter code chosen, or '' for none yet. */
  value: string;
  onChange: (code: string) => void;
};

/**
 * The country of a passport (ADR-010): a list, by name in the language of the page, so
 * that what is stored is always a real two-letter code and never something typed.
 * Brazil is not in it: Brazilians are identified by the CPF.
 */
export function CountrySelect({ value, onChange, ...rest }: Props) {
  const { t } = useTranslation();
  const locale = useLocale();
  const options = useMemo(() => {
    const collator = new Intl.Collator(locale);
    return PASSPORT_COUNTRIES.map((code) => ({ code, name: countryName(code, locale) })).sort((a, b) =>
      collator.compare(a.name, b.name),
    );
  }, [locale]);

  return (
    <select {...rest} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t('registration.countryChoose')}</option>
      {options.map(({ code, name }) => (
        <option key={code} value={code}>
          {name}
        </option>
      ))}
    </select>
  );
}
