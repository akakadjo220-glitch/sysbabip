import React from 'react';
import { Link } from 'react-router-dom';
import { Ticket } from 'lucide-react';
import { Footer } from './Footer';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 relative selection:bg-orange-500/30">

      {/* En-tête compact : la place va aux événements, pas au logo. */}
      <header className="fixed top-0 left-0 right-0 z-40 px-4 md:px-6 h-16 flex items-center bg-[#0f172a]/90 backdrop-blur-xl border-b border-white/5">
        <div className="flex justify-between items-center max-w-7xl mx-auto w-full">
          <Link to="/" className="flex items-center gap-2.5" aria-label="Babipass — accueil">
            <img src="https://insforgeinst.site/images/2026/07/09/log-babipass.png" alt="" className="w-9 h-9 rounded-xl object-contain" />
            <span className="font-black text-xl tracking-tight text-white">Babipass</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link to="/organisateurs" className="hidden sm:inline-flex px-3 py-2 rounded-lg text-sm font-semibold text-slate-300 hover:text-white">
              Organisateurs
            </Link>
            <Link to="/tickets" className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/10 border border-white/10 text-sm font-bold text-white hover:bg-white/15">
              <Ticket size={16} className="text-orange-400" /> Mes billets
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full min-h-screen pt-20 px-4 md:px-8 pb-40 md:pb-32">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>

      <Footer />
    </div>
  );
};
