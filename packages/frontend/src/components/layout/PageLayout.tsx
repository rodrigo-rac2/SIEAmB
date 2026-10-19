import { Outlet } from 'react-router-dom';
import { EventProvider, useEvent } from '../../contexts/EventContext';
import { eventThemeVars } from '../../lib/theme';
import { NotFoundPage } from '../../pages/NotFoundPage';
import { ArchivedBanner } from './ArchivedBanner';
import { Footer } from './Footer';
import { Header } from './Header';
import { TopBar } from './TopBar';

function ThemedShell() {
  const { event, notFound } = useEvent();

  return (
    // Per-edition palette: the event's theme overrides the CSS tokens for
    // everything inside this wrapper; tokens.css stays the fallback.
    <div className="event-shell" style={eventThemeVars(event?.theme)}>
      <TopBar />
      <Header />
      <ArchivedBanner />
      <main>
        {/* Unknown edition slug (#58): the pages render nothing without an event. */}
        {notFound ? <NotFoundPage /> : <Outlet />}
      </main>
      <Footer />
    </div>
  );
}

export function PageLayout() {
  return (
    <EventProvider>
      <ThemedShell />
    </EventProvider>
  );
}
