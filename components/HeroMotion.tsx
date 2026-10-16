import React, { useState } from 'react';
import { CheckCircle2, MousePointerClick } from 'lucide-react';

// Motion design de l'accueil : la promesse « réservé en quelques clics, billet sur
// WhatsApp » racontée en images. Pur CSS (aucune librairie, ~quelques Ko), mouvements
// doux, et image fixe si le système demande de réduire les animations.

const STYLES = `
@keyframes hmSceneA { 0%, 24% { opacity: 1; transform: none; } 29%, 100% { opacity: 0; transform: translateY(-8px); } }
@keyframes hmSceneB { 0%, 25% { opacity: 0; transform: translateY(8px); } 30%, 49% { opacity: 1; transform: none; } 54%, 100% { opacity: 0; transform: translateY(-8px); } }
@keyframes hmSceneC { 0%, 50% { opacity: 0; transform: translateY(8px); } 55%, 94% { opacity: 1; transform: none; } 99%, 100% { opacity: 0; } }
@keyframes hmPress { 0%, 12% { transform: scale(1); } 16% { transform: scale(0.94); } 20%, 100% { transform: scale(1); } }
@keyframes hmPick { 0%, 39% { box-shadow: none; } 42%, 100% { box-shadow: 0 0 0 3px #38bdf8; } }
@keyframes hmLogo0 { 0%, 27% { opacity: 0; transform: translateY(6px) scale(0.8); } 30% { opacity: 1; transform: scale(1.08); } 32%, 100% { opacity: 1; transform: none; } }
@keyframes hmLogo1 { 0%, 30% { opacity: 0; transform: translateY(6px) scale(0.8); } 33% { opacity: 1; transform: scale(1.08); } 35%, 100% { opacity: 1; transform: none; } }
@keyframes hmLogo2 { 0%, 33% { opacity: 0; transform: translateY(6px) scale(0.8); } 36% { opacity: 1; transform: scale(1.08); } 38%, 100% { opacity: 1; transform: none; } }
@keyframes hmLogo3 { 0%, 36% { opacity: 0; transform: translateY(6px) scale(0.8); } 39% { opacity: 1; transform: scale(1.08); } 41%, 100% { opacity: 1; transform: none; } }
@keyframes hmCheck { 0%, 44% { opacity: 0; transform: scale(0.6); } 47%, 100% { opacity: 1; transform: scale(1); } }
@keyframes hmBubble { 0%, 57% { opacity: 0; transform: translateY(10px) scale(0.96); } 61%, 100% { opacity: 1; transform: none; } }
@keyframes hmQr { 0%, 64% { opacity: 0; } 70%, 100% { opacity: 1; } }
.hm-scene { position: absolute; inset: 0; opacity: 0; animation-duration: 9s; animation-iteration-count: infinite; animation-timing-function: ease-in-out; }
.hm-a { animation-name: hmSceneA; }
.hm-b { animation-name: hmSceneB; }
.hm-c { animation-name: hmSceneC; }
.hm-press { animation: hmPress 9s ease-in-out infinite; }
.hm-pick { animation: hmPick 9s ease-in-out infinite; }
.hm-logo-0 { animation: hmLogo0 9s ease-out infinite; }
.hm-logo-1 { animation: hmLogo1 9s ease-out infinite; }
.hm-logo-2 { animation: hmLogo2 9s ease-out infinite; }
.hm-logo-3 { animation: hmLogo3 9s ease-out infinite; }
.hm-check { animation: hmCheck 9s ease-in-out infinite; }
.hm-bubble { animation: hmBubble 9s ease-in-out infinite; }
.hm-qr { animation: hmQr 9s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .hm-scene, .hm-press, .hm-pick, .hm-check, .hm-bubble, .hm-qr, .hm-logo-0, .hm-logo-1, .hm-logo-2, .hm-logo-3 { animation: none !important; }
  .hm-scene { opacity: 0; }
  .hm-c, .hm-bubble, .hm-qr { opacity: 1 !important; transform: none !important; }
}
`;

