import { useTranslation } from 'react-i18next';
import { PageHeader } from './PageHeader';
import './Processing.css';
import './Loading.css';

/**
 * "Carregando…" with the spinner of the waiting state (#278), while a page or a part of it waits
 * for the server (#324). Whatever depends on the answer is not drawn until it is in: a page never
 * shows a guess that the answer then replaces. Like `Processing`, it is announced politely but is
 * not a `role="status"`: on these pages that role is the result's.
 */
export function Loading() {
  const { t } = useTranslation();
  return (
    <p className="loading" aria-live="polite" data-testid="loading">
      <span className="processing__spinner" aria-hidden="true" />
      {t('common.loading')}
    </p>
  );
}

/** A whole page that cannot be drawn yet, under its own title so the title does not jump in later. */
export function PageLoading({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <section className="section">
        <div className="container">
          <Loading />
        </div>
      </section>
    </>
  );
}
