import { Outlet } from 'react-router-dom';
import { EventProvider } from '../../contexts/EventContext';
import { Footer } from './Footer';
import { Header } from './Header';
import { TopBar } from './TopBar';

export function PageLayout() {
  return (
    <EventProvider>
      <TopBar />
      <Header />
      <main>
        <Outlet />
      </main>
      <Footer />
    </EventProvider>
  );
}
