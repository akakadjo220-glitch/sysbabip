import React, { useState, useEffect, useContext, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '../constants';
import { Event } from '../types';
import { useAuth } from '../context/AuthContext';
import { CountrySelector } from '../components/CountrySelector';
import { supabase } from '../supabaseClient';
import { CatalogService } from '../services/CatalogService';
import { AdCarousel } from '../components/AdCarousel';
import { MapPin, Calendar, Users, Filter, Search, Eye, Star, Map as MapIcon, List, SlidersHorizontal, ChevronLeft, ChevronRight, Globe, Loader2, Banknote, ShieldCheck, Ticket, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { lazyNamed } from '../utils/lazyPage';
import { detectCountry } from '../utils/detectCountry';

// La carte (Mapbox, ~460 Ko) n'est téléchargée que si le visiteur ouvre la vue « Carte ».
const PublicMap = lazyNamed(() => import('../components/PublicMap'), 'PublicMap');
import { saveSecureTicket } from '../utils/offlineStorage';
import { SEO } from '../components/SEO';
import { generateMarketplaceSEO } from '../utils/seoEngine';

const ITEMS_PER_PAGE = 20;

// Helper functions for View Counting
const getLocalViews = (eventId: string): number => {
  try {
    const storage = localStorage.getItem('afriTix_event_views');
    const views = storage ? JSON.parse(storage) : {};
    return Number(views[eventId] || 0);
  } catch (e) {
    console.error("Error reading views", e);
    return 0;
  }
};

const incrementLocalView = (eventId: string) => {
  try {
    const COOLDOWN = 5 * 60 * 1000; // 5 minutes
    const now = Date.now();

    const timestampsStr = localStorage.getItem('afriTix_view_timestamps');
    const timestamps = timestampsStr ? JSON.parse(timestampsStr) : {};
    const lastView = timestamps[eventId] || 0;

    if (now - lastView > COOLDOWN) {
      const viewsStr = localStorage.getItem('afriTix_event_views');
      const views = viewsStr ? JSON.parse(viewsStr) : {};

      views[eventId] = (Number(views[eventId] || 0)) + 1;
      timestamps[eventId] = now;

      localStorage.setItem('afriTix_event_views', JSON.stringify(views));
      localStorage.setItem('afriTix_view_timestamps', JSON.stringify(timestamps));
    }
  } catch (e) {
    console.error("Error incrementing view", e);
  }
};

export const Marketplace: React.FC = () => {
  const navigate = useNavigate();
  const { userCountry, setUserCountry, authLoading } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Tous');
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [cityFilter, setCityFilter] = useState('Tous');
  const [currentPage, setCurrentPage] = useState(1);
  const [categories, setCategories] = useState<string[]>(['Tous']);

  // Real data state
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('event_categories')
      .select('name')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .then(({ data }) => {
        if (data) setCategories(['Tous', ...data.map(c => c.name)]);
      });
  }, []);

  // Catalogue filtré et paginé par le serveur (mis en cache) : le navigateur ne
  // télécharge plus tous les événements à chaque visite.
  const [totalPages, setTotalPages] = useState(1);
  const [totalEvents, setTotalEvents] = useState(0);
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [mapEvents, setMapEvents] = useState<Event[]>([]);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    if (authLoading || !userCountry) return;
    let cancelled = false;

    const fetchEvents = async () => {
      setLoading(true);
      try {
        const result = await CatalogService.listEvents({
          country: userCountry,
          category: selectedCategory,
          city: cityFilter,
          q: debouncedSearch,
          page: currentPage,
          limit: ITEMS_PER_PAGE
        });
        if (cancelled) return;
        setEvents(result.events);
        setTotalEvents(result.total);
        setTotalPages(result.pages);
        setCityOptions(result.cities);
      } catch (error) {
        console.error('Error fetching events:', error);
        if (!cancelled) { setEvents([]); setTotalEvents(0); setTotalPages(1); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchEvents();
    return () => { cancelled = true; };
  }, [authLoading, userCountry, selectedCategory, cityFilter, debouncedSearch, currentPage]);

  // Repères de la carte (légers, tous les événements du pays)
  useEffect(() => {
    if (authLoading || !userCountry) return;
    CatalogService.mapEvents(userCountry).then(setMapEvents).catch(() => setMapEvents([]));
  }, [authLoading, userCountry]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory, cityFilter, userCountry]);

  // Première visite : pas d'écran de choix, le pays est détecté (Cloudflare) ;
  // le visiteur peut toujours en changer via le bouton du pays.
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  useEffect(() => {
    if (authLoading || userCountry) return;
    let cancelled = false;
    detectCountry().then(country => { if (!cancelled) setUserCountry(country); });
    return () => { cancelled = true; };
  }, [authLoading, userCountry]);

  // Chiffre réel affiché à la place d'un slogan.
  const [ticketsIssued, setTicketsIssued] = useState(0);
  useEffect(() => {
    CatalogService.ticketsIssued().then(setTicketsIssued).catch(() => setTicketsIssued(0));
  }, []);

  // Accueil jamais vide : sans événement à venir, on montre les derniers temps forts.
  const [highlights, setHighlights] = useState<Event[]>([]);
  const noFilters = selectedCategory === 'Tous' && cityFilter === 'Tous' && !debouncedSearch;
  useEffect(() => {
    if (loading || !userCountry || totalEvents > 0 || !noFilters) return;
    CatalogService.highlights(userCountry).then(setHighlights).catch(() => setHighlights([]));
  }, [loading, userCountry, totalEvents, noFilters]);

  // Catégories : les 5 premières visibles, les autres derrière « Plus ».
  const [showAllCategories, setShowAllCategories] = useState(false);

  if (showCountryPicker) {
    return <CountrySelector onSelect={(country) => { setUserCountry(country); setShowCountryPicker(false); }} />;
  }

  if (!userCountry) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Loader2 className="animate-spin text-orange-500" size={40} />
      </div>
    );
  }

  // Filtres (pays, catégorie, ville, recherche) et pagination faits par le serveur.
  const currentEvents = events;
  const uniqueCities = ['Tous', ...cityOptions];

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    scrollToTop();
  };

  const marketplaceSeo = generateMarketplaceSEO(userCountry);

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-50 overscroll-none pb-40">
      <SEO
        title={marketplaceSeo.title}
        description={marketplaceSeo.description}
        keywords={marketplaceSeo.keywords}
        canonicalUrl={marketplaceSeo.canonicalUrl}
        structuredData={marketplaceSeo.structuredData}
      />
      {/* 📢 Main Hero Carousel Area */}
      <section className="relative flex flex-col gap-4 animate-in slide-in-from-bottom-4 fade-in duration-700 mt-2">
        {/* Top Pills */}
        <div className="flex flex-wrap items-center gap-2 md:gap-3 px-2 z-20 pt-2 md:pt-8">
          {ticketsIssued >= 1000 && (
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-orange-500/20 border border-orange-500/50 text-orange-300 text-[10px] md:text-xs font-bold uppercase tracking-widest backdrop-blur-md">
              +{new Intl.NumberFormat('fr-FR').format(Math.floor(ticketsIssued / 1000) * 1000)} billets émis
            </div>
          )}
          <button
            onClick={() => setShowCountryPicker(true)}
            title="Changer de pays"
            className="inline-flex items-center gap-1.5 md:gap-2 px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-white text-[10px] md:text-xs font-bold uppercase tracking-widest backdrop-blur-md transition-colors"
          >
            <Globe size={12} />
            {userCountry === 'Global' ? 'Monde Entier' : userCountry}
          </button>
          <button
            onClick={() => navigate('/organizer/login')}
            className="inline-flex items-center gap-1.5 md:gap-2 px-4 py-1.5 rounded-full bg-orange-600 hover:bg-orange-500 border border-orange-400 text-white text-[10px] md:text-xs font-bold uppercase tracking-widest backdrop-blur-md transition-all shadow-lg shadow-orange-500/30"
          >
            Créer votre événement
          </button>
          <button
            onClick={() => navigate('/tickets')}
            className="inline-flex items-center gap-1.5 md:gap-2 px-4 py-1.5 rounded-full bg-rose-600 hover:bg-rose-500 border border-rose-400 text-white text-[10px] md:text-xs font-bold uppercase tracking-widest backdrop-blur-md transition-all shadow-lg shadow-rose-500/30"
          >
            <Ticket size={12} />
            Mes Billets
          </button>
        </div>

        {/* Floating Search Dock (Below Carousel) */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 p-2 rounded-2xl md:rounded-full flex flex-col sm:flex-row gap-2 mt-2 md:mt-4 z-30 mx-4 md:mx-auto md:w-11/12 lg:w-3/4 shadow-2xl relative">
          <div className="flex-1 relative w-full sm:w-auto">
            <Search className="absolute left-4 top-3.5 text-slate-300" size={20} />
            <input
              type="text"
              placeholder="Quel événement cherchez-vous ?"
              className="w-full bg-slate-900/60 border border-white/10 rounded-xl md:rounded-full pl-12 pr-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all text-sm md:text-base"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <div className="relative min-w-[140px] w-full sm:w-auto">
              <MapPin className="absolute left-3 top-3.5 text-slate-300" size={18} />
              <select
                className="w-full bg-slate-900/60 border border-white/10 rounded-xl md:rounded-full pl-10 pr-4 py-3 text-white appearance-none focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm md:text-base"
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
              >
                {uniqueCities.map(city => <option key={city} value={city}>{city}</option>)}
              </select>
            </div>
            <button className="w-full sm:w-auto bg-orange-600 text-white px-8 py-3 rounded-xl md:rounded-full font-bold transition-all flex items-center justify-center text-sm md:text-base hover:scale-110 active:scale-95 animate-glow-pulse">
              Rechercher
            </button>
          </div>
        </div>
      </section>

      {/* Control Bar */}
      <div className="sticky top-0 z-30 py-3 md:py-4 bg-[#0f172a]/95 backdrop-blur-xl border-b border-white/10 -mx-4 px-4 md:mx-0 md:px-0 md:rounded-xl md:border-none md:bg-transparent md:backdrop-blur-none flex flex-col md:flex-row justify-between items-center gap-4 shadow-xl md:shadow-none">
        <nav aria-label="Catégories d'événements" className="flex overflow-x-auto pb-2 md:pb-0 gap-2 w-full md:w-auto no-scrollbar mask-gradient snap-x">
        {(showAllCategories
            ? categories
            : [...categories.slice(0, 6), ...(categories.indexOf(selectedCategory) >= 6 ? [selectedCategory] : [])]
          ).map((cat) => {
            const SPORT_ICONS: Record<string, string> = {
              'Football': '⚽', 'Basketball': '🏀', 'Rugby': '🏉',
              'Athlétisme': '🏃', 'Sport': '🏆', 'Concert': '🎵',
              'Festival': '🎉', 'Soirée': '🍾', 'Conférence': '🎤',
              'Atelier': '🎓', 'Networking': '🤝', 'Théâtre & Humour': '🎭',
              'Mode & Beauté': '💄', 'Dîner de Gala': '🍽️', 'Autre': '✨'
            };
            const icon = SPORT_ICONS[cat] || '';
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`snap-start px-4 md:px-5 py-2 md:py-2.5 rounded-full text-xs md:text-sm font-bold whitespace-nowrap transition-all transform hover:scale-105 active:scale-95 ${selectedCategory === cat
                  ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-white shadow-lg shadow-orange-500/30'
                  : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700 hover:text-white border border-slate-700'
                  }`}
              >
                {icon && <span className="mr-1">{icon}</span>}{cat}
              </button>
            );
          })}
          {categories.length > 6 && (
            <button
              onClick={() => setShowAllCategories(v => !v)}
              className="snap-start px-4 md:px-5 py-2 md:py-2.5 rounded-full text-xs md:text-sm font-bold whitespace-nowrap bg-slate-800/50 text-orange-300 hover:bg-slate-700 hover:text-white border border-slate-700 transition-all"
            >
              {showAllCategories ? 'Moins' : `Plus (${categories.length - 6})`}
            </button>
          )}
        </nav>

        <div className="flex items-center gap-3 w-full md:w-auto bg-slate-800/50 p-1 rounded-xl border border-slate-700">
          <button
            onClick={() => setViewMode('grid')}
            className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === 'grid' ? 'bg-orange-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
          >
            <List size={18} />
            <span>Liste</span>
          </button>
          <button
            onClick={() => setViewMode('map')}
            className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === 'map' ? 'bg-orange-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
          >
            <MapIcon size={18} />
            <span>Carte</span>
          </button>
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-orange-500" size={48} />
        </div>
      ) : viewMode === 'grid' ? (
        <section className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
            {currentEvents.map((event, index) => (
              <div
                key={event.id}
                className="perspective-1000 animate-in fade-in zoom-in duration-500 fill-mode-both"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="preserve-3d h-full">
                  <EventCard
                    event={event}
                    onClick={() => {
                      incrementLocalView(event.id);
                      navigate(`/event/${event.slug || event.id}`);
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {!loading && totalEvents === 0 && (noFilters && highlights.length > 0 ? (
            <div className="space-y-6">
              <div className="text-center max-w-2xl mx-auto py-6">
                <h2 className="text-2xl md:text-3xl font-black text-white">De nouveaux événements arrivent bientôt</h2>
                <p className="text-slate-400 mt-2">
                  En attendant, revivez les derniers temps forts vécus avec Babipass.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                {highlights.map(event => (
                  <div key={event.id} className="relative opacity-90 hover:opacity-100 transition-opacity">
                    <span className="absolute top-3 left-3 z-20 px-2.5 py-1 rounded-full bg-slate-900/90 border border-white/15 text-[10px] font-bold uppercase tracking-widest text-slate-200">
                      Terminé
                    </span>
                    <EventCard event={event} onClick={() => navigate(`/event/${event.slug || event.id}`)} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState userCountry={userCountry} />
          ))}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-12 pt-8 border-t border-white/5">
              <button
                onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="p-3 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white"
              >
                <ChevronLeft size={20} />
              </button>

              <div className="flex gap-2">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => handlePageChange(page)}
                    className={`w-12 h-12 rounded-xl font-bold text-sm transition-all flex items-center justify-center ${currentPage === page
                      ? 'bg-orange-600 text-white shadow-lg shadow-orange-500/30 transform scale-105'
                      : 'bg-slate-800 border border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white'
                      }`}
                  >
                    {page}
                  </button>
                ))}
              </div>

              <button
                onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="p-3 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}
        </section>
      ) : (
        <Suspense fallback={<div className="h-[500px] rounded-3xl bg-slate-800/50 animate-pulse" />}>
          <PublicMap events={mapEvents} />
        </Suspense>
      )}

      {/* Publicité : après les événements, jamais avant (le contenu d'abord). */}
      <div className="w-full shadow-2xl relative z-10 mt-16">
        <AdCarousel />
      </div>

      {/* 🚀 Section d'Autorité SEO & Indexation Google / IA (Modèle Sitelinks Jumia) */}
      <section aria-label="À propos de Babipass" className="mt-20 pt-10 border-t border-white/10 text-slate-400 text-xs md:text-sm">
        <div className="bg-slate-900/60 rounded-3xl p-6 md:p-8 border border-white/5 space-y-6">
          <div className="border-b border-white/5 pb-4">
            <h1 className="text-xl md:text-2xl font-black text-white tracking-tight mb-2">
              Babipass — La Billetterie Événementielle N°1 en Côte d'Ivoire & en Afrique
            </h1>
            <p className="text-slate-400 leading-relaxed">
              Découvrez la plus vaste sélection d'événements à Abidjan et partout en Afrique : 
              <strong className="text-slate-200"> concerts live, festivals incontournables, tournois sportifs, soirées VIP</strong> et conférences professionnelles. 
              Achetez vos pass en toute confiance grâce au paiement instantané par <strong className="text-orange-400">Wave, Orange Money, MTN MoMo</strong> et carte bancaire.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
            <div className="space-y-2">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-400" />
                Anti-Fraude & QR Code Sécurisé
              </h2>
              <p className="text-slate-400 text-xs leading-relaxed">
                Chaque billet émis sur Babipass est infalsifiable et horodaté avec un QR Code unique cryptographiquement validé à l'entrée par les organisateurs.
              </p>
            </div>

            <div className="space-y-2">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Banknote size={16} className="text-orange-400" />
                Paiements Mobiles Locaux
              </h2>
              <p className="text-slate-400 text-xs leading-relaxed">
                Validez vos achats en quelques secondes sans carte bancaire obligatoire : Wave, Orange Money Côte d'Ivoire, MTN MoMo et Moov Money acceptés sans frais cachés.
              </p>
            </div>

            <div className="space-y-2">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Trophy size={16} className="text-amber-400" />
                Espace Organisateur Clé en Main
              </h2>
              <p className="text-slate-400 text-xs leading-relaxed">
                Créez votre événement en moins de 3 minutes, générez des billets physiques et digitaux, suivez vos encaissements en direct et retirez vos fonds rapidement.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

// --- Sub Components ---

export const EventCard: React.FC<{ event: Event; onClick: () => void }> = ({ event, onClick }) => {
  // Stock affiché seulement s'il est connu ; un événement passé n'invite plus à réserver.
  const sold = Number((event as any).sold) || 0;
  const capacity = Number((event as any).capacity) || 0;
  const ended = (event as any).status === 'completed' || new Date(event.date).getTime() < Date.now();
  const [viewCount, setViewCount] = useState<number>(0);
  const [rating, setRating] = useState<number>(0);
  const [reviewCount, setReviewCount] = useState<number>(0);

  useEffect(() => {
    // Uniquement les vrais avis : sans avis, la carte affiche « Nouveau ».
    setRating(Number((event as any).average_rating || 0));
    setReviewCount(Number((event as any).total_reviews || 0));

    // Real views from DB + local view buffer
    const dbViews = Number((event as any).views || 0);
    const localViews = getLocalViews(event.id);
    setViewCount(dbViews + localViews);
  }, [event.id, (event as any).views, (event as any).average_rating]);

  // Calculer le prix minimum à partir de ticketTypes s'ils sont disponibles (sinon utiliser le prix par défaut)
  const minPrice = React.useMemo(() => {
    if (event.ticketTypes && event.ticketTypes.length > 0) {
      return Math.min(...event.ticketTypes.map((t: any) => t.price || 0));
    }
    return event.price;
  }, [event.ticketTypes, event.price]);

  return (
    <div
      onClick={onClick}
      className="group hover-3d-tilt relative bg-[#1e293b] rounded-2xl md:rounded-3xl overflow-hidden border border-slate-700/50 hover:border-orange-500/80 transition-all duration-500 flex flex-col h-full cursor-pointer"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <img
          src={event.image}
          alt={event.title}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1e293b] via-transparent to-transparent opacity-60" />

        <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md px-3 py-1 rounded-lg border border-white/10 text-xs font-bold text-white uppercase tracking-wider">
          {event.category}
        </div>
        {/* Badge Tournoi */}
        {(event as any).tournament_id && (event as any).tournament_slug && (
          <Link
            to={`/tournoi/${(event as any).tournament_slug}`}
            onClick={e => e.stopPropagation()}
            className="absolute top-3 left-3 mt-7 flex items-center gap-1 bg-emerald-500/90 backdrop-blur-md px-2 py-0.5 rounded-lg border border-emerald-400/50 text-xs font-bold text-white hover:bg-emerald-500 transition-colors"
          >
            <Trophy size={10} /> Tournoi
          </Link>
        )}
        <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-md text-slate-900 px-3 py-1 rounded-lg text-xs font-bold shadow-lg flex flex-col items-center leading-tight">
          <span className="text-sm font-extrabold">{new Date(event.date).getDate()}</span>
          <span className="text-[10px] uppercase">{new Date(event.date).toLocaleString('fr-FR', { month: 'short' })}</span>
        </div>
      </div>

      <div className="p-5 flex-1 flex flex-col relative">
        <div className="flex-1">
          <h3 className="text-lg font-bold text-white mb-2 line-clamp-2 group-hover:text-orange-400 transition-colors">
            {event.title}
          </h3>
          <div className="flex items-center text-slate-400 text-sm mb-2">
            <MapPin size={16} className="mr-1 text-orange-400" />
            <span className="truncate">{event.location}, {event.city} <span className="text-slate-600">({event.country})</span></span>
          </div>

          <div className="flex items-center justify-between mb-3">
            {reviewCount > 0 && rating > 0 ? (
              <div className="flex items-center space-x-2" title={`${reviewCount} avis vérifiés`}>
                <div className="flex items-center bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 text-amber-500">
                  <Star size={12} fill="currentColor" className="mr-1" />
                  <span className="text-xs font-bold">{rating.toFixed(1)}</span>
                </div>
                <span className="text-xs text-slate-500">({reviewCount})</span>
              </div>
            ) : (
              <span className="text-[10px] font-bold uppercase tracking-widest text-sky-300 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded">Nouveau</span>
            )}
            <div className="flex items-center text-slate-500 text-xs gap-1" title={`${viewCount} vues`}>
              <Eye size={14} />
              <span>{viewCount.toLocaleString()}</span>
            </div>
          </div>

          {ended ? (
            <p className="text-xs text-slate-500 mt-4 mb-4">Événement terminé{sold > 0 ? ` · ${sold} billets vendus` : ''}</p>
          ) : capacity > 0 ? (
            <>
              <div className="w-full bg-slate-800 rounded-full h-1.5 mb-2 mt-4 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-orange-500 to-cyan-400 h-1.5 rounded-full"
                  style={{ width: `${Math.min(100, (sold / capacity) * 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-500 mb-4">
                <span>{sold} vendus</span>
                <span className="text-orange-400 font-medium">Reste {Math.max(0, capacity - sold)}</span>
              </div>
            </>
          ) : <div className="mb-4" />}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-slate-700/50 mt-auto">
          <div>
            <p className="text-xs text-slate-400 uppercase font-bold">À partir de</p>
            <div className="text-emerald-400 font-bold text-lg">
              {formatCurrency(minPrice)}
            </div>
          </div>
          <button className="px-4 py-2 bg-white/5 hover:bg-orange-600 border border-white/10 hover:border-orange-600 text-white rounded-lg text-sm font-medium transition-all group-hover:bg-orange-600 group-hover:border-orange-600">
            {ended ? 'Voir' : 'Réserver'}
          </button>
        </div>
      </div>
    </div>
  );
};



const EmptyState: React.FC<{ userCountry: string }> = ({ userCountry }) => (
  <div className="col-span-full py-20 text-center flex flex-col items-center">
    <div className="inline-block p-6 rounded-full bg-slate-800/50 mb-4 border border-slate-700">
      <Search size={48} className="text-slate-600" />
    </div>
    <h3 className="text-xl font-semibold text-slate-300">Aucun événement trouvé {userCountry !== 'Global' && `en ${userCountry}`}</h3>
    <p className="text-slate-500 mt-2">Essayez d'ajuster vos filtres de recherche.</p>
    <button
      onClick={() => window.location.reload()}
      className="mt-6 text-orange-400 hover:text-orange-300 font-medium"
    >
      Réinitialiser les filtres
    </button>
  </div>
);
