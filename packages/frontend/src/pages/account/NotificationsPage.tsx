import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { PageHeader } from '../../components/shared/PageHeader';
import { useAuth } from '../../contexts/AuthContext';
import { useEvent } from '../../contexts/EventContext';
import { useLocale } from '../../hooks/useLocale';
import { AccountError, fetchNotifications, markNotificationsRead, type SiteNotification } from '../../services/account';
import { NotFoundPage } from '../NotFoundPage';
import './Account.css';

/** Where a notice leads, inside the edition it is about. */
export function noticeLink(notice: SiteNotification): string | null {
  if (!notice.eventSlug) return null;
  const base = `/${notice.eventSlug}`;
  if (notice.kind.startsWith('submission.')) return `${base}/meus-trabalhos`;
  if (notice.kind.startsWith('organiser.submission.')) return `${base}/painel/trabalhos`;
  if (notice.kind === 'organiser.registration.new') return `${base}/painel`;
  if (notice.kind === 'member.added' || notice.kind.startsWith('link.')) return `${base}/minha-area`;
  return null;
}

const when = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Fortaleza' }).format(new Date(iso));

/** `/:event/notificacoes`: what the site told this person, newest first (#221). */
export function NotificationsPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const { event } = useEvent();
  const location = useLocation();
  const locale = useLocale();
  const token = auth.enabled ? auth.accessToken : null;
  const [items, setItems] = useState<SiteNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    fetchNotifications(token)
      .then(({ items: list, unread }) => {
        if (!active) return;
        setItems(list);
        // Seen once shown. What was unread stays highlighted on this visit.
        if (unread > 0) void markNotificationsRead(token).catch(() => undefined);
      })
      .catch((err: unknown) => active && setError(t(`account.errors.${err instanceof AccountError ? err.code : 'generic'}`)));
    return () => {
      active = false;
    };
  }, [token, t]);

  if (!auth.enabled) return <NotFoundPage />;
  if (auth.loading || !event) return null;
  if (!token) return <Navigate to={`/${event.slug}/conta/entrar?next=${encodeURIComponent(location.pathname)}`} replace />;

  return (
    <>
      <PageHeader title={t('notifications.title')} />
      <section className="section">
        <div className="container account" style={{ maxWidth: 760 }}>
          {error && (
            <p className="reg-form__error reg-form__error--global" role="alert">
              {error}
            </p>
          )}
          {!items && !error && <p role="status">{t('common.loading')}</p>}
          {items?.length === 0 && <p data-testid="no-notifications">{t('notifications.none')}</p>}
          {items?.map((notice) => {
            const link = noticeLink(notice);
            const announcement = notice.kind === 'announcement';
            return (
              <div
                className={`account__card${notice.readAt ? '' : ' account__card--unread'}`}
                key={notice.id}
                data-testid="notification"
                data-unread={notice.readAt ? undefined : 'true'}
              >
                <p className="reg-form__hint">
                  {when(notice.createdAt, locale)}
                  {!notice.readAt && ` · ${t('notifications.new')}`}
                </p>
                {announcement ? (
                  <>
                    <h3>{String(notice.data.subject ?? '')}</h3>
                    {String(notice.data.body ?? '')
                      .split(/\n{2,}/)
                      .map((paragraph, i) => (
                        <p key={i}>{paragraph}</p>
                      ))}
                  </>
                ) : (
                  <p>
                    {t(`notifications.kinds.${notice.kind}`, {
                      ...notice.data,
                      role: notice.data.role ? t(`panel.roles.${String(notice.data.role)}`, { defaultValue: String(notice.data.role) }) : '',
                      defaultValue: t('notifications.unknown'),
                    })}
                  </p>
                )}
                {link && <Link to={link}>{t('notifications.open')}</Link>}
              </div>
            );
          })}
          <p className="account__links">
            <Link to={`/${event.slug}/minha-area`}>{t('account.nav.myArea')}</Link>
          </p>
        </div>
      </section>
    </>
  );
}
