import React, { useState } from 'react';
import { HelpCircle, ChevronDown, MessageCircle } from 'lucide-react';

const faqs = [
  {
    category: "Acheteurs & Participants",
    items: [
      {
        q: "Comment recevoir mon billet après paiement ?",
        a: "Dès que votre paiement (Mobile Money ou Carte) est validé, votre billet est généré instantanément. Il est disponible sur la page de confirmation, envoyé par email, et vous pouvez toujours y accéder via l'onglet 'Mes Billets' en utilisant l'adresse mail fournie."
      },
      {
        q: "Mon paiement Mobile Money a échoué, que faire ?",
        a: "Vérifiez que vous avez bien approuvé le retrait sur votre solde sans dépasser le temps imparti. Si le montant a été débité mais que vous n'avez pas de billet, contactez notre support technique immédiatement via WhatsApp avec votre numéro de transaction."
      },
      {
        q: "Puis-je revendre ou céder mon billet ?",
        a: "Babipass permet la vérification sécurisée. Les billets sont dotés de QR codes uniques. Évitez d'acheter des billets 'secondes mains' sous forme de captures d'écran, car le QR Code pourrait déjà avoir été scanné à l'entrée."
      }
    ]
  },
  {
    category: "Organisateurs",
    items: [
      {
        q: "Quand et comment puis-je recevoir l'argent de mes ventes ?",
        a: "Les fonds générés (hors commission Babipass) sont à vous. Vous pouvez demander une 'Avance sur recette' (en Mobile Money) directement depuis votre Dashboard avant l'événement, ou déclencher le versement du reliquat après la fin de celui-ci."
      },
      {
        q: "Comment fonctionne le scan à l'entrée de l'événement ?",
        a: "Pas besoin de matériel coûteux ! Votre staff peut utiliser l'application ou l'interface 'Scanner' de Babipass sur leurs propres smartphones pour valider les billets en un clin d'œil, même avec une connexion internet faible."
      }
    ]
  }
];

export const FAQ = () => {
  const [openIndex, setOpenIndex] = useState<string | null>(null);

  const toggle = (idx: string) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 animate-in fade-in">
      <div className="text-center mb-16">
        <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 flex items-center justify-center mx-auto mb-6 text-indigo-400">
          <MessageCircle size={32} />
        </div>
        <h1 className="text-4xl font-black text-white mb-4">Le Palabre</h1>
        <p className="text-slate-400">Toutes vos questions trouvent réponse ici. On s'assoit, on discute.</p>
      </div>

      <div className="space-y-12">
        {faqs.map((group, gIdx) => (
          <div key={gIdx}>
            <h2 className="text-xl font-bold text-orange-500 mb-6 flex items-center gap-2">
              <HelpCircle size={20} />
              {group.category}
            </h2>
            <div className="space-y-4">
              {group.items.map((faq, iIdx) => {
                const uniqueId = `${gIdx}-${iIdx}`;
                const isOpen = openIndex === uniqueId;
                return (
                  <div 
                    key={uniqueId} 
                    className={`bg-slate-800/40 border border-white/5 rounded-2xl transition-all overflow-hidden ${isOpen ? 'ring-1 ring-indigo-500' : 'hover:bg-slate-800/60'}`}
                  >
                    <button
                      className="w-full px-6 py-4 flex justify-between items-center text-left"
                      onClick={() => toggle(uniqueId)}
                    >
                      <span className="font-bold text-white pr-4">{faq.q}</span>
                      <ChevronDown size={20} className={`text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isOpen && (
                      <div className="px-6 pb-5">
                        <div className="w-full h-px bg-white/5 mb-4"></div>
                        <p className="text-slate-300 leading-relaxed text-sm">
                          {faq.a}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
