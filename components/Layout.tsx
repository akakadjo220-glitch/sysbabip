
import React, { useContext, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import {
  LayoutDashboard,
  Shield,
  QrCode,
  ShoppingBag,
  Layers,
  X,
  Ticket
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleSwitch = (path: string) => {
    navigate(path);
    setIsMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 relative selection:bg-orange-500/30">

      {/* Header with Logo */}
      <header className="fixed top-0 left-0 right-0 z-40 px-4 md:px-6 py-3 md:py-4 bg-[#0f172a]/80 backdrop-blur-xl border-b border-white/5">
        <div className="flex justify-between items-center max-w-7xl mx-auto">
          <Link to="/" className="group flex items-center gap-2">
            <div className="w-10 h-10 md:w-14 md:h-14 rounded-2xl flex items-center justify-center overflow-hidden shadow-lg shadow-orange-500/20 group-hover:scale-105 transition-transform">
              <img src="https://supabasekong-l4cw40oks4kso84ko44ogkkw.188.241.58.227.sslip.io/storage/v1/object/public/events/verso.png" alt="Babipass" className="w-full h-full object-contain" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-xl md:text-2xl tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                Babipass
              </span>
            </div>
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full min-h-screen pt-24 px-4 md:px-8 pb-40 md:pb-32">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>

      {/* Floating Action Button (FAB) Menu */}
      <div className="fixed bottom-8 right-8 z-50 flex flex-col items-end gap-4 pointer-events-none">

        {/* Menu Items */}
        <div className={`flex flex-col items-end gap-3 transition-all duration-300 ${isMenuOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-10 pointer-events-none'}`}>

          <FabItem
            label="Espace Admin"
            icon={Shield}
            color="bg-amber-500"
            active={role === UserRole.ADMIN}
            onClick={() => handleSwitch('/admin')}
          />

          <FabItem
            label="Organisateur (Dash)"
            icon={LayoutDashboard}
            color="bg-orange-600"
            active={role === UserRole.ORGANIZER}
            onClick={() => handleSwitch('/organizer')}
          />

          <FabItem
            label="Organisateur (Login)"
            icon={LayoutDashboard}
            color="bg-slate-700"
            active={false}
            onClick={() => { setIsMenuOpen(false); navigate('/organizer/login'); }}
          />

          <FabItem
            label="Staff / Scanner"
            icon={QrCode}
            color="bg-emerald-600"
            active={role === UserRole.STAFF}
            onClick={() => handleSwitch('/scanner')}
          />

          <FabItem
            label="Mes Billets (Offline)"
            icon={Ticket}
            color="bg-rose-600"
            active={false}
            onClick={() => handleSwitch('/tickets')}
          />

          <FabItem
            label="Acheteur (Marketplace)"
            icon={ShoppingBag}
            color="bg-slate-700"
            active={role === UserRole.GUEST || role === UserRole.USER}
            onClick={() => handleSwitch('/')}
          />

        </div>

        {/* Main Toggle Button */}
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className={`group flex items-center justify-center w-16 h-16 rounded-full shadow-2xl transition-all duration-300 pointer-events-auto ${isMenuOpen ? 'bg-slate-800 rotate-90' : 'bg-gradient-to-r from-orange-500 to-amber-500 hover:scale-110'}`}
        >
          {isMenuOpen ? (
            <X size={28} className="text-white" />
          ) : (
            <Layers size={28} className="text-white" />
          )}
        </button>
      </div>

      {/* Backdrop for menu */}
      {isMenuOpen && (
        <div
          onClick={() => setIsMenuOpen(false)}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 animate-in fade-in duration-200"
        />
      )}
    </div>
  );
};

// Sub-component for Menu Items
const FabItem = ({ label, icon: Icon, color, onClick, active }: any) => (
  <button
    onClick={onClick}
    className="group flex items-center gap-4 pl-4 pr-1 py-1 rounded-full hover:bg-white/5 transition-all"
  >
    <span className="text-sm font-bold text-white bg-slate-900/80 px-3 py-1.5 rounded-lg backdrop-blur-md shadow-lg border border-white/10 group-hover:-translate-x-1 transition-transform">
      {label}
    </span>
    <div className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg border-2 transition-all ${active ? 'border-white scale-110' : 'border-transparent group-hover:scale-110'} ${color}`}>
      <Icon size={20} className="text-white" />
    </div>
  </button>
);
