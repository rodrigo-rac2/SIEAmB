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
            <a href="mailto:sieambufcg@gmail.com">sieambufcg@gmail.com</a>
          </p>
          <h2>{t('contact.socialLabel')}</h2>
          <p>
            <a href="https://www.instagram.com/sieamb_ppgegrn" target="_blank" rel="noreferrer">
              @sieamb_ppgegrn
            </a>
          </p>
        </div>
      </section>
    </>
  );
}
