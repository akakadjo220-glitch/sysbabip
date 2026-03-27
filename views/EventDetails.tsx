
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { MOCK_EVENTS, formatCurrency, formatDate, convertCurrency, PAYMENT_ROUTING } from '../constants';
import { Event, TicketCategory } from '../types';
import { supabase } from '../supabaseClient';
import { getPlatformSetting } from '../utils/platformSettings';
import { getOfflineTickets, saveSecureTicket } from '../utils/offlineStorage';
import { generateTicketPDF } from '../utils/pdfGenerator';
import { WhatsAppService } from '../services/WhatsAppService';
import { EmailService } from '../services/EmailService';
import { PaystackService } from '../services/PaystackService';
import { PawaPayService } from '../services/PawaPayService';
import { FeexpayService } from '../services/FeexpayService';
import { IntouchService } from '../services/IntouchService';
import { PaydunyaService } from '../services/PaydunyaService';
import { signTicket } from '../utils/crypto';
import { LazyVideo } from '../components/LazyVideo';
import { SEO } from '../components/SEO';
import Map, { Marker } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  Calendar, MapPin, Clock, ArrowLeft, Share2, Heart,
  Info, ShieldCheck, Ticket, CheckCircle, Smartphone, CreditCard,
  Download, QrCode, Mail, Link, X, Copy, Facebook, Twitter, Linkedin, Loader2, WifiOff, AlertTriangle, Timer, ShieldAlert, Banknote, Flame, Zap, Users, Phone
} from 'lucide-react';

// Anti-Fraud Constants
const CART_EXPIRATION_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ABANDONS = 3;
const LOCKOUT_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours

