import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/shared/PageHeader';
import './SubmissionsPage.css';

/** Placeholder until the committee publishes the programme (planned for December 2026). */
export function ProgrammePage() {
  const { t } = useTranslation();

  return (
    <>
      <PageHeader title={t('programme.title')} />
      <section className="section">
        <div className="container">
          <div className="submissions-soon" role="status">
            <h2>{t('programme.comingSoon')}</h2>
            <p>{t('programme.comingSoonBody')}</p>
          </div>
        </div>
      </section>
    </>
  );
}
