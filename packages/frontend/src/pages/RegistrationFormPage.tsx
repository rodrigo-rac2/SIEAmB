import type { Registration } from '@sieamb/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PaymentPrompt } from '../components/payment/PaymentPrompt';
import { RegistrationForm } from '../components/registration/RegistrationForm';
import { PageHeader } from '../components/shared/PageHeader';
import { useEvent } from '../contexts/EventContext';
import { paymentsEnabled } from '../services/payments';

export function RegistrationFormPage() {
  const { t } = useTranslation();
  const { event } = useEvent();
  const [done, setDone] = useState<Registration | null>(null);

  if (!event) return null;

  // Only when payments are on and the form handed back the handle to pay with.
  const payToken = paymentsEnabled() ? done?.payToken : undefined;
  const payLink = payToken
    ? `${window.location.origin}/${event.slug}/inscricoes/pagar?t=${payToken}`
    : null;

  return (
    <>
      <PageHeader title={t('registration.formTitle')} />
      <section className="section">
        <div className="container">
          {done ? (
            <div role="status" style={{ maxWidth: '60ch' }}>
              <h2 style={{ color: 'var(--color-success)' }}>{t('registration.successTitle')}</h2>
              {payToken && payLink ? (
                <>
                  <PaymentPrompt token={payToken} />
                  <p>
                    {t('payment.payLater')}{' '}
                    <a className="payment__link" href={payLink}>
                      {payLink}
                    </a>
                  </p>
                </>
              ) : (
                <p>{t('registration.successBody')}</p>
              )}
              <Link to={`/${event.slug}/`}>{t('common.backToHome')}</Link>
            </div>
          ) : (
            <RegistrationForm onSuccess={setDone} />
          )}
        </div>
      </section>
    </>
  );
}
