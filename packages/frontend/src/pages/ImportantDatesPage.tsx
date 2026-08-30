import type { ImportantDate } from '@sieamb/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImportantDatesTable } from '../components/shared/ImportantDatesTable';
import { PageHeader } from '../components/shared/PageHeader';
import { useEvent } from '../contexts/EventContext';
import { getDataProvider } from '../services';

export function ImportantDatesPage() {
  const { t } = useTranslation();
  const { event } = useEvent();
  const [dates, setDates] = useState<ImportantDate[]>([]);

  useEffect(() => {
    if (!event) return;
    void getDataProvider().getImportantDates(event.id).then(setDates);
  }, [event]);

  return (
    <>
      <PageHeader title={t('dates.title')} />
      <section className="section">
        <div className="container">
          <ImportantDatesTable dates={dates} />
        </div>
      </section>
    </>
  );
}
