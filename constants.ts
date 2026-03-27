import { Event, Transaction, UserProfile, PayoutRequest, UserRole, Attendee, PromoCode } from './types';
import { QrCode, Ticket, Shield, Calendar, Users, Home, Settings, Search, Filter, Share2, CreditCard, Banknote, Mail } from 'lucide-react';

export const APP_NAME = "Babipass";
export const APP_TAGLINE = "La billetterie nouvelle génération pour l'Afrique.";

export const generateSlug = (text: string) => {
  return (text || '').toString().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-')         // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start
    .replace(/-+$/, '');            // Trim - from end
};

export const MOCK_EVENTS: Event[] = [
  {
    id: '1',
    title: 'Festival Afrobeat Abidjan 2024',
    date: '2024-12-15T18:00:00',
    endDate: '2024-12-16T04:00:00',
    location: 'Palais de la Culture, Treichville',
    city: 'Abidjan',
    country: 'Côte d\'Ivoire',
    coordinates: { lat: 5.3060, lng: -4.0180 },
    price: 15000,
    currency: 'FCFA',
    image: 'https://images.unsplash.com/photo-1493225255756-d9584f8606e9?q=80&w=2070&auto=format&fit=crop',
    gallery: [
      'https://images.unsplash.com/photo-1533174072545-e8d4aa97edf9?q=80&w=2070&auto=format',
      'https://images.unsplash.com/photo-1514525253440-b393452e8d26?q=80&w=2070&auto=format'
    ],
    category: 'Concert',
    organizer: 'Babi Event Pro',
    sold: 4500,
    capacity: 5000,
    description: 'Le plus grand festival de musique urbaine de l\'année revient pour sa 5ème édition. Une nuit inoubliable sous les étoiles d\'Abidjan avec la crème de la musique africaine. Ambiance électrique, show pyrotechnique et plus de 10 artistes sur scène.',
    program: [
      { time: '18:00', title: 'Ouverture des portes', description: 'DJ Set & Warmup' },
      { time: '20:00', title: 'Première partie', description: 'Jeunes talents ivoiriens' },
      { time: '22:00', title: 'Tête d\'affiche', description: 'Show exclusif de Magic System & Friends' },
      { time: '00:00', title: 'After Party', description: 'Mix par DJ Kerozen' }
    ],
    ticketTypes: [
      { id: 't1', name: 'Standard', price: 15000, available: 1000, type: 'standard', features: ['Accès pelouse', 'Bar payant'] },
      { id: 't2', name: 'VIP Gold', price: 50000, available: 200, type: 'vip', features: ['Accès carré or', 'Coupe de champagne', 'Parking inclus'] },
      { id: 't3', name: 'Groupe (5 pers)', price: 65000, available: 50, type: 'group', features: ['Accès pelouse pour 5 personnes', '1 Bouteille offerte'] }
    ],
    status: 'published'
  },
  {
    id: '2',
    title: 'Dakar Tech Summit',
    date: '2024-11-20T09:00:00',
    endDate: '2024-11-22T18:00:00',
    location: 'King Fahd Palace',
    city: 'Dakar',
    country: 'Sénégal',
    price: 50000,
    currency: 'FCFA',
    image: 'https://images.unsplash.com/photo-1544531586-fde5298cdd40?q=80&w=2070&auto=format&fit=crop',
    category: 'Conférence',
    organizer: 'Senegal Tech Hub',
    sold: 850,
    capacity: 1000,
    description: 'Le rendez-vous incontournable de l\'écosystème tech ouest-africain. 3 jours de keynotes, panels et networking avec les leaders de la Silicon Valley et d\'Afrique.',
    program: [
      { time: 'J1 09:00', title: 'Keynote d\'ouverture', description: 'L\'avenir de la Fintech en Afrique' },
      { time: 'J1 14:00', title: 'Workshop IA', description: 'Implémenter l\'IA dans vos startups' },
      { time: 'J2 10:00', title: 'Pitch Competition', description: '10 Startups, 1 gagnant' }
    ],
    ticketTypes: [
      { id: 't4', name: 'Early Bird', price: 35000, available: 0, type: 'early_bird', features: ['Accès 3 jours', 'Lunch inclus'] },
      { id: 't5', name: 'Pro Pass', price: 50000, available: 150, type: 'standard', features: ['Accès 3 jours', 'Accès app networking', 'Dîner de gala'] }
    ],
    status: 'published'
  },
  {
    id: '3',
    title: 'Gala de Charité - Fondation Espoir',
    date: '2024-10-30T20:00:00',
    location: 'Hôtel 2 Février',
    city: 'Lomé',
    country: 'Togo',
    price: 100000,
    currency: 'FCFA',
    image: 'https://images.unsplash.com/photo-1566737236500-c8ac43014a67?q=80&w=2070&auto=format&fit=crop',
    category: 'Gala',
    organizer: 'Fondation Espoir',
    sold: 120,
    capacity: 300,
    description: 'Une soirée d\'élégance et de générosité. Tous les fonds seront reversés pour la construction d\'écoles en zone rurale.',
    ticketTypes: [
      { id: 't6', name: 'Donation Libre', price: 10000, available: 1000, type: 'donation', features: ['Reçu fiscal', 'Accès cocktail'] },
      { id: 't7', name: 'Table Mécène', price: 1000000, available: 10, type: 'vip', features: ['Table de 8 personnes', 'Service traiteur haut de gamme', 'Logo sur mur des sponsors'] }
    ],
    status: 'published'
  },
  {
    id: '4',
    title: 'Match Gala: Éléphants vs Lions',
    date: '2025-01-10T16:00:00',
    location: 'Stade Olympique',
    city: 'Ebimpé',
    country: 'Côte d\'Ivoire',
    price: 2000,
    currency: 'FCFA',
    image: 'https://images.unsplash.com/photo-1579952363873-27f3bde9be2d?q=80&w=2070&auto=format&fit=crop',
    category: 'Sport',
    organizer: 'FIF',
    sold: 45000,
    capacity: 60000,
    description: 'Le choc des titans ! Venez vibrer au rythme du football africain dans le plus beau stade de la région.',
    ticketTypes: [
      { id: 't8', name: 'Virage', price: 2000, available: 20000, type: 'standard', features: ['Placement libre'] },
      { id: 't9', name: 'Tribune Latérale', price: 5000, available: 15000, type: 'standard', features: ['Siège numéroté'] },
      { id: 't10', name: 'Loge VIP', price: 150000, available: 50, type: 'vip', features: ['Vue panoramique', 'Buffet à volonté'] }
    ],
    status: 'published'
  },
  {
    id: '5',
    title: 'Congo Fashion Week',
    date: '2025-02-14T19:00:00',
    location: 'Grand Hôtel Kinshasa',
    city: 'Kinshasa',
    country: 'Congo RDC',
    price: 25000,
    currency: 'FCFA',
    image: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?q=80&w=2070&auto=format&fit=crop',
    category: 'Mode',
    organizer: 'Kinois Mode',
    sold: 0,
    capacity: 500,
    description: 'La mode congolaise à l\'honneur.',
    status: 'pending_review'
  }
];

