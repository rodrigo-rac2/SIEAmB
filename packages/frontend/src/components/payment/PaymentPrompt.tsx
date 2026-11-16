import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PaymentError, rememberPayToken, startPayment } from '../../services/payments';
import './Payment.css';

interface Props {
  token: string;
  /** Test seam: how the browser leaves for the checkout. */
  goTo?: (url: string) => void;
}

/** "Pagar com Mercado Pago": asks the server for the checkout link and sends the person there. */
export function PaymentPrompt({ token, goTo = (url) => window.location.assign(url) }: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { checkoutUrl } = await startPayment(token);
      rememberPayToken(token);
      goTo(checkoutUrl);
      // Stay busy: the page is being left, a second click must not open anything else.
    } catch (err) {
      const code = err instanceof PaymentError ? err.code : 'generic';
      setError(t(`payment.errors.${code}`));
      setBusy(false);
    }
  };

  return (
    <div className="payment">
      <p>{t('payment.intro')}</p>
      <button className="payment__button" type="button" onClick={() => void pay()} disabled={busy}>
        {busy ? t('payment.redirecting') : t('payment.payButton')}
      </button>
      {error && (
        <p className="payment__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
