import React from 'react';
import { Link } from 'react-router-dom';
import { Footer } from './Footer';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 relative selection:bg-orange-500/30">

      {/* Header with Logo */}
      <header className="fixed top-0 left-0 right-0 z-40 px-4 md:px-6 py-3 md:py-4 bg-[#0f172a]/80 backdrop-blur-xl border-b border-white/5">
        <div className="flex justify-between items-center max-w-7xl mx-auto">
          <Link to="/" className="group flex items-center gap-4">
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl flex items-center justify-center overflow-hidden shadow-xl shadow-orange-500/30 group-hover:scale-105 transition-transform">
              <img src="https://insforgeinst.site/images/2026/07/09/log-babipass.png" alt="Babipass" className="w-full h-full object-contain p-1" />
            </div>
            <div className="flex flex-col">
              <span className="font-black text-3xl md:text-4xl tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
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

      <Footer />
    </div>
  );
};
