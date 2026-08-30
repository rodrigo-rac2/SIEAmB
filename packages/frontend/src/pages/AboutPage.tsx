import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/shared/PageHeader';
import { useEvent } from '../contexts/EventContext';

export function AboutPage() {
  const { t } = useTranslation();
  const { event } = useEvent();

  return (
    <>
      <PageHeader title={t('about.title')} />
      <section className="section">
        <div className="container" style={{ maxWidth: '72ch' }}>
          <p>
            <strong>{event?.fullName}</strong>
          </p>
          <p>{t('home.aboutTeaser')}</p>
          <p>{t('about.organizedBy')}.</p>
        </div>
      </section>
    </>
  );
}
