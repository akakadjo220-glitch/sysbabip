import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '../constants';
import { Event } from '../types';
import { useAuth } from '../context/AuthContext';
import { CountrySelector } from '../components/CountrySelector';
import { supabase } from '../supabaseClient';
import { AdCarousel } from '../components/AdCarousel';
import { MapPin, Calendar, Users, Filter, Search, Eye, Star, Map as MapIcon, List, SlidersHorizontal, ChevronLeft, ChevronRight, Globe, Loader2, Banknote, ShieldCheck, Ticket } from 'lucide-react';
import { PublicMap } from '../components/PublicMap';
import { saveSecureTicket } from '../utils/offlineStorage';
import { SEO } from '../components/SEO';

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

  // Fetch Events from Supabase — attendre que l'auth soit résolue pour éviter un deadlock GoTrue
  useEffect(() => {
    if (authLoading) return; // Ne pas fetcher tant que l'auth n'est pas résolue

    const fetchEvents = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('events')
          .select('*, ticket_types(*)')
          .eq('status', 'published');

        if (error) throw error;

        if (data && data.length > 0) {
          const formattedEvents = data.map((e: any) => ({
            ...e,
            ticketTypes: e.ticket_types
          }));
          setEvents(formattedEvents);
        } else {
          setEvents([]);
        }
      } catch (error) {
        console.error('Error fetching events:', error);
        setEvents([]);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [authLoading]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory, cityFilter, userCountry]);

  // If no country is selected, show the selector
  if (!userCountry) {
    return <CountrySelector onSelect={setUserCountry} />;
  }

  // Filter events based on search, category, city AND COUNTRY
  const filteredEvents = events.filter(event => {
    const matchesSearch = event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      event.city.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'Tous' || event.category === selectedCategory;
    const matchesCity = cityFilter === 'Tous' || event.city === cityFilter;
    // Country Filter Logic: If user selected 'Global', show all, otherwise match country
    const matchesCountry = userCountry === 'Global' || event.country === userCountry;

    return matchesSearch && matchesCategory && matchesCity && matchesCountry;
  });

  // Pagination Logic
  const totalPages = Math.ceil(filteredEvents.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const currentEvents = filteredEvents.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  // Get unique cities from filtered events to populate the dropdown
  // Get unique cities from filtered events to populate the dropdown
  const uniqueCities = ['Tous', ...Array.from(new Set(events.filter(e => userCountry === 'Global' || e.country === userCountry).map(e => e.city)))];

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    scrollToTop();
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-50 overscroll-none pb-40">
      <SEO
        title="Billetterie Événements en Afrique - 100% Sécurisé | Babipass"
        description="Découvrez et réservez instantanément vos billets d'événements (concerts, festivals, sports). Transactions 100% sécurisées et anti-fraude. Réservez ici ✓"
        keywords="billetterie afrique, achat ticket concert, événements sécurisés, billets sport, réservation en ligne"
      />
      {/* Immersive Hero Section */}
      <section className="relative rounded-3xl overflow-hidden min-h-[400px] md:min-h-[500px] flex flex-col justify-end p-6 md:p-12 border border-white/10 shadow-2xl group">
        <div className="absolute inset-0 z-0">
          <img
            src="https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=2070&auto=format&fit=crop"
            alt="Hero"
            className="w-full h-full object-cover transition-transform duration-[20s] group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] via-[#0f172a]/70 to-transparent" />
        </div>

        <div className="relative z-20 max-w-4xl space-y-4 md:space-y-6 animate-in slide-in-from-bottom-10 fade-in duration-700">
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-orange-500/20 border border-orange-500/50 text-orange-300 text-[10px] md:text-xs font-bold uppercase tracking-widest backdrop-blur-md">
              La billetterie #1 en Afrique
            </div>
            {/* Change Country Button */}
            <button
              onClick={() => setUserCountry('')} // Resetting country triggers the selector
              className="inline-flex items-center gap-1.5 md:gap-2 px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-white text-[10px] md:text-xs font-bold uppercase tracking-widest backdrop-blur-md transition-colors"
            >
              <Globe size={12} />
              {userCountry === 'Global' ? 'Monde Entier' : userCountry}
            </button>

            {/* CTA Organizer */}
            <button
              onClick={() => navigate('/organizer/login')}
              className="inline-flex items-center gap-1.5 md:gap-2 px-4 py-1.5 rounded-full bg-orange-600 hover:bg-orange-500 border border-orange-400 text-white text-[10px] md:text-xs font-bold uppercase tracking-widest backdrop-blur-md transition-all shadow-lg shadow-orange-500/30"
            >
              Créer votre événement
            </button>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-7xl font-black tracking-tight leading-none text-white drop-shadow-lg">
            Vivez l'instant <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-amber-400 to-rose-400 shimmer-text bg-[length:200%_auto]">
              Inoubliable
            </span>
          </h1>
          <p className="text-lg md:text-xl text-slate-200 font-light max-w-2xl drop-shadow-md">
            Accédez aux meilleurs événements {userCountry !== 'Global' ? `en ${userCountry}` : 'partout dans le monde'}. De l'effervescence des concerts live aux conférences inspirantes, garantissez votre place en quelques clics via notre billetterie 100% sécurisée.
          </p>

          {/* Floating Search Dock */}
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 p-2 rounded-2xl md:rounded-full flex flex-col sm:flex-row gap-2 mt-6 md:mt-8 shadow-2xl max-w-3xl">
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
        </div>
      </section>

      {/* 📢 Ad Banners Carousel */}
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: '200ms' }}>
        <AdCarousel />
      </div>

      {/* Control Bar */}
      <div className="sticky top-0 z-30 py-3 md:py-4 bg-[#0f172a]/95 backdrop-blur-xl border-b border-white/10 -mx-4 px-4 md:mx-0 md:px-0 md:rounded-xl md:border-none md:bg-transparent md:backdrop-blur-none flex flex-col md:flex-row justify-between items-center gap-4 shadow-xl md:shadow-none">
        <div className="flex overflow-x-auto pb-2 md:pb-0 gap-2 w-full md:w-auto no-scrollbar mask-gradient snap-x">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`snap-start px-4 md:px-5 py-2 md:py-2.5 rounded-full text-xs md:text-sm font-bold whitespace-nowrap transition-all transform hover:scale-105 active:scale-95 ${selectedCategory === cat
                ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-white shadow-lg shadow-orange-500/30'
                : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700 hover:text-white border border-slate-700'
                }`}
            >
              {cat}
            </button>
          ))}
        </div>

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

          {filteredEvents.length === 0 && (
            <EmptyState userCountry={userCountry} />
          )}

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
        <PublicMap events={filteredEvents} />
      )}
    </div>
  );
};

