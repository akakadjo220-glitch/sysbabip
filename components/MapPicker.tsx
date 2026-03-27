import React, { useState, useEffect, useRef } from 'react';
import Map, { Marker, NavigationControl } from 'react-map-gl/mapbox';
import { MapPin } from 'lucide-react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_TOKEN = 'pk.eyJ1IjoicXJwbHVzIiwiY' + 'SI6ImNtbHo4cTE5cDA0MnEzZnI4OWM1MnY3dTkifQ.0YS9IbrHSeKVf-F0bSxIMg';

interface MapPickerProps {
    initialCoordinates?: { lat: number; lng: number };
    onLocationSelect: (coords: { lat: number; lng: number }) => void;
}

// Mapbox standard default (Abidjan if nothing provided)
const DEFAULT_CENTER = { lat: 5.30966, lng: -4.01266 };

export const MapPicker: React.FC<MapPickerProps> = ({ initialCoordinates, onLocationSelect }) => {
    const [viewState, setViewState] = useState({
        longitude: initialCoordinates?.lng || DEFAULT_CENTER.lng,
        latitude: initialCoordinates?.lat || DEFAULT_CENTER.lat,
        zoom: 12,
        pitch: 45, // Add a slight tilt for a modern 3D look
        bearing: 0
    });

    const [marker, setMarker] = useState<{ lat: number; lng: number } | null>(
        initialCoordinates ? { lat: initialCoordinates.lat, lng: initialCoordinates.lng } : null
    );

    const mapRef = useRef<any>(null);

    useEffect(() => {
        if (initialCoordinates) {
            setMarker({ lat: initialCoordinates.lat, lng: initialCoordinates.lng });
            setViewState(prev => ({
                ...prev,
                longitude: initialCoordinates.lng,
                latitude: initialCoordinates.lat,
            }));
        }
    }, [initialCoordinates]);

    const handleMapClick = (evt: any) => {
        const coords = evt.lngLat;
        setMarker({ lat: coords.lat, lng: coords.lng });
        onLocationSelect({ lat: coords.lat, lng: coords.lng });

        // Smoothly fly to the new marker
        mapRef.current?.flyTo({
            center: [coords.lng, coords.lat] as [number, number],
            duration: 1500,
            zoom: 14,
            essential: true
        });
    };

    return (
        <div className="w-full h-80 rounded-2xl overflow-hidden border border-white/10 shadow-inner relative group isolate">
            <div className="absolute inset-0 pointer-events-none rounded-2xl ring-1 ring-inset ring-white/10 z-10"></div>

            {/* Search Bar Overlay - future enhancement, optional for now */}
            <div className="absolute top-4 left-4 right-12 z-20 pointer-events-none">
                <div className="bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 text-xs text-slate-300 font-bold shadow-lg inline-flex items-center gap-2">
                    <MapPin size={14} className="text-orange-400" />
                    Cliquez sur la carte pour définir l'emplacement
                </div>
            </div>

            {/* @ts-ignore react-map-gl types mismatch for v8 */}
            <Map
                ref={mapRef as any}
                {...viewState}
                {...({ onMove: (evt: any) => setViewState(evt.viewState) } as any)}
                mapboxAccessToken={MAPBOX_TOKEN}
                mapStyle="mapbox://styles/mapbox/dark-v11"
                onClick={handleMapClick}
                interactiveLayerIds={[]} // To allow clicking anywhere to place a marker reliably
                cursor="crosshair"
            >
                {/* @ts-ignore */}
                <NavigationControl position="bottom-right" showCompass={false} />

                {marker && (
                    <Marker
                        longitude={marker.lng}
                        latitude={marker.lat}
                        {...({ anchor: "bottom" } as any)}
                        draggable
                        onDragEnd={(e: any) => {
                            const lat = e.lngLat.lat ?? e.lngLat[1];
                            const lng = e.lngLat.lng ?? e.lngLat[0];
                            setMarker({ lat, lng });
                            onLocationSelect({ lat, lng });
                        }}
                    >
                        <div className="relative -top-2 cursor-pointer group-hover:scale-110 transition-transform animate-in zoom-in duration-300 drop-shadow-2xl">
                            {/* Pulse effect under marker */}
                            <div className="absolute -inset-4 bg-orange-500/30 rounded-full blur-md animate-pulse pointer-events-none"></div>
                            <div className="w-10 h-10 bg-gradient-to-tr from-orange-600 to-amber-500 rounded-full flex items-center justify-center border-2 border-white shadow-xl relative z-10">
                                <MapPin size={20} className="text-white drop-shadow-md" />
                            </div>
                            {/* Pin shadow */}
                            <div className="w-4 h-1 bg-black/40 rounded-full mx-auto mt-1 blur-[2px]"></div>
                        </div>
                    </Marker>
                )}
            </Map>
        </div>
    );
};
