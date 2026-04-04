import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Loader2, Check, X, Users, CreditCard, ChevronRight } from 'lucide-react';
import { formatCurrency } from '../constants';
import { Pagination } from '../components/Pagination';

export const AdminAmbassadorsTab = ({ addToast }: { addToast: (msg: string, type: 'success' | 'error') => void }) => {
    const [subTab, setSubTab] = useState<'top' | 'withdrawals'>('top');
    
    // Top Ambassadors State
    const [topAmbassadors, setTopAmbassadors] = useState<any[]>([]);
    const [loadingTop, setLoadingTop] = useState(true);
    
    // Withdrawals State
    const [withdrawals, setWithdrawals] = useState<any[]>([]);
    const [loadingWithdrawals, setLoadingWithdrawals] = useState(true);

    const fetchTopAmbassadors = async () => {
        setLoadingTop(true);
        const { data: links, error } = await supabase
            .from('ambassador_links')
            .select('*')
            .order('earned_amount', { ascending: false })
            .limit(50);
            
        if (error) {
            addToast("Erreur lors du chargement des top ambassadeurs: " + error.message, 'error');
        } else if (links && links.length > 0) {
            const userIds = [...new Set(links.map(l => l.user_id))];
            const eventIds = [...new Set(links.map(l => l.event_id))];

            const [{ data: profiles }, { data: events }] = await Promise.all([
                supabase.from('profiles').select('id, name, email').in('id', userIds),
                supabase.from('events').select('id, title').in('id', eventIds)
            ]);

            const enriched = links.map(link => ({
                ...link,
                profiles: profiles?.find(p => p.id === link.user_id) || null,
                events: events?.find(e => e.id === link.event_id) || null
            }));
            
            setTopAmbassadors(enriched);
        } else {
            setTopAmbassadors([]);
        }
        setLoadingTop(false);
    };

    const fetchWithdrawals = async () => {
        setLoadingWithdrawals(true);
        const { data: wData, error } = await supabase
            .from('ambassador_withdrawals')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            addToast("Erreur lors du chargement des retraits: " + error.message, 'error');
        } else if (wData && wData.length > 0) {
            const userIds = [...new Set(wData.map(w => w.user_id))];
            const { data: profiles } = await supabase.from('profiles').select('id, name, email').in('id', userIds);

            const enriched = wData.map(w => ({
                ...w,
                profiles: profiles?.find(p => p.id === w.user_id) || null
            }));

            setWithdrawals(enriched);
        } else {
            setWithdrawals([]);
        }
        setLoadingWithdrawals(false);
    };

    useEffect(() => {
        if (subTab === 'top') {
            fetchTopAmbassadors();
        } else {
            fetchWithdrawals();
        }
    }, [subTab]);

    const handleAction = async (id: string, newStatus: string) => {
        if (!window.confirm(`Voulez-vous passer ce retrait au statut : ${newStatus} ?`)) return;

        const payload: any = { status: newStatus };
        if (newStatus === 'paid') {
            payload.paid_at = new Date().toISOString();
        }

        const { error } = await supabase
            .from('ambassador_withdrawals')
            .update(payload)
            .eq('id', id);

        if (error) {
            addToast(`Erreur: ${error.message}`, 'error');
        } else {
            addToast(`Statut mis à jour à ${newStatus}`, 'success');
            fetchWithdrawals();
        }
    };

    return (
        <div className="space-y-6 block fade-in">
            {/* Header / SubTabs */}
            <div className="flex gap-4 p-1.5 bg-slate-900/40 rounded-xl border border-white/5 w-fit">
                <button
                    onClick={() => setSubTab('top')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${subTab === 'top' ? 'bg-orange-500/20 text-orange-400' : 'text-slate-400 hover:text-white'}`}
                >
                    <Users size={16} /> Meilleurs Ambassadeurs
                </button>
                <button
                    onClick={() => setSubTab('withdrawals')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${subTab === 'withdrawals' ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-400 hover:text-white'}`}
                >
                    <CreditCard size={16} /> Demandes de Retraits
                </button>
            </div>

            {subTab === 'top' && (
                <div className="bg-slate-900/50 rounded-2xl border border-white/5 overflow-hidden">
                    {loadingTop ? (
                        <div className="flex justify-center p-12"><Loader2 className="animate-spin text-orange-500" /></div>
                    ) : topAmbassadors.length === 0 ? (
                        <div className="p-12 text-center text-slate-500">Aucune donnée ambassadeur trouvée.</div>
                    ) : (
                        <div className="overflow-x-auto relative">
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-slate-900/80 text-slate-400 uppercase text-xs font-bold tracking-wider">
                                    <tr>
                                        <th className="px-6 py-4">Ambassadeur</th>
                                        <th className="px-6 py-4">Evénement</th>
                                        <th className="px-6 py-4 text-center">Ventes</th>
                                        <th className="px-6 py-4 text-right">Commissions Générées</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {topAmbassadors.map((amb) => (
                                        <tr key={amb.id} className="hover:bg-white/5 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-white">{amb.profiles?.name || 'Inconnu'}</div>
                                                <div className="text-xs text-slate-500">{amb.profiles?.email}</div>
                                            </td>
                                            <td className="px-6 py-4 text-slate-300">
                                                {amb.events?.title || 'Non trouvé'}
                                                <div className="text-xs text-slate-500 mt-1 uppercase">Code: {amb.code}</div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className="font-medium text-emerald-400">{amb.sales} tickets</span>
                                                <div className="text-xs text-slate-500">{amb.clicks} clics</div>
                                            </td>
                                            <td className="px-6 py-4 text-right font-bold text-white">
                                                {formatCurrency(amb.earned_amount)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {subTab === 'withdrawals' && (
                <div className="bg-slate-900/50 rounded-2xl border border-white/5 overflow-hidden">
                    {loadingWithdrawals ? (
                         <div className="flex justify-center p-12"><Loader2 className="animate-spin text-indigo-500" /></div>
                    ) : withdrawals.length === 0 ? (
                         <div className="p-12 text-center text-slate-500">Aucune demande de retrait pour le moment.</div>
                    ) : (
                         <div className="overflow-x-auto relative">
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-slate-900/80 text-slate-400 uppercase text-xs font-bold tracking-wider">
                                    <tr>
                                        <th className="px-6 py-4">Date</th>
                                        <th className="px-6 py-4">Ambassadeur</th>
                                        <th className="px-6 py-4">Montant</th>
                                        <th className="px-6 py-4">Moyen de Paiement</th>
                                        <th className="px-6 py-4">Statut</th>
                                        <th className="px-6 py-4 text-right">Actions Admin</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {withdrawals.map((w) => (
                                        <tr key={w.id} className="hover:bg-white/5 transition-colors">
                                            <td className="px-6 py-4 text-slate-400">
                                                {new Date(w.created_at).toLocaleDateString('fr-FR')}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-white">{w.profiles?.name || 'Inconnu'}</div>
                                                <div className="text-xs text-slate-500">{w.profiles?.email}</div>
                                            </td>
                                            <td className="px-6 py-4 font-bold text-emerald-400">
                                                {formatCurrency(w.amount)}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="bg-indigo-500/20 text-indigo-300 font-bold px-2 py-1 rounded text-xs">
                                                    {w.payment_method}
                                                </span>
                                                <div className="text-xs text-slate-400 mt-1">{w.payment_details}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <select
                                                    value={w.status}
                                                    onChange={(e) => handleAction(w.id, e.target.value)}
                                                    className={`px-2 py-1 rounded text-xs font-bold bg-slate-800 border outline-none
                                                        ${w.status === 'paid' ? 'text-emerald-400 border-emerald-500/50' : 
                                                          w.status === 'rejected' ? 'text-red-400 border-red-500/50' : 
                                                          w.status === 'approved' ? 'text-blue-400 border-blue-500/50' :
                                                          'text-amber-400 border-amber-500/50'}`}
                                                >
                                                    <option value="pending">En attente</option>
                                                    <option value="approved">Approuvé</option>
                                                    <option value="paid">Payé</option>
                                                    <option value="rejected">Rejeté</option>
                                                </select>
                                                {w.status === 'paid' && w.paid_at && <div className="text-[10px] text-slate-500 mt-1">Le {new Date(w.paid_at).toLocaleDateString()}</div>}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {w.status !== 'paid' && (
                                                    <button onClick={() => handleAction(w.id, 'paid')} className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 ml-auto">
                                                        <Check size={14} /> Marquer Payé
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                         </div>
                    )}
                </div>
            )}
        </div>
    );
};
