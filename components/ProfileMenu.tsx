import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, UserCircle, ExternalLink, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// Photo de profil en haut à droite : accès rapide au compte et à la déconnexion.
export const ProfileMenu: React.FC<{
  name?: string;
  email?: string;
  avatar?: string | null;
  onAccount: () => void;
  publicPageUrl?: string;
  loginPath?: string;
}> = ({ name, email, avatar, onAccount, publicPageUrl, loginPath = '/organizer/login' }) => {
  const { handleLogout } = useAuth() as any;
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const label = name || email || 'Mon compte';

  // Fermeture au clic extérieur ou avec Échap.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const logout = async () => {
    setOpen(false);
    await handleLogout();
    navigate(loginPath, { replace: true });
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu du compte"
        className="flex items-center gap-2 rounded-full pl-1 pr-2 py-1 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
      >
        <span className="w-10 h-10 rounded-full overflow-hidden bg-orange-600 flex items-center justify-center text-white font-black shrink-0">
          {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : label.slice(0, 1).toUpperCase()}
        </span>
        <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-64 rounded-2xl border border-white/10 bg-slate-900 shadow-2xl z-50 overflow-hidden animate-in fade-in">
          <div className="px-4 py-3 border-b border-white/10">
            <p className="text-white font-bold truncate">{name || 'Mon compte'}</p>
            {email && <p className="text-slate-400 text-xs truncate">{email}</p>}
          </div>
          <button role="menuitem" onClick={() => { setOpen(false); onAccount(); }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-200 hover:bg-white/5 text-left">
            <UserCircle size={18} className="text-slate-400" /> Mon compte
          </button>
          {publicPageUrl && (
            <button role="menuitem" onClick={() => { setOpen(false); navigate(publicPageUrl); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-200 hover:bg-white/5 text-left">
              <ExternalLink size={18} className="text-slate-400" /> Voir ma page publique
            </button>
          )}
          <button role="menuitem" onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-rose-300 hover:bg-rose-500/10 text-left border-t border-white/10">
            <LogOut size={18} /> Se déconnecter
          </button>
        </div>
      )}
    </div>
  );
};
