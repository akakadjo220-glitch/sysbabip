import React, { useRef, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Globe, ChevronRight, ChevronLeft, MapPin } from 'lucide-react';

interface CountrySelectorProps {
  onSelect: (country: string) => void;
}

// Using high-res flags from flagcdn.com
const COUNTRIES = [
  { id: 'ci', name: 'Côte d\'Ivoire', code: 'ci', region: 'Afrique de l\'Ouest', accent: 'from-orange-500 via-white to-green-500' },
  { id: 'sn', name: 'Sénégal', code: 'sn', region: 'Afrique de l\'Ouest', accent: 'from-green-500 via-yellow-400 to-red-500' },
  { id: 'cm', name: 'Cameroun', code: 'cm', region: 'Afrique Centrale', accent: 'from-green-600 via-red-500 to-yellow-500' },
  { id: 'tg', name: 'Togo', code: 'tg', region: 'Afrique de l\'Ouest', accent: 'from-green-600 via-yellow-400 to-red-500' },
  { id: 'cd', name: 'Congo RDC', code: 'cd', region: 'Afrique Centrale', accent: 'from-blue-600 to-red-500' },
  { id: 'fr', name: 'France', code: 'fr', region: 'Diaspora', accent: 'from-blue-600 via-white to-red-600' },
  { id: 'ml', name: 'Mali', code: 'ml', region: 'Afrique de l\'Ouest', accent: 'from-green-500 via-yellow-400 to-red-500' },
  { id: 'ga', name: 'Gabon', code: 'ga', region: 'Afrique Centrale', accent: 'from-green-500 via-yellow-400 to-blue-500' },
];

export const CountrySelector: React.FC<CountrySelectorProps> = ({ onSelect }) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [countries, setCountries] = useState<any[]>([]);

  useEffect(() => {
    const fetchCountries = async () => {
      try {
        const { data, error } = await supabase.from('supported_countries').select('*').eq('is_active', true).order('name');
        if (error) throw error;
        if (data && data.length > 0) {
          setCountries(data);
        } else {
          setCountries(COUNTRIES);
        }
      } catch (err) {
        setCountries(COUNTRIES);
      }
    };
    fetchCountries();
  }, []);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 300; // Increased scroll amount for better navigation
      scrollContainerRef.current.scrollBy({
        left: direction === 'right' ? scrollAmount : -scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0f172a] flex flex-col justify-center overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-orange-600/20 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-amber-500/20 rounded-full blur-[100px] animate-float" style={{ animationDelay: '2s' }}></div>
      </div>

      <div className="relative z-10 w-full space-y-12">

        {/* Header Section */}
        <div className="px-6 text-center animate-in slide-in-from-top-10 duration-700">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md mb-6">
            <Globe className="text-orange-400" size={16} />
            <span className="text-indigo-200 text-xs font-bold uppercase tracking-widest">Babipass Experience</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-white tracking-tight leading-none mb-4">
            Choisissez votre <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-rose-400">
              Destination
            </span>
          </h1>
        </div>

        {/* Horizontal Scroll Bubbles Section */}
        <div className="relative w-full group max-w-7xl mx-auto px-4 md:px-12">

          {/* Scroll Buttons - Increased z-index and visibility */}
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 md:-left-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 bg-slate-800/80 backdrop-blur-md border border-white/20 rounded-full flex items-center justify-center text-white hover:bg-slate-700 transition-all hover:scale-110 shadow-lg hidden md:flex"
            aria-label="Scroll left"
          >
            <ChevronLeft size={24} />
          </button>
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 md:-right-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 bg-slate-800/80 backdrop-blur-md border border-white/20 rounded-full flex items-center justify-center text-white hover:bg-slate-700 transition-all hover:scale-110 shadow-lg hidden md:flex"
            aria-label="Scroll right"
          >
            <ChevronRight size={24} />
          </button>

          {/* Bubbles Container - Removed snap-mandatory which can conflict with manual scroll */}
          <div
            ref={scrollContainerRef}
            className="flex gap-8 overflow-x-auto px-8 md:px-12 py-12 no-scrollbar items-center scroll-smooth"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {countries.map((country, idx) => (
              <button
                key={country.id}
                onClick={() => onSelect(country.name)}
                className="relative flex-none group/bubble cursor-pointer focus:outline-none transform transition-transform"
                style={{
                  animation: `float 6s ease-in-out infinite`,
                  animationDelay: `${idx * 0.5}s`
                }}
              >
                {/* The Bubble */}
                <div className="w-32 h-32 md:w-40 md:h-40 rounded-full p-1.5 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm border border-white/10 shadow-2xl transition-all duration-500 group-hover/bubble:scale-110 group-hover/bubble:border-orange-400/50 group-hover/bubble:shadow-orange-500/30 relative overflow-hidden">

                  {/* Flag Image */}
                  <div className="w-full h-full rounded-full overflow-hidden relative z-10 bg-slate-800">
                    <img
                      src={country.logo || `https://flagcdn.com/w640/${country.code.toLowerCase()}.png`}
                      alt={country.name}
                      className="w-full h-full object-cover transform scale-125 group-hover/bubble:scale-100 transition-transform duration-700"
                    />
                    {/* Inner Shadow/Gloss */}
                    <div className="absolute inset-0 rounded-full ring-inset ring-black/20 group-hover/bubble:bg-black/10 transition-colors"></div>

                    {/* Shine Effect */}
                    <div className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] bg-gradient-to-b from-white/20 to-transparent transform rotate-45 pointer-events-none"></div>
                  </div>

                  {/* Active Ring */}
                  <div className={`absolute inset-0 rounded-full border-2 border-transparent group-hover/bubble:border-orange-400/50 transition-colors`}></div>
                </div>

                {/* Text Label */}
                <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 text-center w-max opacity-80 group-hover/bubble:opacity-100 transition-opacity">
                  <h3 className="text-white font-bold text-lg tracking-wide group-hover/bubble:text-orange-300 transition-colors">
                    {country.name}
                  </h3>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                    {country.code}
                  </p>
                </div>
              </button>
            ))}

            {/* Global Bubble */}
            <button
              onClick={() => onSelect('Global')}
              className="relative flex-none group/bubble cursor-pointer focus:outline-none transform transition-transform"
              style={{ animation: `float 6s ease-in-out infinite`, animationDelay: '4s' }}
            >
              <div className="w-32 h-32 md:w-40 md:h-40 rounded-full p-1.5 bg-gradient-to-br from-orange-500/20 to-amber-500/20 backdrop-blur-md border border-orange-400/30 shadow-2xl transition-all duration-500 group-hover/bubble:scale-110 group-hover/bubble:shadow-orange-500/50 relative overflow-hidden flex items-center justify-center">
                <div className="w-full h-full rounded-full bg-[#0f172a] flex items-center justify-center relative z-10 group-hover/bubble:bg-orange-900/50 transition-colors">
                  <Globe size={48} className="text-orange-400 group-hover/bubble:text-white transition-colors duration-500" />
                </div>
              </div>
              <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 text-center w-max opacity-80 group-hover/bubble:opacity-100 transition-opacity">
                <h3 className="text-white font-bold text-lg tracking-wide group-hover/bubble:text-orange-300 transition-colors">
                  Monde
                </h3>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                  Global
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* Footer Hint */}
        <div className="text-center pt-8 animate-in fade-in delay-1000 duration-1000">
          <p className="text-slate-500 text-sm animate-pulse flex items-center justify-center gap-2">
            <MapPin size={14} /> Choisissez votre localisation
          </p>
        </div>

      </div>
    </div>
  );
};
