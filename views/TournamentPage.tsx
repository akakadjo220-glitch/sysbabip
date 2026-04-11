import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { formatCurrency, formatDate } from '../constants';
import { SEO } from '../components/SEO';
import { Calendar, MapPin, Ticket, Trophy, ArrowLeft, Loader2, ChevronRight, Users, Globe } from 'lucide-react';

const SPORT_ICONS: Record<string, string> = {
  football: '⚽', basketball: '🏀', rugby: '🏉',
  athletisme: '🏃', boxing: '🥊', tennis: '🎾', autre: '🏆',
};

export const TournamentPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [tournament, setTournament] = useState<any>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    const fetchTournament = async () => {
      setLoading(true);
      try {
        // Fetch tournament
        const { data: t, error } = await supabase
          .from('tournaments')
          .select('*, profiles(name, company, avatar)')
          .eq('slug', slug)
          .single();
        if (error || !t) throw error;
        setTournament(t);

        // Fetch associated matches (events linked to this tournament)
        const { data: evts } = await supabase
          .from('events')
          .select('*, ticket_types(*)')
          .eq('tournament_id', t.id)
          .eq('status', 'published')
          .order('date', { ascending: true });
        setMatches(evts || []);
      } catch (e) {
        console.error('Error loading tournament:', e);
        setTournament(null);
      } finally {
        setLoading(false);
      }
    };
    fetchTournament();
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
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-emerald-950/40 to-slate-950" />
        {tournament.logo_url && (
          <img src={tournament.logo_url} alt={tournament.name}
            className="absolute inset-0 w-full h-full object-cover opacity-10 blur-sm" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] via-transparent to-transparent" />

        {/* Back */}
        <button onClick={() => navigate(-1)}
          className="absolute top-6 left-6 z-10 bg-white/10 backdrop-blur-md p-3 rounded-full text-white hover:bg-white/20 transition border border-white/10">
          <ArrowLeft size={20} />
        </button>

        <div className="relative z-10 max-w-4xl space-y-4">
          {/* Sport badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-black uppercase tracking-widest">
            <span>{sportIcon}</span>
            {tournament.sport_type || 'Sport'} · {tournament.competition || 'Tournoi'}
          </div>

          <div className="flex items-center gap-6">
            {/* Logo */}
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

          {/* Meta */}
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

        {/* Matches list */}
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
                const isPast = new Date(match.date) < new Date();
                const minPrice = match.ticket_types?.length > 0
                  ? Math.min(...match.ticket_types.map((t: any) => t.price || 0))
                  : match.price;

                return (
                  <div
                    key={match.id}
                    className={`group relative bg-slate-800/60 hover:bg-slate-800 rounded-2xl border transition-all duration-300 overflow-hidden ${isPast ? 'border-slate-700/50 opacity-75' : 'border-white/10 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/10'}`}
                  >
                    {/* Past badge */}
                    {isPast && (
                      <div className="absolute top-3 right-3 bg-slate-700 text-slate-400 text-xs font-bold px-2 py-0.5 rounded-full">
                        Terminé
                      </div>
                    )}

                    <div className="p-5 md:p-6 flex flex-col md:flex-row items-center gap-4 md:gap-6">
                      {/* Teams VS */}
                      <div className="flex-1 flex items-center gap-4 justify-center md:justify-start">
                        {match.home_team && match.away_team ? (
                          <div className="flex items-center gap-3">
                            <span className="text-white font-black text-lg md:text-xl text-center">{match.home_team}</span>
                            <div className={`shrink-0 px-4 py-1.5 rounded-xl font-black text-lg ${isPast ? 'bg-slate-700 text-slate-400' : 'bg-orange-500 text-white shadow-lg shadow-orange-500/30 animate-pulse'}`}>
                              VS
                            </div>
                            <span className="text-white font-black text-lg md:text-xl text-center">{match.away_team}</span>
                          </div>
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
                        <p className="text-emerald-400 font-black text-base mt-1">
                          Dès {formatCurrency(minPrice)}
                        </p>
                      </div>

                      {/* CTA */}
                      {!isPast && (
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
