import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PageLayout } from './components/layout/PageLayout';
import { AuthProvider } from './contexts/AuthContext';
import { AboutPage } from './pages/AboutPage';
import { LinkPage } from './pages/account/LinkPage';
import { LoginPage } from './pages/account/LoginPage';
import { MyAreaPage } from './pages/account/MyAreaPage';
import { PasswordPage } from './pages/account/PasswordPage';
import { SignupPage } from './pages/account/SignupPage';
import { AnaisPage } from './pages/AnaisPage';
import { MyPapersPage } from './pages/papers/MyPapersPage';
import { PaperFormPage } from './pages/papers/PaperFormPage';
import { PanelPage } from './pages/panel/PanelPage';
import { CommitteePage } from './pages/CommitteePage';
import { ContactPage } from './pages/ContactPage';
import { EditaisPage } from './pages/EditaisPage';
import { EditalPage } from './pages/EditalPage';
import { EditionsPage } from './pages/EditionsPage';
import { HomePage } from './pages/HomePage';
import { ImportantDatesPage } from './pages/ImportantDatesPage';
import { NewsDetailPage } from './pages/NewsDetailPage';
import { NewsListPage } from './pages/NewsListPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PaymentPage } from './pages/PaymentPage';
import { PaymentReturnPage } from './pages/PaymentReturnPage';
import { RegistrationFormPage } from './pages/RegistrationFormPage';
import { RegistrationInfoPage } from './pages/RegistrationInfoPage';
import { ProgrammePage } from './pages/ProgrammePage';
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
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

function AppRoutes() {
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
          <Route path="programacao" element={<ProgrammePage />} />
          <Route path="editais" element={<EditaisPage />} />
          <Route path="editais/:editalSlug" element={<EditalPage />} />
          <Route path="submissoes" element={<SubmissionsPage />} />
          <Route path="inscricoes" element={<RegistrationInfoPage />} />
          <Route path="inscricoes/nova" element={<RegistrationFormPage />} />
          <Route path="inscricoes/pagar" element={<PaymentPage />} />
          <Route path="inscricoes/pagamento" element={<PaymentReturnPage />} />
          <Route path="conta/entrar" element={<LoginPage />} />
          <Route path="conta/criar" element={<SignupPage mode="signup" />} />
          <Route path="conta/recuperar" element={<SignupPage mode="recover" />} />
          <Route path="conta/confirmar" element={<PasswordPage type="signup" />} />
          <Route path="conta/nova-senha" element={<PasswordPage type="recovery" />} />
          <Route path="conta/vincular" element={<LinkPage />} />
          <Route path="minha-area" element={<MyAreaPage />} />
          <Route path="painel" element={<PanelPage tab="registrations" />} />
          <Route path="painel/trabalhos" element={<PanelPage tab="papers" />} />
          <Route path="painel/pessoas" element={<PanelPage tab="people" />} />
          <Route path="painel/pedidos" element={<PanelPage tab="requests" />} />
          <Route path="meus-trabalhos" element={<MyPapersPage />} />
          <Route path="meus-trabalhos/novo" element={<PaperFormPage />} />
          <Route path="meus-trabalhos/:paperId" element={<PaperFormPage />} />
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
