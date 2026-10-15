import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { formatCurrency } from '../constants';
import { SEO } from '../components/SEO';
import { Calendar, MapPin, Ticket, Trophy, ArrowLeft, Loader2, ChevronRight, ShoppingCart } from 'lucide-react';

const SPORT_ICONS: Record<string, string> = {
  football: '⚽', basketball: '🏀', rugby: '🏉',
  athletisme: '🏃', boxing: '🥊', tennis: '🎾', autre: '🏆',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; pulse: boolean }> = {
  scheduled: { label: 'Programmé',  color: 'text-slate-400 bg-slate-700/50 border-slate-600',        pulse: false },
  live:       { label: '🔴 LIVE',   color: 'text-red-300 bg-red-500/20 border-red-500/40',           pulse: true  },
  halftime:   { label: '⏸️ Mi-Temps', color: 'text-amber-300 bg-amber-500/20 border-amber-500/40',  pulse: false },
  fulltime:   { label: '✅ Terminé', color: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30', pulse: false },
  postponed:  { label: '⏳ Reporté', color: 'text-orange-300 bg-orange-500/15 border-orange-500/30', pulse: false },
};

export const TournamentPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [tournament, setTournament] = useState<any>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [seasonPasses, setSeasonPasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<any>(null);

  // ── Initial fetch ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!slug) return;

    const fetchAll = async () => {
      setLoading(true);
      try {
        const { data: t, error } = await supabase
          .from('tournaments')
          .select('*')
          .eq('slug', slug)
          .single();
        if (error || !t) throw error;
        if (t.organizer_id) {
          const { data: org } = await supabase
            .from('organizer_public_profiles')
            .select('name, company, avatar')
            .eq('id', t.organizer_id)
            .maybeSingle();
          t.profiles = org;
        }
        setTournament(t);

        const [{ data: evts }, { data: passes }] = await Promise.all([
          supabase
            .from('events')
            .select('*, ticket_types(*)')
            .eq('tournament_id', t.id)
            .eq('status', 'published')
            .order('date', { ascending: true }),
          supabase
            .from('season_passes')
            .select('*')
            .eq('tournament_id', t.id)
            .eq('is_active', true)
            .order('price', { ascending: true }),
        ]);

        setMatches(evts || []);
        setSeasonPasses(passes || []);

        // ── Supabase Realtime for live scores ─────────────────────────────
        if (channelRef.current) supabase.removeChannel(channelRef.current);
        channelRef.current = supabase
          .channel(`tournament-scores-${t.id}`)
          .on('postgres_changes', {
            event: 'UPDATE', schema: 'public', table: 'events',
            filter: `tournament_id=eq.${t.id}`,
          }, (payload: any) => {
            setMatches(prev =>
              prev.map(m => m.id === payload.new.id ? { ...m, ...payload.new } : m)
            );
          })
          .subscribe();
      } catch (e) {
        console.error('Error loading tournament:', e);
        setTournament(null);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); };
  }, [slug]);

  if (loading) return (
    <div className="flex justify-center items-center min-h-screen bg-[#0f172a]">
      <Loader2 className="animate-spin text-orange-500" size={48} />
    </div>
  );

  if (!tournament) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0f172a] text-white gap-4">
      <Trophy size={64} className="text-slate-600" />
      <h1 className="text-2xl font-bold">Tournoi introuvable</h1>
      <button onClick={() => navigate('/')} className="text-orange-400 hover:text-orange-300 flex items-center gap-2 font-bold">
        <ArrowLeft size={18} /> Retour à l'accueil
      </button>
    </div>
  );

  const sportIcon = SPORT_ICONS[tournament.sport_type] || '🏆';
  const totalMatches = matches.length;
  const upcoming = matches.filter(m => new Date(m.date) > new Date()).length;
  const liveMatches = matches.filter(m => m.match_status === 'live').length;

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-50 pb-24">
      <SEO
        title={`${tournament.name} — ${tournament.competition || 'Tournoi'} | Babipass`}
        description={tournament.description || `Retrouvez tous les matchs du tournoi ${tournament.name} sur Babipass.`}
        image={tournament.logo_url}
        url={window.location.href}
      />

      {/* Hero */}
      <div className="relative overflow-hidden min-h-[340px] flex flex-col justify-end p-6 md:p-12">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-emerald-950/40 to-slate-950" />
        
        {tournament.banner_url ? (
          <img src={tournament.banner_url} alt={tournament.name}
            className="absolute inset-0 w-full h-full object-cover opacity-50" />
        ) : tournament.logo_url ? (
          <img src={tournament.logo_url} alt={tournament.name}
            className="absolute inset-0 w-full h-full object-cover opacity-10 blur-sm" />
        ) : null}
        
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] via-[#0f172a]/80 to-transparent" />

        <button onClick={() => navigate(-1)}
          className="absolute top-6 left-6 z-10 bg-white/10 backdrop-blur-md p-3 rounded-full text-white hover:bg-white/20 transition border border-white/10">
          <ArrowLeft size={20} />
        </button>

        {/* LIVE indicator top-right */}
        {liveMatches > 0 && (
          <div className="absolute top-6 right-6 z-10 flex items-center gap-2 bg-red-500/90 backdrop-blur text-white text-sm font-black px-4 py-2 rounded-full border border-red-400/50 shadow-lg shadow-red-500/30">
            <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
            {liveMatches} match{liveMatches > 1 ? 's' : ''} EN DIRECT
          </div>
        )}

        <div className="relative z-10 max-w-4xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-black uppercase tracking-widest">
            <span>{sportIcon}</span>
            {tournament.sport_type || 'Sport'} · {tournament.competition || 'Tournoi'}
          </div>

          <div className="flex items-center gap-6">
            {tournament.logo_url ? (
              <img src={tournament.logo_url} alt="" className="w-20 h-20 rounded-2xl object-cover border border-white/20 shadow-2xl shrink-0" />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-4xl shrink-0">
                {sportIcon}
              </div>
            )}
            <div>
              <h1 className="text-4xl md:text-5xl font-black text-white leading-tight">{tournament.name}</h1>
              {tournament.competition && (
                <p className="text-emerald-400 font-bold mt-1">🏆 {tournament.competition}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-slate-300">
            {tournament.start_date && (
              <span className="flex items-center gap-2 bg-white/10 backdrop-blur px-3 py-1.5 rounded-lg border border-white/10">
                <Calendar size={14} className="text-orange-400" />
                {new Date(tournament.start_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                {tournament.end_date && ` → ${new Date(tournament.end_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`}
              </span>
            )}
            <span className="flex items-center gap-2 bg-white/10 backdrop-blur px-3 py-1.5 rounded-lg border border-white/10">
              <Trophy size={14} className="text-orange-400" />
              {totalMatches} match{totalMatches > 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-3 py-1.5 rounded-lg">
              <Ticket size={14} />
              {upcoming} à venir
            </span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-5xl mx-auto px-4 md:px-8 space-y-8 mt-4">

        {/* Description */}
        {tournament.description && (
          <div className="bg-slate-800/50 rounded-2xl border border-white/10 p-6">
            <p className="text-slate-300 leading-relaxed text-lg">{tournament.description}</p>
          </div>
        )}

        {/* ─── PASS SAISON ───────────────────────────────────────────────────── */}
        {seasonPasses.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-2xl font-black text-white flex items-center gap-3">
              <span className="text-2xl">🎟️</span>
              Pass Saison — Accès à tous les matchs
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {seasonPasses.map(pass => {
                const remaining = pass.capacity - (pass.sold || 0);
                const pct = pass.capacity > 0 ? remaining / pass.capacity : 1;
                const isAlmostFull = pct <= 0.2;
                const isFull = remaining <= 0;

                return (
                  <div key={pass.id}
                    className={`relative overflow-hidden rounded-2xl border p-5 transition-all ${isFull ? 'border-slate-700 bg-slate-800/30 opacity-60' : 'border-emerald-500/30 bg-gradient-to-br from-emerald-950/50 to-teal-950/50 hover:border-emerald-400/60 hover:shadow-xl hover:shadow-emerald-500/10'}`}>

                    {/* Glow */}
                    {!isFull && <div className="absolute -top-8 -right-8 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl" />}

                    {isAlmostFull && !isFull && (
                      <div className="absolute top-3 right-3 bg-amber-500/80 text-white text-xs font-black px-2 py-0.5 rounded-full">
                        🔥 Presque complet
                      </div>
                    )}

                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-12 h-12 bg-emerald-500/20 border border-emerald-500/30 rounded-xl flex items-center justify-center text-2xl shrink-0">
                        🎟️
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-black text-lg">{pass.name}</h3>
                        {pass.description && <p className="text-slate-400 text-xs mt-0.5">{pass.description}</p>}
                      </div>
                    </div>

                    {pass.features && pass.features.length > 0 && (
                      <ul className="space-y-1 mb-4">
                        {pass.features.map((f: string, i: number) => (
                          <li key={i} className="flex items-center gap-2 text-slate-300 text-xs">
                            <span className="text-emerald-400">✓</span> {f}
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Availability bar */}
                    <div className="mb-4">
                      <div className="flex justify-between text-xs text-slate-400 mb-1">
                        <span>{remaining} places restantes</span>
                        <span>{pass.capacity} total</span>
                      </div>
                      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${isAlmostFull ? 'bg-amber-400' : 'bg-emerald-400'}`}
                          style={{ width: `${Math.max(0, Math.min(100, (1 - pct) * 100))}%` }} />
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white font-black text-2xl">{formatCurrency(pass.price)}</p>
                        <p className="text-slate-400 text-xs">pour tous les matchs</p>
                      </div>
                      {isFull ? (
                        <span className="flex items-center gap-2 bg-slate-700 text-slate-400 px-4 py-2.5 rounded-xl font-bold text-sm">
                          Complet
                        </span>
                      ) : (
                        <Link
                          to={`/?pass=${pass.id}&tournament=${tournament.id}`}
                          className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-500/20 transition-all hover:scale-105 text-sm"
                        >
                          <ShoppingCart size={16} />
                          Acheter
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── CALENDRIER DES MATCHS ─────────────────────────────────────────── */}
        <div>
          <h2 className="text-2xl font-black text-white mb-6 flex items-center gap-3">
            <Trophy className="text-orange-400" size={24} />
            Calendrier des matchs
          </h2>

          {matches.length === 0 ? (
            <div className="text-center py-16 bg-slate-800/30 rounded-2xl border border-white/10">
              <Trophy size={48} className="text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 text-lg font-semibold">Aucun match programmé pour l'instant</p>
              <p className="text-slate-500 text-sm mt-2">Les matchs apparaîtront ici dès leur publication</p>
            </div>
          ) : (
            <div className="space-y-4">
              {matches.map((match) => {
                const isLive         = match.match_status === 'live';
                const isHalftime     = match.match_status === 'halftime';
                const isFulltime     = match.match_status === 'fulltime';
                const isActiveMatch  = isLive || isHalftime;
                const isFinished     = isFulltime || (new Date(match.date) < new Date() && !isLive && !isHalftime);
                const showScore      = isActiveMatch || isFulltime || (match.home_score != null && match.away_score != null && isFinished);
                const statusCfg      = STATUS_CONFIG[match.match_status] || STATUS_CONFIG.scheduled;
                const minPrice       = match.ticket_types?.length > 0
                  ? Math.min(...match.ticket_types.map((t: any) => t.price || 0))
                  : match.price;

                return (
                  <div
                    key={match.id}
                    className={`group relative bg-slate-800/60 hover:bg-slate-800 rounded-2xl border transition-all duration-300 overflow-hidden ${isLive ? 'border-red-500/40 shadow-lg shadow-red-500/10' : isFinished ? 'border-slate-700/50 opacity-80' : 'border-white/10 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/10'}`}
                  >
                    {/* LIVE pulse border */}
                    {isLive && <div className="absolute inset-0 rounded-2xl border-2 border-red-500/30 animate-pulse pointer-events-none" />}

                    <div className="p-5 md:p-6 flex flex-col md:flex-row items-center gap-4 md:gap-6">
                      {/* Teams + Score */}
                      <div className="flex-1 flex flex-col items-center md:items-start gap-1">
                        {match.home_team && match.away_team ? (
                          <>
                            <div className="flex items-center gap-3">
                              <span className={`text-white font-black text-lg md:text-xl text-center ${isFinished ? 'text-slate-400' : ''}`}>
                                {match.home_team}
                              </span>

                              {/* Score Display */}
                              {showScore ? (
                                <div className={`shrink-0 px-5 py-1.5 rounded-xl font-black text-xl tabular-nums ${isLive ? 'bg-red-500 text-white shadow-lg shadow-red-500/40' : isHalftime ? 'bg-amber-500 text-white' : 'bg-slate-700 text-slate-300'}`}>
                                  {match.home_score} — {match.away_score}
                                </div>
                              ) : (
                                <div className={`shrink-0 px-4 py-1.5 rounded-xl font-black text-lg ${isFinished ? 'bg-slate-700 text-slate-500' : 'bg-orange-500 text-white shadow-lg shadow-orange-500/30'} ${!isFinished ? 'animate-pulse' : ''}`}>
                                  VS
                                </div>
                              )}

                              <span className={`text-white font-black text-lg md:text-xl text-center ${isFinished ? 'text-slate-400' : ''}`}>
                                {match.away_team}
                              </span>
                            </div>

                            {/* Status badge */}
                            <span className={`text-xs font-black px-2.5 py-0.5 rounded-full border ${statusCfg.color} ${statusCfg.pulse ? 'animate-pulse' : ''}`}>
                              {statusCfg.label}
                            </span>
                          </>
                        ) : (
                          <h3 className="text-white font-black text-lg">{match.title}</h3>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex flex-col items-center md:items-end gap-1 shrink-0">
                        <div className="flex items-center gap-2 text-slate-400 text-xs">
                          <Calendar size={12} className="text-orange-400" />
                          {new Date(match.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="flex items-center gap-2 text-slate-400 text-xs">
                          <MapPin size={12} className="text-orange-400" />
                          {match.location}, {match.city}
                        </div>
                        {!isFinished && (
                          <p className="text-emerald-400 font-black text-base mt-1">
                            Dès {formatCurrency(minPrice)}
                          </p>
                        )}
                      </div>

                      {/* CTA */}
                      {!isFinished && (
                        <Link
                          to={`/event/${match.slug || match.id}`}
                          className="shrink-0 flex items-center gap-2 bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white font-bold px-5 py-3 rounded-xl shadow-lg shadow-orange-500/20 transition-all hover:scale-105 text-sm"
                        >
                          <Ticket size={16} />
                          Acheter
                          <ChevronRight size={16} />
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Organizer credit */}
        {tournament.profiles && (
          <div className="text-center text-slate-500 text-sm border-t border-white/5 pt-6">
            Tournoi organisé par{' '}
            <span className="text-slate-300 font-bold">
              {tournament.profiles.company || tournament.profiles.name}
            </span>
            {' '}via Babipass
          </div>
        )}
      </div>
    </div>
  );
};
