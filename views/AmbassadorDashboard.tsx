import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Gift, Wallet, TrendingUp, History, Copy, CheckCircle, CreditCard, Loader2, LogOut } from 'lucide-react';
import { formatCurrency } from '../constants';
import { UserRole } from '../types';

export const AmbassadorDashboard = () => {
  const { user, role, authLoading } = useAuth();
  const navigate = useNavigate();
  const [links, setLinks] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);
  
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawMethod, setWithdrawMethod] = useState('');
  const [withdrawPhone, setWithdrawPhone] = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawMessage, setWithdrawMessage] = useState({ text: '', type: '' });
  const [copiedLink, setCopiedLink] = useState('');

  useEffect(() => {
    if (!authLoading && (!user || role === UserRole.GUEST)) {
      navigate('/login');
    } else if (user) {
      loadData();
    }
  }, [user, authLoading, role, navigate]);

  const loadData = async () => {
    setFetching(true);
    try {
      const [linksData, withdrawalsData] = await Promise.all([
        supabase
          .from('ambassador_links')
          .select('*, events(title, image)')
          .eq('user_id', user?.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('ambassador_withdrawals')
          .select('*')
          .eq('user_id', user?.id)
          .order('created_at', { ascending: false })
      ]);

      if (linksData.data) setLinks(linksData.data);
      if (withdrawalsData.data) setWithdrawals(withdrawalsData.data);
    } catch (e) {
      console.error(e);
    } finally {
      setFetching(false);
    }
  };

  const handleCopy = (code: string) => {
    const link = `${window.location.origin}/event/${links.find(l => l.code === code)?.event_id}?ref=${code}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(code);
    setTimeout(() => setCopiedLink(''), 3000);
  };

  const handleWithdrawalRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setWithdrawMessage({ text: '', type: '' });
    
    const amount = Number(withdrawAmount);
    if (!amount || amount < 1000) {
      setWithdrawMessage({ text: "Le montant minimum de retrait est de 1000 FCFA.", type: 'error' });
      return;
    }

    if (amount > availableBalance) {
      setWithdrawMessage({ text: "Solde insuffisant.", type: 'error' });
      return;
    }

    setWithdrawLoading(true);
    try {
      const { error } = await supabase.from('ambassador_withdrawals').insert([{
        user_id: user?.id,
        amount,
        payment_method: withdrawMethod,
        payment_details: withdrawPhone
      }]);

      if (error) throw error;
      
      setWithdrawMessage({ text: "Demande de retrait envoyée avec succès !", type: 'success' });
      setWithdrawAmount('');
      setWithdrawPhone('');
      loadData(); // Reload balances
    } catch (e: any) {
      console.error(e);
      setWithdrawMessage({ text: "Erreur lors de la demande.", type: 'error' });
    } finally {
      setWithdrawLoading(false);
    }
  };

  if (authLoading || fetching) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  // Calcul du solde
  const totalEarned = links.reduce((sum, link) => sum + Number(link.earned_amount || 0), 0);
  const totalWithdrawnAndPending = withdrawals.reduce((sum, w) => {
    if (w.status !== 'rejected') return sum + Number(w.amount);
    return sum;
  }, 0);
  const availableBalance = totalEarned - totalWithdrawnAndPending;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-indigo-500/20 pb-6">
        <div>
          <h1 className="text-3xl font-black text-white flex items-center gap-3">
            <Gift className="text-indigo-400" size={32} />
            Espace Ambassadeur
          </h1>
          <p className="text-slate-400 mt-2">Gérez vos liens de parrainage et retirez vos gains.</p>
        </div>
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            localStorage.removeItem('afritix_user_role');
            navigate('/');
            window.location.reload();
          }}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800/80 hover:bg-red-500/20 text-slate-300 hover:text-red-400 rounded-xl transition-colors border border-slate-700/50 hover:border-red-500/30 font-medium"
        >
          <LogOut size={18} />
          <span>Se déconnecter</span>
        </button>
      </div>

      {/* --- STAT CARD FINANCIER --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-panel p-6 rounded-2xl border border-indigo-500/30 bg-indigo-900/10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
              <Wallet className="text-indigo-400" />
            </div>
            <h3 className="text-slate-300 font-medium">Solde Disponible</h3>
          </div>
          <p className="text-3xl font-black text-white mt-4">{formatCurrency(availableBalance)}</p>
        </div>

        <div className="glass-panel p-6 rounded-2xl border border-emerald-500/30 bg-emerald-900/10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <TrendingUp className="text-emerald-400" />
            </div>
            <h3 className="text-slate-300 font-medium">Total Généré</h3>
          </div>
          <p className="text-3xl font-black text-white mt-4">{formatCurrency(totalEarned)}</p>
        </div>

        <div className="glass-panel p-6 rounded-2xl border border-amber-500/30 bg-amber-900/10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <History className="text-amber-400" />
            </div>
            <h3 className="text-slate-300 font-medium">Total Retiré</h3>
          </div>
          <p className="text-3xl font-black text-white mt-4">{formatCurrency(totalWithdrawnAndPending)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LIGNE DE GAUCHE : LIENS ACTIFS */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-xl font-bold text-white mb-4">Mes Liens Actifs</h2>
          
          {links.length === 0 ? (
            <div className="glass-panel p-8 text-center rounded-2xl border-white/5">
              <Gift className="mx-auto text-slate-500 mb-3" size={32} />
              <p className="text-slate-400">Vous n'avez pas encore généré de lien ambassadeur.</p>
              <p className="text-sm text-slate-500 mt-2">Rendez-vous sur la page d'un événement participant pour générer votre lien !</p>
            </div>
          ) : (
            <div className="space-y-4">
              {links.map((link) => (
                <div key={link.id} className="glass-panel p-5 rounded-2xl border border-white/10 hover:border-indigo-500/30 transition-colors">
                  <div className="flex items-center gap-4">
                    <img src={link.events?.image} alt="Event Cover" className="w-16 h-16 rounded-xl object-cover" />
                    <div className="flex-1">
                      <h4 className="font-bold text-white truncate">{link.events?.title}</h4>
                      <div className="flex gap-4 mt-2 text-sm">
                        <span className="text-slate-400"><strong className="text-white">{link.clicks}</strong> clics</span>
                        <span className="text-slate-400"><strong className="text-emerald-400">{link.sales}</strong> ventes</span>
                        <span className="text-orange-400 font-bold">{formatCurrency((link.earned_amount || 0))} gagnés</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleCopy(link.code)}
                      className="p-3 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 rounded-xl transition-colors"
                      title="Copier le lien"
                    >
                      {copiedLink === link.code ? <CheckCircle size={20} className="text-green-400" /> : <Copy size={20} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* LIGNE DE DROITE : RETRAIT */}
        <div className="space-y-8">
          <div className="glass-panel p-6 rounded-2xl border border-indigo-500/20">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <CreditCard className="text-indigo-400" /> Demander un retrait
            </h2>
            
            <form onSubmit={handleWithdrawalRequest} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Montant (Min. 1000 FCFA)</label>
                <input
                  type="number"
                  required
                  min="1000"
                  max={availableBalance}
                  value={withdrawAmount}
                  onChange={e => setWithdrawAmount(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                  placeholder="Ex: 5000"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Réseau Mobile Money</label>
                <select
                  required
                  value={withdrawMethod}
                  onChange={e => setWithdrawMethod(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-indigo-500 outline-none"
                >
                  <option value="">Sélectionner</option>
                  <option value="WAVE">Wave (App)</option>
                  <option value="ORANGE">Orange Money</option>
                  <option value="MTN">MTN Mobile Money</option>
                  <option value="MOOV">Moov Money</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Numéro de téléphone</label>
                <input
                  type="tel"
                  required
                  value={withdrawPhone}
                  onChange={e => setWithdrawPhone(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-indigo-500 outline-none"
                  placeholder="Ex: 0707070707"
                />
              </div>

              {withdrawMessage.text && (
                <div className={`p-3 rounded-lg text-sm ${withdrawMessage.type === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/30' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'}`}>
                  {withdrawMessage.text}
                </div>
              )}

              <button
                type="submit"
                disabled={withdrawLoading || availableBalance < 1000}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors flex justify-center items-center gap-2"
              >
                {withdrawLoading ? <Loader2 className="animate-spin" size={20} /> : "Retirer mes fonds"}
              </button>
            </form>
          </div>

          <div className="glass-panel p-6 rounded-2xl border border-white/5">
            <h3 className="text-sm font-bold text-slate-300 mb-4 uppercase tracking-wider">Historique Retraits</h3>
            <div className="space-y-3">
              {withdrawals.length === 0 ? (
                <p className="text-slate-500 text-sm">Aucun retrait.</p>
              ) : (
                withdrawals.slice(0, 5).map(w => (
                  <div key={w.id} className="flex justify-between items-center bg-slate-800/50 p-3 rounded-lg border border-white/5">
                    <div>
                      <p className="font-bold text-white text-sm">{formatCurrency(w.amount)}</p>
                      <p className="text-slate-400 text-xs">{new Date(w.created_at).toLocaleDateString()}</p>
                    </div>
                    <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${
                      w.status === 'paid' ? 'bg-emerald-500/20 text-emerald-400' :
                      w.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                      'bg-amber-500/20 text-amber-400'
                    }`}>
                      {w.status === 'pending' ? 'EN ATTENTE' : w.status === 'paid' ? 'PAYÉ' : 'REJETÉ'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
