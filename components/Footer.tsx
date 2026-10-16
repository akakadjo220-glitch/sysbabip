import React from 'react';
import { Link } from 'react-router-dom';
import { Facebook, Instagram, Twitter, Mail, MapPin, Phone } from 'lucide-react';

export const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="relative bg-[#0b1120] border-t border-white/5 pt-16 pb-8 overflow-hidden">
      {/* Motifs africains & musique en arrière-plan (SVG Pattern) */}
      <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none">
        <svg width="100%" height="100%">
          <defs>
            <pattern id="african-music-pattern" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
              {/* Tambour Djembe abstrait */}
              <path d="M20,20 L40,20 L35,40 L25,40 Z" fill="none" stroke="white" strokeWidth="1.5" />
              <path d="M25,40 L20,70 L40,70 L35,40" fill="none" stroke="white" strokeWidth="1.5" />
              <path d="M20,20 Q30,15 40,20" fill="none" stroke="white" strokeWidth="1.5" />
              {/* Lignes de rythme / ondes sonores */}
              <line x1="60" y1="30" x2="60" y2="70" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <line x1="70" y1="40" x2="70" y2="60" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <line x1="80" y1="20" x2="80" y2="80" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <line x1="90" y1="45" x2="90" y2="55" stroke="white" strokeWidth="2" strokeLinecap="round" />
              {/* Motifs géométriques traditionnels (triangles) */}
              <polygon points="50,10 60,25 40,25" fill="none" stroke="currentColor" className="text-orange-500" strokeWidth="1" />
              <polygon points="50,90 60,75 40,75" fill="none" stroke="currentColor" className="text-indigo-500" strokeWidth="1" />
              {/* Symboles de cauris / coquillages */}
              <ellipse cx="10" cy="50" rx="3" ry="8" fill="none" stroke="white" strokeWidth="1" />
              <line x1="10" y1="45" x2="10" y2="55" stroke="white" strokeWidth="1" />
            </pattern>
          </defs>
          <rect x="0" y="0" width="100%" height="100%" fill="url(#african-music-pattern)" />
        </svg>
      </div>

      {/* Decorative background elements styling */}
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-orange-500/50 to-transparent"></div>
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-orange-500/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8 mb-12">
          
          {/* Colonne 1 : Brand & Intro */}
          <div className="space-y-6">
            <Link to="/" className="group flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden shadow-lg shadow-orange-500/20 group-hover:scale-105 transition-transform">
                <img src="https://insforgeinst.site/images/2026/07/09/log-babipass.png" alt="Babipass" className="w-full h-full object-contain p-1" />
              </div>
              <span className="font-black text-2xl tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                Babipass
              </span>
            </Link>
            <p className="text-slate-400 text-sm leading-relaxed">
              Vibrez au rythme de vos événements. La billetterie pensée pour nos réalités, connectant les organisateurs et les passionnés à travers l'Afrique et au-delà.
            </p>
            <div className="flex gap-4">
              <a href="#" className="w-10 h-10 rounded-full bg-slate-800/80 flex items-center justify-center text-slate-400 hover:text-white hover:bg-orange-500 transition-colors border border-white/5">
                <Facebook size={18} />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-slate-800/80 flex items-center justify-center text-slate-400 hover:text-white hover:bg-orange-500 transition-colors border border-white/5">
                <Instagram size={18} />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-slate-800/80 flex items-center justify-center text-slate-400 hover:text-white hover:bg-orange-500 transition-colors border border-white/5">
                <Twitter size={18} />
              </a>
            </div>
          </div>

          {/* Colonne 2 : Babipass */}
          <div>
            <h3 className="text-white font-bold text-lg mb-6 flex items-center gap-2">
              <span className="w-8 h-1 bg-orange-500 rounded-full inline-block"></span>
              Babipass
            </h3>
            <ul className="space-y-4">
              <li>
                <Link to="/about" className="text-slate-400 hover:text-orange-400 transition-colors text-sm flex items-center gap-2">
                   À propos
                </Link>
              </li>
              <li>
                <Link to="/faq" className="text-slate-400 hover:text-orange-400 transition-colors text-sm flex items-center gap-2">
                   FAQ
                </Link>
              </li>
              <li>
                <Link to="/contact" className="text-slate-400 hover:text-orange-400 transition-colors text-sm flex items-center gap-2">
                   Nous Contacter
                </Link>
              </li>
            </ul>
          </div>

          {/* Colonne 3 : Légal */}
          <div>
            <h3 className="text-white font-bold text-lg mb-6 flex items-center gap-2">
              <span className="w-8 h-1 bg-indigo-500 rounded-full inline-block"></span>
              Légal
            </h3>
            <ul className="space-y-4">
              <li>
                <Link to="/terms" className="text-slate-400 hover:text-indigo-400 transition-colors text-sm">
                  Conditions d'Utilisation
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="text-slate-400 hover:text-indigo-400 transition-colors text-sm">
                  Confidentialité & Données
                </Link>
              </li>
              <li>
                <Link to="/organizer/login" className="text-slate-400 hover:text-indigo-400 transition-colors text-sm">
                  Devenir Organisateur
                </Link>
              </li>
            </ul>
          </div>

          {/* Colonne 4 : Support */}
          <div>
            <h3 className="text-white font-bold text-lg mb-6 flex items-center gap-2">
              <span className="w-8 h-1 bg-emerald-500 rounded-full inline-block"></span>
              Support
            </h3>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <MapPin size={18} className="text-emerald-500 mt-0.5 shrink-0" />
                <span className="text-slate-400 text-sm">Abidjan, Côte d'Ivoire</span>
              </li>
              <li className="flex items-center gap-3">
                <Phone size={18} className="text-emerald-500 shrink-0" />
                <a
                  href="https://wa.me/2250799709309?text=Bonjour%20Babipass%2C%20j%27ai%20besoin%20d%27aide"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-400 text-sm hover:text-white transition-colors"
                  title="Support WhatsApp"
                >
                  +225 07 99 70 93 09 (WhatsApp)
                </a>
              </li>
              <li className="flex items-center gap-3">
                <Mail size={18} className="text-emerald-500 shrink-0" />
                <a href="mailto:support@babipass.com" className="text-slate-400 text-sm hover:text-white transition-colors">
                  support@babipass.com
                </a>
              </li>
            </ul>
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-slate-500 text-xs text-center md:text-left">
            &copy; {currentYear} Babipass. Tous droits réservés.
          </p>
          <div className="flex items-center gap-4 text-xs font-medium text-slate-500">
            <span className="flex items-center gap-1">
              Babipass — La billetterie #1 en Afrique 🌍
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
