import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { RegistrationForm } from '../components/registration/RegistrationForm';
import { PageHeader } from '../components/shared/PageHeader';
import { useEvent } from '../contexts/EventContext';

export function RegistrationFormPage() {
  const { t } = useTranslation();
  const { event } = useEvent();
  const [done, setDone] = useState(false);

  if (!event) return null;

  return (
    <>
      <PageHeader title={t('registration.formTitle')} />
      <section className="section">
        <div className="container">
          {done ? (
            <div role="status" style={{ maxWidth: '60ch' }}>
              <h2 style={{ color: 'var(--color-success)' }}>{t('registration.successTitle')}</h2>
              <p>{t('registration.successBody')}</p>
              <Link to={`/${event.slug}/`}>{t('common.backToHome')}</Link>
            </div>
          ) : (
            <RegistrationForm onSuccess={() => setDone(true)} />
          )}
        </div>
      </section>
    </>
  );
}