export const MOCK_TRANSACTIONS: Transaction[] = [
  { id: 'TRX-9872', eventId: '1', eventName: 'Festival Afrobeat', amount: 30000, date: '2024-10-25', customer: '+225 07 08 99 **', method: 'WAVE', status: 'completed' },
  { id: 'TRX-9873', eventId: '1', eventName: 'Festival Afrobeat', amount: 15000, date: '2024-10-25', customer: '+225 05 54 22 **', method: 'OM', status: 'completed' },
  { id: 'TRX-9874', eventId: '2', eventName: 'Dakar Tech', amount: 50000, date: '2024-10-24', customer: '+221 77 654 **', method: 'CB', status: 'completed' },
  { id: 'TRX-9875', eventId: '3', eventName: 'Gala Charité', amount: 200000, date: '2024-10-23', customer: 'Jean Dupont', method: 'CB', status: 'completed' },
  { id: 'TRX-9876', eventId: '1', eventName: 'Festival Afrobeat', amount: 15000, date: '2024-10-23', customer: '+225 01 02 03 **', method: 'MTN', status: 'failed' },
];

export const MOCK_USERS: UserProfile[] = [
  { id: 'u1', name: 'Jean-Philippe K.', email: 'jp.kouam@afritix.com', role: UserRole.ADMIN, status: 'active', joinedAt: '2023-01-15', avatar: 'https://picsum.photos/200?random=1' },
  { id: 'u2', name: 'Babi Event Pro', email: 'contact@babievent.ci', role: UserRole.ORGANIZER, status: 'active', joinedAt: '2023-03-10', avatar: 'https://picsum.photos/200?random=2' },
  { id: 'u3', name: 'Senegal Tech Hub', email: 'info@sthub.sn', role: UserRole.ORGANIZER, status: 'active', joinedAt: '2023-05-22', avatar: 'https://picsum.photos/200?random=3' },
  { id: 'u4', name: 'Marc Z.', email: 'marc@gmail.com', role: UserRole.USER, status: 'active', joinedAt: '2023-06-01', avatar: 'https://picsum.photos/200?random=4' },
  { id: 'u5', name: 'Bad User', email: 'spammer@test.com', role: UserRole.USER, status: 'banned', joinedAt: '2023-08-14', avatar: 'https://picsum.photos/200?random=5' },
];