/** Vrai QR code (public/hero-qr.svg, généré avec `qrcode`) : scanné, il ouvre babipass.com. */
const QrMark: React.FC = () => (
  <img src="/hero-qr.svg" alt="" width={56} height={56} className="w-14 h-14 rounded-md bg-white" />
);

// Logos officiels (ronds) dans public/logos/. Si un fichier manque, la pastille
// (point de couleur + nom) s'affiche : jamais d'image cassée.
const NETWORKS = [
  { key: 'wave', name: 'Wave', src: '/logos/wave.png', dot: 'bg-sky-400' },
  { key: 'orange', name: 'Orange', src: '/logos/orange-money.png', dot: 'bg-orange-500' },
  { key: 'mtn', name: 'MTN', src: '/logos/mtn-momo.png', dot: 'bg-yellow-400' },
  { key: 'moov', name: 'Moov', src: '/logos/moov-money.png', dot: 'bg-blue-600' },
];

const NetworkLogo: React.FC<{ network: typeof NETWORKS[number]; index: number; compact?: boolean }> = ({ network, index, compact }) => {
  const [failed, setFailed] = useState(false);
  return (
    <span className={`hm-logo-${index} block`}>
      <span className={`${network.key === 'wave' ? 'hm-pick ' : ''}flex items-center justify-center gap-1 rounded-lg ${compact ? 'h-10' : 'h-12'} bg-slate-800 ${failed ? 'text-white font-bold ' + (compact ? 'text-[10px]' : 'text-[11px]') : 'p-0.5'}`}>
        {failed ? (
          <><i className={`${compact ? 'w-2 h-2' : 'w-2.5 h-2.5'} rounded-full ${network.dot}`} />{network.name}</>
        ) : (
          <img src={network.src} alt={network.name} onError={() => setFailed(true)} className="h-full aspect-square rounded-full object-contain" />
        )}
      </span>
    </span>
  );
};

