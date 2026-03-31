import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { Gift, Copy, CheckCircle, Loader2, ArrowRight } from 'lucide-react';
import { UserRole } from '../types';

interface AmbassadorWidgetProps {
  eventId: string;
  commissionType: 'percentage' | 'fixed';
  commissionValue: number;
}

export const AmbassadorWidget: React.FC<AmbassadorWidgetProps> = ({ eventId, commissionType, commissionValue }) => {
  const { user, role } = useAuth();
  const [loading, setLoading] = useState(false);
  const [referralLink, setReferralLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  // S'il n'est pas connecté ou pas USER, ne pas montrer de bouton (ou montrer un call to action pour se connecter)
  if (!user || role === UserRole.GUEST) {
    return (
      <div className="bg-gradient-to-br from-indigo-900/50 to-purple-900/50 border border-indigo-500/30 rounded-2xl p-6 mt-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h4 className="text-xl font-bold text-white flex items-center gap-2">
            <Gift className="text-indigo-400" />
            Programme Ambassadeur
          </h4>
          <p className="text-slate-300 mt-1 text-sm">
            Gagnez de l'argent ({commissionType === 'percentage' ? `${commissionValue}%` : `${commissionValue} FCFA`} par billet) en partageant cet événement ! Connectez-vous pour générer votre lien.
          </p>
        </div>
      </div>
    );
  }

  const generateLink = async () => {
    setLoading(true);
    setError('');
    try {
      // Vérifier si un lien existe déjà pour cet utilisateur et cet événement
      const { data: existingLink, error: fetchError } = await supabase
        .from('ambassador_links')
        .select('*')
        .eq('user_id', user.id)
        .eq('event_id', eventId)
        .maybeSingle();

      if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

      let code = '';
      if (existingLink) {
        code = existingLink.code;
      } else {
        // En générer un nouveau
        code = `AMB-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        const { error: insertError } = await supabase
          .from('ambassador_links')
          .insert([
            {
              user_id: user.id,
              event_id: eventId,
              code: code
            }
          ]);
        if (insertError) throw insertError;
      }

      setReferralLink(`${window.location.origin}/event/${eventId}?ref=${code}`);
    } catch (err: any) {
      console.error(err);
      setError("Erreur lors de la génération du lien.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="bg-gradient-to-br from-indigo-900/80 to-purple-900/80 backdrop-blur-md border border-indigo-400/30 rounded-3xl p-6 md:p-8 mt-8 shadow-2xl overflow-hidden relative group">
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500 rounded-full blur-[80px] opacity-20 pointer-events-none group-hover:opacity-40 transition-opacity" />
      
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center border border-indigo-500/30">
            <Gift className="text-indigo-400" size={24} />
          </div>
          <div>
            <h4 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-purple-300">
              Devenez Ambassadeur
            </h4>
            <div className="inline-flex items-center px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold border border-indigo-500/30 mt-1">
              {commissionType === 'percentage' ? `${commissionValue}% de commission` : `${commissionValue} FCFA par vente`}
            </div>
          </div>
        </div>

        <p className="text-slate-300 text-sm leading-relaxed mb-6">
          Nous vous payons pour chaque billet vendu grâce à vous ! Générez votre lien de partage unique. Dès qu'un de vos amis achète son billet, votre commission s'ajoute à votre portefeuille.
        </p>

        {!referralLink ? (
          <div>
            <button
              onClick={generateLink}
              disabled={loading}
              className="flex items-center justify-center gap-2 w-full md:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-600/30"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Gift size={18} />}
              Obtenir mon lien personnel
            </button>
            {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom flex flex-col gap-3">
            <p className="text-xs font-bold text-indigo-300 uppercase tracking-widest">Votre lien de parrainage</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={referralLink}
                className="flex-1 bg-black/40 border border-indigo-500/30 rounded-xl px-4 py-3 font-mono text-sm text-indigo-200 outline-none"
              />
              <button
                onClick={handleCopy}
                className="p-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors shadow-lg"
              >
                {copied ? <CheckCircle size={20} className="text-green-300" /> : <Copy size={20} />}
              </button>
            </div>
            
            <a href="/ambassador" className="inline-flex items-center text-indigo-400 hover:text-indigo-300 text-xs font-bold mt-2 gap-1 group/link">
              Voir mes gains dans mon Portefeuille
              <ArrowRight size={14} className="group-hover/link:translate-x-1 transition-transform" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
