import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink } from 'react-router-dom';
import { useEvent } from '../../contexts/EventContext';
import { assetUrl } from '../../lib/assets';
import { navLinks } from '../../lib/nav';
import './Header.css';

export function Header() {
  const { t } = useTranslation();
  const { event } = useEvent();
  const [menuOpen, setMenuOpen] = useState(false);
  const base = event ? `/${event.slug}` : '';

  const links = navLinks(event);

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link to={`${base}/`} className="site-header__brand" onClick={() => setMenuOpen(false)}>
          {event?.logoUrl ? (
            <img
              className="site-header__logo-img"
              src={assetUrl(event.logoUrl)}
              alt=""
            />
          ) : (
            <span className="site-header__logo" aria-hidden="true">
              🌿
            </span>
          )}
          <span className="site-header__name">
            {event?.name ?? t('common.eventName')}
          </span>
        </Link>

        <button
          className="site-header__toggle"
          aria-expanded={menuOpen}
          aria-label={t('nav.menu')}
          onClick={() => setMenuOpen((v) => !v)}
        >
          ☰
        </button>

        <nav className={`site-header__nav ${menuOpen ? 'is-open' : ''}`} aria-label="principal">
          <ul>
            {links.map((link) => (
              <li key={link.to}>
                <NavLink to={link.to} end={link.end} onClick={() => setMenuOpen(false)}>
                  {t(link.labelKey)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
