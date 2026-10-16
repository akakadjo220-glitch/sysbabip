
import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { MOCK_EVENTS, formatCurrency, formatDate, convertCurrency, PAYMENT_ROUTING } from '../constants';
import { Event, TicketCategory } from '../types';
import { supabase } from '../supabaseClient';
import { getOfflineTickets, saveSecureTicket } from '../utils/offlineStorage';
import { CheckoutService, type CheckoutProvider, type CreateOrderInput, type CreatedOrder, type IssuedTicket } from '../services/CheckoutService';
import { CatalogService } from '../services/CatalogService';
import { LazyVideo } from '../components/LazyVideo';
import { AmbassadorWidget } from '../components/AmbassadorWidget';
import { SEO } from '../components/SEO';
import { generateEventSEO } from '../utils/seoEngine';
import { lazyNamed } from '../utils/lazyPage';
import { loadPaystack } from '../utils/loadPaystack';
import { approximateLocation } from '../utils/paymentOptions';
import { PaymentMethodPicker, usePaymentOptions } from '../components/PaymentMethodPicker';

// Carte et PDF chargés à la demande : la page et le bouton d'achat s'affichent d'abord.
const EventLocationMap = lazyNamed(() => import('../components/EventLocationMap'), 'EventLocationMap');
import { StadiumMap } from '../components/StadiumMap';
import {
  Calendar, MapPin, Clock, ArrowLeft, Share2, Heart,
  Info, ShieldCheck, Ticket, CheckCircle, Smartphone, CreditCard,
  Download, QrCode, Mail, Link, X, Copy, Facebook, Twitter, MessageCircle, Loader2, WifiOff, AlertTriangle, Timer, ShieldAlert, Banknote, Flame, Zap, Users, Phone, Star, Eye
} from 'lucide-react';

// Anti-Fraud Constants
const CART_EXPIRATION_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ABANDONS = 3;
const LOCKOUT_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours

