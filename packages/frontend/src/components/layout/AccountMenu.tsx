import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';

/**
 * The logged-in person's first name, opening a small menu with their pages and "Sair" (#311).
 * It replaces the row of account links that used to sit among the language buttons.
 */
export function AccountMenu({
  slug,
  name,
  panel,
  onSignOut,
}: {
  slug: string;
  /** What the button shows: the first name, or the e-mail until the account has been read. */
  name: string;
  /** Whether this person may open the organisers' panel of the edition. */
  panel: boolean;
  onSignOut: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const location = useLocation();

  // Going somewhere closes it.
  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        root.current?.querySelector('button')?.focus();
      }
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const base = `/${slug}`;
  return (
    <div className="account-menu" ref={root}>
      <button
        type="button"
        className="account-menu__button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('account.nav.menuOf', { name })}
        data-testid="account-menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="account-menu__name">{name}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="account-menu__list" role="menu">
          <Link role="menuitem" to={`${base}/minha-area`}>
            {t('account.nav.myArea')}
          </Link>
          <Link role="menuitem" to={`${base}/meus-trabalhos`}>
            {t('papers.title')}
          </Link>
          {panel && (
            <Link role="menuitem" to={`${base}/painel`} data-testid="topbar-panel">
              {t('panel.title')}
            </Link>
          )}
          <button
            type="button"
            role="menuitem"
            className="account-menu__logout"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            {t('account.nav.logout')}
          </button>
        </div>
      )}
    </div>
  );
}