// --- Sub Components ---

const EventCard: React.FC<{ event: Event; onClick: () => void }> = ({ event, onClick }) => {
  const [viewCount, setViewCount] = useState<number>(0);
  const [rating, setRating] = useState<number>(0);
  const [reviewCount, setReviewCount] = useState<number>(0);

  useEffect(() => {
    // Simulated persistent random data logic
    const baseViews = Math.floor(event.sold * 1.5) + 120;
    const pseudoRandom = event.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const mockRating = 4 + (pseudoRandom % 10) / 10;
    const mockReviews = 20 + (pseudoRandom % 100);

    // Add local views
    const localViews = getLocalViews(event.id);

    setRating(mockRating);
    setReviewCount(mockReviews);
    setViewCount(baseViews + localViews);
  }, [event.id, event.sold]);

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
            <div className="flex items-center space-x-2">
              <div className="flex items-center bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 text-amber-500">
                <Star size={12} fill="currentColor" className="mr-1" />
                <span className="text-xs font-bold">{rating.toFixed(1)}</span>
              </div>
              <span className="text-xs text-slate-500">({reviewCount})</span>
            </div>
            <div className="flex items-center text-slate-500 text-xs gap-1" title={`${viewCount} vues`}>
              <Eye size={14} />
              <span>{viewCount.toLocaleString()}</span>
            </div>
          </div>

          <div className="w-full bg-slate-800 rounded-full h-1.5 mb-2 mt-4 overflow-hidden">
            <div
              className="bg-gradient-to-r from-orange-500 to-cyan-400 h-1.5 rounded-full"
              style={{ width: `${(event.sold / event.capacity) * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-slate-500 mb-4">
            <span>{event.sold} vendus</span>
            <span className="text-orange-400 font-medium">Reste {event.capacity - event.sold}</span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-slate-700/50 mt-auto">
          <div>
            <p className="text-xs text-slate-400 uppercase font-bold">À partir de</p>
            <div className="text-emerald-400 font-bold text-lg">
              {formatCurrency(minPrice)}
            </div>
          </div>
          <button className="px-4 py-2 bg-white/5 hover:bg-orange-600 border border-white/10 hover:border-orange-600 text-white rounded-lg text-sm font-medium transition-all group-hover:bg-orange-600 group-hover:border-orange-600">
            Réserver
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