export const MOCK_PAYOUTS: PayoutRequest[] = [
  { id: 'pay-001', organizerId: 'u2', organizerName: 'Babi Event Pro', amount: 4500000, status: 'pending', requestDate: '2024-10-26', method: 'Virement Bancaire' },
  { id: 'pay-002', organizerId: 'u3', organizerName: 'Senegal Tech Hub', amount: 1200000, status: 'paid', requestDate: '2024-10-20', method: 'Wave Pro' },
  { id: 'pay-003', organizerId: 'u2', organizerName: 'Babi Event Pro', amount: 300000, status: 'approved', requestDate: '2024-10-25', method: 'Orange Money' },
];

export const MOCK_ATTENDEES: Attendee[] = [
  { id: 'att-1', name: 'Awa Diop', email: 'awa.d@gmail.com', ticketType: 'Standard', orderId: 'TRX-9872', status: 'checked_in', checkInTime: '2024-12-15T18:30:00', eventId: '1' },
  { id: 'att-2', name: 'Koffi Mensah', email: 'koffi.m@yahoo.fr', ticketType: 'VIP Gold', orderId: 'TRX-9873', status: 'pending', eventId: '1' },
  { id: 'att-3', name: 'Sarah Connor', email: 'sarah@tech.com', ticketType: 'Pro Pass', orderId: 'TRX-9874', status: 'pending', eventId: '2' },
];

export const MOCK_PROMOS: PromoCode[] = [
  { id: 'p1', code: 'WELCOME20', discount: 20, type: 'percent', usageCount: 45, maxUsage: 100, expiryDate: '2024-12-31', status: 'active' },
  { id: 'p2', code: 'FLASH5000', discount: 5000, type: 'fixed', usageCount: 12, maxUsage: 50, expiryDate: '2024-11-01', status: 'expired' },
];

// ─── Default Email Templates ─────────────────────────────────────────────
export interface EmailTemplateType {
  id: string;
  name: string;
  description: string;
  variables: string[]; // Variables array to inform the admin what they can use
  defaultSubject: string;
  defaultHtml: string;
}

