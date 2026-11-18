import { useTranslation } from 'react-i18next';
import './Processing.css';

/**
 * "Processando…" with a spinner, while something asked of the server is on its way (#278, #291).
 * The line, card, box or form it sits in is shaded and cannot be clicked until it is gone: see
 * Processing.css. No `role="status"`: that one is for the result.
 */
export function Processing({ when }: { when: boolean }) {
  const { t } = useTranslation();
  return when ? (
    <span className="processing" aria-live="polite" data-testid="processing">
      <span className="processing__spinner" aria-hidden="true" />
      {t('common.processing')}
    </span>
  ) : null;
}
