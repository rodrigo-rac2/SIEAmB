import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PageLayout } from './components/layout/PageLayout';
import { AboutPage } from './pages/AboutPage';
import { AnaisPage } from './pages/AnaisPage';
import { CommitteePage } from './pages/CommitteePage';
import { ContactPage } from './pages/ContactPage';
import { EditionsPage } from './pages/EditionsPage';
import { HomePage } from './pages/HomePage';
import { ImportantDatesPage } from './pages/ImportantDatesPage';
import { NewsDetailPage } from './pages/NewsDetailPage';
import { NewsListPage } from './pages/NewsListPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { RegistrationFormPage } from './pages/RegistrationFormPage';
import { RegistrationInfoPage } from './pages/RegistrationInfoPage';
import { SubmissionsPage } from './pages/SubmissionsPage';
import { ThematicAreasPage } from './pages/ThematicAreasPage';
import { VenuePage } from './pages/VenuePage';
import { getDataProvider } from './services';

/** Redirects / to the configured current event. */
function RootRedirect() {
  const [slug, setSlug] = useState<string | null>(null);

  useEffect(() => {
    void getDataProvider()
      .getCurrentEvent()
      .then((e) => setSlug(e.slug));
  }, []);

  if (!slug) return null;
  return <Navigate to={`/${slug}/`} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route element={<PageLayout />}>
        <Route path="/edicoes-anteriores" element={<EditionsPage />} />
        <Route path="/:eventSlug">
          <Route index element={<HomePage />} />
          <Route path="o-evento" element={<AboutPage />} />
          <Route path="organizacao" element={<CommitteePage />} />
          <Route path="areas-tematicas" element={<ThematicAreasPage />} />
          <Route path="submissoes" element={<SubmissionsPage />} />
          <Route path="inscricoes" element={<RegistrationInfoPage />} />
          <Route path="inscricoes/nova" element={<RegistrationFormPage />} />
          <Route path="datas-importantes" element={<ImportantDatesPage />} />
          <Route path="avisos" element={<NewsListPage />} />
          <Route path="avisos/:newsSlug" element={<NewsDetailPage />} />
          <Route path="anais" element={<AnaisPage />} />
          <Route path="local" element={<VenuePage />} />
          <Route path="contato" element={<ContactPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
