import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/shared/PageHeader';
import { useEvent } from '../contexts/EventContext';

export function VenuePage() {
  const { t } = useTranslation();
  const { event } = useEvent();

  return (
    <>
      <PageHeader title={t('venue.title')} />
      <section className="section">
        <div className="container" style={{ maxWidth: '72ch' }}>
          <h2>{event?.venue ?? 'UFCG'}</h2>
          <p>
            Universidade Federal de Campina Grande — Rua Aprígio Veloso, 882, Universitário,
            Campina Grande - PB.
          </p>
          <p>
            <a
              href="https://maps.google.com/?q=Universidade+Federal+de+Campina+Grande"
              target="_blank"
              rel="noreferrer"
            >
              Google Maps →
            </a>
          </p>
        </div>
      </section>
    </>
  );
}
