import React, { useMemo } from 'react';

interface TicketZone {
  id: string;
  name: string;
  price: number;
  capacity: number;
  sold?: number;
  stadium_zone?: string;
}

interface StadiumMapProps {
  ticketTypes: TicketZone[];
  cart: Record<string, number>;
  onZoneSelect: (ticketId: string) => void;
}

// Map zone name → SVG path id
const ZONE_KEY_MAP: Record<string, string[]> = {
  'Virage Nord':              ['virage-nord'],
  'Virage Sud':               ['virage-sud'],
  'Tribune Est':              ['tribune-est'],
  'Tribune Ouest':            ['tribune-ouest'],
  'Tribune Présidentielle':   ['tribune-presidentielle'],
  'Loge VIP':                 ['loges-vip'],
  'Zone Presse':              ['zone-presse'],
};

const getAvailability = (t: TicketZone) => {
  const available = t.capacity - (t.sold || 0);
  const pct = t.capacity > 0 ? available / t.capacity : 1;
  if (pct <= 0) return 'sold-out';
  if (pct <= 0.1) return 'critical';
  if (pct <= 0.5) return 'low';
  return 'available';
};

const ZONE_COLORS = {
  'available': { fill: '#10b981', stroke: '#34d399', label: 'Disponible' },
  'low':       { fill: '#f59e0b', stroke: '#fbbf24', label: 'Presque complet' },
  'critical':  { fill: '#ef4444', stroke: '#f87171', label: 'Dernières places' },
  'sold-out':  { fill: '#374151', stroke: '#4b5563', label: 'Complet' },
  'inactive':  { fill: '#1e293b', stroke: '#334155', label: 'Non configuré' },
};

