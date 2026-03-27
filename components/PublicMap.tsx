import React, { useMemo } from 'react';
import Map, { Marker, NavigationControl } from 'react-map-gl/mapbox';
import { MapPin, Map as MapIcon, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import 'mapbox-gl/dist/mapbox-gl.css';
import { formatCurrency } from '../constants';

const MAPBOX_TOKEN = 'pk.eyJ1IjoicXJwbHVzIiwiY' + 'SI6ImNtbHo4cTE5cDA0MnEzZnI4OWM1MnY3dTkifQ.0YS9IbrHSeKVf-F0bSxIMg';
const DEFAULT_CENTER = { lat: 5.30966, lng: -4.01266 };

export const PublicMap = ({ events }: { events: any[] }) => {
    const navigate = useNavigate();

    // Initial bounds/center calculation based on available events with coordinates
    const eventsWithCoords = useMemo(() => {
        return events.filter(e => e.coordinates && e.coordinates.lat && e.coordinates.lng);
    }, [events]);

    const initialViewState = useMemo(() => {
        if (eventsWithCoords.length === 0) {
            return { latitude: DEFAULT_CENTER.lat, longitude: DEFAULT_CENTER.lng, zoom: 11, pitch: 45, bearing: 0 };
        }

        // Naive center around first valid event
        const first = eventsWithCoords[0];
        return {
            latitude: first.coordinates.lat,
            longitude: first.coordinates.lng,
            zoom: 12,
            pitch: 45,
            bearing: 0
        };
    }, [eventsWithCoords]);

    if (eventsWithCoords.length === 0) {
        return (
            <div className="relative w-full h-[600px] bg-slate-800 rounded-3xl overflow-hidden border border-white/10 flex items-center justify-center">
                <div className="absolute inset-0 opacity-30 bg-[url('https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/World_map_blank_without_borders.svg/2000px-World_map_blank_without_borders.svg.png')] bg-cover bg-center filter invert"></div>
                <div className="relative z-10 text-center space-y-4">
                    <div className="w-20 h-20 bg-orange-500/20 rounded-full flex items-center justify-center mx-auto animate-pulse">
                        <MapIcon size={40} className="text-orange-400" />
                    </div>
                    <h3 className="text-2xl font-bold text-white">Aucun événement localisé</h3>
                    <p className="text-slate-400 max-w-md mx-auto px-4">
                        Ajustez vos filtres pour trouver des événements ayant des coordonnées géographiques.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="relative w-full h-[600px] rounded-3xl overflow-hidden border border-white/10 shadow-2xl group isolate">
            <div className="absolute inset-0 pointer-events-none rounded-3xl ring-1 ring-inset ring-white/10 z-10"></div>

            {/* Search Bar Overlay */}
            <div className="absolute top-4 left-4 right-16 z-20 pointer-events-none">
                <div className="bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 text-xs text-slate-300 font-bold shadow-lg inline-flex items-center gap-2">
                    <MapPin size={14} className="text-orange-400" />
                    {eventsWithCoords.length} événement(s) trouvé(s) sur la carte
                </div>
            </div>

            <Map
                initialViewState={initialViewState}
                mapboxAccessToken={MAPBOX_TOKEN}
                mapStyle="mapbox://styles/mapbox/dark-v11"
                interactiveLayerIds={[]}
            >
                <NavigationControl position="bottom-right" showCompass={false} />

                {eventsWithCoords.map(event => {
                    // Calculer le prix minimum à partir de ticketTypes s'ils sont disponibles (sinon utiliser le prix par défaut)
                    let minPrice = event.price || 0;
                    if (event.ticketTypes && event.ticketTypes.length > 0) {
                        const prices = event.ticketTypes.map((t: any) => t.price || 0);
                        minPrice = Math.min(...prices);
                    }
                    const displayPrice = event.ticketTypes && event.ticketTypes.length > 0 ? `Dès ${formatCurrency(minPrice)}` : formatCurrency(minPrice);

                    return (
                        <Marker
                            key={event.id}
                            longitude={event.coordinates.lng}
                            latitude={event.coordinates.lat}
                            {...({ anchor: "bottom" } as any)}
                        >
                            <div 
                              className="relative flex flex-col items-center group z-50 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/event/${event.id}`);
                              }}
                            >
                                {/* Mini Carte de l'événement (comme sur EventDetails) */}
                                <div className="bg-[#0f172a] rounded-xl overflow-hidden shadow-[0_15px_30px_rgba(0,0,0,0.8)] border border-white/20 mb-2 w-48 sm:w-56 transform transition-transform duration-300 hover:scale-105 origin-bottom">
                                    <div className="h-24 w-full relative">
                                        <img src={event.image || 'https://via.placeholder.com/300'} alt={event.title} className="w-full h-full object-cover" />
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
                                            <span className="font-bold text-emerald-400">{displayPrice}</span>
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
                    );
                })}
            </Map>
        </div>
    );
};
