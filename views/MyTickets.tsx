import React, { useState, useEffect } from 'react';
import { getOfflineTickets, removeSecureTicket, saveSecureTicket } from '../utils/offlineStorage';
import { QrCode, Calendar, MapPin, Ticket, WifiOff, Clock, ShieldCheck, RefreshCw, Send, X, Smartphone, Mail, AlertTriangle, Banknote, Users, Copy, Share2, Plus, Lock, Loader2, User, Download, Search } from 'lucide-react';
import { signTicket } from '../utils/crypto';
import { formatCurrency } from '../constants';
import { WhatsAppService } from '../services/WhatsAppService';
import { generateTicketPDF } from '../utils/pdfGenerator';
import QRCode from 'qrcode';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';

export const MyTickets: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'tickets' | 'affiliate'>('tickets');
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
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs text-slate-400">
          <WifiOff size={12} /> Accessible hors-ligne
        </div>
      </div>

      <div className="flex overflow-x-auto space-x-2 bg-slate-900/40 p-1.5 rounded-2xl border border-white/10 w-full md:w-max no-scrollbar relative z-20 shadow-2xl backdrop-blur-lg">
        <button onClick={() => setActiveTab('tickets')} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'tickets' ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg border border-orange-400/50' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
          <Ticket size={16} /> Mes Billets
        </button>
        <button onClick={() => setActiveTab('affiliate')} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'affiliate' ? 'bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white shadow-lg border border-fuchsia-500/50' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
          <Users size={16} /> Gagner de l'argent
        </button>
      </div>

      {activeTab === 'tickets' ? (
        loading ? (
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
      ) : (
        <AffiliateView user={user} />
      )}

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
  const [showResellModal, setShowResellModal] = useState(false);
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

            {/* Bouton de Revente */}
            <button
              onClick={() => setShowResellModal(true)}
              className="flex-1 py-3 bg-slate-800/80 border border-orange-500/30 hover:bg-orange-600/20 text-orange-400 rounded-xl font-bold transition-all flex items-center justify-center gap-2 group/resell"
            >
              <Banknote size={16} className="group-hover/resell:scale-110 transition-transform" />
              Revendre
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

      {showResellModal && (
        <ResellModal
          ticket={ticket}
          onClose={() => setShowResellModal(false)}
          onSuccess={() => {
            setShowResellModal(false);
            onTransferComplete(); // Recharges the local list
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

    // Simulate payment processing via existing API
    setTimeout(async () => {
      try {
        const updatedTicket = { ...ticket };
        updatedTicket.installmentsPaid += 1;
        updatedTicket.amountPaid += installmentAmount;

        // Si c'est la dernière tranche, on débloque le billet et génère le JWS officiel
        if (updatedTicket.installmentsPaid >= updatedTicket.installmentsTotal) {
          updatedTicket.paymentStatus = 'paid';
          updatedTicket.qrCode = await signTicket({
            tId: ticket.id,
            eId: "event-" + ticket.eventName, // mock
            type: ticket.type,
            usr: ticket.holder || "Anonyme"
          });

          // Notify via WA if known contact
          if (updatedTicket.contactDetail) {
            const msg = `🎉 Tontine terminée !\n\nVous avez réglé la totalité de votre billet pour *${updatedTicket.eventName}*. Votre QR Code officiel est désormais débloqué dans votre Portefeuille (Mes Billets).`;
            WhatsAppService.sendMessage(updatedTicket.contactDetail, msg);
          }
        } else {
          // Notify step
          if (updatedTicket.contactDetail) {
            const msg = `⏳ Paiement de la tranche ${updatedTicket.installmentsPaid}/${updatedTicket.installmentsTotal} reçu pour *${updatedTicket.eventName}*. Plus que ${updatedTicket.installmentsTotal - updatedTicket.installmentsPaid} paiement(s) !`;
            WhatsAppService.sendMessage(updatedTicket.contactDetail, msg);
          }
        }

        // Update local storage
        await removeSecureTicket(ticket.id || ticket.qrCode);
        await saveSecureTicket(updatedTicket);

        setStep('success');
      } catch (err) {
        console.error(err);
        alert("Erreur technique lors du paiement.");
        setStep('info');
      }
    }, 2000); // 2s sim processing
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#1e293b] w-full max-w-sm rounded-2xl border border-white/10 shadow-2xl relative overflow-hidden">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white z-10"><X size={20} /></button>

        {step === 'info' && (
          <div className="p-6">
            <h3 className="text-xl font-bold text-white mb-2 text-center">Paiement de Tranche</h3>
            <div className="bg-slate-800/50 p-4 rounded-xl mb-6 border border-amber-500/20 text-center">
              <p className="text-sm font-medium text-slate-400 mb-1">Montant à régler (Mobile Money)</p>
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

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientName || !contactValue) return;

    setStep('processing');

    try {
      // 1. Invalider l'ancien billet localement via le wallet sécurisé (AES-GCM)
      await removeSecureTicket(ticket.id || ticket.qrCode);

      // 2. Créer un nouveau jeton cryptographique pour le nouvel utilisateur
      const newTicketId = `tix-trsf-${Date.now()}`;

      // Extraction magique de l'Event ID (Dans une vraie DB, on a l'ID exact)
      const eventIdMatch = ticket.qrCode.split('.'); // très simplifié pour la démo

      const newSignedToken = await signTicket({
        tId: newTicketId,
        eId: "event-transfer", // Mock event ID fallback
        type: ticket.type,
        usr: recipientName
      });

      // 3. Simuler l'envoi au destinataire
      setTimeout(async () => {
        // En vrai: L'API envoie le lien magique au destinataire. 
        // L'expéditeur n'a plus le billet localement.

        const transferMessage = `🎟️ *NOUVEAU BILLET* 🎟️\n\nBonjour ${recipientName} !\nUn billet vous a été transféré pour *${ticket.eventName}*.\n\nCe billet est 100% crypté et anti-fraude.`;
        const mockQrImageUrl = "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=" + newSignedToken;

        if (contactMethod === 'wa') {
          console.log(`Transfert WA vers ${contactValue} :`, newSignedToken);
          WhatsAppService.sendMediaMessage(contactValue, transferMessage, mockQrImageUrl);
        } else {
          console.log(`Transfert Email vers ${contactValue} :`, newSignedToken);
        }

        setStep('success');
      }, 1500);

    } catch (err) {
      console.error(err);
      alert("Erreur réseau durant le transfert. Veuillez réessayer.");
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

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Contact du Destinataire
                </label>
                <input
                  type={contactMethod === 'wa' ? 'tel' : 'email'}
                  value={contactValue}
                  onChange={(e) => setContactValue(e.target.value)}
                  placeholder={contactMethod === 'wa' ? '+225 01 23 45 67 89' : 'marie@exemple.com'}
                  className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 font-mono"
                  required
                />
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

// Modal de Revente sur la Marketplace Secondaire
const ResellModal: React.FC<{ ticket: any; onClose: () => void; onSuccess: () => void }> = ({ ticket, onClose, onSuccess }) => {
  const [step, setStep] = useState<'info' | 'processing' | 'success'>('info');
  // Default asking price defaults to the fallback price if none is encoded (demo)
  const defaultPrice = ticket.price || 5000;
  const [askingPrice, setAskingPrice] = useState<number>(defaultPrice);

  const handleResale = async (e: React.FormEvent) => {
    e.preventDefault();

    // Protection anti-marché noir (Max 50% markup)
    if (askingPrice > defaultPrice * 1.5) {
      alert("Plafonnement de revente : Le prix de revente ne peut excéder de 50% la valeur d'origine pour éviter le marché noir.");
      return;
    }

    setStep('processing');

    try {
      // 1. Invalider l'ancien billet localement via le wallet sécurisé
      await removeSecureTicket(ticket.id || ticket.qrCode);

      // 2. Add to "Global" resale list (Marketplace simulation)
      const currentListings = JSON.parse(localStorage.getItem('afriTix_resale_listings') || '[]');
      currentListings.push({
        id: `resale-${Date.now()}`,
        ticket: ticket,
        askingPrice: Number(askingPrice),
        originalPrice: defaultPrice,
        dateListed: new Date().toISOString(),
        sellerId: 'current-user-uuid' // Simulé
      });
      localStorage.setItem('afriTix_resale_listings', JSON.stringify(currentListings));

      // Simulate network request
      setTimeout(() => {
        setStep('success');
      }, 1500);

    } catch (err) {
      console.error(err);
      alert("Erreur système durant la mise en vente.");
      setStep('info');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#1e293b] w-full max-w-md rounded-2xl border border-white/10 shadow-2xl overflow-hidden relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white z-10"><X size={20} /></button>

        {step === 'info' && (
          <div className="p-6">
            <h3 className="text-xl font-bold text-white mb-2">Revendre mon billet</h3>
            <p className="text-sm text-slate-400 mb-6 bg-orange-500/10 border border-orange-500/20 p-3 rounded-lg flex items-start gap-2">
              <Banknote className="text-orange-500 shrink-0 mt-0.5" size={16} />
              Votre billet sera retiré de votre portefeuille et publié dans la Bourse d'Échange. Vous récupèrerez les fonds (Cash ou Mobile Money) une fois le billet acheté.
            </p>

            <form onSubmit={handleResale} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Prix de Revente Souhaité (FCFA)
                </label>
                <input
                  type="number"
                  min="0"
                  max={defaultPrice * 1.5}
                  value={askingPrice}
                  onChange={(e) => setAskingPrice(Number(e.target.value))}
                  className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 font-bold text-lg"
                  required
                />
                <p className="text-xs text-slate-500 mt-2">
                  Prix d'origine : {defaultPrice} FCFA. Max autorisé : {defaultPrice * 1.5} FCFA.
                </p>
              </div>

              <button
                type="submit"
                className="w-full py-4 mt-6 bg-gradient-to-r from-orange-600 to-amber-500 text-white rounded-xl font-bold shadow-[0_0_20px_rgba(249,115,22,0.4)] transition-transform hover:scale-105"
              >
                Mettre en vente
              </button>
            </form>
          </div>
        )}

        {step === 'processing' && (
          <div className="p-12 text-center flex flex-col items-center justify-center min-h-[350px]">
            <RefreshCw size={48} className="text-orange-500 animate-spin mb-6" />
            <h3 className="text-xl font-bold text-white mb-2">Signature & Publication...</h3>
            <p className="text-slate-400 text-sm">Transfert sécurisé du billet vers la Bourse d'Échange.</p>
          </div>
        )}

        {step === 'success' && (
          <div className="p-12 text-center flex flex-col items-center justify-center min-h-[350px]">
            <div className="w-20 h-20 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mb-6 animate-in zoom-in duration-300">
              <ShieldCheck size={40} />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">En ligne !</h3>
            <p className="text-slate-400 text-sm mb-6">Le billet fait désormais partie de la Marketplace Secondaire. Vous serez averti de la vente.</p>
            <button
              onClick={onSuccess}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-colors"
            >
              Retour
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const AffiliateView = ({ user }: any) => {
  const [links, setLinks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');

  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    // Fetch user's affiliate links
    if (user?.email) {
      // Pour une vraie app, on utiliserait le user.id Supabase.
      // Ici l'utilisateur simulé sera "random user" ou le user_id de la db.
      const { data: linksData } = await supabase.from('affiliate_links').select('*, events(title, slug)').order('created_at', { ascending: false });
      if (linksData) setLinks(linksData);
    }

    // Fetch all active events to allow generating link for them
    const { data: eventsData } = await supabase.from('events').select('id, title').eq('status', 'published');
    if (eventsData) {
      setEvents(eventsData);
      if (eventsData.length > 0) setSelectedEventId(eventsData[0].id);
    }

    setLoading(false);
  };

  const handleGenerateLink = async () => {
    if (!selectedEventId || !user) return;

    // Check real Supabase UID if needed, but for demo we might need to fetch a valid profile ID:
    const { data: defaultUser } = await supabase.from('profiles').select('id').limit(1).single();
    if (!defaultUser) { alert("Erreur d'authentification simulée"); return; }

    const uniqueCode = 'AMB' + Math.random().toString(36).substring(2, 8).toUpperCase();

    const { error } = await supabase.from('affiliate_links').insert([{
      user_id: defaultUser.id,
      event_id: selectedEventId,
      unique_code: uniqueCode
    }]);

    if (!error) {
      fetchData();
    } else {
      console.error(error);
      alert("Erreur lors de la création du lien.");
    }
  };

  if (loading) return <div className="py-20 text-center"><RefreshCw className="animate-spin text-fuchsia-500 mx-auto" /></div>;

  return (
    <div className="animate-in fade-in duration-500 space-y-6">

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-fuchsia-900/60 to-purple-900/60 border border-fuchsia-500/20 p-8 rounded-3xl backdrop-blur-xl shadow-2xl relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-fuchsia-500/20 blur-3xl rounded-full pointer-events-none" />
        <div className="relative z-10 md:flex md:items-center md:justify-between">
          <div className="max-w-xl">
            <h3 className="text-2xl font-extrabold text-white flex items-center gap-3 mb-2">
              <Share2 className="text-fuchsia-400" size={28} /> Programme Ambassadeur
            </h3>
            <p className="text-slate-300 text-sm">
              Gagnez des commissions (Mobile Money ou gratuités) simplement en invitant vos amis aux événements ! Générez un lien unique, partagez-le sur WhatsApp, et soyez rémunéré pour chaque billet vendu grâce à vous.
            </p>
          </div>
          <div className="mt-6 md:mt-0 bg-slate-900/50 p-4 rounded-2xl border border-white/10 flex flex-col items-center justify-center min-w-[200px]">
            <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Total Gagné</span>
            <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-purple-400">
              {links.reduce((sum, l) => sum + Number(l.commission_earned), 0)} FCFA
            </span>
          </div>
        </div>
      </div>

      {/* Generation tool */}
      <div className="bg-[#1e293b] p-6 rounded-3xl border border-white/10 shadow-xl flex flex-col md:flex-row gap-4 items-end">
        <div className="flex-1 w-full">
          <label className="block text-sm font-medium text-slate-300 mb-2">Choisissez l'événement à promouvoir</label>
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-4 py-3 text-white appearance-none outline-none focus:ring-2 focus:ring-fuchsia-500"
          >
            {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
          </select>
        </div>
        <button
          onClick={handleGenerateLink}
          className="w-full md:w-auto px-6 py-3 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg transition-colors whitespace-nowrap"
        >
          <Plus size={18} /> Générer mon lien
        </button>
      </div>

      {/* Limits list */}
      <div className="space-y-4">
        <h4 className="text-lg font-bold text-white mb-2">Mes Liens d'Affiliation</h4>
        {links.length === 0 ? (
          <p className="text-slate-500 italic bg-slate-900/30 p-6 rounded-2xl border border-white/5 text-center">Vous n'avez généré aucun lien d'affiliation pour le moment.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {links.map((link) => {
              const shareUrl = `${window.location.origin}/event/${link.events?.slug || link.event_id}?ref=${link.unique_code}`;
              return (
                <div key={link.id} className="bg-slate-800/80 p-5 rounded-2xl border border-white/10 flex flex-col justify-between">
                  <div>
                    <span className="bg-fuchsia-500/20 text-fuchsia-400 px-2 py-1 rounded text-xs font-bold uppercase tracking-wider">
                      {link.events?.title || 'Événement inconnu'}
                    </span>
                    <div className="mt-4 flex items-center justify-between bg-slate-900/80 p-3 rounded-xl border border-slate-700">
                      <span className="font-mono text-slate-300 text-sm truncate mr-4">
                        {shareUrl}
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(shareUrl);
                          alert("Lien copié dans le presse-papier !");
                        }}
                        className="text-fuchsia-400 hover:text-fuchsia-300 shrink-0"
                        title="Copier le lien"
                      >
                        <Copy size={18} />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-6">
                    <div className="bg-slate-900/50 p-2 rounded-xl text-center border border-white/5">
                      <p className="text-[10px] text-slate-400 uppercase font-bold">Clics</p>
                      <p className="text-white font-bold">{link.clicks}</p>
                    </div>
                    <div className="bg-emerald-900/30 p-2 rounded-xl text-center border border-emerald-500/20">
                      <p className="text-[10px] text-emerald-400 uppercase font-bold">Ventes</p>
                      <p className="text-emerald-400 font-bold">{link.sales}</p>
                    </div>
                    <div className="bg-fuchsia-900/30 p-2 rounded-xl text-center border border-fuchsia-500/20">
                      <p className="text-[10px] text-fuchsia-400 uppercase font-bold">Gains (FCFA)</p>
                      <p className="text-fuchsia-400 font-bold">{link.commission_earned}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};

// Modal de Récupération de Billets (Multi-appareil)
const RecoveryModal: React.FC<{ onClose: () => void; onSuccess: () => void }> = ({ onClose, onSuccess }) => {
  const [step, setStep] = useState<'input' | 'searching' | 'results'>('input');
  const [contactValue, setContactValue] = useState('');
  const [foundCount, setFoundCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactValue) return;

    setStep('searching');
    setError(null);

    try {
      // 1. Rechercher les billets en base de données
      const { data, error: fetchError } = await supabase
        .from('tickets')
        .select(`
          *,
          events (
            title,
            date,
            location,
            city,
            profiles:organizer_id (
              name,
              avatar
            )
          )
        `)
        .eq('guest_email', contactValue.trim())
        .eq('status', 'valid');

      if (fetchError) throw fetchError;

      if (!data || data.length === 0) {
        setFoundCount(0);
        setStep('results');
        return;
      }

      // 2. Importer chaque billet localement
      let imported = 0;
      const currentTickets = await getOfflineTickets();
      const currentIds = new Set(currentTickets.map(t => t.id));

      for (const t of data) {
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

      setFoundCount(data.length);
      setStep('results');
    } catch (err: any) {
      console.error("Recovery Error:", err);
      setError("Une erreur est survenue lors de la recherche.");
      setStep('input');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="bg-[#0f172a] w-full max-w-md rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden relative">
        <button onClick={onClose} className="absolute top-6 right-6 text-slate-400 hover:text-white z-10 p-2 hover:bg-white/5 rounded-full">
          <X size={24} />
        </button>

        {step === 'input' && (
          <div className="p-8 pt-12 text-center">
            <div className="w-20 h-20 bg-orange-500/20 text-orange-500 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Search size={40} />
            </div>
            <h3 className="text-2xl font-black text-white mb-3">Récupérer mes Billets</h3>
            <p className="text-slate-400 text-sm mb-8">
              Saisissez l'email ou le numéro WhatsApp utilisé lors de votre achat.
            </p>

            <form onSubmit={handleRecover} className="space-y-4">
              <input
                type="text"
                value={contactValue}
                onChange={(e) => setContactValue(e.target.value)}
                placeholder="Email ou Numéro (+225...)"
                className="w-full bg-slate-900/60 border border-slate-800 rounded-2xl px-6 py-4 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition-all text-center font-bold"
                required
              />
              {error && <p className="text-rose-500 text-xs font-bold">{error}</p>}
              <button type="submit" className="w-full py-5 bg-gradient-to-r from-orange-600 to-amber-500 text-white rounded-2xl font-black shadow-lg">
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