export const StadiumMap: React.FC<StadiumMapProps> = ({ ticketTypes, cart, onZoneSelect }) => {
  // Build a map: zone_name → ticket
  const zoneTicketMap = useMemo(() => {
    const map: Record<string, TicketZone> = {};
    ticketTypes.forEach(t => {
      if (t.stadium_zone) map[t.stadium_zone] = t;
    });
    return map;
  }, [ticketTypes]);

  // Compute zone fill per SVG zone
  const getZoneColor = (zoneName: string) => {
    const ticket = zoneTicketMap[zoneName];
    if (!ticket) return ZONE_COLORS['inactive'];
    const avail = getAvailability(ticket);
    return ZONE_COLORS[avail];
  };

  const handleZoneClick = (zoneName: string) => {
    const ticket = zoneTicketMap[zoneName];
    if (ticket && getAvailability(ticket) !== 'sold-out') {
      onZoneSelect(ticket.id);
      // Scroll to ticket sidebar
      const el = document.getElementById('ticket-section');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const [hovered, setHovered] = React.useState<string | null>(null);

  const ZoneRect = ({
    zoneName, x, y, w, h, rx = 8
  }: { zoneName: string; x: number; y: number; w: number; h: number; rx?: number }) => {
    const colors = getZoneColor(zoneName);
    const ticket = zoneTicketMap[zoneName];
    const isClickable = !!ticket && getAvailability(ticket) !== 'sold-out';
    const isHovered = hovered === zoneName;
    const inCart = ticket && (cart[ticket.id] || 0) > 0;

    return (
      <g
        onClick={() => handleZoneClick(zoneName)}
        onMouseEnter={() => setHovered(zoneName)}
        onMouseLeave={() => setHovered(null)}
        style={{ cursor: isClickable ? 'pointer' : 'default' }}
      >
        <rect
          x={x} y={y} width={w} height={h} rx={rx}
          fill={colors.fill}
          fillOpacity={isHovered ? 0.9 : 0.6}
          stroke={inCart ? '#f97316' : colors.stroke}
          strokeWidth={inCart ? 3 : isHovered ? 2.5 : 1.5}
          style={{ transition: 'all 0.2s ease' }}
          filter={isHovered ? 'url(#glow)' : undefined}
        />
        {/* Texts */}
        {(() => {
          let textY1 = y + h / 2 - 6;
          let textY2 = y + h / 2 + 9;

          if (zoneName === 'Virage Nord') {
            textY1 = y + h - 18;
            textY2 = y + h - 6;
          } else if (zoneName === 'Tribune Ouest') {
            textY1 = 120;
            textY2 = 132;
          } else if (zoneName === 'Tribune Est') {
            textY1 = 126;
            textY2 = 138;
          }

          return (
            <>
              <text
                x={x + w / 2} y={textY1}
                textAnchor="middle" dominantBaseline="middle"
                fill="white" fontFamily="Inter, sans-serif"
                fontSize={w < 80 ? 9 : 11} fontWeight="700"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {zoneName.replace('Tribune ', 'Trib. ')}
              </text>
              {ticket && (
                <text
                  x={x + w / 2} y={textY2}
                  textAnchor="middle" dominantBaseline="middle"
                  fill="rgba(255,255,255,0.8)" fontFamily="Inter, sans-serif"
                  fontSize={9}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {ticket.capacity - (ticket.sold || 0)} pl. · {ticket.price >= 1000 ? `${Math.round(ticket.price / 1000)}k` : ticket.price} FCFA
                </text>
              )}
            </>
          );
        })()}

        {inCart && (
          <circle cx={x + w - 10} cy={y + 10} r={8} fill="#f97316" stroke="white" strokeWidth={1.5}>
            <animate attributeName="r" values="7;9;7" dur="1.5s" repeatCount="indefinite" />
          </circle>
        )}
      </g>
    );
  };

  const ZONES_LIST = Object.keys(ZONE_KEY_MAP);

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <h4 className="text-white font-black text-base flex items-center gap-2 shrink-0">
          🏟️ Plan du Stade
        </h4>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[10px] sm:text-xs">
          {Object.entries(ZONE_COLORS).filter(([k]) => k !== 'inactive').map(([k, v]) => (
            <span key={k} className="flex items-center gap-1.5 text-slate-400 whitespace-nowrap">
              <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm inline-block shrink-0" style={{ backgroundColor: v.fill, opacity: 0.7 }} />
              {v.label}
            </span>
          ))}
        </div>
      </div>

      <div className="relative w-full rounded-2xl overflow-hidden border border-white/10 bg-slate-900/80 shadow-2xl">
        <svg viewBox="0 0 560 380" width="100%" className="block">
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <radialGradient id="pitch-gradient" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#166534" />
              <stop offset="100%" stopColor="#14532d" />
            </radialGradient>
          </defs>

          {/* Stade background */}
          <rect x="0" y="0" width="560" height="380" fill="#0f172a" rx="16" />

          {/* Oval stadium outer */}
          <ellipse cx="280" cy="190" rx="260" ry="170" fill="#1e293b" stroke="#334155" strokeWidth="2" />

          {/* Pelouse / Pitch */}
          <rect x="120" y="100" width="320" height="180" rx="12" fill="url(#pitch-gradient)" />
          {/* Lignes terrain */}
          <rect x="120" y="100" width="320" height="180" rx="12" fill="none" stroke="#15803d" strokeWidth="2" />
          <line x1="280" y1="100" x2="280" y2="280" stroke="#15803d" strokeWidth="1.5" />
          <circle cx="280" cy="190" r="28" fill="none" stroke="#15803d" strokeWidth="1.5" />
          <circle cx="280" cy="190" r="3" fill="#15803d" />
          {/* Surface de réparation */}
          <rect x="120" y="145" width="50" height="90" fill="none" stroke="#15803d" strokeWidth="1.5" />
          <rect x="390" y="145" width="50" height="90" fill="none" stroke="#15803d" strokeWidth="1.5" />
          {/* But */}
          <rect x="110" y="173" width="10" height="34" fill="none" stroke="#86efac" strokeWidth="2" />
          <rect x="440" y="173" width="10" height="34" fill="none" stroke="#86efac" strokeWidth="2" />

          {/* ─── Zones Tribunes ─── */}
          {/* Virage Nord (haut) */}
          <ZoneRect zoneName="Virage Nord" x={160} y={12} w={240} h={76} />
          {/* Virage Sud (bas) */}
          <ZoneRect zoneName="Virage Sud" x={160} y={306} w={240} h={62} />
          {/* Tribune Ouest (gauche) */}
          <ZoneRect zoneName="Tribune Ouest" x={12} y={105} w={88} h={170} />
          {/* Tribune Est (droite) */}
          <ZoneRect zoneName="Tribune Est" x={460} y={105} w={88} h={170} />
          {/* Tribune Présidentielle (haut-centre overlay) */}
          <ZoneRect zoneName="Tribune Présidentielle" x={200} y={18} w={160} h={44} rx={6} />
          {/* Loges VIP (gauche, overlay) */}
          <ZoneRect zoneName="Loge VIP" x={18} y={146} w={76} h={96} rx={6} />
          {/* Zone Presse (droite, overlay) */}
          <ZoneRect zoneName="Zone Presse" x={466} y={158} w={70} h={64} rx={6} />


          {/* Label centre terrain */}
          <text x="280" y="193" textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize="11"
            fontFamily="Inter, sans-serif" fontWeight="600" style={{ userSelect: 'none' }}>
            TERRAIN
          </text>
        </svg>

        {/* Tooltip on hover */}
        {hovered && zoneTicketMap[hovered] && (
          <div className="absolute top-3 right-3 bg-slate-800/95 backdrop-blur-md border border-white/10 rounded-xl p-3 text-xs shadow-xl animate-in fade-in duration-200 z-10 min-w-[160px]">
            <p className="text-white font-black text-sm mb-1">🏟️ {hovered}</p>
            <p className="text-emerald-400 font-bold">
              {new Intl.NumberFormat('fr-FR').format(zoneTicketMap[hovered].price)} FCFA
            </p>
            <p className="text-slate-400 mt-0.5">
              {zoneTicketMap[hovered].capacity - (zoneTicketMap[hovered].sold || 0)} places restantes
            </p>
            <p className={`mt-1 font-bold ${ZONE_COLORS[getAvailability(zoneTicketMap[hovered])].label === 'Complet' ? 'text-red-400' : 'text-slate-300'}`}>
              {ZONE_COLORS[getAvailability(zoneTicketMap[hovered])].label}
            </p>
          </div>
        )}
      </div>

      <p className="text-slate-500 text-xs text-center">
        Cliquez sur une zone pour sélectionner votre place · Le plan est indicatif
      </p>
    </div>
  );
};
