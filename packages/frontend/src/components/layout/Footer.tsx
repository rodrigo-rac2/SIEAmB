import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useEvent } from '../../contexts/EventContext';
import './Footer.css';

export function Footer() {
  const { t } = useTranslation();
  const { event } = useEvent();
  const base = event ? `/${event.slug}` : '';

  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div>
          <h2 className="site-footer__title">{t('footer.realization')}</h2>
          <p>{t('footer.realizationText')}</p>
        </div>
        <div>
          <h2 className="site-footer__title">{t('footer.quickLinks')}</h2>
          <ul className="site-footer__links">
            <li>
              <Link to={`${base}/inscricoes`}>{t('nav.registration')}</Link>
            </li>
            <li>
              <Link to={`${base}/submissoes`}>{t('nav.submissions')}</Link>
            </li>
            <li>
              <Link to={`${base}/avisos`}>{t('nav.news')}</Link>
            </li>
            <li>
              <Link to="/edicoes-anteriores">{t('nav.editions')}</Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="site-footer__bottom">
        <div className="container">
          <span>
            {event?.fullName ?? t('common.eventFullName')} — UFCG
          </span>
        </div>
      </div>
    </footer>
  );
}
