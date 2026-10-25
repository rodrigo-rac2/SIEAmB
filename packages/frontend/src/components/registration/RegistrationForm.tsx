import { zodResolver } from '@hookform/resolvers/zod';
import { registrationSchema, type RegistrationFormData } from '@sieamb/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useEvent } from '../../contexts/EventContext';
import {
  DuplicateRegistrationError,
  RegistrationClosedError,
  getDataProvider,
} from '../../services';
import './RegistrationForm.css';

// Categories offered to the II SIEAmB (committee fee table, 2026-10-10). The fee tiers decide what is shown.
const CATEGORIES = ['ESTUDANTE_GRADUACAO', 'ESTUDANTE_POS', 'PROFISSIONAL'] as const;

export function RegistrationForm({ onSuccess }: { onSuccess: () => void }) {
  const { t, i18n } = useTranslation();
  const { event } = useEvent();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema),
    defaultValues: { country: 'BR', category: 'ESTUDANTE_POS', modality: 'ONLINE', consent: false },
  });

  if (!event) return null;

  const onSubmit = handleSubmit(async (data) => {
    setSubmitError(null);
    try {
      const parsed = registrationSchema.parse(data);
      await getDataProvider().createRegistration(event.id, {
        fullName: parsed.fullName,
        email: parsed.email,
        cpf: parsed.cpf || undefined,
        passport: parsed.passport || undefined,
        country: parsed.country,
        institution: parsed.institution || undefined,
        category: parsed.category,
        modality: parsed.modality,
        locale: i18n.language,
      });
      onSuccess();
    } catch (err) {
      if (err instanceof DuplicateRegistrationError) {
        setSubmitError(t('registration.errors.duplicate'));
      } else if (err instanceof RegistrationClosedError) {
        setSubmitError(t('registration.errors.closed'));
      } else {
        setSubmitError(t('common.error'));
      }
    }
  });

  const errKey = (field: keyof RegistrationFormData): string | null => {
    const err = errors[field];
    if (!err) return null;
    const msg = err.message ?? '';
    if (msg === 'invalid_cpf' || msg === 'cpf_or_passport_required' || msg === 'consent_required') {
      return t(`registration.errors.${msg}`);
    }
    return t(`registration.errors.${String(field)}`, { defaultValue: t('common.error') });
  };

  return (
    <form className="reg-form" onSubmit={(e) => void onSubmit(e)} noValidate>
      <div className="reg-form__field">
        <label htmlFor="fullName">
          {t('registration.fullName')} <span aria-hidden="true">*</span>
        </label>
        <input id="fullName" type="text" autoComplete="name" {...register('fullName')} />
        {errKey('fullName') && <p className="reg-form__error">{errKey('fullName')}</p>}
      </div>

      <div className="reg-form__field">
        <label htmlFor="email">
          {t('registration.email')} <span aria-hidden="true">*</span>
        </label>
        <input id="email" type="email" autoComplete="email" {...register('email')} />
        {errKey('email') && <p className="reg-form__error">{errKey('email')}</p>}
      </div>

      <div className="reg-form__row">
        <div className="reg-form__field">
          <label htmlFor="cpf">{t('registration.cpf')}</label>
          <input
            id="cpf"
            type="text"
            inputMode="numeric"
            placeholder="000.000.000-00"
            {...register('cpf')}
          />
          {errKey('cpf') && <p className="reg-form__error">{errKey('cpf')}</p>}
        </div>
        <div className="reg-form__field">
          <label htmlFor="passport">{t('registration.passport')}</label>
          <input id="passport" type="text" {...register('passport')} />
        </div>
      </div>
      <p className="reg-form__hint">{t('registration.cpfOrPassportHint')}</p>

      <div className="reg-form__field">
        <label htmlFor="institution">{t('registration.institution')}</label>
        <input
          id="institution"
          type="text"
          autoComplete="organization"
          {...register('institution')}
        />
      </div>

      <div className="reg-form__row">
        <div className="reg-form__field">
          <label htmlFor="category">
            {t('registration.category')} <span aria-hidden="true">*</span>
          </label>
          <select id="category" {...register('category')}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`registration.categories.${c}`)}
              </option>
            ))}
          </select>
        </div>
        {!event.isOnline && (
          <div className="reg-form__field">
            <label htmlFor="modality">
              {t('registration.modality')} <span aria-hidden="true">*</span>
            </label>
            <select id="modality" {...register('modality')}>
              <option value="PRESENCIAL">{t('registration.modalities.PRESENCIAL')}</option>
              <option value="ONLINE">{t('registration.modalities.ONLINE')}</option>
            </select>
          </div>
        )}
      </div>

      <div className="reg-form__field reg-form__field--check">
        <label className="reg-form__check" htmlFor="consent">
          <input id="consent" type="checkbox" {...register('consent')} />
          <span>
            {t('registration.consent')} <span aria-hidden="true">*</span>
          </span>
        </label>
        {errKey('consent') && <p className="reg-form__error">{errKey('consent')}</p>}
      </div>

      {submitError && (
        <p className="reg-form__error reg-form__error--global" role="alert">
          {submitError}
        </p>
      )}

      <button className="reg-form__submit" type="submit" disabled={isSubmitting}>
        {isSubmitting ? t('registration.submitting') : t('registration.submit')}
      </button>
    </form>
  );
}
