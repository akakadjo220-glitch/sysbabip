import React, { useEffect, useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';
import { PAYMENT_ROUTING } from '../constants';
import { paymentOptionsFor, loadAvailablePayments, approximateLocation, type PaymentOption } from '../utils/paymentOptions';

// Choix du moyen de paiement, commun à tous les parcours (billets, dons,
// tranches, commissions). Ne montre que ce que le serveur déclare utilisable :
// activé dans l'admin ET configuré. Rien n'est écrit en dur dans les pages.

let visitorCountryPromise: Promise<string> | null = null;
function visitorCountry(): Promise<string> {
  if (!visitorCountryPromise) {
    visitorCountryPromise = approximateLocation().then(({ countryCode }) =>
      countryCode && PAYMENT_ROUTING[countryCode] ? countryCode : 'CI');
  }
  return visitorCountryPromise;
}

/** Moyens de paiement utilisables pour le pays donné (ou celui du visiteur). */
export function usePaymentOptions(countryCode?: string) {
  const [state, setState] = useState<{ options: PaymentOption[]; loading: boolean; countryCode: string }>(
    { options: [], loading: true, countryCode: countryCode || 'CI' }
  );
  useEffect(() => {
    let cancelled = false;
    Promise.all([countryCode ? Promise.resolve(countryCode) : visitorCountry(), loadAvailablePayments()])
      .then(([code, available]) => {
        if (cancelled) return;
        setState({
          options: paymentOptionsFor(code, available.providers, available.paystackMobileMoney),
          loading: false,
          countryCode: code,
        });
      });
    return () => { cancelled = true; };
  }, [countryCode]);
  return state;
}

/** Données à envoyer au serveur pour l'option choisie. */
export function paymentRequest(option: PaymentOption, phone: string) {
  return {
    provider: option.gateway,
    payment: option.kind === 'momo' ? { phone: phone.replace(/[^0-9]/g, ''), network: option.network } : undefined,
  };
}

interface PickerProps {
  options: PaymentOption[];
  loading: boolean;
  selected: string;
  onSelect: (key: string) => void;
  phone: string;
  onPhoneChange: (phone: string) => void;
}

export const PaymentMethodPicker: React.FC<PickerProps> = ({ options, loading, selected, onSelect, phone, onPhoneChange }) => {
  const chosen = options.find(o => o.key === selected);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-slate-400 text-sm gap-2">
        <Loader2 size={16} className="animate-spin" /> Chargement des moyens de paiement…
      </div>
    );
  }
  if (options.length === 0) {
    return (
      <div className="p-4 text-center border-dashed border border-slate-700 rounded-xl">
        <p className="text-slate-400 text-sm">Le paiement en ligne est momentanément indisponible. Réessayez dans quelques minutes.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {options.map(option => (
          <button
            key={option.key}
            type="button"
            onClick={() => onSelect(option.key)}
            aria-pressed={selected === option.key}
            className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${selected === option.key ? 'border-orange-500 bg-orange-500/10 ring-1 ring-orange-500' : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'} ${option.kind === 'card' && options.length % 2 === 1 ? 'col-span-2' : ''}`}
          >
            {option.kind === 'card'
              ? <CreditCard size={18} className="text-indigo-300 shrink-0" />
              : <span className={`w-3.5 h-3.5 rounded-full shrink-0 ${option.color}`} />}
            <span className="text-white font-bold text-sm">{option.label}</span>
          </button>
        ))}
      </div>

      {chosen?.kind === 'momo' && (
        <div className="animate-in fade-in">
          <label htmlFor="pay-phone" className="block text-sm font-medium text-slate-300 mb-2">Numéro {chosen.label} qui paie</label>
          <input
            id="pay-phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            value={phone}
            onChange={e => onPhoneChange(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="07 00 00 00 00"
            className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 font-mono tracking-wider"
            required
          />
          <p className="text-xs text-slate-500 mt-2">{chosen.hint}</p>
        </div>
      )}
      {chosen?.kind === 'card' && (
        <p className="text-xs text-slate-500">{chosen.hint}. Une fenêtre de paiement sécurisée s'ouvre ; Babipass ne voit jamais votre numéro de carte.</p>
      )}
    </div>
  );
};