export const EMAIL_TEMPLATES: EmailTemplateType[] = [
  {
    id: 'welcome_otp',
    name: 'Connexion / Création (OTP)',
    description: 'Email contenant le code OTP envoyé aux organisateurs lors de leur connexion ou création de compte.',
    variables: ['{{otpCode}}', '{{recipientEmail}}'],
    defaultSubject: 'Démarrage Babipass Pro - Votre Code',
    defaultHtml: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: white; border-radius: 12px; overflow: hidden; border: 1px solid #334155;">
  <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Babipass PRO</h1>
    <p style="color: rgba(255,255,255,0.9); margin-top: 5px;">Portail Organisateur</p>
  </div>
  <div style="padding: 40px 30px; text-align: center;">
    <p style="font-size: 16px; color: #cbd5e1; margin-bottom: 20px;">
      Bonjour <b>{{recipientEmail}}</b>,<br><br>
      Voici votre code d'accès sécurisé à un usage unique :
    </p>
    
    <div style="background: rgba(255,255,255,0.1); padding: 15px 30px; display: inline-block; border-radius: 8px; border: 1px solid #475569; margin: 20px 0;">
      <span style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #10b981;">{{otpCode}}</span>
    </div>
    
    <p style="color: #64748b; font-size: 13px; margin-top: 30px;">
      Ce code expirera dans 15 minutes.<br>Si vous n'avez pas demandé ce code, veuillez ignorer cet email.
    </p>
  </div>
</div>
    `
  },
  {
    id: 'ticket_purchase',
    name: 'Billet d\'accès (Achat)',
    description: 'Email envoyé à l\'acheteur contenant son reçu et le QR Code JWS.',
    variables: ['{{eventTitle}}', '{{ticketType}}', '{{eventDate}}', '{{qrUrl}}', '{{jwsData}}'],
    defaultSubject: 'Votre Billet Babipass',
    defaultHtml: `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: white; border-radius: 12px; overflow: hidden;">
  <div style="background: linear-gradient(135deg, #ea580c 0%, #d97706 100%); padding: 30px; text-align: center;">
    <h1 style="color: white; margin: 0;">Votre Billet Babipass</h1>
    <p style="color: rgba(255,255,255,0.8); margin-top: 5px;">{{eventTitle}}</p>
  </div>
  <div style="padding: 30px; text-align: center;">
    <p style="font-size: 18px; font-weight: bold;">Pass {{ticketType}}</p>
    <p style="color: #94a3b8;">Le {{eventDate}}</p>
    
    <div style="background: white; padding: 20px; display: inline-block; border-radius: 12px; margin: 30px 0;">
      <img src="{{qrUrl}}" alt="QR Code d'accès" style="width: 250px; height: 250px;" />
    </div>
    
    <p style="font-size: 11px; color: #64748b; font-family: monospace; word-break: break-all; text-align: left; background: #1e293b; padding: 10px; border-radius: 6px;">
      CODE SÉCURISÉ JWS:<br/>
      {{jwsData}}
    </p>
    
    <div style="margin-top: 40px; border-top: 1px solid #334155; padding-top: 20px;">
      <p style="color: #94a3b8; font-size: 12px;">Présentez ce QR Code à l'entrée. Téléchargez le PDF joint si disponible.</p>
    </div>
  </div>
</div>
    `
  },
  {
    id: 'password_reset',
    name: 'Mot de passe oublié',
    description: 'Email envoyé à l\'organisateur contenant un lien sécurisé pour réinitialiser son mot de passe.',
    variables: ['{{resetLink}}', '{{recipientEmail}}'],
    defaultSubject: 'Réinitialisation de votre mot de passe Babipass',
    defaultHtml: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: white; border-radius: 12px; overflow: hidden; border: 1px solid #334155;">
  <div style="background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%); padding: 30px; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Babipass</h1>
    <p style="color: rgba(255,255,255,0.9); margin-top: 5px;">Réinitialisation de mot de passe</p>
  </div>
  <div style="padding: 40px 30px; text-align: center;">
    <p style="font-size: 16px; color: #cbd5e1; margin-bottom: 20px;">
      Bonjour <b>{{recipientEmail}}</b>,<br><br>
      Vous avez demandé la réinitialisation de votre mot de passe Babipass.<br>
      Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe :
    </p>

    <a href="{{resetLink}}" style="display: inline-block; background: linear-gradient(135deg, #7c3aed, #4f46e5); color: white; text-decoration: none; padding: 16px 40px; border-radius: 10px; font-size: 16px; font-weight: bold; margin: 20px 0; letter-spacing: 0.5px;">
      🔐 Réinitialiser mon mot de passe
    </a>

    <p style="color: #64748b; font-size: 13px; margin-top: 30px;">
      Ce lien expirera dans <b>60 minutes</b>.<br>
      Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.<br>
      Votre mot de passe ne changera pas.
    </p>

    <div style="margin-top: 40px; border-top: 1px solid #334155; padding-top: 20px;">
      <p style="color: #475569; font-size: 11px;">Babipass — La billetterie nouvelle génération pour l'Afrique.</p>
    </div>
  </div>
</div>
    `
  }
];

export interface CountryPaymentConfig {
  code: string;
  name: string;
  currency: string;
  dialCode: string;
  gateways: {
    id: 'pawapay' | 'paystack' | 'feexpay' | 'intouch' | 'paydunya';
    methods: string[];
    operators?: string[];
  }[];
}

