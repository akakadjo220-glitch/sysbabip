import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, CalendarDays, History, MessageCircle } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { SEO } from '../components/SEO';
import { EventCard } from './Marketplace';
import type { Event } from '../types';

// Page publique d'un organisateur : ses prochains événements et ses événements passés.
// Les fans y suivent leurs organisateurs préférés ; Google y trouve tous leurs événements.
export const OrganizerPublicPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const [{ data: org }, { data: evs }] = await Promise.all([
        supabase.from('organizer_public_profiles').select('id, name, company, avatar').eq('id', id).maybeSingle(),
        supabase.from('events')
          .select('id, slug, title, date, image, price, currency, category, city, country, location, status, views, sold, capacity, ticket_types(price)')
          .eq('organizer_id', id)
          .in('status', ['published', 'completed'])
          .order('date', { ascending: false })
          .limit(60),
      ]);
      if (cancelled) return;
      setProfile(org || null);
      setEvents(((evs || []) as any[]).map(e => ({ ...e, ticketTypes: e.ticket_types })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return <div className="flex justify-center items-center min-h-[60vh]"><Loader2 className="animate-spin text-orange-500" size={40} /></div>;
  }
  if (!profile) {
    return <div className="p-10 text-center text-white">Organisateur introuvable.</div>;
  }

  const name = profile.company || profile.name || 'Organisateur';
  const now = Date.now();
  const upcoming = events.filter((e: any) => e.status === 'published' && new Date(e.date).getTime() >= now)
    .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const past = events.filter(e => !upcoming.includes(e));
  const pageUrl = `https://babipass.com/organisateur/${profile.id}`;
  const shareLink = `https://wa.me/?text=${encodeURIComponent(`🎟️ Tous les événements de ${name} sur Babipass\n${pageUrl}`)}`;

  const grid = (list: Event[], ended = false) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
      {list.map(event => (
        <div key={event.id} className={`relative ${ended ? 'opacity-90 hover:opacity-100 transition-opacity' : ''}`}>
          {ended && (
            <span className="absolute top-3 left-3 z-20 px-2.5 py-1 rounded-full bg-slate-900/90 border border-white/15 text-[10px] font-bold uppercase tracking-widest text-slate-200">
              Terminé
            </span>
          )}
          <EventCard event={event} onClick={() => navigate(`/event/${(event as any).slug || event.id}`)} />
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen pb-32">
      <SEO
        title={`Événements de ${name} — billets | Babipass`}
        description={`Tous les événements organisés par ${name} : ${upcoming.length} à venir. Billets en ligne, paiement Wave, Orange Money, MTN, carte.`}
        canonicalUrl={pageUrl}
        image={profile.avatar || undefined}
      />

      <section className="flex flex-col sm:flex-row items-center sm:items-end gap-5 pt-8 pb-10 border-b border-white/10">
        <div className="w-24 h-24 rounded-3xl overflow-hidden bg-slate-800 border border-white/10 shrink-0 flex items-center justify-center text-3xl font-black text-orange-400">
          {profile.avatar ? <img src={profile.avatar} alt={name} className="w-full h-full object-cover" /> : name.slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1 text-center sm:text-left">
          <p className="text-xs font-bold uppercase tracking-widest text-orange-400 mb-1">Organisateur</p>
          <h1 className="text-3xl md:text-4xl font-black text-white">{name}</h1>
          <p className="text-slate-400 mt-1">{upcoming.length} événement{upcoming.length > 1 ? 's' : ''} à venir · {past.length} passé{past.length > 1 ? 's' : ''}</p>
        </div>
        <a
          href={shareLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#25D366] text-white font-bold hover:brightness-110"
        >
          <MessageCircle size={18} /> Partager
        </a>
      </section>

      <section className="mt-10 space-y-6">
        <h2 className="flex items-center gap-2 text-xl font-black text-white"><CalendarDays size={20} className="text-orange-400" /> À venir</h2>
        {upcoming.length > 0 ? grid(upcoming) : (
          <p className="text-slate-400">Aucun événement à venir pour le moment. Revenez bientôt !</p>
        )}
      </section>

      {past.length > 0 && (
        <section className="mt-14 space-y-6">
          <h2 className="flex items-center gap-2 text-xl font-black text-white"><History size={20} className="text-slate-400" /> Événements passés</h2>
          {grid(past, true)}
        </section>
      )}
    </div>
  );
};
