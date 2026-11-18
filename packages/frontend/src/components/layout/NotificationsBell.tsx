import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { fetchNotifications } from '../../services/account';

/**
 * The bell of the top bar (#221): a link to the notifications with the number of
 * unread ones. Asked again on every page change, so it clears after a visit.
 */
export function NotificationsBell({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const auth = useAuth();
  const location = useLocation();
  const token = auth.enabled ? auth.accessToken : null;
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!token) return setUnread(0);
    let active = true;
    fetchNotifications(token)
      // The page that shows them marks them as read as it opens.
      .then((data) => active && setUnread(location.pathname.endsWith('/notificacoes') ? 0 : data.unread))
      // A bell that cannot be filled in is not worth an error on every page.
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [token, location.pathname]);

  if (!token) return null;
  return (
    <Link
      className="topbar__editions"
      to={`/${slug}/notificacoes`}
      aria-label={unread > 0 ? t('notifications.bellUnread', { count: unread }) : t('notifications.title')}
      data-testid="bell"
    >
      <span aria-hidden="true">🔔</span>
      {unread > 0 && <span className="topbar__badge" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
    </Link>
  );
}
