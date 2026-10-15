import React from 'react';
import Map, { Marker } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Calendar } from 'lucide-react';
import { MOCK_EVENTS, formatCurrency } from '../constants';

// Carte de localisation de la page événement. Chargée à part (Mapbox pèse
// ~460 Ko) pour ne pas retarder l'affichage de l'événement et du bouton d'achat.
export const EventLocationMap: React.FC<{ event: any }> = ({ event }) => (
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
);
