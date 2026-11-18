import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';

/**
 * The logged-in person's first name, which shows and hides a short list with their pages and
 * "Sair" (#311). It replaces the row of account links that sat among the language buttons.
 *
 * Built as the W3C "disclosure navigation" pattern: a button with `aria-expanded` and a plain list
 * of links inside a `nav`. Not `role="menu"`, which is for application menus and obliges arrow-key
 * handling that links do not need: here Tab, Enter and Escape work as on any other link.
 * https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation/
 */
export function AccountMenu({
  slug,
  name,
  panel,
  reviewing,
  onSignOut,
}: {
  slug: string;
  /** What the button shows: the first name, or "Minha conta" while the account is not known. */
  name: string;
  /** Whether this person may open the organisers' panel of the edition. */
  panel: boolean;
  /** Whether this person has the Avaliador role in the edition. */
  reviewing: boolean;
  onSignOut: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const location = useLocation();

  // Going to another page closes it.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    // A press or a focus anywhere else closes it. A press is heard as it starts, so touch and pen
    // count; focus is heard where it lands, so pressing "Sair" in a browser that does not focus
    // buttons on a click (Safari) cannot close the list under the pointer.
    const elsewhere = (event: Event) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', elsewhere);
    document.addEventListener('focusin', elsewhere);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', elsewhere);
      document.removeEventListener('focusin', elsewhere);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const base = `/${slug}`;
  return (
    <nav className="account-menu" aria-label={t('account.nav.menu')} ref={root}>
      <button
        ref={button}
        type="button"
        className="account-menu__button"
        aria-expanded={open}
        aria-controls={listId}
        data-testid="account-menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="account-menu__name">{name}</span>
        <span className="account-menu__caret" aria-hidden="true" />
      </button>
      <ul id={listId} className="account-menu__list" hidden={!open}>
        <li>
          <Link to={`${base}/minha-area`}>{t('account.nav.myArea')}</Link>
        </li>
        <li>
          <Link to={`${base}/meus-trabalhos`}>{t('papers.title')}</Link>
        </li>
        {reviewing && (
          <li>
            <Link to={`${base}/avaliacoes`} data-testid="topbar-reviewing">
              {t('reviewing.title')}
            </Link>
          </li>
        )}
        {panel && (
          <li>
            <Link to={`${base}/painel`} data-testid="topbar-panel">
              {t('panel.title')}
            </Link>
          </li>
        )}
        <li className="account-menu__last">
          <button
            type="button"
            className="account-menu__logout"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            {t('account.nav.logout')}
          </button>
        </li>
      </ul>
    </nav>
  );
}
