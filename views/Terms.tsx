import React from 'react';
import { Scale } from 'lucide-react';

export const Terms = () => {
  return (
    <div className="max-w-4xl mx-auto py-12 px-4 animate-in fade-in">
      <div className="flex items-center gap-4 mb-10 pb-6 border-b border-white/10">
        <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-xl">
          <Scale size={28} />
        </div>
        <div>
          <h1 className="text-3xl font-black text-white">Nos Engagements Mutuels (CGU / CGV)</h1>
          <p className="text-slate-400 mt-1">La Chefferie - Règles du jeu sur Babipass</p>
        </div>
      </div>

      <div className="prose prose-invert prose-emerald max-w-none text-slate-300 space-y-8">
        <section>
          <h2 className="text-xl font-bold text-white mb-4">1. Le Rôle de Babipass</h2>
          <p>
            Babipass agit en tant qu'intermédiaire technologique de billetterie entre les Organisateurs d'événements et les Acheteurs (les festivaliers, invités). 
            Nous fournissons l'infrastructure pour la vente, la collecte de fonds, et le scan des billets. Nous ne sommes pas les organisateurs physiques des événements publiés, sauf mention expresse.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-white mb-4">2. Pour les Acheteurs : Billetterie et Remboursements</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>Un billet acheté est définitif. Tout billet falsifié, dupliqué ou acheté en marché gris sera refusé au scan, et Babipass ne pourra en être tenu responsable.</li>
            <li>En cas d'annulation totale d'un événement par l'organisateur, Babipass met tout en œuvre (en gérant directement les fonds ou via l'organisateur) pour garantir la restitution intégrale du prix du billet (hors frais de traitement transactionnels).</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-white mb-4">3. Pour les Organisateurs : Vos obligations</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>Vous vous engagez à fournir des événements réels, légaux, et à respecter les normes de sécurité en vigueur dans les lieux d'accueil.</li>
            <li>Les commissions de la plateforme Babipass sont transparentes et déduites en temps réel lors du calcul des valeurs de versements (Avances sur recettes ou soldes finaux).</li>
            <li>Tout abus du système de demande d'avances sur recette (fausses déclarations, faux événements) entrainera une suspension de compte et des poursuites légales.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-white mb-4">4. Le rôle des Ambassadeurs</h2>
          <p>
            Les ambassadeurs génèrent des liens de recommandation et sont rémunérés aux résultats.
            L'utilisation de techniques s'apparentant à du spam pour partager ces liens est proscrite et peut engendrer la clôture du compte ambassadeur, 
            avec perte des bénéfices générés illégitimement.
          </p>
        </section>

      </div>
    </div>
  );
};
