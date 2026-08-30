import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/shared/PageHeader';

export function ContactPage() {
  const { t } = useTranslation();

  return (
    <>
      <PageHeader title={t('contact.title')} />
      <section className="section">
        <div className="container" style={{ maxWidth: '72ch' }}>
          <h2>{t('contact.emailLabel')}</h2>
          <p>
            {/* Placeholder — confirm the official event email with the committee */}
            <a href="mailto:sieamb@ufcg.edu.br">sieamb@ufcg.edu.br</a>
          </p>
        </div>
      </section>
    </>
  );
}
