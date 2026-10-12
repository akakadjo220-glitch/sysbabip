import React, { useState, useEffect } from 'react';
import { getOfflineTickets, removeSecureTicket, saveSecureTicket } from '../utils/offlineStorage';
import { QrCode, Calendar, MapPin, Ticket, WifiOff, Clock, ShieldCheck, RefreshCw, Send, X, Smartphone, Mail, AlertTriangle, Banknote, Users, Copy, Share2, Plus, Lock, Loader2, User, Download, Search, Globe } from 'lucide-react';
import { CheckoutService } from '../services/CheckoutService';
import { PAYMENT_ROUTING, formatCurrency } from '../constants';
import { generateTicketPDF } from '../utils/pdfGenerator';
import QRCode from 'qrcode';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { SERVER_URL } from '../config';

export const MyTickets: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);

  const loadTickets = async () => {
    setLoading(true);
    try {
      // Charge les billets chiffrés depuis le stockage local
      const data = await getOfflineTickets();
      // Trie par date d'achat (le plus récent en premier)
      setTickets(data.reverse());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, []);

  const handleTransferComplete = () => {
    loadTickets(); // Recharger les billets après un transfert
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Mon Portefeuille</h1>
          <p className="text-slate-400 flex items-center gap-2 mt-1">
            <ShieldCheck size={16} className="text-emerald-400" />
            Billets stockés localement et chiffrés
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-xs text-slate-400">
            <WifiOff size={12} /> Accessible hors-ligne
          </div>
          <button
            onClick={() => navigate('/ambassador')}
            className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500 hover:text-white transition-colors text-xs font-bold"
          >
            <Share2 size={12} /> Espace Ambassadeur
          </button>
        </div>
      </div>

      {loading ? (
          <div className="text-center py-20">
            <RefreshCw className="animate-spin text-orange-500 mx-auto" size={32} />
            <p className="text-slate-500 mt-4">Déchiffrement de votre portefeuille...</p>
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-slate-800/30 rounded-3xl border border-white/5 p-8 text-center">
            <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-4">
              <Ticket className="text-slate-600" size={32} />
            </div>
            <h3 className="text-xl font-bold text-white">Aucun billet</h3>
            <p className="text-slate-500 mt-2 max-w-xs mb-8">
              Vos futurs billets apparaîtront ici. Si vous avez déjà acheté des billets sur un autre appareil, utilisez la fonction de récupération.
            </p>
            <button
              onClick={() => setShowRecoveryModal(true)}
              className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-white font-bold transition-all"
            >
              <Search size={18} className="text-orange-500" />
              Retrouver mes billets
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tickets.map((ticket) => (
                <TicketCard key={ticket.id} ticket={ticket} onTransferComplete={handleTransferComplete} />
              ))}
            </div>

            <div className="flex justify-center pt-4">
              <button
                onClick={() => setShowRecoveryModal(true)}
                className="flex items-center gap-2 px-6 py-3 bg-slate-800/50 hover:bg-slate-800 border border-white/5 rounded-2xl text-slate-400 hover:text-white transition-all text-sm font-medium"
              >
                <Search size={16} />
                Billet manquant ? Lancer la récupération
              </button>
            </div>
          </div>
        )
      }

      {showRecoveryModal && (
        <RecoveryModal
          onClose={() => setShowRecoveryModal(false)}
          onSuccess={() => {
            setShowRecoveryModal(false);
            loadTickets();
          }}
        />
      )}
    </div>
  );
};

