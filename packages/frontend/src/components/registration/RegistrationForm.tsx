import { zodResolver } from '@hookform/resolvers/zod';
import {
  maskCpf,
  registrationSchema,
  type Registration,
  type RegistrationFormData,
} from '@sieamb/shared';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useEvent } from '../../contexts/EventContext';
import { checkDuplicateRegistration, fetchAccount } from '../../services/account';
import {
  DuplicateRegistrationError,
  RegistrationClosedError,
  getDataProvider,
} from '../../services';
import './RegistrationForm.css';

// Categories offered to the II SIEAmB (committee fee table, 2026-10-10). The fee tiers decide what is shown.
const CATEGORIES = ['ESTUDANTE_GRADUACAO', 'ESTUDANTE_POS', 'PROFISSIONAL'] as const;

export function RegistrationForm({
  onSuccess,
}: {
  /** The e-mail is handed back too: the saved row cannot be read by the browser. */
  onSuccess: (registration: Registration, email: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const { event } = useEvent();
  const { accessToken, email: sessionEmail, loading: authLoading } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Logged in (#210): the registration is made with the account's own e-mail. It comes from the
  // session, known before any call to the server, so there is no moment in which a logged-in person
  // can type another one (#290).
  const accountEmail = sessionEmail ? sessionEmail.toLowerCase() : null;
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;

  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema),
    defaultValues: { country: 'BR', category: 'ESTUDANTE_POS', modality: 'ONLINE', consent: false },
  });

  // The account's e-mail goes in at once; name, document and institution follow from the account,
  // and only into fields still empty, so nothing the person already typed is thrown away. Keyed on
  // the e-mail, not on the token, which changes on every refresh and used to drop the answer (#290).
  useEffect(() => {
    if (!accountEmail) return;
    setValue('email', accountEmail, { shouldValidate: false });
    const token = tokenRef.current;
    if (!token) return;
    let active = true;
    const fillEmpty = (field: 'fullName' | 'cpf' | 'passport' | 'institution', value: string | null | undefined) => {
      if (value && !getValues(field)) setValue(field, value);
    };
    fetchAccount(token)
      .then(({ user }) => {
        if (!active) return;
        fillEmpty('fullName', user.fullName);
        fillEmpty('cpf', user.cpf ? maskCpf(user.cpf) : null);
        fillEmpty('passport', user.passport);
        fillEmpty('institution', user.institution);
        if (user.passport && !getValues('cpf')) setValue('country', user.country);
      })
      // The form still works without the account's data.
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [accountEmail, getValues, setValue]);

  if (!event) return null;

  const onSubmit = handleSubmit(async (data) => {
    setSubmitError(null);
    try {
      // Logged in, the e-mail is the account's whatever the field says (#290).
      const parsed = registrationSchema.parse(accountEmail ? { ...data, email: accountEmail } : data);
      const check = await checkDuplicateRegistration({
        eventSlug: event.slug,
        email: parsed.email,
        cpf: parsed.cpf || undefined,
        passport: parsed.passport || undefined,
        country: parsed.country,
      });
      if (check.duplicate) {
        setSubmitError(t('registration.errors.duplicateDocument', { email: check.maskedEmail ?? '' }));
        return;
      }
      const registration = await getDataProvider().createRegistration(event.id, {
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
      onSuccess(registration, parsed.email);
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
        <input
          id="email"
          type="email"
          autoComplete="email"
          readOnly={Boolean(accountEmail) || authLoading}
          {...register('email')}
        />
        {accountEmail && <p className="reg-form__hint">{t('registration.accountEmailHint')}</p>}
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
            {...register('cpf', {
              // Format while typing; the schema strips the mask again before validating.
              onChange: (e: ChangeEvent<HTMLInputElement>) => {
                e.target.value = maskCpf(e.target.value);
              },
            })}
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
