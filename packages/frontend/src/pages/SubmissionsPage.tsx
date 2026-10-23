import type { Edital } from '@sieamb/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { EditalFiles } from '../components/editais/EditalFiles';
import { PageHeader } from '../components/shared/PageHeader';
import { useEvent } from '../contexts/EventContext';
import { getDataProvider } from '../services';
import './SubmissionsPage.css';

export function SubmissionsPage() {
  const { t } = useTranslation();
  const { event } = useEvent();
  const [edital, setEdital] = useState<Edital | null>(null);

  useEffect(() => {
    if (!event) return;
    void getDataProvider()
      .getEditais(event.id)
      .then((list) => setEdital(list[0] ?? null));
  }, [event]);

  return (
    <>
      <PageHeader title={t('submissions.title')} />
      <section className="section">
        <div className="container">
          <div className="submissions-soon" role="status">
            <h2>{t('submissions.comingSoon')}</h2>
            <p>{t('submissions.comingSoonBody')}</p>
          </div>
          {event && edital && (
            <div className="submissions-rules">
              <h2>{t('submissions.rulesTitle')}</h2>
              <p>{t('submissions.rulesBody')}</p>
              <p>
                <Link to={`/${event.slug}/editais/${edital.slug}`}>{t('submissions.rulesCta')} →</Link>
              </p>
              <h3>{t('submissions.templatesTitle')}</h3>
              <EditalFiles files={edital.attachments.filter((f) => f.format !== 'pdf')} />
            </div>
          )}
        </div>
      </section>
    </>
  );
}
