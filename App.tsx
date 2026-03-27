import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { Layout } from './components/Layout';
import { Marketplace } from './views/Marketplace';
import { OrganizerDashboard } from './views/OrganizerDashboard';
import { AdminDashboard } from './views/AdminDashboard';
import { TicketScanner } from './views/TicketScanner';
import { EventDetails } from './views/EventDetails';
import { MyTickets } from './views/MyTickets';
import { OrganizerLogin } from './views/OrganizerLogin';
import { AgentDashboard } from './views/AgentDashboard';
import { AdminLogin } from './views/AdminLogin';
import { AgentLogin } from './views/AgentLogin';
import { FundraisingPage } from './views/FundraisingPage';
import { UserRole } from './types';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PublicChatWidget } from './components/PublicChatWidget';

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

  // Si pas d'utilisateur connecté ou si le rôle n'est pas autorisé
  if (!user || !allowedRoles.includes(role)) {
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

const AppContent: React.FC = () => {
  return (
    <AuthProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Marketplace />} />
          <Route path="/event/:slug" element={<EventDetails />} />
          <Route path="/tickets" element={<MyTickets />} />
          <Route path="/collecte/:slug" element={<FundraisingPage />} />

          <Route path="/organizer/login" element={<OrganizerLogin />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/agent/login" element={<AgentLogin />} />

          <Route path="/organizer" element={
            <ProtectedRoute allowedRoles={[UserRole.ORGANIZER, UserRole.ADMIN]} fallbackPath="/organizer/login">
              <OrganizerDashboard />
            </ProtectedRoute>
          } />
          <Route path="/admin" element={
            <ProtectedRoute allowedRoles={[UserRole.ADMIN]} fallbackPath="/admin/login">
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
      </Layout>
      <PublicChatWidget />
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