export const PAYMENT_ROUTING: Record<string, CountryPaymentConfig> = {
  'CI': {
    code: 'CI',
    name: "Côte d'Ivoire",
    currency: 'XOF',
    dialCode: '+225',
    gateways: [
      { id: 'pawapay', methods: ['momo'], operators: ['Orange CI', 'MTN CI', 'Wave CI', 'Moov CI'] },
      { id: 'paystack', methods: ['card'] }
    ]
  },
  'SN': {
    code: 'SN',
    name: 'Sénégal',
    currency: 'XOF',
    dialCode: '+221',
    gateways: [
      { id: 'intouch', methods: ['momo'], operators: ['Orange SN', 'Wave SN', 'Free SN'] },
      { id: 'paydunya', methods: ['momo'], operators: ['Orange SN', 'Wave SN', 'Free SN'] },
      { id: 'paystack', methods: ['card'] }
    ]
  },
  'BJ': {
    code: 'BJ',
    name: 'Bénin',
    currency: 'XOF',
    dialCode: '+229',
    gateways: [
      { id: 'feexpay', methods: ['momo'], operators: ['MTN BJ', 'Moov BJ', 'Celtiis BJ'] },
      { id: 'paydunya', methods: ['momo'], operators: ['MTN BJ', 'Moov BJ'] },
      { id: 'paystack', methods: ['card'] }
    ]
  },
  'NG': {
    code: 'NG',
    name: 'Nigeria',
    currency: 'NGN',
    dialCode: '+234',
    gateways: [
      { id: 'paystack', methods: ['card', 'bank_transfer', 'ussd'] }
    ]
  },
  'TG': {
    code: 'TG',
    name: 'Togo',
    currency: 'XOF',
    dialCode: '+228',
    gateways: [
      { id: 'feexpay', methods: ['momo'], operators: ['Togocel', 'Moov TG'] },
      { id: 'paydunya', methods: ['momo'], operators: ['Togocel', 'Moov TG'] },
      { id: 'paystack', methods: ['card'] }
    ]
  },
  'CM': {
    code: 'CM',
    name: 'Cameroun',
    currency: 'XAF',
    dialCode: '+237',
    gateways: [
      { id: 'intouch', methods: ['momo'], operators: ['Orange CM', 'MTN CM'] },
      { id: 'paystack', methods: ['card'] }
    ]
  }
};

export const EXCHANGE_RATES: Record<string, number> = {
  'XOF': 1,      // Base (FCFA UEMOA)
  'XAF': 1,      // Base (FCFA CEMAC)
  'NGN': 2.5,    // 1 XOF = 2.5 Naira (mock)
  'USD': 0.0016, // 1 XOF = 0.0016 USD
  'EUR': 0.0015, // 1 XOF = 0.0015 EUR
};

export const convertCurrency = (amount: number, fromCurrency: string = 'XOF', toCurrency: string = 'XOF') => {
  // Load dynamic rates from admin dashboard settings if they exist
  const storedRatesStr = localStorage.getItem('afriTix_exchange_rates');
  const rates = storedRatesStr ? JSON.parse(storedRatesStr) : EXCHANGE_RATES;

  // Convert to Base (XOF) first
  let baseAmount = amount;
  const fromCode = fromCurrency === 'FCFA' ? 'XOF' : fromCurrency;
  if (fromCode !== 'XOF') {
    const fromRate = rates[fromCode] || 1;
    baseAmount = amount / fromRate;
  }

  // Convert from Base to Target
  const toCode = toCurrency === 'FCFA' ? 'XOF' : toCurrency;
  if (toCode === 'XOF') return baseAmount;

  const toRate = rates[toCode] || 1;
  return baseAmount * toRate;
};

export const formatCurrency = (amount: number, currency: string = 'XOF') => {
  const isCFA = currency === 'XOF' || currency === 'XAF' || currency === 'FCFA';
  const displayCode = isCFA ? 'XOF' : currency;

  const formatted = new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: displayCode,
    minimumFractionDigits: (currency === 'USD' || currency === 'EUR') ? 2 : 0
  }).format(amount);

  if (isCFA) return formatted.replace('XOF', 'FCFA');
  return formatted;
};

export const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit'
  });
};
