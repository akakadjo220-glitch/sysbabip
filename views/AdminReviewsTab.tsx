import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Star, CheckCircle, XCircle, Loader2, Trash2 } from 'lucide-react';

export const AdminReviewsTab: React.FC<{ addToast: (msg: string, type: 'success' | 'error' | 'info') => void }> = ({ addToast }) => {
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReviews = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('reviews')
      .select(`
        *,
        events(title)
      `)
      .order('created_at', { ascending: false });
    
    if (error) {
      addToast(error.message, 'error');
    } else {
      setReviews(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchReviews();
  }, []);

  const handleApprove = async (id: string, isApproved: boolean) => {
    const { error } = await supabase.from('reviews').update({ is_approved: isApproved }).eq('id', id);
    if (error) {
      addToast(error.message, 'error');
    } else {
      addToast(isApproved ? 'Avis approuvé avec succès' : 'Avis masqué avec succès', 'success');
      fetchReviews();
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Voulez-vous vraiment supprimer cet avis définitivement ?')) return;
    const { error } = await supabase.from('reviews').delete().eq('id', id);
    if (error) {
      addToast(error.message, 'error');
    } else {
      addToast('Avis supprimé', 'success');
      fetchReviews();
    }
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 size={32} className="animate-spin text-orange-500" /></div>;

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/80 backdrop-blur-xl border border-white/10 rounded-3xl p-6">
        <h2 className="text-xl font-bold text-white mb-6">Modération des Avis ({reviews.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-slate-400 text-sm border-b border-white/10">
                <th className="pb-3 px-4 font-semibold">Date</th>
                <th className="pb-3 px-4 font-semibold">Utilisateur</th>
                <th className="pb-3 px-4 font-semibold">Événement</th>
                <th className="pb-3 px-4 font-semibold">Note</th>
                <th className="pb-3 px-4 font-semibold">Commentaire</th>
                <th className="pb-3 px-4 font-semibold">Statut</th>
                <th className="pb-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {reviews.map(r => (
                <tr key={r.id} className="hover:bg-white/5 transition-colors">
                  <td className="py-4 px-4 text-sm text-slate-300">
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-4 px-4 font-medium text-white">
                    {r.reviewer_name || 'Anonyme'}
                  </td>
                  <td className="py-4 px-4 text-sm text-slate-400">
                    {r.events?.title || 'Inconnu'}
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex text-amber-400">
                      {[1,2,3,4,5].map(s => <Star key={s} size={14} fill={r.rating >= s ? 'currentColor' : 'none'} className={r.rating >= s ? 'text-amber-400' : 'text-slate-600'} />)}
                    </div>
                  </td>
                  <td className="py-4 px-4 text-sm text-slate-300 max-w-xs truncate" title={r.comment}>
                    {r.comment || <span className="text-slate-600 italic">Sans commentaire</span>}
                  </td>
                  <td className="py-4 px-4">
                    {r.is_approved ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded-lg border border-emerald-500/30">
                        <CheckCircle size={14} /> Approuvé
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-amber-500/20 text-amber-400 text-xs font-bold rounded-lg border border-amber-500/30">
                        <Loader2 size={14} className="animate-spin" /> En attente
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-4 flex items-center justify-end gap-2">
                    {r.is_approved ? (
                      <button onClick={() => handleApprove(r.id, false)} className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors" title="Masquer l'avis">
                         <XCircle size={16} />
                      </button>
                    ) : (
                      <button onClick={() => handleApprove(r.id, true)} className="p-2 bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-400 border border-emerald-500/30 rounded-lg transition-colors" title="Approuver l'avis">
                         <CheckCircle size={16} />
                      </button>
                    )}
                    <button onClick={() => handleDelete(r.id)} className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg transition-colors" title="Supprimer">
                       <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {reviews.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-slate-500">Aucun avis trouvé.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
