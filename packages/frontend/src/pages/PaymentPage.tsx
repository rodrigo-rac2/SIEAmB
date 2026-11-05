import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { PaymentPrompt } from '../components/payment/PaymentPrompt';
import { PageHeader } from '../components/shared/PageHeader';
import { isUuid, paymentsEnabled } from '../services/payments';
import { NotFoundPage } from './NotFoundPage';

/** `/:event/inscricoes/pagar?t=<pay token>`: pay a pre-registration made earlier. */
export function PaymentPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('t');

  if (!paymentsEnabled()) return <NotFoundPage />;

  return (
    <>
      <PageHeader title={t('payment.title')} />
      <section className="section">
        <div className="container">
          {isUuid(token) ? (
            <PaymentPrompt token={token} />
          ) : (
            <p role="alert">{t('payment.errors.invalidLink')}</p>
          )}
        </div>
      </section>
    </>
  );
}
