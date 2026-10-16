import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wallet, Smartphone, ScanLine, Printer, Users, CalendarClock, HeartHandshake,
  BarChart3, Share2, Trophy, MessageCircle, ArrowRight, CheckCircle2,
} from 'lucide-react';
import { SEO } from '../components/SEO';
import { getPlatformSettings } from '../utils/platformSettings';
import { CatalogService } from '../services/CatalogService';

// Page « Devenir organisateur » : ce que la plateforme fait réellement, avec les
// taux en vigueur lus en direct (réglages admin) — aucun chiffre écrit en dur.

const SUPPORT_WA = 'https://wa.me/2250799709309?text=' +
  encodeURIComponent("Bonjour Babipass, je suis organisateur et je souhaite vendre mes billets sur Babipass.");

/** Taux enregistré « 8 » ou « 0.08 » → pourcentage. */
const asPercent = (value: any, fallback: number) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n > 1 ? n : n * 100;
};
const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n));
const pct = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1).replace('.', ',')} %`;

export const OrganizersLanding: React.FC = () => {
  const navigate = useNavigate();
  const [rates, setRates] = useState({ ticket: 8, physical: 8, fundraising: 5, advance: 30 });
  const [ticketsIssued, setTicketsIssued] = useState(0);
  const [price, setPrice] = useState(5000);
  const [quantity, setQuantity] = useState(500);

  useEffect(() => {
    getPlatformSettings(['default_commission_rate', 'default_physical_commission_rate', 'default_fundraising_commission_rate', 'default_advance_rate'])
      .then(s => setRates({
        ticket: asPercent(s.default_commission_rate, 8),
        physical: asPercent(s.default_physical_commission_rate, asPercent(s.default_commission_rate, 8)),
        fundraising: asPercent(s.default_fundraising_commission_rate, 5),
        advance: asPercent(s.default_advance_rate, 30),
      }))
      .catch(() => { /* taux par défaut conservés */ });
    CatalogService.ticketsIssued().then(setTicketsIssued).catch(() => setTicketsIssued(0));
  }, []);

  const sim = useMemo(() => {
    const gross = Math.max(0, price) * Math.max(0, quantity);
    const commission = gross * rates.ticket / 100;
    const net = gross - commission;
    // Même calcul que la comptabilité (org_event_sales_view) : avance = ventes × taux.
    return { gross, commission, net, advance: gross * rates.advance / 100 };
  }, [price, quantity, rates]);

  const start = () => navigate('/organizer/login');

  const features = [
    { icon: Wallet, title: `Avance de trésorerie jusqu'à ${pct(rates.advance)}`, text: "Avant même l'événement, demandez une avance sur vos ventes pour payer artistes, salle et logistique (entreprise vérifiée)." },
    { icon: Smartphone, title: 'Mobile Money et carte', text: "Vos clients paient comme ils en ont l'habitude. Le paiement est vérifié par Babipass avant l'envoi de chaque billet." },
    { icon: CalendarClock, title: 'Paiement en 3 fois (Tontine)', text: "Vos acheteurs réservent maintenant et paient en trois fois : plus de billets vendus, plus tôt." },
    { icon: ScanLine, title: 'Contrôle à l\'entrée infalsifiable', text: "Vos agents scannent les QR codes depuis leur téléphone, même avec un réseau faible. Un billet ne passe qu'une seule fois." },
    { icon: Printer, title: 'Billets physiques', text: `Imprimez des billets QR pour la vente en points de vente (commission ${pct(rates.physical)}).` },
    { icon: Users, title: 'Programme ambassadeurs', text: "Vos ambassadeurs reçoivent un lien personnel et une commission sur leurs ventes. Ils vendent pour vous sur WhatsApp." },
    { icon: Share2, title: 'Partage WhatsApp qui donne envie', text: "Chaque lien partagé affiche l'affiche, la date, le lieu et le prix de votre événement." },
    { icon: BarChart3, title: 'Tableau de bord en temps réel', text: "Ventes, participants, carte de vos acheteurs par quartier, export vers Meta Ads et fichier clients." },
    { icon: HeartHandshake, title: 'Cagnottes', text: `Collectez des fonds pour une cause ou un projet (commission ${pct(rates.fundraising)}).` },
    { icon: Trophy, title: 'Tournois et sport', text: 'Gérez un tournoi complet : matchs, pass, billetterie par rencontre.' },
  ];

  return (
    <div className="pb-32">
      <SEO
        title="Vendre vos billets en ligne en Côte d'Ivoire | Babipass Organisateurs"
        description={`Billetterie pour organisateurs : Mobile Money, avance de trésorerie, contrôle à l'entrée, billets physiques. Commission de ${pct(rates.ticket)} sur les billets vendus.`}
        canonicalUrl="https://babipass.com/organisateurs"
      />

      {/* Promesse */}
      <section className="pt-10 md:pt-16 pb-12 text-center max-w-3xl mx-auto">
        <p className="text-xs font-bold uppercase tracking-widest text-orange-400 mb-3">Organisateurs</p>
        <h1 className="text-3xl md:text-5xl font-black text-white leading-tight">
          Remplissez votre salle. <span className="text-orange-400">On s'occupe de la billetterie.</span>
        </h1>
        <p className="text-slate-300 mt-5 text-base md:text-lg">
          Vente en ligne et en point de vente, paiement Mobile Money, contrôle à l'entrée et avance de trésorerie :
          tout ce qu'il faut pour un événement réussi, au même endroit.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
          <button onClick={start} className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 text-white font-bold">
            Créer mon événement <ArrowRight size={18} />
          </button>
          <a href={SUPPORT_WA} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl bg-[#25D366] text-white font-bold">
            <MessageCircle size={18} /> Parler à un conseiller
          </a>
        </div>
        {ticketsIssued >= 1000 && (
          <p className="text-slate-400 text-sm mt-6">
            Déjà <strong className="text-white">+{fmt(Math.floor(ticketsIssued / 1000) * 1000)} billets</strong> émis sur Babipass.
          </p>
        )}
      </section>

      {/* Tarif clair */}
      <section className="max-w-4xl mx-auto grid md:grid-cols-2 gap-6 items-stretch">
        <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-7">
          <h2 className="text-xl font-black text-white mb-4">Un tarif simple</h2>
          <p className="text-5xl font-black text-orange-400">{pct(rates.ticket)}</p>
          <p className="text-slate-300 mt-2">par billet vendu en ligne. Rien à payer si vous ne vendez pas.</p>
          <ul className="mt-6 space-y-2 text-sm text-slate-300">
            {['Création de l\'événement et page de vente', 'Billets envoyés sur WhatsApp et par e-mail', 'Application de contrôle pour vos agents', 'Tableau de bord et exports'].map(item => (
              <li key={item} className="flex items-start gap-2"><CheckCircle2 size={16} className="text-emerald-400 mt-0.5 shrink-0" />{item}</li>
            ))}
          </ul>
        </div>

        {/* Simulateur */}
        <div className="rounded-3xl border border-orange-500/30 bg-orange-500/5 p-7">
          <h2 className="text-xl font-black text-white mb-4">Combien vous recevez</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm text-slate-300">
              Prix du billet (FCFA)
              <input type="number" min={0} inputMode="numeric" value={price} onChange={e => setPrice(Number(e.target.value) || 0)}
                className="mt-1 w-full bg-slate-900/70 border border-slate-700 rounded-xl px-3 py-2.5 text-white font-mono focus:outline-none focus:border-orange-500" />
            </label>
            <label className="text-sm text-slate-300">
              Billets vendus
              <input type="number" min={0} inputMode="numeric" value={quantity} onChange={e => setQuantity(Number(e.target.value) || 0)}
                className="mt-1 w-full bg-slate-900/70 border border-slate-700 rounded-xl px-3 py-2.5 text-white font-mono focus:outline-none focus:border-orange-500" />
            </label>
          </div>
          <dl className="mt-5 space-y-2 text-sm">
            <div className="flex justify-between text-slate-300"><dt>Ventes</dt><dd className="font-mono">{fmt(sim.gross)} FCFA</dd></div>
            <div className="flex justify-between text-slate-400"><dt>Commission Babipass ({pct(rates.ticket)})</dt><dd className="font-mono">− {fmt(sim.commission)} FCFA</dd></div>
            <div className="flex justify-between text-white text-lg font-black border-t border-white/10 pt-3"><dt>Vous recevez</dt><dd className="font-mono text-emerald-400">{fmt(sim.net)} FCFA</dd></div>
            <div className="flex justify-between text-amber-300"><dt>Avance possible avant l'événement</dt><dd className="font-mono">jusqu'à {fmt(sim.advance)} FCFA</dd></div>
          </dl>
          <p className="text-[11px] text-slate-500 mt-4">Estimation hors commissions d'ambassadeurs éventuelles. Taux en vigueur appliqués automatiquement.</p>
        </div>
      </section>

      {/* Fonctionnalités */}
      <section className="mt-16">
        <h2 className="text-2xl md:text-3xl font-black text-white text-center mb-8">Tout pour vendre plus, et sans stress le jour J</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border border-white/10 bg-slate-900/50 p-5">
              <Icon className="text-orange-400 mb-3" size={22} />
              <h3 className="text-white font-bold mb-1">{title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Comment ça marche */}
      <section className="mt-16 max-w-4xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-black text-white text-center mb-8">Comment ça marche</h2>
        <ol className="grid md:grid-cols-3 gap-4">
          {[
            ['Créez votre compte', 'Avec votre e-mail ou votre numéro. Ajoutez vos documents d\'entreprise pour débloquer les avances.'],
            ['Publiez votre événement', 'Affiche, catégories de billets, prix, lieu : votre page de vente est prête à partager.'],
            ['Vendez et encaissez', 'Suivez vos ventes en direct, contrôlez les entrées, demandez vos versements depuis votre espace.'],
          ].map(([title, text], i) => (
            <li key={title} className="rounded-2xl border border-white/10 bg-slate-900/50 p-5">
              <span className="inline-flex w-8 h-8 rounded-full bg-orange-600 text-white font-black items-center justify-center mb-3">{i + 1}</span>
              <h3 className="text-white font-bold mb-1">{title}</h3>
              <p className="text-slate-400 text-sm">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Appel final */}
      <section className="mt-16 rounded-3xl border border-orange-500/30 bg-gradient-to-br from-orange-600/20 to-transparent p-8 md:p-12 text-center max-w-4xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-black text-white">Votre prochain événement mérite une salle pleine</h2>
        <p className="text-slate-300 mt-3">Créez votre événement maintenant, ou écrivez-nous : un conseiller vous accompagne pour la mise en vente.</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-7">
          <button onClick={start} className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl bg-white text-slate-900 font-bold">
            Créer mon événement <ArrowRight size={18} />
          </button>
          <a href={SUPPORT_WA} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl bg-[#25D366] text-white font-bold">
            <MessageCircle size={18} /> +225 07 99 70 93 09
          </a>
        </div>
      </section>
    </div>
  );
};
