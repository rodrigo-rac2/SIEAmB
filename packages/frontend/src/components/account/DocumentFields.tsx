import { maskCpf, readDocument, type DocumentProblem } from '@sieamb/shared';
import { useTranslation } from 'react-i18next';
import { CountrySelect } from '../shared/CountrySelect';

/** The three fields as they are typed: the CPF with its dots and dash, the rest as is. */
export interface DocumentValue {
  cpf: string;
  passport: string;
  country: string;
}

export const NO_DOCUMENT: DocumentValue = { cpf: '', passport: '', country: '' };

/** What is wrong with what was typed, by the rules the server applies too; null when it can be sent. */
export function documentProblem(value: DocumentValue): DocumentProblem | null {
  const read = readDocument(value);
  return 'problem' in read ? read.problem : null;
}

/** What to send: only the fields that were filled, and a country only with a passport. */
export function documentInput(value: DocumentValue): { cpf?: string; passport?: string; country?: string } {
  const passport = value.passport.trim();
  return {
    ...(value.cpf.trim() ? { cpf: value.cpf.trim() } : {}),
    ...(passport ? { passport, country: value.country } : {}),
  };
}

interface Props {
  /** Makes the ids of the fields, so that two of these can be on one page. */
  idPrefix: string;
  value: DocumentValue;
  onChange: (value: DocumentValue) => void;
  /** A kind the account already has cannot be changed here: shown, not editable. */
  locked?: { cpf?: boolean; passport?: boolean };
  disabled?: boolean;
  /** Other names for the three fields, where a page has several of these (one per author). */
  labels?: { cpf: string; passport: string; country: string };
}

/**
 * Who the person is (ADR-010): a CPF, a passport with the country that issued it, or both.
 * The country is only asked for once a passport is being typed, and is chosen from a list.
 */
export function DocumentFields({ idPrefix, value, onChange, locked = {}, disabled = false, labels }: Props) {
  const { t } = useTranslation();
  const names = labels ?? { cpf: t('registration.cpf'), passport: t('registration.passport'), country: t('account.area.country') };
  const set = (patch: Partial<DocumentValue>) => onChange({ ...value, ...patch });
  const hasPassport = value.passport.trim() !== '';

  return (
    <>
      <div className="reg-form__row">
        <div className="reg-form__field">
          <label htmlFor={`${idPrefix}-cpf`}>{names.cpf}</label>
          <input
            id={`${idPrefix}-cpf`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="000.000.000-00"
            value={value.cpf}
            onChange={(e) => set({ cpf: maskCpf(e.target.value) })}
            readOnly={locked.cpf}
            disabled={disabled || locked.cpf}
          />
        </div>
        <div className="reg-form__field">
          <label htmlFor={`${idPrefix}-passport`}>{names.passport}</label>
          <input
            id={`${idPrefix}-passport`}
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={30}
            value={value.passport}
            // Without a passport there is no country to keep.
            onChange={(e) => set({ passport: e.target.value, ...(e.target.value.trim() ? {} : { country: '' }) })}
            readOnly={locked.passport}
            disabled={disabled || locked.passport}
          />
        </div>
      </div>
      {hasPassport && (
        <div className="reg-form__field">
          <label htmlFor={`${idPrefix}-country`}>{names.country}</label>
          <CountrySelect
            id={`${idPrefix}-country`}
            value={value.country}
            onChange={(country) => set({ country })}
            disabled={disabled || locked.passport}
          />
        </div>
      )}
    </>
  );
}
