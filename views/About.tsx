import React from 'react';
import { Sparkles, Globe, Heart, ShieldCheck } from 'lucide-react';

export const About = () => {
  return (
    <div className="max-w-4xl mx-auto py-12 px-4 animate-in fade-in">
      <div className="text-center mb-16">
        <h1 className="text-4xl md:text-5xl font-black text-white mb-6">
          La billetterie qui parle <span className="bg-gradient-to-r from-orange-400 to-amber-500 bg-clip-text text-transparent">notre langue</span>
        </h1>
        <p className="text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed">
          Née de la volonté de simplifier et de sécuriser l'accès aux événements en Afrique, Babipass connecte la culture, la tech et les moyens de paiement locaux.
        </p>
      </div>

      <div className="space-y-16">
        
        {/* Section 1 */}
        <section className="bg-slate-800/50 rounded-3xl p-8 border border-white/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl"></div>
          <div className="relative z-10 flex flex-col md:flex-row gap-8 items-center">
            <div className="flex-1">
              <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center mb-4 text-orange-400">
                <Globe size={24} />
              </div>
              <h2 className="text-2xl font-bold text-white mb-4">Ancrés dans nos réalités</h2>
              <p className="text-slate-300 leading-relaxed">
                Pendant longtemps, organiser ou assister à un événement majeur sur le continent rimait avec files d'attente interminables, billets papiers falsifiés et complexité de paiement. Babipass s'intègre nativement avec nos moyens de paiements quotidiens (Mobile Money, cartes locales) pour fluidifier la fête.
              </p>
            </div>
          </div>
        </section>

        {/* Section 2 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-slate-800/50 rounded-3xl p-8 border border-white/5 flex flex-col items-start hover:border-indigo-500/30 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center mb-6 text-indigo-400">
              <ShieldCheck size={24} />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Transparence & Sécurité</h3>
            <p className="text-slate-400 leading-relaxed">
              Nous rémunérons justement les organisateurs en temps réel, garantissant que chaque billet acheté aide directement ceux qui font vivre l'événementiel, tout en protégeant les acheteurs.
            </p>
          </div>

          <div className="bg-slate-800/50 rounded-3xl p-8 border border-white/5 flex flex-col items-start hover:border-pink-500/30 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-pink-500/20 flex items-center justify-center mb-6 text-pink-400">
              <Heart size={24} />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Une Communauté Vibrante</h3>
            <p className="text-slate-400 leading-relaxed">
              Plus qu'un ticket, c'est l'accès à une expérience. Nous impliquons nos ambassadeurs locaux et créons une chaîne de valeur solidaire autour du show business.
            </p>
          </div>
        </div>

        {/* Section Conclusion */}
        <section className="text-center bg-gradient-to-br from-orange-500/20 to-indigo-500/20 rounded-3xl p-12 border border-white/10">
          <Sparkles className="mx-auto text-amber-400 mb-6" size={40} />
          <h2 className="text-2xl font-bold text-white mb-4">Prêt à rejoindre le mouvement ?</h2>
          <p className="text-slate-300 max-w-lg mx-auto mb-8">
            Que vous organisiez un petit meetup tech ou le plus grand festival de coupé-décalé de l'année, nous sommes avec vous.
          </p>
        </section>

      </div>
    </div>
  );
};
