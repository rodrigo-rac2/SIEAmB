import { useTranslation } from 'react-i18next';
import { ImportantDatesTable } from '../components/shared/ImportantDatesTable';
import { PageHeader } from '../components/shared/PageHeader';
import { useEvent } from '../contexts/EventContext';
import { useContent } from '../hooks/useContent';

export function ImportantDatesPage() {
  const { t } = useTranslation();
  const { event } = useEvent();
  const dates = useContent('getImportantDates', event?.id) ?? [];

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
