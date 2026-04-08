import React from 'react';
import { Lock } from 'lucide-react';

export const Privacy = () => {
  return (
    <div className="max-w-4xl mx-auto py-12 px-4 animate-in fade-in">
      <div className="flex items-center gap-4 mb-10 pb-6 border-b border-white/10">
        <div className="p-3 bg-blue-500/20 text-blue-400 rounded-xl">
          <Lock size={28} />
        </div>
        <div>
          <h1 className="text-3xl font-black text-white">Sécurité & Données</h1>
          <p className="text-slate-400 mt-1">Dernière mise à jour : {new Date().toLocaleDateString()}</p>
        </div>
      </div>

      <div className="prose prose-invert prose-orange max-w-none text-slate-300 space-y-8">
        <section>
          <h2 className="text-xl font-bold text-white mb-4">1. Ce que nous collectons</h2>
          <p>
            Lorsque vous utilisez Babipass, nous recueillons les informations strictement nécessaires à la bonne exécution de nos services de billetterie et de reversement : 
            votre adresse email, nom, numéro de téléphone (pour les paiements Mobile Money et réception de billets). 
            Pour les organisateurs, les coordonnées bancaires (RIB/IBAN) sont requises pour les virements manuels.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-white mb-4">2. Utilisation de vos données</h2>
          <p>
            Vos informations servent à établir vos billets, vous notifier des changements liés aux événements, et assurer 
            les transferts financiers de manière sécurisée. Nous ne revendons <strong>jamais</strong> vos informations personnelles à des courtiers en données ou autres entités tierces. Chez nous, vos données restent au village.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-white mb-4">3. Sécurisation des paiements</h2>
          <p>
            Nous ne stockons pas directement les empreintes de vos cartes bancaires ni vos codes PIN Mobile Money. 
            Toutes les transactions financières transitent par des agrégateurs sécurisés, certifiés et audités, répondant 
            aux normes PCI-DSS d'Afrique et du monde.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-white mb-4">4. Vos droits sur vos données</h2>
          <p>
            Vous avez le droit de consulter, rectifier ou demander l'effacement de vos informations personnelles.
            Contactez simplement notre support pour toute requête relative au RGPD ou aux lois locales de protection des données (ARTCI & consorts).
          </p>
        </section>
      </div>
    </div>
  );
};
