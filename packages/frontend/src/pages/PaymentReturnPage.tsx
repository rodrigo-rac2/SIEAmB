import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/shared/PageHeader';
import { useEvent } from '../contexts/EventContext';
import {
  PaymentError,
  formatBRL,
  getPaymentStatus,
  isUuid,
  paymentsEnabled,
  recallPayToken,
  type PaymentErrorCode,
  type PaymentState,
} from '../services/payments';
import { NotFoundPage } from './NotFoundPage';
import '../components/payment/Payment.css';

const OPEN = ['CREATED', 'PENDING'];
const RETRY = ['CREATED', 'REJECTED', 'CANCELLED'];

interface Props {
  /** Test seams: how often and how many times an open payment is re-checked. */
  pollMs?: number;
  maxPolls?: number;
}

/**
 * `/:event/inscricoes/pagamento?p=<payment id>`: where Mercado Pago sends people back.
 * The status comes from our server; the query string Mercado Pago adds is ignored.
 */
export function PaymentReturnPage({ pollMs = 3000, maxPolls = 5 }: Props) {
  const { t, i18n } = useTranslation();
  const { event } = useEvent();
  const [params] = useSearchParams();
  const paymentId = params.get('p');
  const enabled = paymentsEnabled();
  const valid = isUuid(paymentId);

  const [state, setState] = useState<PaymentState | null>(null);
  const [error, setError] = useState<PaymentErrorCode | null>(null);
  const [polls, setPolls] = useState(0);

  useEffect(() => {
    if (!enabled || !valid) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      getPaymentStatus(paymentId)
        .then((next) => {
          if (cancelled) return;
          setState(next);
          setError(null);
          // A card payment is confirmed within seconds: look again a few times before giving up.
          if (OPEN.includes(next.status) && polls < maxPolls) {
            timer = setTimeout(() => setPolls((n) => n + 1), pollMs);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(err instanceof PaymentError ? err.code : 'generic');
        });
    };
    check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, valid, paymentId, polls, maxPolls, pollMs]);

  if (!enabled) return <NotFoundPage />;
  if (!event) return null;

  const token = recallPayToken();
  const checking = !state && !error && valid;
  const stillChecking = !!state && OPEN.includes(state.status) && polls < maxPolls;

  return (
    <>
      <PageHeader title={t('payment.return.title')} />
      <section className="section">
        <div className="container payment">
          {!valid && <p role="alert">{t('payment.errors.invalidLink')}</p>}
          {checking && <p role="status">{t('payment.return.checking')}</p>}
          {error && <p role="alert">{t(`payment.errors.${error}`)}</p>}
          {state && (
            <div role="status">
              <h2
                style={state.status === 'APPROVED' ? { color: 'var(--color-success)' } : undefined}
              >
                {t(`payment.return.${state.status}.title`)}
              </h2>
              <p>{t(`payment.return.${state.status}.body`)}</p>
              {state.amountCents > 0 && (
                <p>
                  {t('payment.return.amount')}: {formatBRL(state.amountCents, i18n.language)}
                </p>
              )}
              {stillChecking && <p>{t('payment.return.checking')}</p>}
              {!stillChecking && RETRY.includes(state.status) && token && (
                <p>
                  <Link to={`/${event.slug}/inscricoes/pagar?t=${token}`}>
                    {t('payment.return.retry')}
                  </Link>
                </p>
              )}
            </div>
          )}
          <p>
            <Link to={`/${event.slug}/`}>{t('common.backToHome')}</Link>
          </p>
        </div>
      </section>
    </>
  );
}
