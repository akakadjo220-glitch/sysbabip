import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Heart, Users, Target, Calendar, ArrowLeft, Loader2, CheckCircle, CreditCard, Phone, Shield } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { formatCurrency } from '../constants';
import { SEO } from '../components/SEO';
import { PawaPayService } from '../services/PawaPayService';
import { PaystackService } from '../services/PaystackService';
import { getPlatformSetting } from '../utils/platformSettings';

export const FundraisingPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [campaign, setCampaign] = useState<any>(null);
  const [stats, setStats] = useState<{ total_raised: number; contributor_count: number }>({ total_raised: 0, contributor_count: 0 });
  const [loading, setLoading] = useState(true);

  // Contribution form
  const [step, setStep] = useState<'form' | 'card_details' | 'success'>('form');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', phone: '', amount: '', method: 'WAVE' });
  const [cardDetails, setCardDetails] = useState({ number: '', expiry: '', cvv: '' });

  const paymentMethods = [
    { id: 'WAVE', label: 'Wave', emoji: '🌊' },
    { id: 'OM', label: 'Orange Money', emoji: '🟠' },
    { id: 'MTN', label: 'MTN MoMo', emoji: '🟡' },
    { id: 'MOOV', label: 'Moov Money', emoji: '🔵' },
    { id: 'CB', label: 'Carte bancaire', emoji: '💳' },
  ];

  useEffect(() => {
    if (!slug) return;
    const load = async () => {
      setLoading(true);
      const { data: camp, error: fetchErr } = await supabase
        .from('fundraising_campaigns')
        .select('*')
        .eq('slug', slug)
        .eq('status', 'active')
        .single();

      if (!camp) { setLoading(false); return; }

      const { data: prof } = await supabase.from('profiles').select('name').eq('id', camp.organizer_id).single();
      if (prof) camp.profiles = prof;

      setCampaign(camp);

      const { data: s } = await supabase
        .from('campaign_stats')
        .select('total_raised, contributor_count')
        .eq('campaign_id', camp.id)
        .single();
      if (s) setStats(s);
      setLoading(false);
    };
    load();
  }, [slug]);

  const handleContribute = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) { setError('Veuillez saisir un montant valide.'); return; }
    
    if (form.method === 'CB') {
      setStep('card_details');
      return;
    }
    
    if (!form.phone && form.method !== 'CB') {
      setError('Mode Mobile Money sélectionné : le numéro de téléphone est obligatoire.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const rawRate = await getPlatformSetting('default_fundraising_commission_rate');
      const rate = rawRate !== null ? Number(rawRate) / 100 : 0.05;
      const platform_fee = Math.round(amount * rate);
      const net_amount = amount - platform_fee;

      // 1. Process Payment
      const { success, pawaId } = await PawaPayService.requestUSSDPush(form.phone, amount, form.method);
      if (!success) throw new Error('Échec du paiement Mobile Money');

      // 2. Validate in DB
      const { error: insErr } = await supabase.from('fundraising_contributions').insert([{
        campaign_id: campaign.id,
        contributor_name: form.name || 'Anonyme',
        contributor_email: form.email || null,
        amount,
        platform_fee,
        net_amount,
        payment_method: form.method,
        transaction_ref: pawaId
      }]);
      if (insErr) throw insErr;
      
      setStep('success');
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la contribution.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCardPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    setSubmitting(true);
    setError('');

    try {
      const rawRate = await getPlatformSetting('default_fundraising_commission_rate');
      const rate = rawRate !== null ? Number(rawRate) / 100 : 0.05;
      const platform_fee = Math.round(amount * rate);
      const net_amount = amount - platform_fee;

      const emailToUse = form.email || 'guest@afritix.com';
      const { success, transactionId } = await PaystackService.processCardPayment(cardDetails, amount, emailToUse);
      if (!success) throw new Error('Transaction bancaire refusée.');

      const { error: insErr } = await supabase.from('fundraising_contributions').insert([{
        campaign_id: campaign.id,
        contributor_name: form.name || 'Anonyme',
        contributor_email: emailToUse,
        amount,
        platform_fee,
        net_amount,
        payment_method: 'CB',
        transaction_ref: transactionId
      }]);
      if (insErr) throw insErr;
      
      setStep('success');
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la contribution.');
      setStep('form');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <Loader2 className="animate-spin text-orange-400" size={40} />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center gap-4 text-white">
        <p className="text-xl font-bold">Campagne introuvable ou terminée.</p>
        <button onClick={() => navigate('/')} className="text-orange-400 hover:text-orange-300 flex items-center gap-2">
          <ArrowLeft size={16} /> Retour à l'accueil
        </button>
      </div>
    );
  }

  const progress = campaign.goal_amount > 0 ? Math.min((stats.total_raised / campaign.goal_amount) * 100, 100) : 0;

  return (
    <div className="min-h-screen bg-[#0f172a] text-white">
      <SEO
        title={`${campaign.title} — Collecte de fonds | Babipass`}
        description={campaign.description || `Soutenez la campagne "${campaign.title}" sur Babipass.`}
        keywords="collecte de fonds, crowdfunding, événement afrique"
      />

      {/* Hero */}
      <div className="relative h-64 md:h-96 overflow-hidden">
        {campaign.image ? (
          <img src={campaign.image} alt={campaign.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-orange-900 to-rose-900 flex items-center justify-center">
            <Heart size={80} className="text-orange-300/40" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] via-[#0f172a]/60 to-transparent" />
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 flex items-center gap-2 bg-black/40 hover:bg-black/60 backdrop-blur-md px-4 py-2 rounded-full text-sm font-bold transition-all"
        >
          <ArrowLeft size={16} /> Retour
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-4 -mt-16 relative z-10 pb-20">
        <div className="grid md:grid-cols-5 gap-6">
          {/* Left: info */}
          <div className="md:col-span-3 space-y-6">
            <div className="bg-[#1e293b] rounded-2xl border border-white/10 p-6 shadow-xl">
              <h1 className="text-3xl font-black mb-2">{campaign.title}</h1>
              <p className="text-slate-400 text-sm mb-4">Par <span className="text-orange-400 font-bold">{campaign.profiles?.name || 'Organisateur'}</span></p>
              {campaign.description && <p className="text-slate-300 leading-relaxed">{campaign.description}</p>}

              {campaign.end_date && (
                <div className="mt-4 flex items-center gap-2 text-slate-400 text-sm">
                  <Calendar size={14} />
                  <span>Se termine le {new Date(campaign.end_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="bg-[#1e293b] rounded-2xl border border-white/10 p-6 shadow-xl space-y-4">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-3xl font-black text-orange-400">{formatCurrency(stats.total_raised, campaign.currency)}</p>
                  <p className="text-slate-400 text-sm mt-1">collectés sur <span className="text-white font-bold">{formatCurrency(campaign.goal_amount, campaign.currency)}</span></p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black">{stats.contributor_count}</p>
                  <p className="text-slate-400 text-sm flex items-center gap-1 justify-end"><Users size={12} /> contributeurs</p>
                </div>
              </div>
              <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-700"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-sm text-slate-400 text-right font-bold">{progress.toFixed(0)}% de l'objectif atteint</p>
            </div>
          </div>

          {/* Right: contribution form */}
          <div className="md:col-span-2">
            <div className="bg-[#1e293b] rounded-2xl border border-white/10 p-6 shadow-xl sticky top-4">
              {/* Approval Guard */}
              {campaign.approval_status !== 'approved' ? (
                <div className="text-center py-10 space-y-4">
                  {campaign.approval_status === 'rejected' ? (
                    <>
                      <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto"><span className="text-3xl">❌</span></div>
                      <h3 className="text-lg font-black text-red-400">Campagne refusée</h3>
                      <p className="text-slate-400 text-sm">Cette campagne a été refusée par l'équipe de modération et n'est pas disponible au public.</p>
                    </>
                  ) : (
                    <>
                      <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto"><span className="text-3xl">⏳</span></div>
                      <h3 className="text-lg font-black text-amber-400">En cours de validation</h3>
                      <p className="text-slate-400 text-sm">Cette campagne est en attente de validation par l'équipe Babipass. Elle sera ouverte aux contributions dès son approbation.</p>
                    </>
                  )}
                </div>
              ) : step === 'success' ? (
                <div className="text-center space-y-4 py-6">
                  <CheckCircle className="mx-auto text-emerald-400" size={56} />
                  <h2 className="text-2xl font-black">Merci !</h2>
                  <p className="text-slate-400">Votre contribution a bien été enregistrée. Merci de soutenir cette campagne 🙏</p>
                  <button
                    onClick={() => { setStep('form'); setForm({ ...form, amount: '' }); }}
                    className="text-sm text-orange-400 hover:text-orange-300"
                  >Contribuer à nouveau</button>
                </div>
              ) : step === 'form' ? (
                <form onSubmit={handleContribute} className="space-y-4">
                  <h2 className="text-xl font-black mb-2 flex items-center gap-2"><Heart size={20} className="text-orange-400" /> Contribuer</h2>

                  {error && <div className="bg-red-500/10 border border-red-500/40 text-red-400 text-sm p-3 rounded-xl">{error}</div>}

                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-1">Votre nom (optionnel)</label>
                    <input
                      type="text"
                      placeholder="Anonyme"
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                      className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-1">Email (optionnel pour Mobile Money)</label>
                    <input
                      type="email"
                      placeholder="votre@email.com"
                      value={form.email}
                      onChange={e => setForm({ ...form, email: e.target.value })}
                      className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 text-sm"
                      required={form.method === 'CB'}
                    />
                  </div>

                  {form.method !== 'CB' && (
                    <div className="animate-in fade-in slide-in-from-top-2">
                      <label className="block text-sm font-semibold text-slate-300 mb-1">Numéro Mobile Money *</label>
                      <div className="relative">
                        <Phone size={18} className="absolute left-3 top-3 text-slate-500" />
                        <input
                          type="tel"
                          placeholder="Ex: 0102030405"
                          value={form.phone}
                          onChange={e => setForm({ ...form, phone: e.target.value })}
                          className="w-full bg-slate-900/60 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 text-sm"
                          required
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-1">Montant ({campaign.currency}) *</label>
                    <input
                      type="number"
                      placeholder="5000"
                      min="100"
                      value={form.amount}
                      onChange={e => setForm({ ...form, amount: e.target.value })}
                      className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 text-sm"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">Mode de paiement</label>
                    <div className="grid grid-cols-2 gap-2">
                      {paymentMethods.map(pm => (
                        <button
                          key={pm.id}
                          type="button"
                          onClick={() => setForm({ ...form, method: pm.id })}
                          className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${form.method === pm.id ? 'bg-orange-600 border-orange-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'}`}
                        >
                          {pm.emoji} {pm.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {submitting ? <Loader2 size={18} className="animate-spin" /> : <Heart size={18} />}
                    {form.method === 'CB' ? 'Suivant (Carte)' : (submitting ? 'Paiement en cours...' : 'Payer via Mobile Money')}
                  </button>
                  <p className="text-xs text-slate-500 text-center">Paiement sécurisé via Babipass</p>
                </form>
              ) : step === 'card_details' ? (
                <form onSubmit={handleCardPayment} className="space-y-4 animate-in slide-in-from-right-4">
                  <button type="button" onClick={() => setStep('form')} className="text-sm font-bold text-slate-400 hover:text-white flex items-center gap-1 mb-4">
                    <ArrowLeft size={16} /> Retour
                  </button>
                  <h2 className="text-xl font-black mb-4 flex items-center gap-2"><CreditCard size={20} className="text-blue-400" /> Carte Bancaire</h2>
                  
                  {error && <div className="bg-red-500/10 border border-red-500/40 text-red-400 text-sm p-3 rounded-xl mb-4">{error}</div>}
                  
                  <div className="p-4 bg-slate-800 rounded-xl mb-4 text-center">
                    <p className="text-sm text-slate-400">Montant à payer</p>
                    <p className="text-2xl font-black">{formatCurrency(parseFloat(form.amount || '0'), campaign.currency)}</p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-1">Numéro de carte</label>
                    <input type="text" placeholder="0000 0000 0000 0000" maxLength={19} required value={cardDetails.number} onChange={e => setCardDetails({...cardDetails, number: e.target.value})} className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:ring-1 focus:ring-blue-500" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-300 mb-1">Expiration</label>
                      <input type="text" placeholder="MM/YY" maxLength={5} required value={cardDetails.expiry} onChange={e => setCardDetails({...cardDetails, expiry: e.target.value})} className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-300 mb-1">CVC</label>
                      <input type="text" placeholder="123" maxLength={4} required value={cardDetails.cvv} onChange={e => setCardDetails({...cardDetails, cvv: e.target.value})} className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:ring-1 focus:ring-blue-500" />
                    </div>
                  </div>
                  <button type="submit" disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg flex justify-center items-center mt-6 disabled:opacity-50">
                    {submitting ? <Loader2 size={20} className="animate-spin" /> : 'Payer maintenant'}
                  </button>
                  <p className="text-xs text-center text-slate-500 mt-4 flex items-center justify-center gap-1"><Shield size={12}/> Paiement sécurisé via Paystack</p>
                </form>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