/** Ordinateur : téléphone animé (choisir → payer → billet sur WhatsApp). */
export const HeroPhoneDemo: React.FC = () => (
  <div className="relative w-[230px] h-[340px] mx-auto select-none" aria-hidden>
    <style>{STYLES}</style>
    <div className="absolute -inset-10 bg-orange-500/10 blur-3xl rounded-full pointer-events-none" />
    <div className="relative w-full h-full rounded-[2.2rem] border-[6px] border-slate-700 bg-slate-950 shadow-2xl overflow-hidden">
      <div className="absolute top-2 left-1/2 -translate-x-1/2 w-16 h-4 rounded-full bg-slate-800 z-10" />

      {/* 1. Choisir l'événement */}
      <div className="hm-scene hm-a p-4 pt-9 flex flex-col">
        <div className="rounded-2xl h-36 bg-gradient-to-br from-orange-500 via-rose-500 to-purple-600 p-3 flex flex-col justify-between">
          <span className="self-start text-[9px] font-black uppercase tracking-widest bg-black/30 text-white px-2 py-0.5 rounded">Concert</span>
          <span className="text-white font-black text-base leading-tight">Le concert<br />de l'année</span>
        </div>
        <p className="text-slate-300 text-[11px] mt-3">Sam. 30 nov. · Abidjan</p>
        <p className="text-white font-black text-sm">Dès 5 000 FCFA</p>
        <div className="hm-press mt-auto flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-orange-600 text-white text-xs font-black">
          <MousePointerClick size={14} /> Réserver
        </div>
      </div>

      {/* 2. Payer en Mobile Money */}
      <div className="hm-scene hm-b p-4 pt-9 flex flex-col">
        <p className="text-white font-black text-sm">Paiement</p>
        <p className="text-slate-400 text-[11px] mb-3">Total : 5 000 FCFA</p>
        <div className="grid grid-cols-2 gap-2">
          {NETWORKS.map((n, i) => <NetworkLogo key={n.key} network={n} index={i} />)}
        </div>
        <div className="hm-check mt-auto flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-black">
          <CheckCircle2 size={14} /> Paiement vérifié
        </div>
      </div>

      {/* 3. Billet reçu sur WhatsApp */}
      <div className="hm-scene hm-c flex flex-col">
        <div className="pt-8 pb-2 px-3 bg-[#075E54] flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center text-white text-[10px] font-black">B</span>
          <span className="text-white text-xs font-bold">Babipass</span>
        </div>
        <div className="flex-1 p-3 bg-[#0b141a]">
          <div className="hm-bubble max-w-[85%] rounded-xl rounded-tl-sm bg-[#202c33] p-2.5">
            <p className="text-white text-[11px] font-bold">🎟️ Votre billet est arrivé !</p>
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-slate-900 p-2">
              <div className="hm-qr"><QrMark /></div>
              <div className="text-[10px] leading-tight text-slate-300">
                <p className="text-white font-bold">Le concert de l'année</p>
                <p>1 billet · Standard</p>
                <p className="text-emerald-400 font-bold mt-1">✓ Valide</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

/** Mobile : carte paysage compacte (~140 px), mêmes scènes que le téléphone. */
export const HeroCardDemo: React.FC<{ ticketsIssued: number }> = ({ ticketsIssued }) => (
  <div className="relative h-[140px] rounded-2xl border border-white/10 bg-slate-900/80 overflow-hidden select-none" aria-hidden>
    <style>{STYLES}</style>
    {ticketsIssued >= 1000 && (
      <span className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded-full bg-black/50 border border-white/10 text-[10px] font-bold text-emerald-300">
        ✓ +{new Intl.NumberFormat('fr-FR').format(Math.floor(ticketsIssued / 1000) * 1000)} billets émis
      </span>
    )}

    {/* 1. Choisir l'événement */}
    <div className="hm-scene hm-a p-3 flex gap-3">
      <div className="w-[88px] shrink-0 rounded-xl bg-gradient-to-br from-orange-500 via-rose-500 to-purple-600 p-2 flex flex-col justify-between">
        <span className="self-start text-[8px] font-black uppercase tracking-widest bg-black/30 text-white px-1.5 py-0.5 rounded">Concert</span>
        <span className="text-white font-black text-[11px] leading-tight">Le concert de l'année</span>
      </div>
      <div className="flex-1 min-w-0 flex flex-col pt-4">
        <p className="text-slate-300 text-[11px]">Sam. 30 nov. · Abidjan</p>
        <p className="text-white font-black text-sm">Dès 5 000 FCFA</p>
        <div className="hm-press mt-auto flex items-center justify-center gap-1.5 py-2 rounded-xl bg-orange-600 text-white text-xs font-black">
          <MousePointerClick size={14} /> Réserver
        </div>
      </div>
    </div>

    {/* 2. Payer en Mobile Money */}
    <div className="hm-scene hm-b p-3 flex flex-col">
      <p className="text-white font-black text-sm">Paiement <span className="text-slate-400 font-semibold text-[11px]">· 5 000 FCFA</span></p>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {NETWORKS.map((n, i) => <NetworkLogo key={n.key} network={n} index={i} compact />)}
      </div>
      <div className="hm-check mt-auto flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-black">
        <CheckCircle2 size={14} /> Paiement vérifié
      </div>
    </div>

    {/* 3. Billet reçu sur WhatsApp */}
    <div className="hm-scene hm-c flex flex-col">
      <div className="py-1.5 px-3 bg-[#075E54] flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center text-white text-[9px] font-black">B</span>
        <span className="text-white text-xs font-bold">Babipass</span>
      </div>
      <div className="flex-1 px-3 py-2 bg-[#0b141a]">
        <div className="hm-bubble inline-flex items-center gap-2.5 rounded-xl rounded-tl-sm bg-[#202c33] p-2">
          <div className="hm-qr"><QrMark /></div>
          <div className="text-[10px] leading-tight text-slate-300">
            <p className="text-white text-[11px] font-bold">🎟️ Votre billet est arrivé !</p>
            <p className="mt-0.5">Le concert de l'année · 1 billet</p>
            <p className="text-emerald-400 font-bold mt-1">✓ Valide</p>
          </div>
        </div>
      </div>
    </div>
  </div>
);
