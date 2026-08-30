import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink } from 'react-router-dom';
import { useEvent } from '../../contexts/EventContext';
import './Header.css';

export function Header() {
  const { t } = useTranslation();
  const { event } = useEvent();
  const [menuOpen, setMenuOpen] = useState(false);
  const base = event ? `/${event.slug}` : '';

  const links = [
    { to: `${base}/`, label: t('nav.home'), end: true },
    { to: `${base}/o-evento`, label: t('nav.about') },
    { to: `${base}/areas-tematicas`, label: t('nav.areas') },
    { to: `${base}/submissoes`, label: t('nav.submissions') },
    { to: `${base}/inscricoes`, label: t('nav.registration') },
    { to: `${base}/datas-importantes`, label: t('nav.dates') },
    { to: `${base}/avisos`, label: t('nav.news') },
    { to: `${base}/local`, label: t('nav.venue') },
    { to: `${base}/contato`, label: t('nav.contact') },
  ];

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link to={`${base}/`} className="site-header__brand" onClick={() => setMenuOpen(false)}>
          <span className="site-header__logo" aria-hidden="true">
            {/* Placeholder mark — replaced by the official logo asset */}
            🌿
          </span>
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
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
