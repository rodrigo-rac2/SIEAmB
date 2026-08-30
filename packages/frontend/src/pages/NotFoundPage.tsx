import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <section className="section">
      <div className="container">
        <h1>{t('common.notFoundTitle')}</h1>
        <p>{t('common.notFoundBody')}</p>
        <Link to="/">{t('common.backToHome')}</Link>
      </div>
    </section>
  );
}