// E-commerce Urgency Components
const FomoBanner = () => {
  const [msgIdx, setMsgIdx] = useState(0);

  const messages = [
    { icon: Users, text: `${Math.floor(Math.random() * 10) + 5} personnes consultent cette page`, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30" },
    { icon: Flame, text: "Très demandé : les billets partent vite !", color: "text-rose-500", bg: "bg-rose-500/10", border: "border-rose-500/30" },
    { icon: Zap, text: `${Math.floor(Math.random() * 5) + 1} billets vendus dans la dernière heure`, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30" }
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIdx((prev) => (prev + 1) % messages.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const current = messages[msgIdx];
  const Icon = current.icon;

  return (
    <div className={`overflow-hidden transition-all duration-500 rounded-xl border ${current.bg} ${current.border} mb-6`}>
      <div className="flex items-center gap-3 p-3 animate-in fade-in slide-in-from-right-4 duration-500" key={msgIdx}>
        <div className={`p-2 rounded-full bg-white/5 ${current.color} shadow-[0_0_15px_rgba(current-color,0.2)]`}>
          <Icon size={18} className="animate-pulse" />
        </div>
        <p className={`text-sm font-bold ${current.color}`}>{current.text}</p>
      </div>
    </div>
  );
};

const StockBar = ({ capacity, sold }: { capacity: number, sold: number }) => {
  const [fillPct, setFillPct] = useState(0);

  // Si pas de capacité, simulation pour générer de l'urgence
  const effectiveCapacity = capacity || 500;
  let effectiveSold = sold || 420;

  if (effectiveSold > effectiveCapacity) effectiveSold = effectiveCapacity;
  const targetPct = Math.round((effectiveSold / effectiveCapacity) * 100);

  // Déterminer la couleur : Rouge si critique (> 85%), orange sinon
  const isCritical = targetPct >= 85;

  useEffect(() => {
    const timer = setTimeout(() => {
      setFillPct(targetPct);
    }, 500); // Délai pour l'animation au chargement
    return () => clearTimeout(timer);
  }, [targetPct]);

  return (
    <div className="mb-6 space-y-2">
      <div className="flex justify-between items-end">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Disponibilité</span>
        <span className={`text-sm font-bold ${isCritical ? 'text-rose-500 animate-pulse' : 'text-orange-400'}`}>
          {isCritical ? 'Presque Complet !' : `${100 - targetPct}% des places restantes`}
        </span>
      </div>
      <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden shadow-inner relative">
        <div
          className={`h-full rounded-full transition-all duration-1500 ease-out relative overflow-hidden ${isCritical ? 'bg-gradient-to-r from-rose-600 to-rose-400' : 'bg-gradient-to-r from-orange-600 to-amber-400'}`}
          style={{ width: `${fillPct}%` }}
        >
          {/* Shimmer effect inside the bar */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
        </div>
      </div>
      <p className="text-[10px] text-slate-500 text-right">{effectiveSold} billets déjà réservés</p>
    </div>
  );
};

export const EventDetails: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const id = slug; // Temporary alias for session storage keys
  const navigate = useNavigate();
  const location = useLocation();
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'details' | 'programme' | 'infos'>('details');
  const viewTrackedRef = useRef(false);
  const [participantName, setParticipantName] = useState(() => sessionStorage.getItem(`checkout_name_${id}`) || '');
  const [cart, setCart] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(`checkout_cart_${id}`) || '{}');
    } catch { return {}; }
  });
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(() => sessionStorage.getItem(`checkout_open_${id}`) === 'true');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [resaleListings, setResaleListings] = useState<any[]>([]);

  // Persistence Effect
  useEffect(() => {
    if (id) {
      sessionStorage.setItem(`checkout_cart_${id}`, JSON.stringify(cart));
      sessionStorage.setItem(`checkout_name_${id}`, participantName);
      sessionStorage.setItem(`checkout_open_${id}`, String(isCheckoutOpen));
    }
  }, [id, cart, participantName, isCheckoutOpen]);

  // Scroll to top on mount/id change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  const fetchResaleListings = () => {
    if (event) {
      const listings = JSON.parse(localStorage.getItem('afriTix_resale_listings') || '[]');
      const eventListings = listings.filter((l: any) => l.ticket.eventName === event.title);
      setResaleListings(eventListings);
    }
  };

  useEffect(() => {
    fetchResaleListings();
  }, [event]);

  // Handle Affiliate Tracking
  useEffect(() => {
    const handleAffiliateRef = async () => {
      const searchParams = new URLSearchParams(location.search);
      const refCode = searchParams.get('ref');

      if (refCode) {
        // Store in session storage for the checkout process
        sessionStorage.setItem('afriTix_affiliate_ref', refCode);

        // Record a click using Supabase RPC if we had it, or directly by reading/updating
        try {
          // Since we might not have the RPC available, we do a simple select/update
          const { data: linkInfo } = await supabase
            .from('affiliate_links')
            .select('id, clicks')
            .eq('unique_code', refCode)
            .single();

          if (linkInfo) {
            await supabase
              .from('affiliate_links')
              .update({ clicks: linkInfo.clicks + 1 })
              .eq('id', linkInfo.id);
          }
        } catch (e) {
          console.error("Erreur lors de l'enregistrement du clic", e);
        }
      }
    };

    handleAffiliateRef();
  }, [location.search]);

  // Anti-Fraud State
  const [cartExpiresAt, setCartExpiresAt] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isSuspended, setIsSuspended] = useState(false);
  const [suspensionTimeLeft, setSuspensionTimeLeft] = useState(0);
  const [showAutoReleaseBadge, setShowAutoReleaseBadge] = useState(false);

  // Check Suspensions on mount
  useEffect(() => {
    const checkSuspension = () => {
      const suspensionEnd = localStorage.getItem('afriTix_suspended_until');
      if (suspensionEnd) {
        const remaining = Number(suspensionEnd) - Date.now();
        if (remaining > 0) {
          setIsSuspended(true);
          setSuspensionTimeLeft(Math.ceil(remaining / 60000)); // in minutes
        } else {
          localStorage.removeItem('afriTix_suspended_until');
          localStorage.removeItem('afriTix_cart_abandons'); // reset strikes
          setIsSuspended(false);
        }
      }
    };
    checkSuspension();
    const interval = setInterval(checkSuspension, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  // Timer Countdown Logic
  useEffect(() => {
    if (!cartExpiresAt || isCheckoutOpen) return; // Freeze timer if checkout is open in this simplified flow

    const interval = setInterval(() => {
      const remaining = cartExpiresAt - Date.now();
      if (remaining <= 0) {
        handleCartExpiration();
        clearInterval(interval);
      } else {
        setTimeLeft(remaining);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [cartExpiresAt, isCheckoutOpen]);

  const handleCartExpiration = () => {
    // 1. Record an abandon if items were in cart
    const totalItems = Object.values(cart).reduce((a, b) => a + b, 0);
    if (totalItems >= 5) {
      const abandons = Number(localStorage.getItem('afriTix_cart_abandons') || 0) + 1;
      localStorage.setItem('afriTix_cart_abandons', String(abandons));

      if (abandons >= MAX_ABANDONS) {
        const lockoutEnd = Date.now() + LOCKOUT_DURATION_MS;
        localStorage.setItem('afriTix_suspended_until', String(lockoutEnd));
        setIsSuspended(true);
        setSuspensionTimeLeft(Math.ceil(LOCKOUT_DURATION_MS / 60000));
      }
    }

    // 2. Clear Cart and Timer
    setCart({});
    setCartExpiresAt(null);
    setTimeLeft(0);
    setIsCheckoutOpen(false);

    // 3. Trigger Auto-Release visual effect for other users (simulated locally here)
    if (totalItems > 0) {
      setShowAutoReleaseBadge(true);
      setTimeout(() => setShowAutoReleaseBadge(false), 8000); // Pulse for 8 seconds
    }
  };

  const handleCheckoutClose = (completed: boolean = false) => {
    if (!completed) {
      // User cancelled checkout, treat as abandon if timer is close to expiring
      handleCartExpiration();
    } else {
      // Success, clear cart and timer but don't count an abandon
      setCart({});
      setCartExpiresAt(null);
      setTimeLeft(0);
      setIsCheckoutOpen(false);

      // Clear persistence
      Object.keys(sessionStorage).forEach(key => {
        if (key.includes(`checkout_`) && key.includes(id || '')) {
          sessionStorage.removeItem(key);
        }
      });
    }
  };

  useEffect(() => {
    const fetchEvent = async () => {
      if (!id) return;
      setLoading(true);

      try {
        const { data, error } = await supabase
          .from('events')
          .select('*, ticket_types(*), profiles(name, company, avatar)') // Fetch related ticket types and organizer profile
          .eq('slug', slug)
          .single();

        if (error) throw error;

        if (data) {
          // Transform snake_case relation to match Event type
          const formattedEvent = {
            ...data,
            ticketTypes: data.ticket_types,
            video: data.video_url
          };
          setEvent(formattedEvent);
        } else {
          // No DB record
          setEvent(null);
        }
      } catch (err) {
        console.error("Error fetching event details", err);
        setEvent(null);
      } finally {
        setLoading(false);
      }
    };

    fetchEvent();

    // Track page view for Organizer BI dashboard (silently, no-await)
    if (id && !viewTrackedRef.current) {
      const sessionKey = `afriTix_view_tracked_${id}`;
      if (!sessionStorage.getItem(sessionKey)) {
        // Mark as tracked IMMEDIATELY (synchronously) to prevent race conditions during async calls
        sessionStorage.setItem(sessionKey, 'true');
        viewTrackedRef.current = true;

        supabase.rpc('increment_event_view', { evt_id: id })
          .then(null, (err) => console.error("Error tracking view:", err));
      } else {
        viewTrackedRef.current = true;
      }
    }
  }, [id]);

  // Logic for similar events - In a real app, this would be another Supabase query 
  // currently we just leave an empty array if we don't fetch them specifically
  const relatedEvents: Event[] = [];

  const handleShare = async () => {
    if (!event) return;

    const shareData = {
      title: event.title,
      text: `Découvrez l'événement ${event.title} sur Babipass !`,
      url: window.location.href
    };

    // Use Native Share API if available (Mobile)
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.error('Error sharing:', err);
      }
    } else {
      // Fallback to custom modal (Desktop)
      setIsShareModalOpen(true);
    }
  };

  if (loading) return <EventDetailsSkeleton />;

  if (!event) return <div className="p-10 text-center text-white">Événement introuvable.</div>;

  const handleTicketChange = (ticketId: string, delta: number) => {
    if (isSuspended) return;

    setCart((prev) => {
      const current = prev[ticketId] || 0;
      const newValue = Math.max(0, current + delta);
      const newCart = { ...prev, [ticketId]: newValue };

      // Start timer if first item added
      const totalItemsNow = Object.values(newCart).reduce((a, b) => a + b, 0);
      if (totalItemsNow > 0 && !cartExpiresAt) {
        setCartExpiresAt(Date.now() + CART_EXPIRATION_MS);
      } else if (totalItemsNow === 0) {
        setCartExpiresAt(null);
      }

      return newCart;
    });
  };

  const totalAmount = event.ticketTypes?.reduce((sum, ticket) => {
    return sum + (ticket.price * (cart[ticket.id] || 0));
  }, 0) || 0;

  const totalItems = (Object.values(cart) as number[]).reduce((a: number, b: number) => a + b, 0);

  // Consider event sold out if sold >= capacity, or for demo purposes, if it has no capacity set yet but let's stick to true logic.
  // We'll add a demo check: if you want to test the resale, you can manually set capacity=sold in db.
  const isSoldOut = event.capacity > 0 && event.sold >= event.capacity;

  return (
    <div className="relative min-h-screen pb-36">
      <SEO
        title={`${event.title} à ${event.city} - Réservation & Billets | Babipass`}
        description={`Participez à ${event.title} le ${new Date(event.date).toLocaleDateString('fr-FR')} à ${event.city}. Achetez vos billets officiels dès ${formatCurrency(event.price)} en toute sécurité. Places limitées, réservez ✓`}
        image={event.image}
        url={window.location.href}
      />
      {/* Back Button */}
      <button
        onClick={() => navigate(-1)}
        className="fixed top-20 left-4 z-40 bg-black/40 backdrop-blur-md p-3 rounded-full text-white hover:bg-black/60 transition-colors border border-white/10"
      >
        <ArrowLeft size={24} />
      </button>

      {/* Share Button */}
      <button
        onClick={handleShare}
        className="fixed top-20 right-4 z-40 bg-black/40 backdrop-blur-md p-3 rounded-full text-white hover:bg-orange-600 transition-colors border border-white/10 shadow-lg"
        title="Partager l'événement"
      >
        <Share2 size={24} />
      </button>

      {/* Hero Section */}
      <div className="relative h-[60vh] w-full overflow-hidden bg-slate-900">
        {event.video ? (
          <LazyVideo
            src={event.video}
            poster={event.image}
            loop
            priority
            className="absolute inset-0 w-full h-full"
          />
        ) : (
          <img
            src={event.image}
            alt={event.title}
            className="absolute inset-0 w-full h-full object-cover animate-ken-burns transform origin-center"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] via-[#0f172a]/40 to-transparent pointer-events-none" />

        <div className="absolute bottom-0 left-0 w-full p-6 md:p-12 max-w-7xl mx-auto">
          {showAutoReleaseBadge && (
            <div className="absolute -top-12 left-6 md:left-12 z-50 animate-in fade-in slide-in-from-bottom duration-500">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-rose-600 border border-rose-400 text-white text-xs md:text-sm font-bold uppercase tracking-widest shadow-[0_0_20px_rgba(225,29,72,0.6)] animate-pulse">
                🔥 Des places viennent de se libérer !
              </div>
            </div>
          )}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-600/90 text-white text-xs font-bold uppercase mb-4 shadow-lg animate-in slide-in-from-bottom-4 duration-500">
            <Ticket size={14} /> {event.category}
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-orange-100 to-white shimmer-text bg-[length:200%_auto] mb-4 leading-tight drop-shadow-xl animate-in slide-in-from-bottom-4 duration-700 delay-100 fill-mode-both">
            {event.title}
          </h1>
          <div className="flex flex-wrap gap-6 text-slate-200 text-sm md:text-base font-medium">
            <div className="flex items-center gap-2 bg-black/30 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10">
              <Calendar className="text-orange-400" size={20} />
              <span>{formatDate(event.date)}</span>
            </div>
            <div className="flex items-center gap-2 bg-black/30 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10">
              <Clock className="text-orange-400" size={20} />
              <span>{new Date(event.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div className="flex items-center gap-2 bg-black/30 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10">
              <MapPin className="text-orange-400" size={20} />
              <span>{event.location}, {event.city}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 -mt-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Main Content (Left Column) */}
          <div className="lg:col-span-2 space-y-8">

            <div className="bg-[#1e293b] rounded-3xl border border-white/5 p-8 min-h-[400px]">
              <div className="space-y-6 animate-in fade-in duration-300">
                <h3 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-300 flex items-center gap-2">
                  ✨ Ce qui vous attend...
                </h3>
                <div className="relative">
                  <p className={`text-slate-300 leading-relaxed text-lg whitespace-pre-line transition-all duration-500 ${!isDescriptionExpanded ? 'line-clamp-4' : ''}`}>
                    {event.description}
                  </p>
                  {/* Dégradé masquant le texte en mode réduit pour inviter au clic */}
                  {!isDescriptionExpanded && (
                    <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#1e293b] via-[#1e293b]/80 to-transparent pointer-events-none" />
                  )}
                </div>
                <button
                  onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                  className="text-orange-400 hover:text-amber-300 font-bold text-[15px] flex items-center gap-2 transition-colors active:scale-95 bg-orange-500/10 px-4 py-2 rounded-lg inline-block"
                >
                  {isDescriptionExpanded ? 'Réduire la description' : 'Lire la suite...'}
                </button>

                {event.gallery && (
                  <div className="grid grid-cols-2 gap-4 mt-8 pt-8 border-t border-white/10">
                    <h4 className="col-span-2 text-xl font-bold text-white mb-2">Aperçu</h4>
                    {event.gallery.map((img, idx) => (
                      <img key={idx} src={img} className="rounded-xl w-full h-48 object-cover hover:scale-105 transition-transform duration-500 shadow-lg border border-white/5" alt="Gallery" />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sticky Ticket Sidebar (Right Column) */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-4" id="ticket-section">
              <div className="glass-panel p-6 rounded-3xl border border-orange-500/30 shadow-2xl shadow-orange-500/10">
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                  <Ticket className="text-orange-400 animate-pulse" /> Billetterie
                </h3>

                {!isSoldOut && (
                  <>
                    <FomoBanner />
                    <StockBar capacity={event.capacity} sold={event.sold} />
                  </>
                )}

                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {isSoldOut ? (
                    <div className="p-6 text-center bg-slate-800/50 border border-slate-700 rounded-xl mb-4">
                      <div className="w-12 h-12 bg-rose-500/20 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-3 shadow-[0_0_15px_rgba(244,63,94,0.3)]">
                        <X size={24} />
                      </div>
                      <p className="font-bold text-white text-xl mb-1">Guichets Fermés</p>
                      <p className="text-slate-400 text-sm">Tous les billets officiels pour cet événement ont été vendus.</p>
                    </div>
                  ) : (
                    event.ticketTypes?.map((ticket) => {
                      const quantity = (cart[ticket.id] as number) || 0;
                      return (
                        <div
                          key={ticket.id}
                          className={`p-4 rounded-xl border transition-all ${quantity > 0
                            ? 'bg-orange-600/10 border-orange-500'
                            : 'bg-slate-800/50 border-slate-700 hover:border-slate-500'
                            }`}
                        >
                          <div className="flex justify-between mb-1">
                            <span className="font-bold text-white">{ticket.name}</span>
                            <span className="font-bold text-emerald-400">{formatCurrency(ticket.price)}</span>
                          </div>
                          <div className="flex flex-wrap gap-2 mb-4">
                            {ticket.features && ticket.features.map((f, i) => (
                              <span key={i} className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">{f}</span>
                            ))}
                          </div>

                          <div className="flex items-center justify-between bg-slate-900 rounded-lg p-1">
                            <button
                              onClick={() => handleTicketChange(ticket.id, -1)}
                              className="w-8 h-8 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-white transition-colors"
                            >-</button>
                            <span className="font-mono font-bold text-white">{quantity}</span>
                            <button
                              onClick={() => handleTicketChange(ticket.id, 1)}
                              className="w-8 h-8 flex items-center justify-center rounded bg-orange-600 hover:bg-orange-500 text-white transition-colors"
                            >+</button>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>

                {!isSoldOut && (
                  <div className="mt-6 pt-6 border-t border-white/10 space-y-4">
                    {isSuspended ? (
                      <div className="bg-rose-500/10 border border-rose-500/30 p-4 rounded-xl flex items-start gap-3 mt-4">
                        <ShieldAlert className="text-rose-500 shrink-0" size={20} />
                        <div>
                          <p className="font-bold text-rose-500 text-sm">Action bloquée - Suspicion de bot</p>
                          <p className="text-slate-400 text-xs mt-1">Vous avez abandonné trop de réservations avec un grand nombre de billets. Achat verrouillé pendant {suspensionTimeLeft} min.</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        {cartExpiresAt && (
                          <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/30 p-3 rounded-lg mb-4 text-amber-500">
                            <span className="text-xs font-bold flex items-center gap-2"><Timer size={14} /> Places réservées</span>
                            <span className="font-mono font-bold text-sm">
                              {Math.floor(timeLeft / 60000).toString().padStart(2, '0')}:
                              {Math.floor((timeLeft % 60000) / 1000).toString().padStart(2, '0')}
                            </span>
                          </div>
                        )}

                        <div className="flex justify-between items-end">
                          <span className="text-slate-400">Total à payer</span>
                          <span className="text-3xl font-black text-white">{formatCurrency(totalAmount)}</span>
                        </div>

                        <button
                          disabled={totalAmount === 0}
                          onClick={() => setIsCheckoutOpen(true)}
                          className="w-full py-4 bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-500 text-white rounded-xl font-bold text-lg shadow-[0_0_20px_rgba(249,115,22,0.4)] hover:shadow-[0_0_30px_rgba(249,115,22,0.6)] transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none animate-glow-pulse"
                        >
                          Acheter {totalItems > 0 && `(${totalItems})`}
                        </button>
                        <p className="text-xs text-center text-slate-500 flex items-center justify-center gap-1">
                          <ShieldCheck size={12} /> Paiement 100% sécurisé
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Resale Market Panel */}
              {isSoldOut && resaleListings.length > 0 && (
                <div className="glass-panel p-6 rounded-3xl border border-emerald-500/40 shadow-2xl shadow-emerald-500/10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-xl font-bold text-emerald-400 flex items-center gap-2">
                      <Banknote className="animate-pulse" /> Revente Sécurisée
                    </h3>
                    <span className="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2 py-1 rounded-full border border-emerald-500/30">
                      {resaleListings.length} dispo.
                    </span>
                  </div>
                  <p className="text-slate-300 text-sm mb-6 leading-relaxed">
                    Les billets officiels étant épuisés, des billets certifiés sont disponibles à la revente par notre communauté.
                  </p>

                  <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {resaleListings.map(listing => (
                      <ResaleCard key={listing.id} listing={listing} onSuccessfulPurchase={fetchResaleListings} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>


        {/* Programme & Infos (Post-Ticketing Flow - Neuromarketing) */}
        {event.program && event.program.length > 0 && (
          <div className="mt-20 border-t border-white/10 pt-16">
            <h3 className="text-3xl font-black text-white mb-10 text-center">Le Programme</h3>
            <div className="max-w-3xl mx-auto space-y-8 relative pl-8 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-700">
              {event.program?.map((item, idx) => (
                <div key={idx} className="relative bg-slate-800/30 p-6 rounded-2xl border border-white/5 hover:bg-slate-800/50 transition-colors">
                  <div className="absolute -left-[39px] top-6 w-6 h-6 rounded-full bg-slate-900 border-4 border-orange-600 z-10" />
                  <span className="text-orange-400 font-bold text-sm bg-orange-400/10 px-3 py-1.5 rounded-lg inline-block mb-3">{item.time}</span>
                  <h4 className="text-2xl font-bold text-white mb-2">{item.title}</h4>
                  <p className="text-slate-400 text-lg">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mapbox Localisation */}
        <div className="mt-20 border-t border-white/10 pt-16 mb-10 w-full overflow-hidden">
          <h3 className="text-3xl font-black text-white mb-10 text-center">Localisation</h3>
          {/* Interactive Mapbox Map */}
          <div className="h-[400px] w-full max-w-5xl mx-auto bg-slate-800 rounded-3xl overflow-hidden shadow-2xl border border-white/10 relative group">
            <Map
              mapboxAccessToken={'pk.eyJ1IjoicXJwbHVzIiwiY' + 'SI6ImNtbHo4cTE5cDA0MnEzZnI4OWM1MnY3dTkifQ.0YS9IbrHSeKVf-F0bSxIMg'}
              initialViewState={{
                longitude: event.coordinates?.lng || -4.00,
                latitude: event.coordinates?.lat || 5.35,
                zoom: 13
              }}
              style={{ width: '100%', height: '100%' }}
              mapStyle="mapbox://styles/mapbox/dark-v11"
              interactive={true}
            >
              <Marker longitude={event.coordinates?.lng || -4.00} latitude={event.coordinates?.lat || 5.35} anchor="bottom">
                <div className="relative flex flex-col items-center group z-50">
                  {/* Mini Carte de l'événement */}
                  <div className="bg-[#0f172a] rounded-xl overflow-hidden shadow-[0_15px_30px_rgba(0,0,0,0.8)] border border-white/20 mb-2 w-48 sm:w-56 transform transition-transform duration-300 hover:scale-105 origin-bottom cursor-pointer">
                    <div className="h-24 w-full relative">
                      <img src={event.image || MOCK_EVENTS[0].image} alt={event.title} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] via-[#0f172a]/20 to-transparent" />
                      <div className="absolute top-2 right-2 bg-orange-600/90 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-lg">
                        {event.category || 'Événement'}
                      </div>
                    </div>
                    <div className="p-3 bg-[#0f172a]">
                      <h4 className="text-white font-bold text-sm leading-tight line-clamp-1 mb-1">{event.title}</h4>
                      <div className="flex items-center justify-between text-slate-400 text-xs">
                        <div className="flex items-center gap-1">
                          <Calendar size={12} className="text-orange-400" />
                          <span>{new Date(event.date || new Date()).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
                        </div>
                        <span className="font-bold text-emerald-400">
                          {(() => {
                            let minPrice = event.price || 0;
                            if (event.ticketTypes && event.ticketTypes.length > 0) {
                              const prices = event.ticketTypes.map((t: any) => t.price || 0);
                              minPrice = Math.min(...prices);
                              return `Dès ${formatCurrency(minPrice)}`;
                            }
                            return formatCurrency(minPrice);
                          })()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Point d'ancrage Pulse */}
                  <div className="relative">
                    <div className="w-5 h-5 bg-orange-500 rounded-full border-2 border-white shadow-[0_0_15px_rgba(249,115,22,0.9)] animate-pulse z-10 relative"></div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-orange-500 rounded-full animate-ping opacity-30 pointer-events-none"></div>
                  </div>
                </div>
              </Marker>
            </Map>
            <div className="absolute bottom-6 right-6 z-10 transition-transform duration-300 group-hover:-translate-y-2 group-hover:shadow-[0_10px_30px_rgba(249,115,22,0.4)]">
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${event.coordinates?.lat || 5.35},${event.coordinates?.lng || -4.00}`}
                target="_blank"
                rel="noreferrer"
                className="bg-white/95 backdrop-blur-md text-slate-900 px-6 py-3 rounded-xl font-black shadow-xl flex items-center gap-2 hover:bg-orange-500 hover:text-white transition-all border border-black/5"
              >
                <MapPin size={18} /> Obtenir l'itinéraire
              </a>
            </div>
          </div>
        </div>

        {/* Infos Pratiques avec Auto-Scroll */}
        <div className="border-t border-white/10 pt-16 mb-10 w-full overflow-hidden">
          <style>{`
            @keyframes autoMarquee {
              0% { transform: translateX(0%); }
              100% { transform: translateX(-50%); }
            }
            .animate-auto-marquee {
              animation: autoMarquee 25s linear infinite;
            }
            .animate-auto-marquee:hover {
              animation-play-state: paused;
            }
          `}</style>

          <h3 className="text-3xl font-black text-white mb-10 text-center">Infos Pratiques</h3>

          <div className="max-w-6xl mx-auto -mx-4 px-4 sm:mx-auto sm:px-0 mb-10 overflow-hidden relative">
            <div style={{ maskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)" }} className="flex overflow-hidden w-full group">
              <div className="flex gap-4 md:gap-6 animate-auto-marquee w-max">
                {/* Boucle 2 fois pour le défilement infini sans coupure */}
                {[1, 2].map(loopIndex => (
                  <React.Fragment key={loopIndex}>
                    {((event as any).practical_infos?.length > 0 || (event as any).practicalInfos?.length > 0) ? (
                      ((event as any).practical_infos || (event as any).practicalInfos || []).map((info: any, idx: number) => {
                        let IconComp = Info;
                        if (info.icon === 'MapPin') IconComp = MapPin;
                        if (info.icon === 'ShieldCheck') IconComp = ShieldCheck;
                        if (info.icon === 'Clock') IconComp = Clock;

                        return (
                          <div key={idx} className="shrink-0 w-72 md:w-80 bg-slate-800/50 p-6 flex flex-col items-center text-center rounded-2xl border border-slate-700 hover:border-orange-500/50 transition-colors">
                            <IconComp size={32} className="text-orange-400 mb-4" />
                            <h4 className="font-bold text-white mb-2 text-lg">{info.title}</h4>
                            <p className="text-slate-400 text-sm leading-relaxed whitespace-pre-wrap">{info.description}</p>
                          </div>
                        );
                      })
                    ) : (
                      <>
                        <div className="shrink-0 w-72 md:w-80 bg-slate-800/50 p-6 flex flex-col items-center text-center rounded-2xl border border-slate-700 hover:border-orange-500/50 transition-colors">
                          <MapPin size={32} className="text-orange-400 mb-4" />
                          <h4 className="font-bold text-white mb-2 text-lg">Accès</h4>
                          <p className="text-slate-400 text-sm leading-relaxed">Parking surveillé disponible.<br />Accessible via Boulevard Latrille.<br />Navettes gratuites.</p>
                        </div>
                        <div className="shrink-0 w-72 md:w-80 bg-slate-800/50 p-6 flex flex-col items-center text-center rounded-2xl border border-slate-700 hover:border-orange-500/50 transition-colors">
                          <ShieldCheck size={32} className="text-orange-400 mb-4" />
                          <h4 className="font-bold text-white mb-2 text-lg">Sécurité</h4>
                          <p className="text-slate-400 text-sm leading-relaxed">Contrôle des sacs à l'entrée.<br />Bouteilles en verre interdites.<br />Equipe médicale sur place.</p>
                        </div>
                        <div className="shrink-0 w-72 md:w-80 bg-slate-800/50 p-6 flex flex-col items-center text-center rounded-2xl border border-slate-700 hover:border-orange-500/50 transition-colors">
                          <Clock size={32} className="text-orange-400 mb-4" />
                          <h4 className="font-bold text-white mb-2 text-lg">Horaires</h4>
                          <p className="text-slate-400 text-sm leading-relaxed">Ouverture des portes : 18h00<br />Début du spectacle : 20h00<br />Fin estimée : 23h30</p>
                        </div>
                      </>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>

          {/* Support Phone */}
          {((event as any).support_phone || (event as any).supportPhone) && (
            <div className="max-w-md mx-auto mt-4 bg-slate-800/60 border border-orange-500/20 rounded-2xl px-6 py-4 flex items-center gap-4 shadow-lg">
              <div className="w-10 h-10 bg-orange-500/20 rounded-full flex items-center justify-center shrink-0 border border-orange-500/30">
                <Phone size={20} className="text-orange-400" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Infoline / Support</p>
                <p className="text-white font-bold text-lg">{(event as any).support_phone || (event as any).supportPhone}</p>
              </div>
            </div>
          )}
        </div>

        {/* Similar Events Section */}
        {relatedEvents.length > 0 && (
          <div className="mt-20 border-t border-white/10 pt-10">
            <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
              <Heart className="text-rose-500" size={24} />
              Cela pourrait vous plaire
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {relatedEvents.map((related, idx) => (
                <div key={related.id} className="perspective-1000 animate-in fade-in zoom-in duration-500 fill-mode-both" style={{ animationDelay: `${idx * 150}ms` }}>
                  <div
                    onClick={() => {
                      navigate(`/event/${related.slug || related.id}`);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="group preserve-3d hover-3d-tilt bg-[#1e293b] rounded-2xl border border-white/5 hover:border-orange-500/50 overflow-hidden cursor-pointer transition-all hover:shadow-[0_10px_40px_rgba(249,115,22,0.15)]"
                  >
                    <div className="h-40 relative overflow-hidden">
                      <img
                        src={related.image}
                        alt={related.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent opacity-60" />
                      <div className="absolute bottom-3 left-3 right-3">
                        <span className="text-xs font-bold text-white bg-orange-600/80 px-2 py-1 rounded backdrop-blur-md">
                          {related.category}
                        </span>
                      </div>
                    </div>
                    <div className="p-4">
                      <h4 className="font-bold text-white text-lg leading-tight mb-2 line-clamp-1 group-hover:text-orange-400 transition-colors">
                        {related.title}
                      </h4>
                      <div className="flex items-center gap-4 text-xs text-slate-400 mb-3">
                        <span className="flex items-center gap-1">
                          <Calendar size={12} />
                          {new Date(related.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin size={12} />
                          {related.city}
                        </span>
                      </div>
                      <div className="font-bold text-emerald-400">
                        {formatCurrency(related.price)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Barre flottante Mobile de Conversion (Sticky Bottom Tab) - Root Level */}
      {!isSoldOut && !isCheckoutOpen && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-[100] animate-in slide-in-from-bottom duration-500">
          <div className="bg-[#1e293b]/95 backdrop-blur-2xl border-t border-white/10 p-4 pb-6 shadow-[0_-15px_40px_rgba(0,0,0,0.6)] flex flex-col gap-3">
            {totalItems > 0 ? (
              <>
                <div className="flex justify-between items-center text-sm px-1">
                  <span className="text-slate-300 truncate font-bold text-[13px] tracking-wide uppercase">
                    {Object.entries(cart).filter(([_, qty]) => qty > 0).length === 1
                      ? event.ticketTypes?.find(t => t.id === Object.keys(cart).find(id => cart[id] > 0))?.name
                      : 'Plusieurs billets'}
                  </span>
                  <span className="text-white font-black text-lg drop-shadow-lg">{formatCurrency(totalAmount)}</span>
                </div>

                <div className="flex gap-3 items-center">
                  {/* Contrôleur Global - Visible si un seul type de billet sélectionné */}
                  {Object.entries(cart).filter(([_, qty]) => qty > 0).length === 1 && (
                    <div className="flex items-center justify-between bg-black/40 rounded-xl p-1 w-[120px] border border-white/10 shadow-inner">
                      <button
                        onClick={() => handleTicketChange(Object.keys(cart).find(id => cart[id] > 0) || '', -1)}
                        className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors active:scale-95"
                      >-</button>
                      <span className="font-mono font-bold text-white text-base leading-none translate-y-[1px]">{totalItems}</span>
                      <button
                        onClick={() => handleTicketChange(Object.keys(cart).find(id => cart[id] > 0) || '', 1)}
                        className="w-10 h-10 flex items-center justify-center rounded-lg bg-orange-600/20 hover:bg-orange-600/40 text-orange-400 transition-colors active:scale-95"
                      >+</button>
                    </div>
                  )}

                  <button
                    onClick={() => setIsCheckoutOpen(true)}
                    className="flex-1 bg-gradient-to-r from-orange-600 to-amber-500 active:scale-95 hover:brightness-110 text-white py-4 px-2 rounded-xl font-black text-[15px] shadow-[0_0_25px_rgba(249,115,22,0.5)] transition-all flex items-center justify-center gap-2 whitespace-nowrap animate-glow-pulse tracking-wide"
                  >
                    <Ticket size={18} /> Réserver ma place
                  </button>
                </div>
              </>
            ) : (
              <div className="flex justify-between items-center gap-4">
                <div className="flex flex-col pl-1">
                  <span className="text-slate-400 font-bold text-[11px] uppercase tracking-widest shadow-sm">Total</span>
                  <span className="text-slate-500 font-black text-2xl truncate">0 F</span>
                </div>
                <button
                  onClick={() => {
                    const el = document.getElementById('ticket-section') || document.querySelector('.sticky.top-24');
                    if (el) {
                      const y = el.getBoundingClientRect().top + window.scrollY - 100;
                      window.scrollTo({ top: y, behavior: 'smooth' });
                    } else {
                      window.scrollTo({ top: document.body.scrollHeight / 2, behavior: 'smooth' });
                    }
                  }}
                  className="flex-1 bg-slate-800 text-slate-300 hover:text-white border border-slate-700 py-4 px-4 rounded-xl font-bold text-[15px] shadow-inner flex items-center justify-center gap-2 transition-colors active:scale-95"
                  title="Aller vers la section des billets"
                >
                  <Ticket className="text-orange-400" size={18} /> Obtenir mon accès
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Share Modal */}
      {isShareModalOpen && (
        <ShareModal
          event={event}
          onClose={() => setIsShareModalOpen(false)}
        />
      )}

      {/* Checkout Modal */}
      {isCheckoutOpen && event && (
        <CheckoutModal
          total={totalAmount}
          cart={cart}
          onClose={(completed) => handleCheckoutClose(completed)}
          eventName={event.title}
          eventData={event}
          participantName={participantName}
          setParticipantName={setParticipantName}
        />
      )}
    </div>
  );
};

// --- Sub Components ---

const EventDetailsSkeleton: React.FC = () => (
  <div className="relative min-h-screen pb-24 animate-pulse bg-[#0f172a]">
    {/* Hero Skeleton */}
    <div className="relative h-[60vh] w-full bg-slate-800">
      <div className="absolute bottom-0 left-0 w-full p-6 md:p-12 max-w-7xl mx-auto space-y-4">
        <div className="w-32 h-6 bg-slate-700 rounded-full" />
        <div className="w-2/3 h-12 md:h-16 bg-slate-700 rounded-xl" />
        <div className="flex gap-4">
          <div className="w-32 h-10 bg-slate-700 rounded-xl" />
          <div className="w-32 h-10 bg-slate-700 rounded-xl" />
          <div className="w-48 h-10 bg-slate-700 rounded-xl" />
        </div>
      </div>
    </div>

    <div className="max-w-7xl mx-auto px-4 md:px-8 -mt-8 relative z-10">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content Skeleton */}
        <div className="lg:col-span-2 space-y-8">
          <div className="h-14 bg-slate-800 rounded-2xl border border-white/5" />
          <div className="bg-slate-800 rounded-3xl border border-white/5 p-8 h-96">
            <div className="w-48 h-8 bg-slate-700 rounded-lg mb-6" />
            <div className="space-y-4">
              <div className="w-full h-4 bg-slate-700 rounded" />
              <div className="w-full h-4 bg-slate-700 rounded" />
              <div className="w-3/4 h-4 bg-slate-700 rounded" />
            </div>
            <div className="grid grid-cols-2 gap-4 mt-8">
              <div className="h-48 bg-slate-700 rounded-xl" />
              <div className="h-48 bg-slate-700 rounded-xl" />
            </div>
          </div>
        </div>

        {/* Sidebar Skeleton */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 space-y-4">
            <div className="h-[500px] bg-slate-800 rounded-3xl border border-white/5 p-6">
              <div className="w-40 h-8 bg-slate-700 rounded-lg mb-8" />
              <div className="space-y-4">
                <div className="h-24 bg-slate-700 rounded-xl" />
                <div className="h-24 bg-slate-700 rounded-xl" />
                <div className="h-24 bg-slate-700 rounded-xl" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const ShareModal: React.FC<{ event: Event | null; onClose: () => void }> = ({ event, onClose }) => {
  if (!event) return null;

  const shareUrl = window.location.href;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareUrl);
    alert('Lien copié !');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#1e293b] w-full max-w-sm rounded-2xl border border-white/10 shadow-2xl p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white"
        >
          <X size={20} />
        </button>

        <h3 className="text-xl font-bold text-white mb-6">Partager cet événement</h3>

        <div className="grid grid-cols-4 gap-4 mb-6">
          <button className="flex flex-col items-center gap-2 group">
            <div className="w-12 h-12 rounded-full bg-[#1877F2]/20 text-[#1877F2] flex items-center justify-center group-hover:bg-[#1877F2] group-hover:text-white transition-colors">
              <Facebook size={20} />
            </div>
            <span className="text-xs text-slate-400">Facebook</span>
          </button>
          <button className="flex flex-col items-center gap-2 group">
            <div className="w-12 h-12 rounded-full bg-[#1DA1F2]/20 text-[#1DA1F2] flex items-center justify-center group-hover:bg-[#1DA1F2] group-hover:text-white transition-colors">
              <Twitter size={20} />
            </div>
            <span className="text-xs text-slate-400">Twitter</span>
          </button>
          <button className="flex flex-col items-center gap-2 group">
            <div className="w-12 h-12 rounded-full bg-[#0A66C2]/20 text-[#0A66C2] flex items-center justify-center group-hover:bg-[#0A66C2] group-hover:text-white transition-colors">
              <Linkedin size={20} />
            </div>
            <span className="text-xs text-slate-400">LinkedIn</span>
          </button>
          <button onClick={copyToClipboard} className="flex flex-col items-center gap-2 group">
            <div className="w-12 h-12 rounded-full bg-slate-700 text-slate-300 flex items-center justify-center group-hover:bg-slate-600 group-hover:text-white transition-colors">
              <Copy size={20} />
            </div>
            <span className="text-xs text-slate-400">Copier</span>
          </button>
        </div>

        <div className="bg-slate-900 rounded-lg p-3 flex items-center justify-between border border-white/5">
          <span className="text-slate-400 text-xs truncate max-w-[200px]">{shareUrl}</span>
          <button onClick={copyToClipboard} className="text-orange-400 text-xs font-bold hover:text-orange-300">
            Copier
          </button>
        </div>
      </div>
    </div>
  );
};

const CheckoutModal: React.FC<{
  total: number;
  eventName: string;
  eventData: Event;
  cart: Record<string, number>;
  participantName: string;
  setParticipantName: (name: string) => void;
  onClose: (completed?: boolean) => void
}> = ({ total, eventName, eventData, cart, participantName, setParticipantName, onClose }) => {
  const eId = eventData.id;
  const [step, setStep] = useState<any>(() => sessionStorage.getItem(`checkout_step_${eId}`) || 'auth');
  const [contactMethod, setContactMethod] = useState<'wa' | 'email'>(() => (sessionStorage.getItem(`checkout_method_${eId}`) as any) || 'wa');
  const [contactValue, setContactValue] = useState(() => sessionStorage.getItem(`checkout_contact_${eId}`) || '');
  const [paymentMode, setPaymentMode] = useState<'full' | 'installment'>(() => (sessionStorage.getItem(`checkout_mode_${eId}`) as any) || 'full');
  const [visitorCountryCode, setVisitorCountryCode] = useState('CI');

  // Persistence for internal modal state
  useEffect(() => {
    // Ne jamais sauvegarder 'processing' car si la page recharge, 
    // la promesse réseau est perdue et on resterait bloqué indéfiniment.
    if (step !== 'processing') {
      sessionStorage.setItem(`checkout_step_${eId}`, step);
    }
    sessionStorage.setItem(`checkout_method_${eId}`, contactMethod);
    sessionStorage.setItem(`checkout_contact_${eId}`, contactValue);
    sessionStorage.setItem(`checkout_mode_${eId}`, paymentMode);
  }, [eId, step, contactMethod, contactValue, paymentMode]);

  const visitorCountry = PAYMENT_ROUTING[visitorCountryCode];
  const displayCurrency = visitorCountry?.currency || 'XOF';

  const convertedTotal = convertCurrency(total, 'XOF', displayCurrency);

  // Toggles Admin Actifs
  const [activeGateways, setActiveGateways] = useState({
    paystack: true, pawapay: true, feexpay: false, intouch: false, paydunya: false
  });
  const [buyerLocation, setBuyerLocation] = useState<any>(null);

  useEffect(() => {
    const loadToggles = async () => {
      const toggles = await getPlatformSetting<typeof activeGateways>('payment_toggles');
      if (toggles) setActiveGateways(toggles);
    };
    loadToggles();

    // Robustly capture buyer's approximate location via IP with fallbacks
    const fetchLocation = async () => {
      try {
        // Source 1: ipwho.is (très permissif côté CORS)
        const res1 = await fetch('https://ipwho.is/');
        const data1 = await res1.json();
        if (data1.success && data1.latitude) {
          setBuyerLocation({ lat: data1.latitude, lng: data1.longitude, city: data1.city, country: data1.country });
          return;
        }
      } catch (e) { }

      try {
        // Source 2: freeipapi
        const res2 = await fetch('https://freeipapi.com/api/json');
        const data2 = await res2.json();
        if (data2.latitude) {
          setBuyerLocation({ lat: data2.latitude, lng: data2.longitude, city: data2.cityName, country: data2.countryName });
          return;
        }
      } catch (e) { }

      try {
        // Source 3: ipapi.co (souvent bloqué en 429)
        const res3 = await fetch('https://ipapi.co/json/');
        const data3 = await res3.json();
        if (data3.latitude) {
          setBuyerLocation({ lat: data3.latitude, lng: data3.longitude, city: data3.city, country: data3.country_name });
        }
      } catch (e) {
        console.log('Location fetch entirely failed or blocked');
      }
    };
    fetchLocation();
  }, []);

  // Custom Payment Form States
  const [momoPhone, setMomoPhone] = useState(() => sessionStorage.getItem(`checkout_momo_phone_${eId}`) || '');
  const [momoNetwork, setMomoNetwork] = useState(() => sessionStorage.getItem(`checkout_momo_net_${eId}`) || 'ORANGE_CI');
  const [feexpayPhone, setFeexpayPhone] = useState(() => sessionStorage.getItem(`checkout_feex_phone_${eId}`) || '');
  const [feexpayNetwork, setFeexpayNetwork] = useState(() => sessionStorage.getItem(`checkout_feex_net_${eId}`) || 'MTN_BJ');
  const [intouchPhone, setIntouchPhone] = useState(() => sessionStorage.getItem(`checkout_intouch_phone_${eId}`) || '');
  const [intouchNetwork, setIntouchNetwork] = useState(() => sessionStorage.getItem(`checkout_intouch_net_${eId}`) || 'ORANGE_SN');
  const [paydunyaPhone, setPaydunyaPhone] = useState(() => sessionStorage.getItem(`checkout_paydunya_phone_${eId}`) || '');
  const [paydunyaNetwork, setPaydunyaNetwork] = useState(() => sessionStorage.getItem(`checkout_paydunya_net_${eId}`) || 'orange-money-senegal');
  const [cardDetails, setCardDetails] = useState({ number: '', expiry: '', cvv: '' });

  // Persistence for internal form states
  useEffect(() => {
    sessionStorage.setItem(`checkout_momo_phone_${eId}`, momoPhone);
    sessionStorage.setItem(`checkout_momo_net_${eId}`, momoNetwork);
    sessionStorage.setItem(`checkout_feex_phone_${eId}`, feexpayPhone);
    sessionStorage.setItem(`checkout_feex_net_${eId}`, feexpayNetwork);
    sessionStorage.setItem(`checkout_intouch_phone_${eId}`, intouchPhone);
    sessionStorage.setItem(`checkout_intouch_net_${eId}`, intouchNetwork);
    sessionStorage.setItem(`checkout_paydunya_phone_${eId}`, paydunyaPhone);
    sessionStorage.setItem(`checkout_paydunya_net_${eId}`, paydunyaNetwork);
  }, [eId, momoPhone, momoNetwork, feexpayPhone, feexpayNetwork, intouchPhone, intouchNetwork, paydunyaPhone, paydunyaNetwork]);

  const navigate = useNavigate();

  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactValue || contactValue.trim() === '') {
      alert("Veuillez entrer un contact valide.");
      return;
    }

    // Concaténer l'indicatif si c'est un numéro WhatsApp qui ne commence pas déjà par un +
    let finalContact = contactValue;
    if (contactMethod === 'wa' && !contactValue.startsWith('+')) {
      const dialCode = visitorCountry?.dialCode || '+225';
      finalContact = `${dialCode}${contactValue.replace(/^0+/, '')}`; // Enlève le 0 initial éventuel
      setContactValue(finalContact); // Met à jour l'état visuel et global
    }

    // Simulation envoi OTP retirée
    // On passe directement à l'étape de paiement
    setStep('method');
  };



  const finalizeCheckout = async (transactionRef?: string, paymentMethod?: string) => {
    const amountToPay = paymentMode === 'installment' ? total / 3 : total;

    try {
      // --- FAST PATH: Ticket Generation & Local Storage (Zero Network Dependency) ---
      const ticketId = `tix-${Date.now()}`;
      let signedToken = "LOCKED_INSTALLMENT";

      try {
        if (paymentMode === 'full') {
          signedToken = await signTicket({
            tId: ticketId,
            eId: eventData.id,
            type: "Standard",
            usr: participantName || "Participant Anonyme"
          });
        }
      } catch (err) {
        console.error("Signature offline failed", err);
        signedToken = "ERROR_SIGNATURE";
      }

      const organizerProfile = (eventData as any).profiles;
      const finalOrganizerName = organizerProfile?.company || organizerProfile?.name || (eventData as any).organizer_name || "Organisateur";

      const offlineTicket = {
        id: ticketId,
        eventName: eventData.title,
        eventDate: eventData.date,
        location: eventData.location,
        image: eventData.image,
        qrCode: signedToken,
        holder: participantName || "Participant Anonyme",
        type: "Standard",
        purchaseDate: new Date().toISOString(),
        paymentStatus: paymentMode === 'installment' ? 'partial' : 'paid',
        amountPaid: amountToPay,
        totalAmount: total,
        installmentsPaid: paymentMode === 'installment' ? 1 : 3,
        installmentsTotal: 3,
        contactDetail: contactValue,
        organizerName: finalOrganizerName,
        organizerLogo: organizerProfile?.avatar || null
      };

      // 1. Sauvegarde locale ultra-rapide (débloque l'UI)
      await saveSecureTicket(offlineTicket);

      // 2. Mettre à jour l'UI AVANT les appels réseaux lents !
      setStep('success');

      // --- SLOW PATH: Network Calls in Background (Fire and Forget) ---
      (async () => {
        try {
          const { error: trxError, data: trxData } = await supabase.from('transactions').insert([{
            event_id: eventData.id,
            amount: amountToPay,
            commission_rate: eventData.commission_rate || 8.0,
            commission_amount: Math.round(amountToPay * (Number(eventData.commission_rate || 8.0) / 100)),
            currency: displayCurrency,
            method: paymentMethod || (transactionRef ? 'paystack_card' : 'other_mobile'),
            status: 'completed',
            guest_email: contactMethod === 'email' ? contactValue : null,
            buyer_phone: contactMethod === 'wa' ? contactValue : null,
            guest_name: participantName || 'Guest User',
            buyer_location: buyerLocation
          }]).select().single();
          if (trxError) console.error("Supabase Transaction Error:", trxError);

          // A2. Supabase Ticket Backup Insert (For Revocation & Centralized Stats)
          const backupTicket = {
            id: ticketId, // Using the offline-generated ID
            event_id: eventData.id,
            transaction_id: trxData?.id || null,
            guest_name: participantName || 'Guest User',
            guest_email: contactValue, // Stores email OR phone for recovery
            status: 'valid',
            ticket_type: Object.keys(cart).find(id => cart[id] > 0) || 'Standard',
            qr_code: signedToken
          };

          const { error: tErr } = await supabase.from('tickets').insert([backupTicket]);
          if (tErr) console.error("Supabase Ticket Backup Error:", tErr);

          // B. Update Sales Stats
          const totalTicketsBought = Object.values(cart).reduce((a, b) => a + b, 0);
          await supabase.rpc('increment_event_sold', { evt_id: eventData.id, amount: totalTicketsBought });
          for (const [tId, qty] of Object.entries(cart)) {
            if (qty > 0) await supabase.rpc('increment_ticket_type_sold', { tt_id: tId, amount: qty });
          }

          // C. Affiliation Update
          const affiliateRef = sessionStorage.getItem('afriTix_affiliate_ref');
          if (affiliateRef) {
            const affiliateConfig = await getPlatformSetting<{ type: string; value: number }>('affiliate_config');
            let commission = (amountToPay * 10) / 100;
            if (affiliateConfig) commission = affiliateConfig.type === 'percentage' ? (amountToPay * affiliateConfig.value) / 100 : affiliateConfig.value;
            const { data: linkInfo } = await supabase.from('affiliate_links').select('id, sales, commission_earned').eq('unique_code', affiliateRef).single();
            if (linkInfo) {
              await supabase.from('affiliate_links')
                .update({ sales: (linkInfo.sales || 0) + 1, commission_earned: Number(linkInfo.commission_earned || 0) + commission })
                .eq('id', linkInfo.id);
            }
          }

          // D. Email Notification
          if (contactMethod === 'email' && paymentMode === 'full') {
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(offlineTicket.qrCode)}`;
            const emailData = await EmailService.buildFromTemplate('ticket_purchase', {
              eventTitle: eventData.title,
              ticketType: offlineTicket.type,
              eventDate: new Date(eventData.date).toLocaleString(),
              qrUrl: qrUrl,
              jwsData: offlineTicket.qrCode
            });
            await EmailService.sendTicketEmail(contactValue, emailData.subject, emailData.html);
          }

          // E. WhatsApp Notifications
          if (contactMethod === 'wa' && paymentMode === 'full') {
            const ticketMessage = `🎉 Félicitations pour votre achat !\n\nVoici votre billet pour l'événement *${eventData.title}*.\nDate: ${new Date(eventData.date).toLocaleString('fr-FR')}\nLieu: ${eventData.location}, ${eventData.city}\nReference: ${transactionRef || ticketId}\n\nPrésentez ce QR Code à l'entrée. À très vite !`;
            const mockQrImageUrl = "https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=" + encodeURIComponent(offlineTicket.qrCode);
            await WhatsAppService.sendMediaMessage(contactValue, ticketMessage, mockQrImageUrl);
          } else if (contactMethod === 'wa' && paymentMode === 'installment') {
            await WhatsAppService.sendMessage(contactValue, `⏳ Réservation validée pour *${eventData.title}*. 1ère tranche payée.`);
          }

          // Tâche asynchrone pour le PDF
          if (paymentMode === 'full') {
            generateTicketPDF(offlineTicket).catch(console.error);
          }
        } catch (backgroundError) {
          console.error("Background processing error:", backgroundError);
        }
      })();

    } catch (err) {
      console.error("Critical error in finalizeCheckout:", err);
      alert("Erreur critique. Votre paiement est validé mais le billet n'a pas pu être sauvegardé localement.");
      setStep('success');
    }
  };

  const handleCardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStep('processing');
    try {
      const amountToPay = paymentMode === 'installment' ? total / 3 : total;

      // Valider la configuration Paystack avant de lancer
      let config;
      try {
        config = await PaystackService.getConfig();
        if (!config || !config.publicKey) throw new Error("Clé introuvable.");
        if (!config.publicKey.startsWith('pk_')) throw new Error("Clé publique invalide.");
      } catch (configErr: any) {
        console.error("Erreur de configuration Paystack:", configErr);
        alert("Configuration Paystack invalide. Contactez l'administrateur.");
        setStep('pay_card');
        return;
      }

      if (!(window as any).PaystackPop) {
        console.error("PaystackPop script is not loaded");
        alert("Le script de paiement Paystack n'est pas chargé. Veuillez rafraîchir la page.");
        setStep('pay_card');
        return;
      }

      const handler = (window as any).PaystackPop.setup({
        key: config.publicKey,
        email: contactValue || 'user@afritix.com',
        amount: Math.round(amountToPay * 100), // Paystack attend des centimes (entier)
        currency: 'XOF',
        ref: 'afritix_' + Math.floor((Math.random() * 1000000000) + 1),
        callback: function (response: any) {
          if (response.status === 'success') {
            finalizeCheckout(response.reference, 'paystack_card');
          } else {
            alert('Paiement échoué ou annulé.');
            setStep('pay_card');
          }
        },
        onClose: function () {
          setStep('pay_card'); // L'utilisateur a fermé le popup
        }
      });
      handler.openIframe();
    } catch (err: any) {
      console.error("Erreur lancement Paystack", err);
      alert(err.message || 'Erreur lors du lancement de Paystack');
      setStep('pay_card');
    }
  };

  const handleMomoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStep('processing');
    try {
      const amountToPay = paymentMode === 'installment' ? total / 3 : total;

      // Auto-timeout après 5 minutes (300s) comme demandé par l'utilisateur
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Délai d'attente de 5 minutes dépassé.")), 300000));
      const res: any = await Promise.race([PawaPayService.requestUSSDPush(momoPhone, amountToPay, momoNetwork), timeoutPromise]);

      if (res.success) {
        await finalizeCheckout(res.pawaId, 'pawapay_momo');
      } else {
        alert("Paiement Mobile Money échoué.");
        setStep('pay_momo');
      }
    } catch (err: any) {
      alert(err.message || 'Le paiement a échoué ou a expiré.');
      setStep('pay_momo');
    }
  };

  const handleFeexpaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStep('processing');
    try {
      const amountToPay = paymentMode === 'installment' ? total / 3 : total;
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Délai de 5 min dépassé.")), 300000));
      const res: any = await Promise.race([
        FeexpayService.processMobileMoney({ phone: feexpayPhone, amount: amountToPay, country: 'BJ', network: feexpayNetwork }),
        timeoutPromise
      ]);

      if (res.success) {
        await finalizeCheckout(res.transactionId, 'feexpay_momo');
      } else {
        alert("Paiement FeexPay échoué.");
        setStep('pay_feexpay');
      }
    } catch (err: any) {
      alert(err.message || "Erreur service.");
      setStep('pay_feexpay');
    }
  };

  const handleIntouchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStep('processing');
    try {
      const amountToPay = paymentMode === 'installment' ? total / 3 : total;
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Délai de 5 min dépassé.")), 300000));
      const res: any = await Promise.race([
        IntouchService.processMobilePayment({ phone: intouchPhone, amount: amountToPay, provider: intouchNetwork }),
        timeoutPromise
      ]);

      if (res.success) {
        await finalizeCheckout(res.transactionId, 'intouch_momo');
      } else {
        alert("Paiement InTouch échoué.");
        setStep('pay_intouch');
      }
    } catch (err: any) {
      alert(err.message || "Erreur connexion.");
      setStep('pay_intouch');
    }
  };

  const handlePaydunyaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStep('processing');
    try {
      const amountToPay = paymentMode === 'installment' ? total / 3 : total;
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Délai de 5 min dépassé.")), 300000));
      const res: any = await Promise.race([
        PaydunyaService.processMobilePayment({ phone: paydunyaPhone, amount: amountToPay, provider: paydunyaNetwork }),
        timeoutPromise
      ]);

      if (res.success) {
        await finalizeCheckout(res.transactionId, 'paydunya_momo');
      } else {
        alert("Paiement PayDunya échoué.");
        setStep('pay_paydunya');
      }
    } catch (err: any) {
      alert(err.message || "Erreur PayDunya.");
      setStep('pay_paydunya');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#1e293b] w-full max-w-md rounded-2xl border border-white/10 shadow-2xl overflow-hidden">

        {step === 'auth' && (
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">Création Billet</h3>
              <button onClick={() => onClose(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>

            {/* Country Selector */}
            <div className="mb-6 bg-slate-800/50 p-3 rounded-xl border border-white/5 flex flex-col gap-2">
              <span className="text-slate-300 text-sm font-medium">Votre pays de localisation</span>
              <select
                value={visitorCountryCode}
                onChange={e => setVisitorCountryCode(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-orange-500"
              >
                {Object.values(PAYMENT_ROUTING).map(country => (
                  <option key={country.code} value={country.code}>
                    {country.name} ({country.currency})
                  </option>
                ))}
              </select>
            </div>

            <p className="text-slate-300 text-sm mb-6">Comment souhaitez-vous recevoir ce billet ?</p>

            <div className="flex bg-slate-800 p-1 rounded-xl mb-6">
              <button
                onClick={() => setContactMethod('wa')}
                className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors ${contactMethod === 'wa' ? 'bg-orange-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                <Smartphone size={16} /> WhatsApp
              </button>
              <button
                onClick={() => setContactMethod('email')}
                className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors ${contactMethod === 'email' ? 'bg-orange-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                <Mail size={16} /> Email
              </button>
            </div>

            <form onSubmit={handleSendOtp}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-2">Prénom et Nom du Participant</label>
                <input
                  type="text"
                  value={participantName}
                  onChange={(e) => setParticipantName(e.target.value)}
                  placeholder="Ex: Jean Dupont"
                  className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all font-medium"
                  required
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  {contactMethod === 'wa' ? 'Numéro WhatsApp (Réception du billet)' : 'Adresse Email (Réception du billet)'}
                </label>
                <div className="relative flex items-center">
                  {contactMethod === 'wa' && (
                    <div className="absolute left-0 top-0 bottom-0 flex items-center justify-center bg-slate-800/80 border-y border-l border-slate-700 rounded-l-xl px-3 text-slate-300 font-mono font-bold text-sm">
                      {visitorCountry?.dialCode || '+225'}
                    </div>
                  )}
                  <input
                    type={contactMethod === 'wa' ? 'tel' : 'email'}
                    value={contactValue}
                    onChange={(e) => setContactValue(e.target.value)}
                    placeholder={contactMethod === 'wa' ? '01 23 45 67 89' : 'jean@exemple.com'}
                    className={`w-full bg-slate-900/60 border border-slate-700 rounded-xl py-3 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all font-mono ${contactMethod === 'wa' ? 'pl-16 pr-4' : 'px-4'}`}
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-white text-slate-900 rounded-xl font-bold hover:bg-slate-200 transition-colors"
              >
                Continuer
              </button>
            </form>
          </div>
        )}



        {step === 'method' && (
          <div className="p-6 animate-in fade-in slide-in-from-right-4">
            <div className="flex justify-between items-center mb-6">
              <button onClick={() => setStep('auth')} className="text-slate-400 hover:text-white"><ArrowLeft size={20} /></button>
              <h3 className="text-xl font-bold text-white">Paiement</h3>
              <button onClick={() => onClose(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>

            <div className="bg-slate-800/50 p-4 rounded-xl mb-6 border border-white/5">
              <div className="mb-4">
                <p className="text-sm font-medium text-slate-300 mb-2">Mode de paiement</p>
                <div className="flex gap-2 bg-slate-900/50 p-1 rounded-xl">
                  <button
                    onClick={() => setPaymentMode('full')}
                    className={`flex-1 flex flex-col items-center justify-center p-2 rounded-lg border transition-all ${paymentMode === 'full' ? 'bg-orange-600/20 border-orange-500 text-white shadow-[0_0_15px_rgba(249,115,22,0.15)]' : 'border-transparent text-slate-400 hover:bg-slate-800'}`}
                  >
                    <span className="font-bold text-sm">Totalité</span>
                  </button>
                  <button
                    onClick={() => setPaymentMode('installment')}
                    className={`flex-1 flex flex-col items-center justify-center p-2 rounded-lg border transition-all relative ${paymentMode === 'installment' ? 'bg-amber-500/10 border-amber-500 text-amber-100 shadow-[0_0_15px_rgba(245,158,11,0.15)]' : 'border-transparent text-slate-400 hover:bg-slate-800'}`}
                  >
                    <span className="font-bold flex items-center gap-1 text-sm">3 Fois <span className="bg-amber-500 text-amber-950 text-[9px] px-1 rounded uppercase font-black">Tontine</span></span>
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-end border-t border-white/10 pt-4">
                <div>
                  <p className="text-slate-400 text-sm mb-1">{paymentMode === 'installment' ? 'À payer maintenant (1/3)' : 'Total à payer'}</p>
                  <p className="text-slate-500 text-xs truncate max-w-[150px]">{eventName}</p>
                </div>
                <div className="text-3xl font-black text-white">{formatCurrency(paymentMode === 'installment' ? convertedTotal / 3 : convertedTotal, displayCurrency)}</div>
              </div>
            </div>

            <p className="text-sm font-medium text-slate-300 mb-3">Choisir un moyen de paiement ({visitorCountry?.name})</p>
            <div className="space-y-3">

              {visitorCountry?.gateways.map(gatewayConfig => {
                // Vérifier si cette passerelle a été activée par l'admin Panafricain
                const isGatewayActive = activeGateways[gatewayConfig.id as keyof typeof activeGateways];
                if (!isGatewayActive) return null;

                if (gatewayConfig.id === 'pawapay' && gatewayConfig.methods.includes('momo')) {
                  return (
                    <button
                      key="pawapay"
                      onClick={() => {
                        setMomoNetwork(gatewayConfig.operators?.[0] || 'ORANGE_CI'); // Auto-sélection
                        setStep('pay_momo');
                      }}
                      className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-700 bg-slate-800/50 hover:border-orange-500 hover:bg-orange-500/10 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center">
                          <Smartphone size={20} />
                        </div>
                        <div className="text-left">
                          <p className="text-white font-bold group-hover:text-orange-300 transition-colors">Mobile Money (PawaPay)</p>
                          <p className="text-xs text-slate-500">{gatewayConfig.operators?.join(', ')}</p>
                        </div>
                      </div>
                      <div className="w-5 h-5 rounded-full border-2 border-slate-600 group-hover:border-orange-500"></div>
                    </button>
                  );
                }

                if (gatewayConfig.id === 'feexpay' && gatewayConfig.methods.includes('momo')) {
                  return (
                    <button
                      key="feexpay"
                      onClick={() => {
                        setFeexpayNetwork(gatewayConfig.operators?.[0] || 'MTN_BJ');
                        setStep('pay_feexpay');
                      }}
                      className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-700 bg-slate-800/50 hover:border-green-500 hover:bg-green-500/10 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center font-bold">F</div>
                        <div className="text-left">
                          <p className="text-white font-bold group-hover:text-green-300 transition-colors">FeexPay</p>
                          <p className="text-xs text-slate-500">{gatewayConfig.operators?.join(', ')}</p>
                        </div>
                      </div>
                      <div className="w-5 h-5 rounded-full border-2 border-slate-600 group-hover:border-green-500"></div>
                    </button>
                  );
                }

                if (gatewayConfig.id === 'intouch' && gatewayConfig.methods.includes('momo')) {
                  return (
                    <button
                      key="intouch"
                      onClick={() => {
                        setIntouchNetwork(gatewayConfig.operators?.[0] || 'ORANGE_SN');
                        setStep('pay_intouch');
                      }}
                      className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-700 bg-slate-800/50 hover:border-red-500 hover:bg-red-500/10 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center font-bold">I</div>
                        <div className="text-left">
                          <p className="text-white font-bold group-hover:text-red-300 transition-colors">InTouch</p>
                          <p className="text-xs text-slate-500">{gatewayConfig.operators?.join(', ')}</p>
                        </div>
                      </div>
                      <div className="w-5 h-5 rounded-full border-2 border-slate-600 group-hover:border-red-500"></div>
                    </button>
                  );
                }

                if (gatewayConfig.id === 'paydunya' && gatewayConfig.methods.includes('momo')) {
                  return (
                    <button
                      key="paydunya"
                      onClick={() => {
                        setPaydunyaNetwork(gatewayConfig.operators?.[0] || 'orange-money-senegal');
                        setStep('pay_paydunya');
                      }}
                      className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-700 bg-slate-800/50 hover:border-blue-500 hover:bg-blue-500/10 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center font-bold">P</div>
                        <div className="text-left">
                          <p className="text-white font-bold group-hover:text-blue-300 transition-colors">PayDunya</p>
                          <p className="text-xs text-slate-500">{gatewayConfig.operators?.join(', ')}</p>
                        </div>
                      </div>
                      <div className="w-5 h-5 rounded-full border-2 border-slate-600 group-hover:border-blue-500"></div>
                    </button>
                  );
                }

                if (gatewayConfig.id === 'paystack' && gatewayConfig.methods.includes('card')) {
                  return (
                    <button
                      key="paystack_card"
                      onClick={() => setStep('pay_card')}
                      className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-700 bg-slate-800/50 hover:border-indigo-500 hover:bg-indigo-500/10 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-500/20 text-indigo-500 flex items-center justify-center">
                          <CreditCard size={20} />
                        </div>
                        <div className="text-left">
                          <p className="text-white font-bold group-hover:text-indigo-300 transition-colors">Carte Bancaire (Paystack)</p>
                          <p className="text-xs text-slate-500">Visa, Mastercard</p>
                        </div>
                      </div>
                      <div className="w-5 h-5 rounded-full border-2 border-slate-600 group-hover:border-indigo-500"></div>
                    </button>
                  );
                }

                return null;
              })}

              {(!visitorCountry || !visitorCountry.gateways.some(g => activeGateways[g.id as keyof typeof activeGateways])) && (
                <div className="p-4 text-center border-dashed border border-slate-700 rounded-xl">
                  <p className="text-slate-400 text-sm">Aucun moyen de paiement activé pour ce pays.</p>
                </div>
              )}
            </div>

            <div className="mt-6 text-center">
              <p className="text-xs text-slate-500 flex items-center justify-center gap-1">
                <ShieldCheck size={12} /> Transaction cryptée et sécurisée
              </p>
            </div>
          </div>
        )}

        {step === 'pay_momo' && (
          <div className="p-6 animate-in fade-in slide-in-from-right-4">
            <div className="flex justify-between items-center mb-6">
              <button onClick={() => setStep('method')} className="text-slate-400 hover:text-white"><ArrowLeft size={20} /></button>
              <h3 className="text-xl font-bold text-white">Mobile Money</h3>
              <button onClick={() => onClose(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>

            <p className="text-slate-300 text-sm mb-6">Paiement sécurisé via PawaPay</p>

            <form onSubmit={handleMomoSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-2">Réseau</label>
                <select
                  value={momoNetwork}
                  onChange={e => setMomoNetwork(e.target.value)}
                  className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 font-bold"
                >
                  <option value="ORANGE_CI">Orange CI</option>
                  <option value="MTN_CI">MTN CI</option>
                  <option value="WAVE_CI">Wave CI</option>
                  <option value="MOOV_CI">Moov CI</option>
                </select>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-300 mb-2">Numéro Mobile Money</label>
                <input
                  type="tel"
                  value={momoPhone}
                  onChange={(e) => setMomoPhone(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="Ex: 0102030405"
                  className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 font-mono text-lg tracking-wider"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-orange-600 to-amber-500 text-white rounded-xl font-bold transition-all hover:shadow-[0_0_20px_rgba(249,115,22,0.4)]"
              >
                Payer {formatCurrency(paymentMode === 'installment' ? total / 3 : total)}
              </button>
            </form>
          </div>
        )}

        {step === 'pay_card' && (
          <div className="p-6 animate-in fade-in slide-in-from-right-4">
            <div className="flex justify-between items-center mb-6">
              <button onClick={() => setStep('method')} className="text-slate-400 hover:text-white"><ArrowLeft size={20} /></button>
              <h3 className="text-xl font-bold text-white">Carte Bancaire</h3>
              <button onClick={() => onClose(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>

            <p className="text-slate-300 text-sm mb-6 flex items-center justify-center gap-2">
              <ShieldCheck size={16} className="text-emerald-500" /> API Sécurisée Paystack
            </p>

            <div className="text-center mb-6">
              <p className="text-sm text-slate-400">Vous allez être redirigé(e) vers la passerelle sécurisée Paystack pour finaliser le paiement par carte Visa ou Mastercard.</p>
            </div>

            <form onSubmit={handleCardSubmit}>
              <button
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white rounded-xl font-bold transition-all hover:shadow-[0_0_20px_rgba(79,70,229,0.4)]"
              >
                Ouvrir Paystack et Payer {formatCurrency(paymentMode === 'installment' ? total / 3 : total)}
              </button>
            </form>
          </div>
        )}

        {step === 'pay_feexpay' && (
          <div className="p-6 animate-in fade-in slide-in-from-right-4">
            <div className="flex justify-between items-center mb-6">
              <button onClick={() => setStep('method')} className="text-slate-400 hover:text-white"><ArrowLeft size={20} /></button>
              <h3 className="text-xl font-bold text-white">FeexPay</h3>
              <button onClick={() => onClose(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>

            <p className="text-slate-300 text-sm mb-6 flex items-center gap-2">
              <ShieldCheck size={16} className="text-emerald-500" /> API Sécurisée Bénin/Afrique de l'Ouest
            </p>

            <form onSubmit={handleFeexpaySubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-2">Réseau Opérateur</label>
                <select
                  value={feexpayNetwork}
                  onChange={e => setFeexpayNetwork(e.target.value)}
                  className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-green-500"
                >
                  <option value="MTN_BJ">MTN Bénin</option>
                  <option value="MOOV_BJ">Moov Bénin</option>
                  <option value="CELTIIS_BJ">Celtiis Bénin</option>
                  <option value="TOGOCEL">Togo Cellulaire</option>
                </select>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-300 mb-2">Numéro Mobile Money</label>
                <input
                  type="tel"
                  value={feexpayPhone}
                  onChange={(e) => setFeexpayPhone(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="Ex: 01020304"
                  className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-green-500 font-mono tracking-wider"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-500 text-white rounded-xl font-bold transition-all hover:shadow-[0_0_20px_rgba(16,185,129,0.4)]"
              >
                Payer {formatCurrency(paymentMode === 'installment' ? total / 3 : total)}
              </button>
            </form>
          </div>
        )}

        {step === 'pay_intouch' && (
          <div className="p-6 animate-in fade-in slide-in-from-right-4">
            <div className="flex justify-between items-center mb-6">
              <button onClick={() => setStep('method')} className="text-slate-400 hover:text-white"><ArrowLeft size={20} /></button>
              <h3 className="text-xl font-bold text-white">Guichet InTouch</h3>
              <button onClick={() => onClose(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>

            <p className="text-slate-300 text-sm mb-6 flex items-center gap-2">
              <ShieldCheck size={16} className="text-emerald-500" /> Agrégateur de Paiement Multi-Réseaux
            </p>

            <form onSubmit={handleIntouchSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-2">Pays & Réseau</label>
                <select
                  value={intouchNetwork}
                  onChange={e => setIntouchNetwork(e.target.value)}
                  className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
                >
                  <option value="ORANGE_SN">Orange Sénégal</option>
                  <option value="WAVE_SN">Wave Sénégal</option>
                  <option value="ORANGE_ML">Orange Mali</option>
                  <option value="ORANGE_CM">Orange Cameroun</option>
                </select>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-300 mb-2">Numéro Mobile Money</label>
                <input
                  type="tel"
                  value={intouchPhone}
                  onChange={(e) => setIntouchPhone(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="Ex: 771234567"
                  className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-red-500 font-mono tracking-wider"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-red-600 to-rose-500 text-white rounded-xl font-bold transition-all hover:shadow-[0_0_20px_rgba(225,29,72,0.4)]"
              >
                Payer {formatCurrency(paymentMode === 'installment' ? total / 3 : total)}
              </button>
            </form>
          </div>
        )}

        {step === 'pay_paydunya' && (
          <div className="p-6 animate-in fade-in slide-in-from-right-4">
            <div className="flex justify-between items-center mb-6">
              <button onClick={() => setStep('method')} className="text-slate-400 hover:text-white"><ArrowLeft size={20} /></button>
              <h3 className="text-xl font-bold text-white">PayDunya</h3>
              <button onClick={() => onClose(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>

            <p className="text-slate-300 text-sm mb-6 flex items-center gap-2">
              <ShieldCheck size={16} className="text-emerald-500" /> Paiement sécurisé via PayDunya
            </p>

            <form onSubmit={handlePaydunyaSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-2">Opérateur de paiement</label>
                <select
                  value={paydunyaNetwork}
                  onChange={e => setPaydunyaNetwork(e.target.value)}
                  className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                >
                  <option value="orange-money-senegal">Orange Money Sénégal</option>
                  <option value="wave-senegal">Wave Sénégal</option>
                  <option value="free-money-senegal">Free Money Sénégal</option>
                  <option value="expresso-senegal">E-Money Expresso</option>
                </select>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-300 mb-2">Numéro de téléphone</label>
                <input
                  type="tel"
                  value={paydunyaPhone}
                  onChange={(e) => setPaydunyaPhone(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="Ex: 771234567"
                  className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono tracking-wider"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-500 text-white rounded-xl font-bold transition-all hover:shadow-[0_0_20px_rgba(37,99,235,0.4)]"
              >
                Payer {formatCurrency(paymentMode === 'installment' ? convertedTotal / 3 : convertedTotal, displayCurrency)}
              </button>
            </form>
          </div>
        )}

        {step === 'processing' && (
          <div className="p-12 text-center flex flex-col items-center justify-center min-h-[400px] relative">
            <button
              onClick={() => setStep('method')}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X size={20} />
            </button>
            <Loader2 size={48} className="text-orange-500 animate-spin mb-6" />
            <h3 className="text-xl font-bold text-white mb-2">Traitement en cours...</h3>
            <p className="text-slate-400 text-sm">Veuillez valider le paiement sur votre téléphone. Cette fenêtre se fermera automatiquement après validation.</p>
          </div>
        )}

        {step === 'success' && (
          <div className="p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
            <div className="w-20 h-20 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mb-6 animate-in zoom-in duration-300">
              <CheckCircle size={40} />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">{paymentMode === 'installment' ? 'Tranche Validée !' : 'Paiement Réussi !'}</h3>
            <div className="bg-slate-800/50 p-3 rounded-lg border border-emerald-500/30 mb-6 flex items-start gap-3 text-left">
              <WifiOff className="text-emerald-400 shrink-0 mt-0.5" size={16} />
              <p className="text-slate-300 text-sm">
                {paymentMode === 'installment'
                  ? "Votre acompte a été pris en compte. Rendez-vous dans 'Mes Billets' pour solder les prochaines tranches et débloquer le QR Code final."
                  : "Votre billet a été sauvegardé de manière sécurisée hors-ligne. Vous pourrez y accéder même sans connexion."}
              </p>
            </div>
            <button
              onClick={() => { onClose(true); navigate('/tickets'); }}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-colors"
            >
              Voir mes billets
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// --- Component : Resale Card (Contextual Secondary Market) ---
const ResaleCard: React.FC<{ listing: any; onSuccessfulPurchase: () => void }> = ({ listing, onSuccessfulPurchase }) => {
  const [buying, setBuying] = useState(false);

  const handlePurchase = async () => {
    if (window.confirm(`Confirmer l'achat sécurisé de ce billet pour ${formatCurrency(listing.askingPrice)} ?\n\nLe billet original sera détruit, et un nouveau billet cryptographié vous sera émis.`)) {
      setBuying(true);

      try {
        // Simuler le délai de paiement et de re-génération du JWS
        setTimeout(async () => {
          // 1. Ajouter le billet vendu au portefeuille sécurisé
          await saveSecureTicket({
            ...listing.ticket,
            id: `tix-resold-${Date.now()}` // Hack: on empêche les doublons dans la démo
          });

          // 2. Retirer de la liste globale des reventes
          const currentListings = JSON.parse(localStorage.getItem('afriTix_resale_listings') || '[]');
          const updatedListings = currentListings.filter((l: any) => l.id !== listing.id);
          localStorage.setItem('afriTix_resale_listings', JSON.stringify(updatedListings));

          alert("Achat réussi ! Le billet est crypté et placé dans votre Portefeuille (Mes Billets).");
          onSuccessfulPurchase(); // Trigger refetch
          setBuying(false);
        }, 1500);

      } catch (e) {
        console.error("Erreur d'achat", e);
        setBuying(false);
      }
    }
  };

  const isDiscount = listing.askingPrice < listing.originalPrice;

  return (
    <div className="bg-slate-800/80 rounded-2xl overflow-hidden border border-slate-700 hover:border-emerald-500/50 transition-all duration-300 flex flex-col shadow-lg p-4">
      <div className="flex justify-between items-start mb-3">
        <span className="bg-slate-900 px-2 py-1 rounded text-xs font-bold text-slate-300 uppercase border border-white/5">
          {listing.ticket.type}
        </span>
        <div className="flex items-center text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20 font-bold uppercase tracking-widest">
          <ShieldCheck size={12} className="mr-1" />
          Vérifié
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4 p-2 bg-slate-900/50 rounded-lg border border-slate-700/50">
        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
          <Ticket size={16} className="text-slate-500" />
        </div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase font-bold">Vendu par</p>
          <p className="text-xs font-medium text-slate-300">Anonyme (Garanti Babipass)</p>
        </div>
      </div>

      <div className="mt-auto border-t border-slate-700/50 pt-3 flex justify-between items-end">
        <div>
          <p className="text-[10px] text-slate-400 font-medium">Valeur d'origine: <span className="line-through">{formatCurrency(listing.originalPrice)}</span></p>
          <p className={`text-xl font-black ${isDiscount ? 'text-emerald-400' : 'text-orange-400'}`}>
            {formatCurrency(listing.askingPrice)}
          </p>
        </div>
        <button
          onClick={handlePurchase}
          disabled={buying}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 flex items-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
        >
          {buying ? <Loader2 size={16} className="animate-spin" /> : "Acheter"}
        </button>
      </div>
    </div>
  );
};
