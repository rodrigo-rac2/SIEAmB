import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/shared/PageHeader';
import './SubmissionsPage.css';

export function SubmissionsPage() {
  const { t } = useTranslation();

  return (
    <>
      <PageHeader title={t('submissions.title')} />
      <section className="section">
        <div className="container">
          <div className="submissions-soon" role="status">
            <h2>{t('submissions.comingSoon')}</h2>
            <p>{t('submissions.comingSoonBody')}</p>
          </div>
        </div>
      </section>
    </>
  );
}