// Signaux d'urgence : uniquement des faits réels (stock, ventes, vues, date).
// S'il n'y a rien de vrai à dire, rien ne s'affiche.
const FomoBanner = ({ remaining, capacity, sold, views, date }: { remaining: number; capacity: number; sold: number; views: number; date: string }) => {
  const [msgIdx, setMsgIdx] = useState(0);

  const messages: { icon: any; text: string; color: string; bg: string; border: string }[] = [];
  if (capacity > 0 && remaining > 0 && remaining <= Math.max(20, Math.round(capacity * 0.1))) {
    messages.push({ icon: Flame, text: `Plus que ${remaining} place${remaining > 1 ? 's' : ''} disponible${remaining > 1 ? 's' : ''}`, color: "text-rose-500", bg: "bg-rose-500/10", border: "border-rose-500/30" });
  }
  const daysLeft = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  if (daysLeft >= 0 && daysLeft <= 7) {
    const when = daysLeft === 0 ? "C'est aujourd'hui !" : daysLeft === 1 ? "C'est demain !" : `Plus que ${daysLeft} jours`;
    messages.push({ icon: Timer, text: when, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30" });
  }
  if (sold >= 20) {
    messages.push({ icon: Zap, text: `${sold.toLocaleString('fr-FR')} billets déjà vendus`, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30" });
  }
  if (views >= 100) {
    messages.push({ icon: Users, text: `${views.toLocaleString('fr-FR')} personnes ont consulté cet événement`, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30" });
  }

  useEffect(() => {
    if (messages.length < 2) return;
    const interval = setInterval(() => setMsgIdx((prev) => prev + 1), 6000);
    return () => clearInterval(interval);
  }, [messages.length]);

  if (messages.length === 0) return null;
  const current = messages[msgIdx % messages.length];
  const Icon = current.icon;

  return (
    <div className={`overflow-hidden transition-all duration-500 rounded-xl border ${current.bg} ${current.border} mb-6`}>
      <div className="flex items-center gap-3 p-3 animate-in fade-in slide-in-from-right-4 duration-500" key={msgIdx}>
        <div className={`p-2 rounded-full bg-white/5 ${current.color}`}>
          <Icon size={18} />
        </div>
        <p className={`text-sm font-bold ${current.color}`}>{current.text}</p>
      </div>
    </div>
  );
};

// Disponibilité : jauge seulement si la capacité est connue ; jamais de chiffre inventé.
const StockBar = ({ capacity, sold }: { capacity: number, sold: number }) => {
  const [fillPct, setFillPct] = useState(0);

  const hasRealCapacity = capacity > 0;
  const effectiveSold = hasRealCapacity ? Math.min(sold, capacity) : sold;
  const soldPct = hasRealCapacity ? Math.min(100, (effectiveSold / capacity) * 100) : 0;
  const remaining = hasRealCapacity ? capacity - effectiveSold : 0;
  const isCritical = hasRealCapacity && soldPct >= 85;

  useEffect(() => {
    const timer = setTimeout(() => setFillPct(Math.max(2, soldPct)), 500);
    return () => clearTimeout(timer);
  }, [soldPct]);

  if (!hasRealCapacity) {
    return (
      <p className="mb-6 text-sm font-bold text-emerald-400">
        Billets disponibles{sold > 0 ? ` · ${sold} déjà réservé${sold > 1 ? 's' : ''}` : ''}
      </p>
    );
  }

  const availabilityLabel = isCritical
    ? 'Presque complet'
    : `${remaining} place${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}`;
  const labelColor = isCritical ? 'text-rose-500' : remaining / capacity <= 0.3 ? 'text-amber-400' : 'text-emerald-400';

  return (
    <div className="mb-6 space-y-2">
      <div className="flex justify-between items-end">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Disponibilité</span>
        <span className={`text-sm font-bold ${labelColor}`}>{availabilityLabel}</span>
      </div>
      <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden shadow-inner relative">
        <div
          className={`h-full rounded-full transition-all duration-[1500ms] ease-out ${isCritical ? 'bg-gradient-to-r from-rose-600 to-rose-400' : 'bg-gradient-to-r from-orange-600 to-amber-400'}`}
          style={{ width: `${fillPct}%` }}
        />
      </div>
      <p className="text-[10px] text-slate-500 text-right">{effectiveSold} / {capacity} billets vendus</p>
    </div>
  );
};

export const EventDetails: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const id = slug; // Temporary alias for session storage keys
  const navigate = useNavigate();
  const location = useLocation();

  // Prépare le module de paiement Paystack pendant que le visiteur lit la page.
  useEffect(() => { loadPaystack().catch(() => { /* réessayé au paiement */ }); }, []);
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

  // Handle Ambassador Tracking
  useEffect(() => {
    const handleAmbassadorRef = async () => {
      const searchParams = new URLSearchParams(location.search);
      const refCode = searchParams.get('ref');

      if (refCode && refCode.startsWith('AMB-')) {
        // Store in session storage for the checkout process
        sessionStorage.setItem('afritix_ambassador_ref', refCode);

        // Prevent double counting (StrictMode) and spam impressions in the same session
        if (sessionStorage.getItem('tracked_click_ref') !== refCode) {
            sessionStorage.setItem('tracked_click_ref', refCode);
            try {
              await supabase.rpc('increment_ambassador_clicks', { p_code: refCode });
            } catch (e) {
              console.error("Erreur lors de l'enregistrement du clic", e);
            }
        }
      }
    };

    handleAmbassadorRef();
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
        // 1. Catalogue public mis en cache (absorbe les pics de visites).
        let data: any = await CatalogService.getEvent(slug!).catch(() => null);

        // 2. Sinon (brouillon vu par son organisateur, serveur injoignable) : accès direct.
        if (!data) {
          const direct = await supabase
            .from('events')
            .select('*, ticket_types(*)')
            .eq('slug', slug)
            .single();
          if (direct.error) throw direct.error;
          data = direct.data;
          if (data?.organizer_id) {
            const { data: org } = await supabase
              .from('organizer_public_profiles')
              .select('name, company, avatar')
              .eq('id', data.organizer_id)
              .maybeSingle();
            data.profiles = org;
          }
        }

        if (data) {
          // Transform snake_case relation to match Event type
          const formattedEvent = {
            ...data,
            ticketTypes: data.ticket_types,
            video: data.video_url
          };
          setEvent(formattedEvent);

          // Track page view for Organizer BI dashboard (silently, no-await)
          if (!viewTrackedRef.current) {
            const sessionKey = `afriTix_view_tracked_${data.id}`;
            if (!sessionStorage.getItem(sessionKey)) {
              // Mark as tracked IMMEDIATELY (synchronously) to prevent race conditions
              sessionStorage.setItem(sessionKey, 'true');
              viewTrackedRef.current = true;
              supabase.rpc('increment_event_view', { evt_id: data.id })
                .then(null, (err) => console.error("Error tracking view:", err));
            } else {
              viewTrackedRef.current = true;
            }
          }
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
  }, [id]);

  // Logic for similar events - In a real app, this would be another Supabase query 
  // currently we just leave an empty array if we don't fetch them specifically
  const relatedEvents: Event[] = [];

  const handleShare = async () => {
    if (!event) return;

    const shareData = {
      title: event.title,
      text: eventShareText(event),
      url: eventShareUrl(event)
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
  // Stock réel : somme des catégories de billets (sinon les totaux de l'événement).
  const stock = (() => {
    const types = (event.ticketTypes || []) as any[];
    const capacity = types.reduce((n, t) => n + (Number(t.quantity) || 0), 0);
    if (capacity > 0) return { capacity, sold: types.reduce((n, t) => n + (Number(t.sold) || 0), 0) };
    return { capacity: Number(event.capacity) || 0, sold: Number(event.sold) || 0 };
  })();

  // Clôture automatique des ventes configurée par l'organisateur
  const salesCloseMinutes = Number((event as any).sales_close_before_minutes ?? 0);
  const isSalesClosed = salesCloseMinutes > 0 && (() => {
    const eventDate = new Date(event.date);
    const closeAt = new Date(eventDate.getTime() - salesCloseMinutes * 60 * 1000);
    return new Date() >= closeAt;
  })();

  return (
    <div className="relative min-h-screen pb-36">
      {event && (() => {
        const seoData = generateEventSEO(event);
        return (
          <SEO
            title={seoData.title}
            description={seoData.description}
            keywords={seoData.keywords}
            image={seoData.image}
            canonicalUrl={seoData.canonicalUrl}
            type="event"
            structuredData={seoData.structuredData}
            breadcrumbsData={seoData.breadcrumbsData}
          />
        );
      })()}
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
      {/* Partage WhatsApp direct : le canal n°1 pour faire venir ses amis */}
      {event && (
        <a
          href={whatsappShareLink(event)}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed top-36 right-4 z-40 bg-[#25D366] p-3 rounded-full text-white hover:scale-110 transition-transform shadow-lg shadow-black/40"
          title="Partager sur WhatsApp"
          aria-label="Partager sur WhatsApp"
        >
          <MessageCircle size={24} />
        </a>
      )}

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
          {/* Organisateur : lien vers tous ses événements */}
          {(event as any).organizer_id && ((event as any).profiles?.company || (event as any).profiles?.name) && (
            <button
              onClick={() => navigate(`/organisateur/${(event as any).organizer_id}`)}
              className="mt-4 inline-flex items-center gap-2 text-sm text-slate-200 hover:text-orange-300 transition-colors"
            >
              {(event as any).profiles?.avatar
                ? <img src={(event as any).profiles.avatar} alt="" className="w-7 h-7 rounded-full object-cover border border-white/20" />
                : <Users size={18} className="text-orange-400" />}
              <span>Organisé par <strong className="font-bold">{(event as any).profiles?.company || (event as any).profiles?.name}</strong> · voir ses événements →</span>
            </button>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 -mt-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Main Content (Left Column) */}
          <div className="lg:col-span-2 space-y-8">

            <div className="bg-[#1e293b] rounded-3xl border border-white/5 p-8 min-h-[400px]">
              <div className="space-y-6 animate-in fade-in duration-300">
                  {/* 📡 Bandeau Score Live */}
                  {(event as any).home_team && (event as any).away_team &&
                    ((event as any).match_status === 'live' || (event as any).match_status === 'halftime' || (event as any).match_status === 'fulltime') && (
                    <div className={`relative overflow-hidden rounded-2xl p-4 mb-2 text-center ${
                      (event as any).match_status === 'live' ? 'bg-red-950/60 border border-red-500/40 shadow-lg shadow-red-500/10' :
                      (event as any).match_status === 'halftime' ? 'bg-amber-950/60 border border-amber-500/40' :
                      'bg-slate-800/60 border border-slate-600'
                    }`}>
                      {(event as any).match_status === 'live' && (
                        <div className="absolute inset-0 rounded-2xl border-2 border-red-500/30 animate-pulse pointer-events-none" />
                      )}
                      <p className={`text-xs font-black uppercase tracking-widest mb-2 flex items-center justify-center gap-2 ${
                        (event as any).match_status === 'live' ? 'text-red-400' :
                        (event as any).match_status === 'halftime' ? 'text-amber-400' : 'text-slate-400'
                      }`}>
                        {(event as any).match_status === 'live' && <span className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />}
                        {(event as any).match_status === 'live' ? '🔴 EN DIRECT' :
                         (event as any).match_status === 'halftime' ? '⏸️ MI-TEMPS' : '✅ TERMINÉ'}
                      </p>
                      <div className="flex items-center justify-center gap-4">
                        <span className="text-white font-black text-lg">{(event as any).home_team}</span>
                        <span className={`font-black text-3xl tabular-nums px-4 py-1 rounded-xl ${
                          (event as any).match_status === 'live' ? 'bg-red-500 text-white shadow-lg shadow-red-500/40' :
                          (event as any).match_status === 'halftime' ? 'bg-amber-500 text-white' : 'bg-slate-700 text-slate-300'
                        }`}>
                          {(event as any).home_score ?? 0} — {(event as any).away_score ?? 0}
                        </span>
                        <span className="text-white font-black text-lg">{(event as any).away_team}</span>
                      </div>
                    </div>
                  )}
                  {/* ⚽ Affiche du match (sport) */}
                  {(event as any).home_team && (event as any).away_team && (
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-emerald-500/30 p-6 mb-4">
                      <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle at 30% 50%, #10b981, transparent), radial-gradient(circle at 70% 50%, #0ea5e9, transparent)' }} />
                      {(event as any).competition && (
                        <p className="text-center text-emerald-400 text-xs font-black uppercase tracking-widest mb-4 flex items-center justify-center gap-2">
                          <span>🏆</span> {(event as any).competition} <span>🏆</span>
                        </p>
                      )}
                      <div className="flex items-center justify-between gap-2 sm:gap-4">
                        <div className="flex-1 flex flex-col items-center justify-start">
                          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center mb-2 text-2xl sm:text-3xl shrink-0">
                            {(event as any).sport_type === 'football' ? '⚽' : (event as any).sport_type === 'basketball' ? '🏀' : '🏆'}
                          </div>
                          <p className="text-white font-black text-xs sm:text-lg leading-tight text-center break-words max-w-full">{(event as any).home_team}</p>
                          <p className="text-emerald-400 text-[10px] sm:text-xs font-bold mt-1 text-center">🏠 Domicile</p>
                        </div>
                        <div className="text-center shrink-0 flex flex-col items-center justify-center">
                          <div className="bg-orange-500 text-white font-black text-lg sm:text-2xl px-3 py-1.5 sm:px-5 sm:py-2 rounded-xl shadow-[0_0_20px_rgba(249,115,22,0.5)] animate-pulse">
                            VS
                          </div>
                          <p className="text-slate-400 text-[10px] sm:text-xs mt-2 whitespace-nowrap">{new Date(event.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                        </div>
                        <div className="flex-1 flex flex-col items-center justify-start">
                          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-blue-500/20 border-2 border-blue-500/40 flex items-center justify-center mb-2 text-2xl sm:text-3xl shrink-0">
                            {(event as any).sport_type === 'football' ? '⚽' : (event as any).sport_type === 'basketball' ? '🏀' : '🏆'}
                          </div>
                          <p className="text-white font-black text-xs sm:text-lg leading-tight text-center break-words max-w-full">{(event as any).away_team}</p>
                          <p className="text-blue-400 text-[10px] sm:text-xs font-bold mt-1 text-center">✈️ Visiteur</p>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-center gap-1.5 text-slate-400 text-[10px] sm:text-xs text-center">
                        <MapPin size={12} className="text-orange-400 shrink-0" />
                        <span className="truncate">{event.location}, {event.city}</span>
                      </div>
                    </div>
                  )}
                {/* 🏟️ Plan de stade interactif — affiché si zones configurées */}
                {(event as any).home_team && event.ticketTypes?.some((t: any) => t.stadium_zone) && (
                  <div className="mt-2 mb-4">
                    <StadiumMap
                      ticketTypes={event.ticketTypes!.map((t: any) => ({
                        id: t.id, name: t.name, price: t.price,
                        capacity: t.available ?? t.quantity ?? t.capacity ?? 0,
                        sold: 0,
                        stadium_zone: t.stadium_zone
                      }))}
                      cart={cart}
                      onZoneSelect={(_ticketId) => {
                        const el = document.getElementById('ticket-section');
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                    />
                  </div>
                )}
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

              {event.ambassador_enabled && (
                <AmbassadorWidget
                  eventId={event.id}
                  commissionType={event.ambassador_commission_type || 'percentage'}
                  commissionValue={event.ambassador_commission_value || 0}
                />
              )}
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
                    <FomoBanner remaining={stock.capacity - stock.sold} capacity={stock.capacity} sold={stock.sold} views={Number((event as any).views) || 0} date={event.date} />
                    <StockBar capacity={stock.capacity} sold={stock.sold} />
                  </>
                )}

                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {isSalesClosed && !isSoldOut ? (
                  <div className="p-6 text-center bg-amber-500/5 border border-amber-500/30 rounded-xl mb-4">
                    <div className="w-12 h-12 bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Clock size={24} />
                    </div>
                    <p className="font-bold text-white text-xl mb-1">Ventes Clôturées</p>
                    <p className="text-slate-400 text-sm">Les ventes en ligne sont fermées pour cet événement. Présentez-vous directement à l'entrée si des billets sont encore disponibles.</p>
                  </div>
                ) : isSoldOut ? (
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
                          {/* Zone de stade badge */}
                          {(ticket as any).stadium_zone && (
                            <div className="mb-2">
                              <span className="text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                                🏟️ {(ticket as any).stadium_zone}
                              </span>
                            </div>
                          )}
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

                {!isSoldOut && !isSalesClosed && (
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

        {/* Programme Ambassadeur */}
        {(event as any).ambassador_enabled && (
          <div className="mt-8 mb-8">
            <AmbassadorWidget 
              eventId={event.id}
              commissionType={(event as any).ambassador_commission_type || 'percentage'}
              commissionValue={(event as any).ambassador_commission_value || 10}
            />
          </div>
        )}

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
            <Suspense fallback={<div className="w-full h-full animate-pulse bg-slate-800" />}>
              <EventLocationMap event={event} />
            </Suspense>
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

      {/* =================== AVIS & COMMENTAIRES (Bas de page) =================== */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 mt-16 mb-10" id="reviews">
        <div className="border-t border-white/10 pt-12">
          <div className="flex items-start justify-between flex-wrap gap-4 mb-10">
            <div>
              <h2 className="text-3xl font-black text-white flex items-center gap-3">
                <Star className="text-amber-400" fill="currentColor" /> Avis &amp; Commentaires
              </h2>
              <p className="text-slate-400 mt-1">Les avis sont v&#233;rifi&#233;s et mod&#233;r&#233;s avant publication.</p>
            </div>
            <div className="text-right">
              <div className="text-5xl font-black text-white">{Number((event as any).average_rating || 0) > 0 ? Number((event as any).average_rating).toFixed(1) : '—'}</div>
              <div className="flex justify-end gap-0.5 my-1">
                {[1,2,3,4,5].map(s => {
                  const avg = Number((event as any).average_rating || 0);
                  return <Star key={s} size={16} fill={avg >= s ? 'currentColor' : 'none'} className={avg >= s ? 'text-amber-400' : 'text-slate-600'} />;
                })}
              </div>
              <span className="text-slate-500 text-sm">{(event as any).total_reviews || 0} avis au total</span>
            </div>
          </div>

          {/* Approved reviews list - fetched from DB */}
          <ReviewsList eventId={event.id} />

          {/* Submit Review Form */}
          <ReviewForm eventId={event.id} eventTitle={event.title} />
        </div>
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

// Reviews System Components
const ReviewsList: React.FC<{ eventId: string }> = ({ eventId }) => {
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('reviews')
      .select('id, rating, comment, created_at, reviewer_name')
      .eq('event_id', eventId)
      .eq('is_approved', true)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        setReviews(data || []);
        setLoading(false);
      });
  }, [eventId]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-orange-400" size={24} /></div>;

  if (reviews.length === 0) return (
    <div className="text-center py-10 rounded-2xl border border-white/5 mb-8 bg-white/3">
      <Star size={36} className="mx-auto text-slate-600 mb-3" />
      <p className="text-slate-400 font-medium">Aucun avis approuvé pour le moment.</p>
      <p className="text-slate-600 text-sm mt-1">Soyez le premier à partager votre expérience !</p>
    </div>
  );

  return (
    <div className="space-y-4 mb-10">
      {reviews.map((r: any) => {
        const displayName = r.reviewer_name || 'Anonyme';
        const initials = displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
        const bgColors = ['bg-orange-500','bg-blue-500','bg-emerald-500','bg-purple-500','bg-rose-500'];
        const bg = bgColors[initials.charCodeAt(0) % bgColors.length];
        return (
          <div key={r.id} className="p-5 rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-9 h-9 rounded-full ${bg} flex items-center justify-center font-bold text-xs text-white shrink-0`}>{initials}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-bold text-white">{displayName}</p>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/30">Avis Vérifié</span>
                </div>
                <div className="flex gap-0.5 mt-0.5">
                  {[1,2,3,4,5].map(s => <Star key={s} size={11} fill={r.rating >= s ? 'currentColor' : 'none'} className={r.rating >= s ? 'text-amber-400' : 'text-slate-600'} />)}
                </div>
              </div>
              <span className="text-xs text-slate-600 shrink-0">{new Date(r.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </div>
            {r.comment && <p className="text-slate-300 text-sm leading-relaxed italic">"{r.comment}"</p>}
          </div>
        );
      })}
    </div>
  );
};

const ReviewForm: React.FC<{ eventId: string; eventTitle: string }> = ({ eventId }) => {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [reviewError, setReviewError] = useState('');

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setReviewError('');
    if (rating === 0) { setReviewError('Veuillez sélectionner une note.'); return; }
    if (!name.trim()) { setReviewError('Veuillez entrer votre prénom.'); return; }
    setSubmitting(true);

    // Get logged-in user if any (user_id is optional/nullable)
    const { data: { user } } = await supabase.auth.getUser();

    const payload: Record<string, any> = {
      event_id: eventId,
      reviewer_name: name.trim(),
      rating,
      comment: comment.trim() || null,
      is_approved: false,
    };
    // Only attach user_id if logged in
    if (user?.id) payload.user_id = user.id;

    const { error: err } = await supabase.from('reviews').insert(payload);

    if (err) {
      console.error('Review insert error:', err);
      setReviewError("Erreur lors de l'envoi. Vérifiez votre connexion ou réessayez.");
      setSubmitting(false);
      return;
    }

    setSubmitted(true);
    setSubmitting(false);
  };

  if (submitted) return (
    <div className="mt-8 p-8 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 text-center animate-in fade-in duration-500">
      <CheckCircle size={40} className="text-emerald-400 mx-auto mb-3" />
      <h3 className="text-xl font-bold text-white mb-2">Avis envoyé, merci !</h3>
      <p className="text-slate-400">Votre avis est en attente de modération. Il sera affiché après validation par notre équipe.</p>
    </div>
  );

  return (
    <div className="mt-8 p-6 md:p-8 rounded-3xl bg-white/5 border border-white/10">
      <h3 className="text-xl font-bold text-white mb-1">Partagez votre expérience</h3>
      <p className="text-slate-400 text-sm mb-6">Votre avis sera affiché après modération par notre équipe.</p>

      <form onSubmit={handleReviewSubmit} className="space-y-5">
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Votre note *</label>
          <div className="flex gap-2">
            {[1,2,3,4,5].map(s => (
              <button key={s} type="button"
                onMouseEnter={() => setHovered(s)} onMouseLeave={() => setHovered(0)}
                onClick={() => setRating(s)} className="transition-transform hover:scale-125 active:scale-110">
                <Star size={32}
                  fill={(hovered || rating) >= s ? 'currentColor' : 'none'}
                  className={(hovered || rating) >= s ? 'text-amber-400' : 'text-slate-600'} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Votre prénom *</label>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="Ex: Moussa"
            className="w-full bg-slate-900/60 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm" />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Commentaire (optionnel)</label>
          <textarea value={comment} onChange={e => setComment(e.target.value)}
            placeholder="Racontez votre expérience..."
            rows={3}
            className="w-full bg-slate-900/60 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm resize-none" />
        </div>

        {reviewError && <p className="text-rose-400 text-sm flex items-center gap-2"><AlertTriangle size={14} />{reviewError}</p>}

        <button type="submit" disabled={submitting}
          className="w-full py-4 bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white font-bold rounded-xl transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2">
          {submitting ? <><Loader2 size={18} className="animate-spin" /> Envoi...</> : <><Star size={18} fill="currentColor" /> Soumettre mon avis</>}
        </button>
      </form>
    </div>
  );
};

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

// Lien propre de l'événement (c'est lui qui donne le bel aperçu WhatsApp / Facebook).
const eventShareUrl = (event: Event) => `https://babipass.com/event/${encodeURIComponent((event as any).slug || event.id)}`;
const eventShareText = (event: Event) => `🎟️ ${event.title} — billets disponibles sur Babipass`;
const whatsappShareLink = (event: Event) =>
  `https://wa.me/?text=${encodeURIComponent(`${eventShareText(event)}\n${eventShareUrl(event)}`)}`;

const ShareModal: React.FC<{ event: Event | null; onClose: () => void }> = ({ event, onClose }) => {
  const [copied, setCopied] = useState(false);
  if (!event) return null;

  const shareUrl = eventShareUrl(event);
  const text = eventShareText(event);
  const open = (url: string) => window.open(url, '_blank', 'noopener,noreferrer');

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copiez ce lien :', shareUrl);
    }
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
          <button onClick={() => open(whatsappShareLink(event))} className="flex flex-col items-center gap-2 group">
            <div className="w-12 h-12 rounded-full bg-[#25D366]/20 text-[#25D366] flex items-center justify-center group-hover:bg-[#25D366] group-hover:text-white transition-colors">
              <MessageCircle size={20} />
            </div>
            <span className="text-xs text-slate-400">WhatsApp</span>
          </button>
          <button onClick={() => open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`)} className="flex flex-col items-center gap-2 group">
            <div className="w-12 h-12 rounded-full bg-[#1877F2]/20 text-[#1877F2] flex items-center justify-center group-hover:bg-[#1877F2] group-hover:text-white transition-colors">
              <Facebook size={20} />
            </div>
            <span className="text-xs text-slate-400">Facebook</span>
          </button>
          <button onClick={() => open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`)} className="flex flex-col items-center gap-2 group">
            <div className="w-12 h-12 rounded-full bg-slate-700 text-slate-200 flex items-center justify-center group-hover:bg-black group-hover:text-white transition-colors">
              <Twitter size={20} />
            </div>
            <span className="text-xs text-slate-400">X</span>
          </button>
          <button onClick={copyToClipboard} className="flex flex-col items-center gap-2 group">
            <div className="w-12 h-12 rounded-full bg-slate-700 text-slate-300 flex items-center justify-center group-hover:bg-slate-600 group-hover:text-white transition-colors">
              <Copy size={20} />
            </div>
            <span className="text-xs text-slate-400">{copied ? 'Copié ✓' : 'Copier'}</span>
          </button>
        </div>

        <div className="bg-slate-900 rounded-lg p-3 flex items-center justify-between border border-white/5">
          <span className="text-slate-400 text-xs truncate max-w-[200px]">{shareUrl}</span>
          <button onClick={copyToClipboard} className="text-orange-400 text-xs font-bold hover:text-orange-300">
            {copied ? 'Lien copié ✓' : 'Copier'}
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
  const [step, setStep] = useState<any>(() => {
    const saved = sessionStorage.getItem(`checkout_step_${eId}`) || 'auth';
    return saved.startsWith('pay_') ? 'method' : saved;
  });
  const [error, setError] = useState('');
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

  // Moyens de paiement utilisables (activés ET configurés, selon le serveur).
  const { options: paymentOptions, loading: paymentOptionsLoading } = usePaymentOptions(visitorCountryCode);
  const [buyerLocation, setBuyerLocation] = useState<any>(null);

  useEffect(() => {
    // Pays et position approximatifs (Cloudflare) : aucune demande d'autorisation
    // au moment de payer, aucun service tiers.
    approximateLocation().then(({ countryCode, location }) => {
      if (countryCode && PAYMENT_ROUTING[countryCode]) setVisitorCountryCode(countryCode);
      if (location) setBuyerLocation(location);
    });
  }, []);

  // Moyen de paiement choisi et numéro qui paie (prérempli avec le numéro WhatsApp).
  const [selectedOption, setSelectedOption] = useState(() => sessionStorage.getItem(`checkout_option_${eId}`) || '');
  const [payPhone, setPayPhone] = useState(() => sessionStorage.getItem(`checkout_pay_phone_${eId}`) || '');
  useEffect(() => {
    sessionStorage.setItem(`checkout_option_${eId}`, selectedOption);
    sessionStorage.setItem(`checkout_pay_phone_${eId}`, payPhone);
  }, [eId, selectedOption, payPhone]);

  const navigate = useNavigate();

  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!contactValue || contactValue.trim() === '') {
      setError("Indiquez votre numéro WhatsApp ou votre e-mail pour recevoir le billet.");
      return;
    }

    // Concaténer l'indicatif si c'est un numéro WhatsApp qui ne commence pas déjà par un +
    let finalContact = contactValue.trim().replace(/\s/g, ''); // Nettoyer les espaces
    if (contactMethod === 'wa' && !payPhone && !finalContact.startsWith('+')) {
      // Le même numéro sert par défaut à payer (modifiable à l'étape suivante).
      setPayPhone(finalContact.replace(/[^0-9]/g, ''));
    }
    if (contactMethod === 'wa' && !finalContact.startsWith('+')) {
      const dialCode = (visitorCountry?.dialCode || '+225').replace('+', '');
      // Pour la CI (10 chiffres), on garde le 0 initial car il fait partie du préfixe opérateur (01, 05, 07, etc.)
      finalContact = `${dialCode}${finalContact}`;
      setContactValue(finalContact); 
    }

    // Simulation envoi OTP retirée
    // On passe directement à l'étape de paiement
    setStep('method');
  };



  // ─── Achat côté serveur ────────────────────────────────────────────────
  // Le serveur calcule le prix, réserve les places, vérifie le paiement auprès
  // de l'opérateur et émet les billets. Le navigateur suit le statut, puis
  // enregistre localement les billets reçus.

  const amountToPay = paymentMode === 'installment' ? total / 3 : total;

  // Salle d'attente : pendant un pic, le serveur fait patienter l'acheteur.
  const [queueWait, setQueueWait] = useState<{ seconds: number; attempt: number } | null>(null);
  const handleQueued = (seconds: number, attempt: number) => setQueueWait({ seconds, attempt });

  const completeCheckout = async (tickets: IssuedTicket[]) => {
    const organizerProfile = (eventData as any).profiles;
    const finalOrganizerName = organizerProfile?.company || organizerProfile?.name || (eventData as any).organizer_name || "Organisateur";
    const typeNames: Record<string, string> = Object.fromEntries(
      (eventData.ticketTypes || []).map((t: any) => [t.id, t.name])
    );

    for (const ticket of tickets) {
      const offlineTicket = {
        id: ticket.id,
        eventName: eventData.title,
        eventDate: eventData.date,
        location: eventData.location,
        image: eventData.image,
        qrCode: ticket.qr_code,
        holder: ticket.guest_name || participantName || "Participant Anonyme",
        type: typeNames[ticket.ticket_type] || "Standard",
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
      await saveSecureTicket(offlineTicket);
      if (paymentMode === 'full') {
        import('../utils/pdfGenerator')
          .then(({ generateTicketPDF }) => generateTicketPDF(offlineTicket))
          .catch(console.error);
      }
    }
    setStep('success');
  };

  const buildOrderInput = (provider: CheckoutProvider, payment?: CreateOrderInput['payment']): CreateOrderInput => ({
    eventId: eventData.id,
    items: Object.fromEntries(Object.entries(cart).filter(([, qty]) => qty > 0)),
    paymentMode,
    provider,
    buyer: {
      name: participantName || undefined,
      email: contactMethod === 'email' ? contactValue : undefined,
      phone: contactMethod === 'wa' ? contactValue : undefined,
      contactMethod: contactMethod === 'wa' ? 'wa' : 'email'
    },
    buyerLocation,
    referralCode: sessionStorage.getItem('afritix_ambassador_ref'),
    payment
  });

  // Attend la confirmation (vérifiée par le serveur) puis termine ou revient au formulaire.
  const settleOrder = async (created: CreatedOrder, retryStep: typeof step) => {
    const result = await CheckoutService.waitForPayment(created.order.id, created.order.token);
    const ref = created.order.id.slice(0, 8).toUpperCase();

    if (result.status === 'paid' && result.tickets?.length) {
      await completeCheckout(result.tickets);
      return;
    }
    if (result.status === 'pending') {
      setError(`Paiement pas encore confirmé (réf. ${ref}). Si vous l'avez validé sur votre téléphone, vos billets vous seront envoyés automatiquement dès confirmation.`);
    } else if (result.status === 'refund_required') {
      setError(`Votre paiement est arrivé après la fin de la réservation et il ne reste plus de place. Contactez le support pour le remboursement (réf. ${ref}).`);
    } else if (result.status === 'amount_mismatch') {
      setError(`Le montant payé ne correspond pas à la commande. Contactez le support (réf. ${ref}).`);
    } else {
      setError("Paiement non abouti ou délai dépassé. Vos places ont été libérées : vous pouvez réessayer.");
    }
    setStep(retryStep);
  };

  const handleCardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await loadPaystack();
    } catch (err) {
      console.error(err);
      setError("Le paiement par carte n'a pas pu s'ouvrir. Vérifiez votre connexion et réessayez.");
      return;
    }
    setError('');
    setStep('processing');
    try {
      const created = await CheckoutService.createOrder(buildOrderInput('paystack'), { onQueued: handleQueued });
      setQueueWait(null);
      const payment = created.payment;

      const handler = (window as any).PaystackPop.setup({
        key: payment.publicKey,
        email: payment.email,
        amount: payment.amount, // montant calculé par le serveur (en centimes)
        currency: payment.currency,
        channels: ['card', 'mobile_money'],
        ref: payment.reference,
        callback: function () {
          // Le statut renvoyé par le popup n'est pas une preuve : le serveur vérifie.
          setStep('processing');
          settleOrder(created, 'method');
        },
        onClose: function () {
          setStep('method'); // L'utilisateur a fermé la fenêtre (la réservation expirera seule)
        }
      });
      handler.openIframe();
    } catch (err: any) {
      console.error("Erreur lancement Paystack", err);
      setQueueWait(null);
      setError(err.message || "Le paiement par carte n'a pas pu démarrer. Réessayez.");
      setStep('method');
    }
  };

  const payWithMobileMoney = async (
    provider: Exclude<CheckoutProvider, 'paystack'>,
    payment: CreateOrderInput['payment'],
    retryStep: typeof step
  ) => {
    setError('');
    setStep('processing');
    try {
      const created = await CheckoutService.createOrder(buildOrderInput(provider, payment), { onQueued: handleQueued });
      setQueueWait(null);
      await settleOrder(created, retryStep);
    } catch (err: any) {
      setQueueWait(null);
      setError(err.message || "Le paiement n'a pas pu démarrer. Réessayez.");
      setStep(retryStep);
    }
  };

  const chosen = paymentOptions.find(o => o.key === selectedOption) || null;

  const handleMobileMoneySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosen || chosen.kind !== 'momo') return;
    const phone = payPhone.replace(/[^0-9]/g, '');
    if (phone.length < 8) {
      setError(`Indiquez le numéro ${chosen.label} qui va payer.`);
      return;
    }
    payWithMobileMoney(chosen.gateway as Exclude<CheckoutProvider, 'paystack'>, { phone, network: chosen.network }, 'method');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#1e293b] w-full max-w-md rounded-2xl border border-white/10 shadow-2xl overflow-hidden">

        {step === 'auth' && (
          <div className="p-6">
            <div className="flex justify-between items-center mb-1">
              <h3 className="text-xl font-bold text-white">Vos informations</h3>
              <button onClick={() => onClose(false)} aria-label="Fermer" className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <p className="text-xs text-slate-500 mb-6">Étape 1 sur 2 · Votre billet est envoyé dès le paiement validé</p>

            {error && (
              <div role="alert" className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 text-sm">{error}</div>
            )}

            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label htmlFor="checkout-name" className="block text-sm font-medium text-slate-300 mb-2">Nom du participant</label>
                <input
                  id="checkout-name"
                  type="text"
                  autoComplete="name"
                  value={participantName}
                  onChange={(e) => setParticipantName(e.target.value)}
                  placeholder="Ex : Aya Koné"
                  className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all font-medium"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="checkout-contact" className="text-sm font-medium text-slate-300">
                    {contactMethod === 'wa' ? 'Numéro WhatsApp' : 'Adresse e-mail'}
                  </label>
                  <button
                    type="button"
                    onClick={() => { setContactMethod(contactMethod === 'wa' ? 'email' : 'wa'); setContactValue(''); }}
                    className="text-xs font-semibold text-orange-400 hover:text-orange-300"
                  >
                    {contactMethod === 'wa' ? 'Recevoir par e-mail' : 'Recevoir sur WhatsApp'}
                  </button>
                </div>
                <div className="relative flex items-center">
                  {contactMethod === 'wa' && (
                    <select
                      aria-label="Indicatif du pays"
                      value={visitorCountryCode}
                      onChange={e => setVisitorCountryCode(e.target.value)}
                      className="absolute left-0 top-0 bottom-0 w-[5.5rem] bg-slate-800/80 border-y border-l border-slate-700 rounded-l-xl pl-2 text-slate-300 font-mono font-bold text-sm outline-none appearance-none cursor-pointer"
                    >
                      {Object.values(PAYMENT_ROUTING).map(country => (
                        <option key={country.code} value={country.code}>{country.code} {country.dialCode}</option>
                      ))}
                    </select>
                  )}
                  <input
                    id="checkout-contact"
                    type={contactMethod === 'wa' ? 'tel' : 'email'}
                    inputMode={contactMethod === 'wa' ? 'tel' : 'email'}
                    autoComplete={contactMethod === 'wa' ? 'tel-national' : 'email'}
                    value={contactValue}
                    onChange={(e) => setContactValue(e.target.value)}
                    placeholder={contactMethod === 'wa' ? '07 00 00 00 00' : 'aya@exemple.com'}
                    className={`w-full bg-slate-900/60 border border-slate-700 rounded-xl py-3 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all font-mono ${contactMethod === 'wa' ? 'pl-[6.25rem] pr-4' : 'px-4'}`}
                    required
                  />
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  {contactMethod === 'wa' ? 'Votre billet arrive sur WhatsApp. Ce numéro servira aussi au paiement (modifiable).' : 'Votre billet arrive par e-mail.'}
                </p>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 bg-gradient-to-r from-orange-600 to-amber-500 text-white rounded-xl font-bold transition-all hover:shadow-[0_0_20px_rgba(249,115,22,0.4)]"
              >
                Continuer vers le paiement · {formatCurrency(convertedTotal, displayCurrency)}
              </button>
            </form>
          </div>
        )}

        {step === 'method' && (
          <div className="p-6 animate-in fade-in slide-in-from-right-4">
            <div className="flex justify-between items-center mb-1">
              <button onClick={() => { setError(''); setStep('auth'); }} aria-label="Retour" className="text-slate-400 hover:text-white"><ArrowLeft size={20} /></button>
              <h3 className="text-xl font-bold text-white">Paiement</h3>
              <button onClick={() => onClose(false)} aria-label="Fermer" className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <p className="text-xs text-slate-500 mb-5 text-center">Étape 2 sur 2</p>

            {error && (
              <div role="alert" className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 text-sm">{error}</div>
            )}

            <div className="bg-slate-800/50 p-4 rounded-xl mb-5 border border-white/5">
              <div className="flex gap-2 bg-slate-900/50 p-1 rounded-xl mb-4">
                <button
                  onClick={() => setPaymentMode('full')}
                  className={`flex-1 p-2 rounded-lg border text-sm font-bold transition-all ${paymentMode === 'full' ? 'bg-orange-600/20 border-orange-500 text-white' : 'border-transparent text-slate-400 hover:bg-slate-800'}`}
                >
                  Tout payer
                </button>
                <button
                  onClick={() => setPaymentMode('installment')}
                  className={`flex-1 p-2 rounded-lg border text-sm font-bold transition-all flex items-center justify-center gap-1 ${paymentMode === 'installment' ? 'bg-amber-500/10 border-amber-500 text-amber-100' : 'border-transparent text-slate-400 hover:bg-slate-800'}`}
                >
                  En 3 fois <span className="bg-amber-500 text-amber-950 text-[9px] px-1 rounded uppercase font-black">Tontine</span>
                </button>
              </div>
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-slate-400 text-sm">{paymentMode === 'installment' ? 'À payer maintenant (1/3)' : 'Total à payer'}</p>
                  <p className="text-slate-500 text-xs truncate max-w-[150px]">{eventName}</p>
                </div>
                <div className="text-3xl font-black text-white">{formatCurrency(paymentMode === 'installment' ? convertedTotal / 3 : convertedTotal, displayCurrency)}</div>
              </div>
            </div>

            <p className="text-sm font-medium text-slate-300 mb-3">Payer avec</p>
            <form onSubmit={chosen?.kind === 'card' ? handleCardSubmit : handleMobileMoneySubmit} className="space-y-4">
              <PaymentMethodPicker
                options={paymentOptions}
                loading={paymentOptionsLoading}
                selected={selectedOption}
                onSelect={(key) => { setSelectedOption(key); setError(''); }}
                phone={payPhone}
                onPhoneChange={setPayPhone}
              />
              {chosen && (
                <button
                  type="submit"
                  className="w-full py-3.5 bg-gradient-to-r from-orange-600 to-amber-500 text-white rounded-xl font-bold transition-all hover:shadow-[0_0_20px_rgba(249,115,22,0.4)]"
                >
                  Payer {formatCurrency(paymentMode === 'installment' ? convertedTotal / 3 : convertedTotal, displayCurrency)}{chosen.kind === 'momo' ? ` avec ${chosen.label}` : ''}
                </button>
              )}
            </form>

            <p className="mt-5 text-xs text-slate-500 flex items-center justify-center gap-1">
              <ShieldCheck size={12} /> Paiement vérifié par Babipass avant l'envoi du billet
            </p>
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
            {queueWait ? (
              <>
                <h3 className="text-xl font-bold text-white mb-2">Forte affluence : vous êtes dans la file d'attente</h3>
                <p className="text-slate-400 text-sm">
                  Ne fermez pas cette fenêtre. Nouvel essai automatique dans {queueWait.seconds} s
                  {queueWait.attempt > 1 ? ` (tentative ${queueWait.attempt})` : ''}. Votre place sera réservée dès votre tour.
                </p>
              </>
            ) : (
              <>
                <h3 className="text-xl font-bold text-white mb-2">Traitement en cours...</h3>
                <p className="text-slate-400 text-sm">Veuillez valider le paiement sur votre téléphone. Cette fenêtre se fermera automatiquement après validation.</p>
              </>
            )}
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
            <div className="flex gap-4 w-full">
              <button
                onClick={() => { onClose(true); navigate('/tickets'); }}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-colors"
              >
                Voir mes billets
              </button>
              <button
                onClick={() => { 
                  setParticipantName(''); // Reset participant name
                  setStep('auth'); // Back to first purchase step
                }}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-colors border border-slate-700"
              >
                Nouveau Billet
              </button>
            </div>
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