const TicketCard: React.FC<{ ticket: any; onTransferComplete: () => void }> = ({ ticket, onTransferComplete }) => {
  const [showQR, setShowQR] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showInstallmentModal, setShowInstallmentModal] = useState(false);
  const [qrBase64, setQrBase64] = useState<string>('');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  useEffect(() => {
    if (showQR && !qrBase64) {
      QRCode.toDataURL(ticket.qrCode, { width: 300, margin: 2 })
        .then(setQrBase64)
        .catch(err => console.error("QR display error", err));
    }
  }, [showQR, ticket.qrCode, qrBase64]);

  const handleDownloadPdf = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsGeneratingPdf(true);
    await generateTicketPDF(ticket);
    setIsGeneratingPdf(false);
  };

  const isPartial = ticket.paymentStatus === 'partial';
  const installmentAmount = isPartial && ticket.installmentsTotal > 0 ? ticket.totalAmount / ticket.installmentsTotal : 0;

  // Génération d'une couleur de gradient aléatoire basée sur l'ID pour varier les visuels
  const gradients = [
    'from-orange-500 to-amber-500',
    'from-emerald-500 to-teal-600',
    'from-orange-500 to-rose-600',
    'from-blue-500 to-cyan-500'
  ];
  const gradient = gradients[ticket.eventName.length % gradients.length];

  return (
    <div className="group relative bg-[#1e293b] rounded-3xl overflow-hidden border border-white/10 shadow-xl transition-all hover:border-white/20">

      {/* Ticket Header (Tear-off part visual) */}
      <div className={`relative h-36 bg-gradient-to-br ${gradient} p-5 flex flex-col justify-between overflow-hidden`}>
        {/* Background pattern for premium feel */}
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.1) 10px, rgba(255,255,255,0.1) 11px)' }} />

        <div className="flex justify-between items-start relative z-10">
          <span className="bg-black/20 backdrop-blur-md px-3 py-1 rounded-lg text-xs font-bold text-white uppercase tracking-widest border border-white/10">
            {ticket.type}
          </span>
          {/* Organizer Logo / Fallback Icon */}
          <div className="w-10 h-10 rounded-full bg-white shadow-lg border-2 border-white/80 flex items-center justify-center overflow-hidden shrink-0">
            {ticket.organizerLogo ? (
              <img
                src={ticket.organizerLogo}
                alt={ticket.organizerName || 'Organisateur'}
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <Ticket size={18} className="text-slate-600" />
            )}
          </div>
        </div>
        <div className="relative z-10">
          <p className="text-white/70 text-[10px] font-bold uppercase tracking-wider mb-0.5">
            {ticket.organizerName || 'Babipass'}
          </p>
          <h3 className="text-xl font-black text-white leading-tight line-clamp-2 drop-shadow-sm">
            {ticket.eventName}
          </h3>
        </div>

        {/* Decorative Circles for "holes" */}
        <div className="absolute -bottom-3 -left-3 w-6 h-6 bg-[#0f172a] rounded-full z-20"></div>
        <div className="absolute -bottom-3 -right-3 w-6 h-6 bg-[#0f172a] rounded-full z-20"></div>
      </div>

      {/* Ticket Body */}
      <div className="p-6 pt-8 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center shrink-0">
            <Calendar size={18} className="text-slate-400" />
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase font-bold">Date</p>
            <p className="text-white font-medium">
              {new Date(ticket.eventDate).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' })}
            </p>
            <p className="text-sm text-slate-400">
              {new Date(ticket.eventDate).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center shrink-0">
            <MapPin size={18} className="text-slate-400" />
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase font-bold">Lieu</p>
            <p className="text-white font-medium line-clamp-1">{ticket.location}</p>
          </div>
        </div>

        <div className="border-t border-dashed border-slate-700 my-2"></div>

        <div className="text-center">
          {isPartial ? (
            <div className="bg-slate-800 p-4 rounded-xl text-center border border-amber-500/30">
              <div className="w-16 h-16 bg-amber-500/20 text-amber-500 rounded-full mx-auto flex items-center justify-center mb-3">
                <Lock size={32} />
              </div>
              <p className="text-amber-400 font-bold">Billet Verrouillé (Tontine)</p>
              <p className="text-xs text-slate-400 mt-1 mb-4">Payez pour débloquer le QR Code</p>

              <div className="bg-slate-900 rounded-full h-2 mb-2 overflow-hidden mx-auto max-w-[80%]">
                <div
                  className="bg-amber-500 h-full transition-all"
                  style={{ width: `${(ticket.installmentsPaid / ticket.installmentsTotal) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 mb-4 px-2 font-bold uppercase tracking-wider">
                <span>Tranche {ticket.installmentsPaid}/{ticket.installmentsTotal}</span>
                <span>{formatCurrency(ticket.amountPaid)} / {formatCurrency(ticket.totalAmount)}</span>
              </div>

              <button
                onClick={() => setShowInstallmentModal(true)}
                className="w-full py-2.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white rounded-lg font-bold text-sm shadow-[0_0_15px_rgba(245,158,11,0.3)] transition-all"
              >
                Payer la suite ({formatCurrency(installmentAmount)})
              </button>
            </div>
          ) : showQR ? (
            <div className="bg-white p-4 rounded-xl inline-block animate-in zoom-in duration-300">
              {qrBase64 ? (
                <img
                  src={qrBase64}
                  alt="QR Code"
                  className="w-32 h-32 object-contain"
                />
              ) : (
                <div className="w-32 h-32 flex items-center justify-center bg-slate-100 rounded-lg">
                  <Loader2 className="animate-spin text-orange-500" />
                </div>
              )}
              <p className="text-black font-mono text-[10px] mt-2 font-bold tracking-widest uppercase">
                {ticket.id}
              </p>
            </div>
          ) : (
            <button
              onClick={() => setShowQR(true)}
              className="w-full py-4 border-2 border-dashed border-slate-600 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:text-white hover:border-orange-500 hover:bg-orange-500/5 transition-all group/btn"
            >
              <QrCode size={32} className="mb-2 group-hover/btn:scale-110 transition-transform" />
              <span className="text-sm font-bold">Afficher le QR Code</span>
              <span className="text-xs opacity-60 mt-1">Cliquez pour scanner</span>
            </button>
          )}
        </div>

        <div className="flex items-center justify-center gap-2 text-xs text-slate-500 pt-2 pb-4">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          Disponible hors-connexion
        </div>

        {/* Action: Download PDF */}
        {!isPartial && (
          <button
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
            className="w-full py-3 mb-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white font-bold transition-all flex items-center justify-center gap-2"
          >
            {isGeneratingPdf ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Download size={16} className="text-orange-400" />
            )}
            Télécharger mon Ticket (PDF)
          </button>
        )}

        {/* Actions Buttons */}
        {!isPartial && (
          <div className="flex gap-2">
            {/* Bouton de Transfert */}
            <button
              onClick={() => setShowTransferModal(true)}
              className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 group/transfer"
            >
              <Send size={16} className="text-orange-400 group-hover/transfer:translate-x-1 transition-transform" />
              Transférer
            </button>


          </div>
        )}
      </div>

      {showInstallmentModal && (
        <InstallmentModal
          ticket={ticket}
          installmentAmount={installmentAmount}
          onClose={() => setShowInstallmentModal(false)}
          onSuccess={() => {
            setShowInstallmentModal(false);
            onTransferComplete(); // Recharger le ticket local
          }}
        />
      )}

      {showTransferModal && (
        <TransferModal
          ticket={ticket}
          onClose={() => setShowTransferModal(false)}
          onSuccess={() => {
            setShowTransferModal(false);
            onTransferComplete();
          }}
        />
      )}


    </div>
  );
};

// Modal de Paiement de Tranche (Tontine)
const InstallmentModal: React.FC<{ ticket: any; installmentAmount: number; onClose: () => void; onSuccess: () => void }> = ({ ticket, installmentAmount, onClose, onSuccess }) => {
  const [step, setStep] = useState<'info' | 'processing' | 'success'>('info');

  const handlePayment = async () => {
    setStep('processing');
    try {
      // Le serveur calcule la tranche, lance le paiement et le vérifie. À la
      // dernière tranche, il rend les billets valables à l'entrée.
      const created = await CheckoutService.createInstallment(ticket.id, 'paystack');
      if (!(await CheckoutService.openPaystack(created))) {
        setStep('info');
        return;
      }

      const result = await CheckoutService.waitForPayment(created.order.id, created.order.token);
      if (result.status !== 'paid') {
        alert(result.status === 'pending'
          ? "Paiement pas encore confirmé. S'il a été validé, il sera pris en compte automatiquement."
          : 'Paiement échoué ou expiré.');
        setStep('info');
        return;
      }

      const updatedTicket = { ...ticket };
      updatedTicket.installmentsPaid += 1;
      updatedTicket.amountPaid = result.amount_paid ?? updatedTicket.amountPaid + created.order.amount_due;
      if (result.fully_paid) {
        updatedTicket.paymentStatus = 'paid';
        updatedTicket.installmentsPaid = updatedTicket.installmentsTotal;
      }

      await removeSecureTicket(ticket.id || ticket.qrCode);
      await saveSecureTicket(updatedTicket);
      setStep('success');
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Erreur technique lors du paiement.");
      setStep('info');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#1e293b] w-full max-w-sm rounded-2xl border border-white/10 shadow-2xl relative overflow-hidden">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white z-10"><X size={20} /></button>

        {step === 'info' && (
          <div className="p-6">
            <h3 className="text-xl font-bold text-white mb-2 text-center">Paiement de Tranche</h3>
            <div className="bg-slate-800/50 p-4 rounded-xl mb-6 border border-amber-500/20 text-center">
              <p className="text-sm font-medium text-slate-400 mb-1">Montant à régler (carte ou Mobile Money)</p>
              <p className="text-3xl font-black text-amber-400">{formatCurrency(installmentAmount)}</p>
            </div>

            <p className="text-sm text-slate-400 mb-6 px-2 text-center">Vous allez être débité de cette somme. Un reçu vous sera envoyé par la suite.</p>

            <button
              onClick={handlePayment}
              className="w-full py-3.5 bg-gradient-to-r from-amber-600 to-amber-500 text-white rounded-xl font-bold shadow-[0_0_15px_rgba(245,158,11,0.3)] transition-all hover:scale-105"
            >
              Confirmer le Paiement
            </button>
          </div>
        )}

        {step === 'processing' && (
          <div className="p-12 text-center flex flex-col items-center justify-center min-h-[300px]">
            <Loader2 size={48} className="text-amber-500 animate-spin mb-6" />
            <h3 className="text-xl font-bold text-white mb-2">Paiement en cours...</h3>
            <p className="text-slate-400 text-sm">Veuillez valider sur votre téléphone.</p>
          </div>
        )}

        {step === 'success' && (
          <div className="p-12 text-center flex flex-col items-center justify-center min-h-[300px]">
            <div className="w-20 h-20 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mb-6 animate-in zoom-in duration-300">
              <ShieldCheck size={40} />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">Paiement Validé !</h3>
            <p className="text-slate-400 text-sm mb-6">Votre tranche a été payée avec succès.</p>
            <button
              onClick={onSuccess}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-colors"
            >
              Voir mon Billet
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Modal de Transfert Sécurisé
const TransferModal: React.FC<{ ticket: any; onClose: () => void; onSuccess: () => void }> = ({ ticket, onClose, onSuccess }) => {
  const [step, setStep] = useState<'info' | 'processing' | 'success'>('info');
  const [recipientName, setRecipientName] = useState('');
  const [contactMethod, setContactMethod] = useState<'wa' | 'email'>('wa');
  const [contactValue, setContactValue] = useState('');
  const [visitorCountryCode, setVisitorCountryCode] = useState('CI');
  const [availableCountries, setAvailableCountries] = useState<any[]>([]);
  const [loadingCountries, setLoadingCountries] = useState(true);

  // Charger les pays actifs dynamiquement pour le destinataire
  useEffect(() => {
    const fetchActiveCountries = async () => {
      try {
        const { data, error } = await supabase
          .from('supported_countries')
          .select('*')
          .eq('is_active', true)
          .order('name');
        
        if (error) throw error;
        if (data && data.length > 0) {
          setAvailableCountries(data);
          if (!data.find((c: any) => c.code.toUpperCase() === 'CI')) {
            setVisitorCountryCode(data[0].code.toUpperCase());
          }
        }
      } catch (err) {
        setAvailableCountries(Object.values(PAYMENT_ROUTING));
      } finally {
        setLoadingCountries(false);
      }
    };
    fetchActiveCountries();
  }, []);

  const visitorCountry = PAYMENT_ROUTING[visitorCountryCode] || { dialCode: '+225' };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    // 0. Pré-formater le contact du destinataire
    const searchContact = contactValue.trim().toLowerCase().replace(/\s/g, '');
    let finalContact = searchContact;
    if (contactMethod === 'wa') {
      const dialCode = (visitorCountry?.dialCode || '+225').replace('+', '');
      finalContact = searchContact.startsWith('+') ? searchContact.replace('+', '') : `${dialCode}${searchContact}`;
    }

    try {
      // 1. Le serveur invalide l'ancien billet, en émet un nouveau au nom du
      //    destinataire et lui envoie (email ou WhatsApp).
      const res = await fetch(`${SERVER_URL}/api/tickets/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_id: ticket.id || ticket.qrCode,
          recipient_name: recipientName,
          recipient_contact: finalContact,
          channel: contactMethod === 'wa' ? 'wa' : 'email'
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erreur lors du transfert.');
      }

      // 2. Retirer l'ancien billet du portefeuille local (il n'est plus valable)
      await removeSecureTicket(ticket.id || ticket.qrCode);

      setStep('success');
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Erreur lors du transfert. Vérifiez votre connexion ou que le billet est toujours valide.");
      setStep('info');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#1e293b] w-full max-w-md rounded-2xl border border-white/10 shadow-2xl overflow-hidden relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white z-10"><X size={20} /></button>

        {step === 'info' && (
          <div className="p-6">
            <h3 className="text-xl font-bold text-white mb-2">Transférer ce billet</h3>
            <p className="text-sm text-slate-400 mb-6 bg-rose-500/10 border border-rose-500/20 p-3 rounded-lg flex items-start gap-2">
              <AlertTriangle className="text-rose-500 shrink-0 mt-0.5" size={16} />
              Attention: Le transfert détruira définitivement votre QR Code actuel et en générera un nouveau pour le destinataire.
            </p>

            <form onSubmit={handleTransfer} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Nom Complet du Destinataire</label>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="Ex: Marie K."
                  className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                  required
                />
              </div>

              <div className="flex bg-slate-800 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setContactMethod('wa')}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors ${contactMethod === 'wa' ? 'bg-orange-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                >
                  <Smartphone size={16} /> WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => setContactMethod('email')}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors ${contactMethod === 'email' ? 'bg-orange-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                >
                  <Mail size={16} /> Email
                </button>
              </div>

              {contactMethod === 'wa' && (
                <div className="mb-4 bg-slate-800/30 p-3 rounded-xl border border-white/5 flex flex-col gap-2">
                  <span className="text-slate-300 text-xs font-bold uppercase tracking-wider">Pays du Destinataire</span>
                  {loadingCountries ? (
                    <div className="h-10 flex items-center px-3 bg-slate-900/60 rounded-lg animate-pulse" />
                  ) : (
                    <select
                      value={visitorCountryCode}
                      onChange={e => setVisitorCountryCode(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-orange-500"
                    >
                      {availableCountries.map(country => {
                        const code = country.code.toUpperCase();
                        const dial = country.dial_code || (PAYMENT_ROUTING[code]?.dialCode) || '';
                        return (
                          <option key={country.id || code} value={code}>
                            {country.name} {dial ? `(${dial})` : ''}
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Contact du Destinataire
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                    {contactMethod === 'wa' ? (
                      <span className="font-bold text-sm bg-slate-800 px-2 py-1 rounded border border-white/5">{visitorCountry?.dialCode || '+225'}</span>
                    ) : (
                      <Mail size={18} />
                    )}
                  </div>
                  <input
                    type={contactMethod === 'wa' ? 'tel' : 'email'}
                    value={contactValue}
                    onChange={(e) => setContactValue(e.target.value)}
                    placeholder={contactMethod === 'wa' ? '05 44 24 69 72' : 'marie@exemple.com'}
                    className={`w-full bg-slate-900/60 border border-slate-700 rounded-xl py-3 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 font-medium ${contactMethod === 'wa' ? 'pl-20' : 'pl-12'} pr-4`}
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-4 mt-6 bg-gradient-to-r from-orange-600 to-amber-500 text-white rounded-xl font-bold shadow-[0_0_20px_rgba(249,115,22,0.4)] transition-transform hover:scale-105"
              >
                Confirmer le Transfert
              </button>
            </form>
          </div>
        )}

        {step === 'processing' && (
          <div className="p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
            <RefreshCw size={48} className="text-orange-500 animate-spin mb-6" />
            <h3 className="text-xl font-bold text-white mb-2">Chiffrement en cours...</h3>
            <p className="text-slate-400 text-sm">Destruction de l'ancien billet et émission du nouveau...</p>
          </div>
        )}

        {step === 'success' && (
          <div className="p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
            <div className="w-20 h-20 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mb-6 animate-in zoom-in duration-300">
              <ShieldCheck size={40} />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">Transfert Réussi</h3>
            <p className="text-slate-400 text-sm mb-6">Le billet a été envoyé à {recipientName} et a été retiré de votre portefeuille pour empêcher la revente illégale.</p>
            <button
              onClick={onSuccess}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-colors"
            >
              Retour au portefeuille
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Modal de Récupération de Billets (Multi-appareil)
const RecoveryModal: React.FC<{ onClose: () => void; onSuccess: () => void }> = ({ onClose, onSuccess }) => {
  const [step, setStep] = useState<'input' | 'searching' | 'otp' | 'results'>('input');
  const [contactValue, setContactValue] = useState('');
  const [foundCount, setFoundCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [ticketData, setTicketData] = useState<any[]>([]);
  
  // Nouveaux états pour le sélecteur dynamique
  const [contactMethod, setContactMethod] = useState<'wa' | 'email'>('wa');
  const [visitorCountryCode, setVisitorCountryCode] = useState('CI');
  const [availableCountries, setAvailableCountries] = useState<any[]>([]);
  const [loadingCountries, setLoadingCountries] = useState(true);

  // Charger les pays actifs depuis la base de données (gérés par l'admin)
  useEffect(() => {
    const fetchActiveCountries = async () => {
      try {
        const { data, error } = await supabase
          .from('supported_countries')
          .select('*')
          .eq('is_active', true)
          .order('name');
        
        if (error) throw error;
        if (data && data.length > 0) {
          setAvailableCountries(data);
          // Si le pays par défaut (CI) n'est pas dans la liste active, prendre le premier
          if (!data.find((c: any) => c.code.toUpperCase() === 'CI')) {
            setVisitorCountryCode(data[0].code.toUpperCase());
          }
        }
      } catch (err) {
        console.error("Error fetching countries", err);
        // Fallback sur les pays par défaut si erreur
        setAvailableCountries(Object.values(PAYMENT_ROUTING));
      } finally {
        setLoadingCountries(false);
      }
    };

    fetchActiveCountries();
  }, []);

  const visitorCountry = PAYMENT_ROUTING[visitorCountryCode] || { dialCode: '+225' };

  const handleRecoverSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactValue) return;

    setStep('searching');
    setError(null);

    try {
      const searchContact = contactValue.trim().toLowerCase().replace(/\s/g, '');
      const dialCode = (visitorCountry?.dialCode || '+225').replace('+', '');
      let finalContact = searchContact;
      
      if (contactMethod === 'wa') {
        // Formater intelligemment : Ne pas doubler le préfixe
        if (searchContact.startsWith('+')) {
          finalContact = searchContact.replace('+', '');
        } else if (searchContact.startsWith(dialCode)) {
          finalContact = searchContact;
        } else {
          finalContact = `${dialCode}${searchContact}`;
        }
      }

      // Le serveur compte les billets et envoie le code (email ou WhatsApp).
      // Les billets eux-mêmes ne sont renvoyés qu'après vérification du code.
      const res = await fetch(`${SERVER_URL}/api/tickets/recover/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: finalContact, channel: contactMethod === 'wa' ? 'wa' : 'email' })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'Recherche impossible');

      setFoundCount(data.count || 0);
      if (!data.count) {
        setStep('results');
        return;
      }

      setStep('otp');

    } catch (err) {
      console.error(err);
      setError("Erreur système lors de la recherche.");
      setStep('input');
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode) return;
    
    setError(null);
    setStep('searching'); // Reuse loading screen
    
    try {
      // 1. Construire le contact au format international (SANS DOUBLON)
      const searchContact = contactValue.trim().toLowerCase().replace(/\s/g, '');
      const dialCode = (visitorCountry?.dialCode || '+225').replace('+', '');
      let finalContact = searchContact;

      if (contactMethod === 'wa') {
        if (searchContact.startsWith('+')) {
          finalContact = searchContact.replace('+', '');
        } else if (searchContact.startsWith(dialCode)) {
          finalContact = searchContact;
        } else {
          finalContact = `${dialCode}${searchContact}`;
        }
      }

      // 2. Vérifier l'OTP côté serveur, qui ne renvoie les billets qu'en cas de succès
      const verifyRes = await fetch(`${SERVER_URL}/api/tickets/recover/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: finalContact, channel: contactMethod === 'wa' ? 'wa' : 'email', code: otpCode })
      });
      const verifyData = await verifyRes.json().catch(() => ({}));

      if (!verifyRes.ok || !verifyData.success) {
        setError("Code incorrect ou expiré. Veuillez réessayer.");
        setStep('otp');
        return;
      }

      // Transformer les données à plat du RPC vers le format attendu par l'UI
      const recoveredTickets = (verifyData.tickets || []).map((d: any) => ({
        ...d,
        events: {
          title: d.event_title,
          date: d.event_date,
          location: d.event_location,
          city: d.event_city,
          profiles: {
            name: d.organizer_name,
            avatar: d.organizer_avatar
          }
        }
      }));
      setTicketData(recoveredTickets);
      setFoundCount(recoveredTickets.length);

      // Code validé ! On procède à l'import local
      let imported = 0;
      const currentTickets = await getOfflineTickets();
      const currentIds = new Set(currentTickets.map(t => t.id));

      for (const t of recoveredTickets) {
        if (!currentIds.has(t.id)) {
          const offlineTicket = {
            id: t.id,
            eventName: t.events?.title || 'Événement Babipass',
            eventDate: t.events?.date,
            location: `${t.events?.location || ''}, ${t.events?.city || ''}`.trim().replace(/,$/, ''),
            type: t.ticket_type || 'Standard',
            holder: t.guest_name || 'Client Babipass',
            qrCode: t.qr_code,
            paymentStatus: 'paid',
            organizerName: t.events?.profiles?.name,
            organizerLogo: t.events?.profiles?.avatar
          };

          await saveSecureTicket(offlineTicket);
          imported++;
        }
      }

      setStep('results');
    } catch (err) {
      console.error(err);
      setError("Erreur système lors du téléchargement des billets.");
      setStep('otp');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="bg-[#0f172a] w-full max-w-md rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden relative">
        
        {step === 'input' && (
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">Récupérer mes Billets</h3>
              <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>

            <p className="text-slate-400 text-sm mb-6">
              Saisissez l'email ou le numéro WhatsApp utilisé lors de votre achat.
            </p>

            <div className="flex bg-slate-800 p-1 rounded-xl mb-6">
              <button
                onClick={() => setContactMethod('wa')}
                className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors ${contactMethod === 'wa' ? 'bg-orange-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                <Smartphone size={16} /> WhatsApp
              </button>
              <button
                onClick={() => setContactMethod('email')}
                className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors ${contactMethod === 'email' ? 'bg-orange-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                <Mail size={16} /> Email
              </button>
            </div>

            {contactMethod === 'wa' && (
              <div className="mb-4 bg-slate-800/50 p-3 rounded-xl border border-white/5 flex flex-col gap-2">
                <span className="text-slate-300 text-xs font-bold uppercase tracking-wider">Votre pays</span>
                {loadingCountries ? (
                  <div className="h-10 flex items-center px-3 bg-slate-900 rounded-lg animate-pulse">
                    <span className="text-slate-500 text-xs text-center w-full">Chargement des pays...</span>
                  </div>
                ) : (
                  <select
                    value={visitorCountryCode}
                    onChange={e => setVisitorCountryCode(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-orange-500"
                  >
                    {availableCountries.map(country => {
                      const code = country.code.toUpperCase();
                      const dialCode = country.dial_code || (PAYMENT_ROUTING[code]?.dialCode) || '';
                      return (
                        <option key={country.id || code} value={code}>
                          {country.name} {dialCode ? `(${dialCode})` : ''}
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>
            )}

            <form onSubmit={handleRecoverSearch}>
              <div className="relative mb-6">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                  {contactMethod === 'wa' ? (
                    <span className="font-bold text-sm bg-slate-800 px-2 py-1 rounded border border-white/5">{visitorCountry?.dialCode || '+225'}</span>
                  ) : (
                    <Mail size={18} />
                  )}
                </div>
                <input
                  type={contactMethod === 'wa' ? 'tel' : 'email'}
                  value={contactValue}
                  onChange={(e) => setContactValue(e.target.value)}
                  className={`w-full bg-slate-900 border border-slate-700 rounded-xl py-3 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition-all font-medium ${contactMethod === 'wa' ? 'pl-20' : 'pl-12'} pr-4`}
                  placeholder={contactMethod === 'wa' ? '05 44 24 69 72' : 'votre@email.com'}
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full py-4 bg-gradient-to-r from-orange-600 to-amber-500 text-white rounded-xl font-bold hover:shadow-[0_0_20px_rgba(249,115,22,0.3)] transition-all flex items-center justify-center gap-2"
              >
                <Search size={18} />
                Rechercher
              </button>
            </form>
          </div>
        )}

        {step === 'searching' && (
          <div className="p-16 text-center min-h-[400px] flex flex-col items-center justify-center">
            <RefreshCw size={48} className="text-orange-500 animate-spin mb-6" />
            <h3 className="text-xl font-bold text-white">Recherche en cours...</h3>
          </div>
        )}

        {step === 'otp' && (
          <div className="p-8">
            <div className="flex flex-col items-center mb-6">
              <div className="w-16 h-16 bg-orange-500/10 text-orange-500 rounded-full flex items-center justify-center mb-4">
                <Lock size={32} />
              </div>
              <h3 className="text-xl font-bold text-white text-center mb-2">Vérification de Sécurité</h3>
              <p className="text-sm text-slate-400 text-center">
                Un code de vérification à 6 chiffres a été envoyé à <b>{contactValue}</b>. Vous avez trouvé {foundCount} billet(s).
              </p>
            </div>

            {error && (
              <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-3 rounded-lg text-sm mb-4 text-center">
                {error}
              </div>
            )}

            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <input
                  type="text"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="Ex: 123456"
                  className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-4 text-white text-center text-2xl tracking-[0.5em] font-bold placeholder-slate-600 focus:outline-none focus:border-orange-500"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full py-4 mt-6 bg-gradient-to-r from-orange-600 to-amber-500 text-white rounded-xl font-bold shadow-[0_0_20px_rgba(249,115,22,0.4)] transition-transform hover:scale-105"
              >
                Vérifier et Télécharger
              </button>
            </form>
          </div>
        )}

        {step === 'results' && (
          <div className="p-8 pt-12 text-center">
            {foundCount > 0 ? (
              <>
                <div className="w-20 h-20 bg-emerald-500/20 text-emerald-500 rounded-3xl flex items-center justify-center mx-auto mb-6">
                  <Ticket size={40} />
                </div>
                <h3 className="text-2xl font-black text-white mb-3">Billets Retrouvés !</h3>
                <p className="text-slate-400 text-sm mb-8">
                  <span className="text-emerald-400 font-bold">{foundCount} billet(s)</span> associés à ce contact ont été synchronisés ou sont déjà présents sur cet appareil.
                </p>
                <button onClick={onSuccess} className="w-full py-5 bg-emerald-600 text-white rounded-2xl font-black">
                  Voir mes Billets
                </button>
              </>
            ) : (
              <>
                <div className="w-20 h-20 bg-slate-800 text-slate-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
                  <Mail size={40} />
                </div>
                <h3 className="text-2xl font-black text-white mb-3">Aucun Billet Trouvé</h3>
                <p className="text-slate-400 text-sm mb-8">
                  Aucun billet valide n'est associé à ce contact.
                </p>
                <button onClick={() => setStep('input')} className="w-full py-5 bg-slate-800 text-white rounded-2xl font-black">
                  Réessayer
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyTickets;
