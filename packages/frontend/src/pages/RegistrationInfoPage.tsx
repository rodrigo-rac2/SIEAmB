import type { FeeTier } from '@sieamb/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { FeeTable } from '../components/registration/FeeTable';
import { PageHeader } from '../components/shared/PageHeader';
import { useEvent } from '../contexts/EventContext';
import { getDataProvider } from '../services';

export function RegistrationInfoPage() {
  const { t } = useTranslation();
  const { event } = useEvent();
  const [tiers, setTiers] = useState<FeeTier[]>([]);

  useEffect(() => {
    if (!event) return;
    void getDataProvider().getFeeTiers(event.id).then(setTiers);
  }, [event]);

  if (!event) return null;

  return (
    <>
      <PageHeader title={t('registration.title')} />
      <section className="section">
        <div className="container">
          <h2>{t('registration.feesTitle')}</h2>
          <FeeTable tiers={tiers} />
          <p style={{ marginTop: 'var(--space-4)' }}>{t('registration.paymentNote')}</p>
          {event.settings.registrationOpen && (
            <Link
              className="hero__cta"
              to={`/${event.slug}/inscricoes/nova`}
              style={{ marginTop: 'var(--space-2)' }}
            >
              {t('registration.registerCta')}
            </Link>
          )}
        </div>
      </section>
    </>
  );
}
