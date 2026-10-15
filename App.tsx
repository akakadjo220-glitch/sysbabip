import React, { useState, useEffect, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { Layout } from './components/Layout';
import { Marketplace } from './views/Marketplace';
import { UserRole } from './types';
import { AuthProvider, useAuth } from './context/AuthContext';
import { lazyNamed } from './utils/lazyPage';
import { ErrorBoundary } from './components/ErrorBoundary';

// L'accueil est chargé tout de suite ; les autres pages seulement quand on les
// ouvre (un acheteur ne télécharge jamais le code des tableaux de bord).
const EventDetails = lazyNamed(() => import('./views/EventDetails'), 'EventDetails');
const MyTickets = lazyNamed(() => import('./views/MyTickets'), 'MyTickets');
const FundraisingPage = lazyNamed(() => import('./views/FundraisingPage'), 'FundraisingPage');
const TournamentPage = lazyNamed(() => import('./views/TournamentPage'), 'TournamentPage');
const OrganizerPublicPage = lazyNamed(() => import('./views/OrganizerPublicPage'), 'OrganizerPublicPage');
const About = lazyNamed(() => import('./views/About'), 'About');
const FAQ = lazyNamed(() => import('./views/FAQ'), 'FAQ');
const Privacy = lazyNamed(() => import('./views/Privacy'), 'Privacy');
const Terms = lazyNamed(() => import('./views/Terms'), 'Terms');
const OrganizerLogin = lazyNamed(() => import('./views/OrganizerLogin'), 'OrganizerLogin');
const AdminLogin = lazyNamed(() => import('./views/AdminLogin'), 'AdminLogin');
const AgentLogin = lazyNamed(() => import('./views/AgentLogin'), 'AgentLogin');
const AmbassadorLogin = lazyNamed(() => import('./views/AmbassadorLogin'), 'AmbassadorLogin');
const OrganizerDashboard = lazyNamed(() => import('./views/OrganizerDashboard'), 'OrganizerDashboard');
const AdminDashboard = lazyNamed(() => import('./views/AdminDashboard'), 'AdminDashboard');
const AmbassadorDashboard = lazyNamed(() => import('./views/AmbassadorDashboard'), 'AmbassadorDashboard');
const AgentDashboard = lazyNamed(() => import('./views/AgentDashboard'), 'AgentDashboard');
const TicketScanner = lazyNamed(() => import('./views/TicketScanner'), 'TicketScanner');
const PublicChatWidget = lazyNamed(() => import('./components/PublicChatWidget'), 'PublicChatWidget');

const PageLoader: React.FC = () => (
  <div className="flex justify-center items-center min-h-[60vh]">
    <div className="animate-spin w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full"></div>
  </div>
);

// --- Component de protection des routes internes ---
const ProtectedRoute = ({ children, allowedRoles, fallbackPath = "/organizer/login" }: { children: React.ReactNode, allowedRoles: UserRole[], fallbackPath?: string }) => {
  const { role, user, authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-slate-950">
        <div className="animate-spin w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  // Les agents STAFF s'authentifient via RPC (pas Supabase Auth) — ils n'ont pas de user Supabase.
  // On vérifie leur rôle via localStorage + la présence de la session agent.
  const isStaffAgent = role === UserRole.STAFF && !!localStorage.getItem('afritix_current_agent');

  // Pour les autres rôles : exiger la session Supabase ET le bon rôle
  if (!isStaffAgent && (!user || !allowedRoles.includes(role))) {
    return <Navigate to={fallbackPath} replace />;
  }

  // Pour les agents : exiger uniquement le bon rôle dans allowedRoles
  if (isStaffAgent && !allowedRoles.includes(role)) {
    return <Navigate to={fallbackPath} replace />;
  }

  return <>{children}</>;
};

// ─── Toast d'avertissement d'inactivité ───────────────────────────────────
const InactivityWarning: React.FC = () => {
  const { showInactivityWarning, extendSession } = useAuth();
  if (!showInactivityWarning) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[99999] flex items-center gap-4 bg-amber-900/95 border border-amber-500/50 text-amber-100 px-6 py-4 rounded-2xl shadow-2xl backdrop-blur-md">
      <span className="text-2xl">⏱️</span>
      <div>
        <p className="font-bold text-sm">Session sur le point d'expirer</p>
        <p className="text-xs text-amber-300">Vous serez déconnecté dans 2 minutes par inactivité.</p>
      </div>
      <button
        onClick={extendSession}
        className="ml-4 bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2 rounded-xl text-sm transition-colors shrink-0"
      >
        Rester connecté
      </button>
    </div>
  );
};

// Remonte en haut de page à chaque changement de page (liens du pied de page, etc.).
// Les ancres (#section) gardent leur comportement normal.
const ScrollToTop: React.FC = () => {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
};

const AppContent: React.FC = () => {
  const { pathname } = useLocation();
  return (
    <AuthProvider>
      <ScrollToTop />
      <Layout>
        {/* Une page qui plante affiche un message au lieu d'un écran blanc ; le
            filet se réinitialise à chaque changement de page. */}
        <ErrorBoundary key={pathname}>
        <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Marketplace />} />
          <Route path="/event/:slug" element={<EventDetails />} />
          <Route path="/tickets" element={<MyTickets />} />
          <Route path="/ambassador" element={
            <ProtectedRoute allowedRoles={[UserRole.AMBASSADOR, UserRole.USER]} fallbackPath="/ambassador/login">
              <AmbassadorDashboard />
            </ProtectedRoute>
          } />
          <Route path="/collecte/:slug" element={<FundraisingPage />} />

          {/* Institutional Pages */}
          <Route path="/about" element={<About />} />
          <Route path="/faq" element={<FAQ />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/tournoi/:slug" element={<TournamentPage />} />
          <Route path="/organisateur/:id" element={<OrganizerPublicPage />} />

          <Route path="/organizer/login" element={<OrganizerLogin />} />
          <Route path="/sysbap/login" element={<AdminLogin />} />
          <Route path="/agent/login" element={<AgentLogin />} />
          <Route path="/ambassador/login" element={<AmbassadorLogin />} />

          <Route path="/organizer" element={
            <ProtectedRoute allowedRoles={[UserRole.ORGANIZER, UserRole.ADMIN]} fallbackPath="/organizer/login">
              <OrganizerDashboard />
            </ProtectedRoute>
          } />
          <Route path="/sysbap" element={
            <ProtectedRoute allowedRoles={[UserRole.ADMIN]} fallbackPath="/sysbap/login">
              <AdminDashboard />
            </ProtectedRoute>
          } />
          <Route path="/scanner" element={
            <ProtectedRoute allowedRoles={[UserRole.STAFF]} fallbackPath="/agent/login">
              <TicketScanner />
            </ProtectedRoute>
          } />
          <Route path="/agent" element={
            <ProtectedRoute allowedRoles={[UserRole.STAFF]} fallbackPath="/agent/login">
              <AgentDashboard />
            </ProtectedRoute>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
        </ErrorBoundary>
      </Layout>
      <Suspense fallback={null}>
        <PublicChatWidget />
      </Suspense>
      <InactivityWarning />
    </AuthProvider>
  );
};

export default function App() {
  return (
    <HelmetProvider>
      <Router>
        <AppContent />
      </Router>
    </HelmetProvider>
  );
}
