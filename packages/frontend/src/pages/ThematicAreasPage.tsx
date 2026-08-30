import type { ThematicArea } from '@sieamb/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/shared/PageHeader';
import { useEvent } from '../contexts/EventContext';
import { getDataProvider } from '../services';
import './ThematicAreasPage.css';

export function ThematicAreasPage() {
  const { t } = useTranslation();
  const { event } = useEvent();
  const [areas, setAreas] = useState<ThematicArea[]>([]);

  useEffect(() => {
    if (!event) return;
    void getDataProvider().getThematicAreas(event.id).then(setAreas);
  }, [event]);

  return (
    <>
      <PageHeader title={t('areas.title')} />
      <section className="section">
        <div className="container">
          <ol className="areas-list">
            {areas.map((area) => (
              <li key={area.id} className="areas-list__item">
                <span className="areas-list__code">{area.code}</span>
                <div>
                  <h2>{area.name}</h2>
                  {area.description && <p>{area.description}</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
