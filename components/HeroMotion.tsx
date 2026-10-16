import React, { useEffect, useState } from 'react';
import { Ticket, CheckCircle2, MessageCircle, MousePointerClick, Smartphone } from 'lucide-react';

// Motion design de l'accueil : la promesse « réservé en quelques clics, billet sur
// WhatsApp » racontée en images. Pur CSS (aucune librairie, ~quelques Ko), mouvements
// doux, et image fixe si le système demande de réduire les animations.

const STYLES = `
@keyframes hmSceneA { 0%, 24% { opacity: 1; transform: none; } 29%, 100% { opacity: 0; transform: translateY(-8px); } }
@keyframes hmSceneB { 0%, 25% { opacity: 0; transform: translateY(8px); } 30%, 49% { opacity: 1; transform: none; } 54%, 100% { opacity: 0; transform: translateY(-8px); } }
@keyframes hmSceneC { 0%, 50% { opacity: 0; transform: translateY(8px); } 55%, 94% { opacity: 1; transform: none; } 99%, 100% { opacity: 0; } }
@keyframes hmPress { 0%, 12% { transform: scale(1); } 16% { transform: scale(0.94); } 20%, 100% { transform: scale(1); } }
@keyframes hmPick { 0%, 33% { box-shadow: none; } 37%, 100% { box-shadow: 0 0 0 2px #38bdf8; } }
@keyframes hmCheck { 0%, 40% { opacity: 0; transform: scale(0.6); } 44%, 100% { opacity: 1; transform: scale(1); } }
@keyframes hmBubble { 0%, 57% { opacity: 0; transform: translateY(10px) scale(0.96); } 61%, 100% { opacity: 1; transform: none; } }
@keyframes hmQr { 0%, 64% { opacity: 0; } 70%, 100% { opacity: 1; } }
.hm-scene { position: absolute; inset: 0; opacity: 0; animation-duration: 9s; animation-iteration-count: infinite; animation-timing-function: ease-in-out; }
.hm-a { animation-name: hmSceneA; }
.hm-b { animation-name: hmSceneB; }
.hm-c { animation-name: hmSceneC; }
.hm-press { animation: hmPress 9s ease-in-out infinite; }
.hm-pick { animation: hmPick 9s ease-in-out infinite; }
.hm-check { animation: hmCheck 9s ease-in-out infinite; }
.hm-bubble { animation: hmBubble 9s ease-in-out infinite; }
.hm-qr { animation: hmQr 9s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .hm-scene, .hm-press, .hm-pick, .hm-check, .hm-bubble, .hm-qr { animation: none !important; }
  .hm-scene { opacity: 0; }
  .hm-c, .hm-bubble, .hm-qr { opacity: 1 !important; transform: none !important; }
}
`;

/** Petit QR code décoratif (motif fixe, pas un vrai code). */
const QrMark: React.FC = () => {
  const cells = '1110111100101101011111011010000101101111101110101'.split('');
  return (
    <div className="grid grid-cols-7 gap-[2px] w-14 h-14 p-1 bg-white rounded-md">
      {cells.map((c, i) => <span key={i} className={c === '1' ? 'bg-slate-900 rounded-[1px]' : ''} />)}
    </div>
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
          <span className="hm-pick flex items-center gap-1.5 p-2 rounded-lg bg-slate-800 text-white text-[11px] font-bold"><i className="w-2.5 h-2.5 rounded-full bg-sky-400" />Wave</span>
          <span className="flex items-center gap-1.5 p-2 rounded-lg bg-slate-800 text-white text-[11px] font-bold"><i className="w-2.5 h-2.5 rounded-full bg-orange-500" />Orange</span>
          <span className="flex items-center gap-1.5 p-2 rounded-lg bg-slate-800 text-white text-[11px] font-bold"><i className="w-2.5 h-2.5 rounded-full bg-yellow-400" />MTN</span>
          <span className="flex items-center gap-1.5 p-2 rounded-lg bg-slate-800 text-white text-[11px] font-bold"><i className="w-2.5 h-2.5 rounded-full bg-blue-600" />Moov</span>
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

/** Mobile : bandeau compact qui fait défiler les étapes (hauteur fixe, rien ne bouge autour). */
export const HeroStepsTicker: React.FC<{ ticketsIssued: number }> = ({ ticketsIssued }) => {
  const steps = [
    { icon: Ticket, text: 'Choisissez votre événement' },
    { icon: Smartphone, text: 'Payez avec Wave, Orange Money, MTN' },
    { icon: MessageCircle, text: 'Recevez votre billet sur WhatsApp ✓' },
    ...(ticketsIssued >= 1000
      ? [{ icon: CheckCircle2, text: `+${new Intl.NumberFormat('fr-FR').format(Math.floor(ticketsIssued / 1000) * 1000)} billets déjà émis` }]
      : []),
  ];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let reduce = false;
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* navigateur ancien */ }
    if (reduce) { setIndex(2); return; }
    const timer = setInterval(() => setIndex(i => (i + 1) % steps.length), 2600);
    return () => clearInterval(timer);
  }, [steps.length]);

  const step = steps[index % steps.length];
  const Icon = step.icon;
  return (
    <div className="h-14 flex items-center gap-3 px-4 rounded-2xl bg-slate-800/60 border border-white/10" role="status" aria-live="off">
      <span className="w-8 h-8 shrink-0 rounded-full bg-orange-500/15 text-orange-400 flex items-center justify-center">
        <Icon size={16} />
      </span>
      <p key={index} className="flex-1 text-sm font-semibold text-white truncate animate-in fade-in slide-in-from-bottom-2 duration-500">
        {step.text}
      </p>
      <span className="flex gap-1 shrink-0" aria-hidden>
        {steps.map((_, i) => <i key={i} className={`h-1.5 rounded-full transition-all ${i === index % steps.length ? 'w-4 bg-orange-400' : 'w-1.5 bg-slate-600'}`} />)}
      </span>
    </div>
  );
};
