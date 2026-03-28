import React, { useState, useEffect, useMemo, useContext, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie, Legend } from 'recharts';
import { Plus, Users, Calendar, ArrowRight, Save, Image as ImageIcon, MapPin, CheckCircle, Search, QrCode, Tag, LayoutDashboard, Clock, Eye, Trash2, Globe, Loader2, DollarSign, X, Check, Edit2, Shield, Activity, TrendingUp, Wallet, Banknote, MessageSquare, Send, User, Store, ShieldCheck, Key, Printer, Building2, Heart, Link, Target, XOctagon, Download, AlertTriangle } from 'lucide-react';
import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { formatCurrency } from '../constants';
import { Event } from '../types';
import { getPlatformSettings, getPlatformSetting } from '../utils/platformSettings';
import { supabase } from '../supabaseClient';
import { Pagination } from '../components/Pagination';
import { useAuth } from '../context/AuthContext';
import { MapPicker } from '../components/MapPicker';
import { VideoUploadField } from '../components/LazyVideo';
import { CRMPushService, PushCampaign } from '../services/CRMPushService';
import { getUniqueSlug } from '../utils/slugUtils';
import { getCountryDialCode } from '../utils/countryCodes';
import { PaystackService } from '../services/PaystackService';
import { PawaPayService } from '../services/PawaPayService';

const MapResizer = () => {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 300); // Délai pour laisser l'onglet se dessiner totalement
    return () => clearTimeout(timer);
  }, [map]);
  return null;
};

type OrganizerTab = 'overview' | 'events' | 'attendees' | 'sales' | 'marketing' | 'wallet' | 'chatbot' | 'account' | 'agents' | 'crm' | 'physical' | 'fundraising';
type ToastType = 'success' | 'error' | 'info';

import { AccountSettingsView } from '../components/AccountSettingsView';
interface Toast { id: number; message: string; type: ToastType; }

const ToastContainer: React.FC<{ toasts: Toast[]; onRemove: (id: number) => void }> = ({ toasts, onRemove }) => (
  <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
    {toasts.map(t => (
      <div key={t.id} className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border text-sm font-bold ${t.type === 'success' ? 'bg-emerald-900 border-emerald-500 text-emerald-100' : t.type === 'error' ? 'bg-red-900 border-red-500 text-red-100' : 'bg-slate-800 border-slate-600 text-slate-100'}`}>
        {t.type === 'success' ? <CheckCircle size={16} /> : t.type === 'error' ? <XCircle size={16} /> : <Eye size={16} />}
        <span className="flex-1">{t.message}</span>
        <button onClick={() => onRemove(t.id)} className="opacity-60 hover:opacity-100 shrink-0"><X size={14} /></button>
      </div>
    ))}
  </div>
);

const XCircle = ({ size, className }: any) => <X size={size} className={className} />;

export const OrganizerDashboard: React.FC = () => {
  const { user, authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<OrganizerTab>('overview');
  const [selectedEventId, setSelectedEventId] = useState<string>('all');
  const [loading, setLoading] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardEvent, setWizardEvent] = useState<any>(null);
  
  // Cancellation States
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelEventObj, setCancelEventObj] = useState<any>(null);
  const [cancelReason, setCancelReason] = useState('');

  const [events, setEvents] = useState<Event[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [attendees, setAttendees] = useState<any[]>([]);
  const [promos, setPromos] = useState<any[]>([]);

  // 1. Listen for Didit KYC returning parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    const sessionId = params.get('verificationSessionId');

    if (status && sessionId) {
      if (status.toLowerCase() === 'approved') {
        addToast('Félicitations ! Votre identité est vérifiée. Vous avez désormais accès à toutes les fonctionnalités.', 'success');
      } else {
        addToast(`La vérification a échoué ou a été annulée (Statut: ${status}). Veuillez réessayer.`, 'error');
      }

      // Clean up the URL securely without reloading the page
      const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
      window.history.replaceState({ path: newUrl }, '', newUrl);

      // Force profile refresh to get the latest status
      fetchProfile();
    }
  }, []);

  const [stats, setStats] = useState({ totalGross: 0, totalNet: 0, totalCommission: 0, availableBalance: 0 });
  const [eventSales, setEventSales] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);

  const fetchProfile = async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (data) setProfile(data);
  };

  const [toasts, setToasts] = useState<Toast[]>([]);
  const addToast = (message: string, type: ToastType = 'info') => {
    const id = Date.now() + Math.random(); setToasts(p => [...p, { id, message, type }]); setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 5000);
  };

  const fetchData = async () => {
    if (!user?.id) return;
    setLoading(true);
    console.log("OrganizerDashboard: Starting fetchData for", user.id);

    try {
      // 1. Récupération des événements (sans timeout artificiel — le timeout natif Supabase gère les erreurs)
      const { data: eventsData, error: evErr } = await supabase
        .from('events')
        .select(`*, ticket_types(*)`)
        .eq('organizer_id', user.id)
        .order('created_at', { ascending: false });

      if (evErr) throw new Error(evErr.message);

      const mappedEvents = (eventsData || []).map(e => ({
        id: e.id, title: e.title || 'Sans titre', date: e.date || e.start_date || new Date().toISOString(),
        city: e.city || '', country: e.country || '', price: Number(e.price) || 0,
        currency: e.currency || 'FCFA', image: e.image || e.cover_image || '',
        category: e.category || '', sold: Number(e.sold) || 0, capacity: Number(e.capacity) || 0,
        status: e.status || 'draft', description: e.description, gallery: e.gallery,
        program: e.program, location: e.location, coordinates: e.coordinates,
        ticketTypes: e.ticket_types, practicalInfos: e.practical_infos || [],
        supportPhone: e.support_phone || '', views: Number(e.views) || 0,
        video_url: e.video_url || ''
      } as any));

      setEvents(mappedEvents);

      // Build type name map
      const typeNameMap: Record<string, string> = {};
      eventsData?.forEach((e: any) => {
        (e.ticket_types || []).forEach((tt: any) => {
          typeNameMap[tt.id] = tt.name || 'Standard';
        });
      });

      // 2. Récupération des transactions (isolée)
      const eventIds = eventsData?.map(e => e.id) || [];
      let trxData: any[] = [];
      if (eventIds.length > 0) {
        try {
          const { data: rawTrx, error: trErr } = await supabase
            .from('transactions')
            .select('*, events(title, country), tickets(ticket_type_id, ticket_type)')
            .in('event_id', eventIds)
            .order('created_at', { ascending: false });

          if (trErr) {
            console.warn('Transactions fetch blocked:', trErr.message);
            addToast(`ⓘ Données de vente indisponibles : ${trErr.message}`, 'info');
          } else {
            trxData = rawTrx || [];
          }
        } catch (innerErr: any) {
          console.warn('Silent trx fetch error:', innerErr);
        }
      }

      setTransactions(trxData);

      const mappedAttendees = trxData.filter(t => t.status === 'completed').map(t => {
        let ticketTypeName = 'Standard';
        const ticketList = Array.isArray(t.tickets) ? t.tickets : (t.tickets ? [t.tickets] : []);
        if (ticketList.length > 0) {
          const rawType = ticketList[0].ticket_type_id || ticketList[0].ticket_type || 'Standard';
          ticketTypeName = typeNameMap[rawType] || rawType;
          // If the resolved name is still a UUID (meaning the ticket_type was deleted), fallback to Standard
          if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ticketTypeName)) {
            ticketTypeName = 'Standard';
          }
        }
        return {
          id: t.id.split('-')[0].substring(0, 8).toUpperCase(),
          fullId: t.id,
          name: t.guest_name || t.guest_email || 'Anonyme',
          event: t.events?.title || 'Événement Inconnu',
          eventId: t.event_id,
          ticketType: ticketTypeName,
          status: 'valid'
        };
      });
      setAttendees(mappedAttendees);
      setPromos([]);

      // 3. Stats Globales via RPC
      const { data: globalStats } = await supabase.rpc('get_org_stats', { p_organizer_id: user.id });
      if (globalStats) {
        setStats({
          totalGross: globalStats.totalGross,
          totalNet: globalStats.totalNet,
          totalCommission: globalStats.totalCommission,
          availableBalance: globalStats.availableBalance
        });
      }

      // 4. Ventes par Événement via Vue SQL
      const { data: salesData } = await supabase.from('org_event_sales_view')
        .select('*')
        .eq('organizer_id', user.id)
        .order('gross', { ascending: false });
      if (salesData) setEventSales(salesData);

    } catch (err: any) {
      console.error('fetchData error:', err.message);
      addToast(`Erreur chargement: ${err.message}`, 'error');
    } finally {
      setLoading(false);
      console.log("OrganizerDashboard: fetchData finished");
    }
  };

  useEffect(() => {
    if (authLoading) return; // Still waiting for auth state
    if (user?.id) {
      // Auth is loaded, and a user is present, fetch data
      fetchData();
      fetchProfile();
    } else {
      // Auth is loaded, but no user (e.g., logged out), stop loading indicator
      setLoading(false);
    }
  }, [user?.id, authLoading]);

  const startVerification = async () => {
    try {
      // 1. Mark as pending in database immediately
      await supabase.from('profiles').update({
        didit_status: 'pending'
      }).eq('id', user?.id);
      fetchProfile();

      // 2. Request a unique, secure session from the backend
      const response = await fetch('https://qg4skow800g8kookksgswsg4.188.241.58.227.sslip.io/api/didit/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user?.id,
          callback_url: window.location.origin + '/organizer'
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Erreur lors de la création de la session Didit');
      }

      // 3. Open the securely generated URL
      window.open(data.url, '_blank');
    } catch (err) {
      console.error('Erreur startVerification:', err);
      alert('Impossible de démarrer la vérification. Veuillez réessayer.');

      // Revert status on failure
      await supabase.from('profiles').update({
        didit_status: 'not_started'
      }).eq('id', user?.id);
      fetchProfile();
    }
  };

  const handleSaveEvent = async (data: any) => {
    try {
      const { ticketTypes, video, id, isEdit, dialCode, practicalInfos, supportPhone, ...eventPayload } = data;

      const totalCapacity = ticketTypes && ticketTypes.length > 0
        ? ticketTypes.reduce((sum: number, t: any) => sum + (Number(t.capacity) || 0), 0)
        : eventPayload.capacity || 0;
      const minPrice = ticketTypes && ticketTypes.length > 0
        ? Math.min(...ticketTypes.map((t: any) => Number(t.price) || 0))
        : eventPayload.price || 0;

      const payload: any = { ...eventPayload, capacity: totalCapacity, price: minPrice, practical_infos: practicalInfos, support_phone: supportPhone, organizer_name: user?.name, organizer_id: user?.id, video_url: video };
      
      if (payload.title) {
         payload.slug = await getUniqueSlug(payload.title, 'events', id);
      }

      let savedEvt: any = null;

      if (isEdit && id) {
        // Mode Modification
        const { data: updEvt, error } = await supabase.from('events').update(payload).eq('id', id).select().single();
        if (error) throw new Error(error.message);
        savedEvt = updEvt;

        // Mise à jour simpliste des tickets: Suppression puis réinsertion
        if (ticketTypes) {
          await supabase.from('ticket_types').delete().eq('event_id', id);
          if (ticketTypes.length > 0) {
            const ticketPayloads = ticketTypes.map((t: any) => ({
              event_id: id, name: t.name, price: t.price, quantity: t.capacity || 0, type: 'standard', features: t.features || []
            }));
            await supabase.from('ticket_types').insert(ticketPayloads);
          }
        }
        addToast('✅ Événement modifié avec succès !', 'success');
      } else {
        // Mode Création
        const settings = await getPlatformSettings(['default_commission_rate', 'default_advance_rate']);
        payload.commission_rate = Number(settings.default_commission_rate ?? 8);
        payload.advance_rate = Number(settings.default_advance_rate ?? 30);

        payload.status = 'pending_review';
        const { data: newEvt, error } = await supabase.from('events').insert([payload]).select().single();
        if (error) throw new Error(error.message);
        savedEvt = newEvt;

        if (newEvt && ticketTypes && ticketTypes.length > 0) {
          const ticketPayloads = ticketTypes.map((t: any) => ({
            event_id: newEvt.id, name: t.name, price: t.price, quantity: t.capacity || 0, type: 'standard', features: t.features || []
          }));
          const { error: tErr } = await supabase.from('ticket_types').insert(ticketPayloads);
          if (tErr) console.error("Erreur insertion tickets :", tErr);
        }
        addToast('✅ Événement soumis pour validation !', 'success');
      }

      setShowWizard(false);
      setWizardEvent(null);
      fetchData(); // Rafraîchir pour avoir les tickets etc.
      setActiveTab('events');
    } catch (err: any) {
      addToast(`Erreur sauvegarde: ${err.message}`, 'error');
    }
  };

  const exportEventBuyers = (eventId: string, title: string) => {
    const eventTxs = transactions.filter((t: any) => t.event_id === eventId && t.status === 'completed');
    if (eventTxs.length === 0) {
      addToast('Aucun acheteur enregistré pour cet événement.', 'error');
      return;
    }
    const headers = ['Nom', 'Email', 'Téléphone', 'Méthode', 'Billets', 'Montant (FCFA)', 'Date'];
    const rows = eventTxs.map((t: any) => [
      t.guest_name || '',
      t.guest_email || '',
      t.buyer_phone || t.guest_phone || '',
      t.method || '—',
      t.tickets ? (Array.isArray(t.tickets) ? t.tickets.length : 1) : 1,
      t.amount || 0,
      new Date(t.created_at).toLocaleDateString('fr-FR')
    ]);
    const csvContent = [headers, ...rows]
      .map(row => row.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `acheteurs-${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.csv`;
    link.click();
  };

  const submitCancellation = async () => {
    if (!cancelReason.trim() || cancelReason.length < 10) return addToast('Veuillez fournir un motif d\'annulation détaillé.', 'error');

    const { error } = await supabase.from('events').update({
      cancellation_status: 'requested',
      cancellation_reason: cancelReason
    }).eq('id', cancelEventObj.id);

    if (error) {
      addToast('Erreur lors de la demande: ' + error.message, 'error');
    } else {
      addToast('Votre demande a été soumise avec succès.', 'success');
      setEvents(events.map((e: any) => e.id === cancelEventObj.id ? { ...e, cancellation_status: 'requested', cancellation_reason: cancelReason } : e));
      setCancelModalOpen(false);
      setCancelReason('');
      setCancelEventObj(null);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    const hasSales = transactions.some((t: any) => t.event_id === eventId || t.events?.id === eventId);
    if (confirm(hasSales ? "Cet événement a déjà des ventes. Il sera annulé (Soft Delete) au lieu d'être supprimé définitivement. Continuer ?" : "Voulez-vous vraiment supprimer cet événement définitivement ?")) {
      try {
        if (hasSales) {
          const { error } = await supabase.from('events').update({ status: 'cancelled' }).eq('id', eventId);
          if (error) throw error;
          addToast('Événement annulé (Soft Delete)', 'info');
        } else {
          // On peut supprimer physiquement (Supabase Cascade effacera les tickets grâce à la FK si configurée, ou on nettoie manuellement)
          await supabase.from('ticket_types').delete().eq('event_id', eventId);
          const { error } = await supabase.from('events').delete().eq('id', eventId);
          if (error) throw error;
          addToast('Événement supprimé définitivement', 'success');
        }
        fetchData();
      } catch (err: any) {
        addToast(`Erreur suppression: ${err.message}`, 'error');
      }
    }
  };

  // Filter Data based on selectedEventId
  const filteredEvents = useMemo(() => {
    if (selectedEventId === 'all') return events;
    return events.filter(e => e.id === selectedEventId);
  }, [events, selectedEventId]);

  const filteredTransactions = useMemo(() => {
    if (selectedEventId === 'all') return transactions;
    return transactions.filter((t: any) => t.event_id === selectedEventId || t.events?.id === selectedEventId);
  }, [transactions, selectedEventId]);

  const filteredAttendees = useMemo(() => {
    if (selectedEventId === 'all') return attendees;
    return attendees.filter((a: any) => a.eventId === selectedEventId || a.event_id === selectedEventId);
  }, [attendees, selectedEventId]);

  if (loading) return <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4"><Loader2 className="animate-spin text-orange-500" size={48} /><p className="text-slate-400 font-medium">Chargement du portail organisateur...</p></div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative z-10 block">
      <ToastContainer toasts={toasts} onRemove={id => setToasts(p => p.filter(t => t.id !== id))} />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/5 backdrop-blur-xl p-6 rounded-3xl border border-white/10 shadow-xl relative z-20">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white flex items-center gap-3">
            <LayoutDashboard className="text-orange-400 shrink-0" size={32} /> Espace Organisateur
            {profile?.is_verified && (
              <span className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider animate-in zoom-in duration-500">
                <ShieldCheck size={14} /> Vérifié
              </span>
            )}
          </h1>
          <p className="text-slate-400 mt-2 font-medium flex items-center gap-2">
            {profile?.name || user?.email} • Gérant {events.length} événement{events.length > 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={() => {
          if (!profile?.is_verified) {
            addToast('Veuillez vérifier votre identité dans Mon Compte pour créer un événement.', 'error');
            setActiveTab('account');
            return;
          }
          setShowWizard(true);
        }} className="flex items-center gap-2 bg-gradient-to-r from-orange-600 to-amber-500 hover:scale-105 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-orange-500/25">
          <Plus size={18} /> Nouvel Événement
        </button>
      </div>

      {/* Identity Verification Banner */}
      {!profile?.is_verified && (
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 border border-orange-500/30 rounded-3xl p-6 shadow-2xl relative overflow-hidden group mb-2 z-20">
          <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/5 blur-3xl rounded-full -mr-20 -mt-20 group-hover:bg-orange-500/10 transition-colors" />
          <div className="flex flex-col md:flex-row items-center gap-6 relative z-10">
            <div className="bg-orange-500/10 p-4 rounded-2xl border border-orange-500/20">
              <ShieldCheck className="text-orange-500" size={40} />
            </div>
            <div className="flex-1 text-center md:text-left">
              <h4 className="text-xl font-black text-white mb-2">Vérification de l'Identité (KYC)</h4>
              <p className="text-slate-400 text-sm max-w-xl">
                {profile?.didit_status === 'pending'
                  ? "Votre demande est en cours. Si vous avez perdu la page ou fermé la fenêtre, vous pouvez relancer la session ci-dessous."
                  : "Vous devez vérifier votre identité officielle avec Didit pour pouvoir créer des événements, gérer votre équipe, et accéder à vos fonds."}
              </p>
            </div>
            <div className="flex flex-col gap-3 min-w-[220px]">
              <button
                onClick={startVerification}
                className="px-8 py-3 rounded-xl font-bold transition-all shadow-lg bg-gradient-to-r from-orange-600 to-amber-500 text-white hover:scale-105 shadow-orange-500/20 w-full"
              >
                {profile?.didit_status === 'pending' ? "Continuer / Relancer" : "Démarrer la vérification"}
              </button>
              {profile?.didit_status === 'pending' && (
                <div className="flex flex-col gap-2 w-full">
                  <button
                    onClick={() => {
                      addToast('⏳ Vérification du statut...', 'info');
                      fetchProfile();
                    }}
                    className="flex items-center justify-center gap-2 text-slate-400 hover:text-white text-xs font-bold transition-colors"
                  >
                    <Activity size={12} /> Rafraîchir mon statut
                  </button>
                  <button
                    onClick={async () => {
                      await supabase.from('profiles').update({ didit_status: 'not_started' }).eq('id', user?.id);
                      fetchProfile();
                    }}
                    className="flex items-center justify-center gap-2 text-red-400 hover:text-red-300 text-xs font-bold transition-colors mt-2"
                  >
                    Réinitialiser le processus
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex overflow-x-auto space-x-2 bg-slate-900/40 p-1.5 rounded-2xl border border-white/10 w-full no-scrollbar relative z-20 shadow-2xl backdrop-blur-lg">
        {[
          { id: 'overview', icon: Activity, label: "Tableau de bord" },
          { id: 'events', icon: Calendar, label: "Événements" },
          { id: 'attendees', icon: Users, label: "Participants" },
          { id: 'sales', icon: DollarSign, label: "Ventes" },
          { id: 'agents', icon: Store, label: "Équipe & POS" },
          { id: 'crm', icon: Send, label: "CRM & Push WA" },
          { id: 'marketing', icon: Globe, label: "Heatmap (BI)" },
          { id: 'wallet', icon: Wallet, label: "Mon Wallet" },
          { id: 'chatbot', icon: MessageSquare, label: "Bot WhatsApp" },
          { id: 'account', icon: User, label: "Mon Compte" },
          { id: 'physical', icon: Printer, label: "Billets Physiques" },
          ...(profile?.is_verified && profile?.business_status === 'verified' ? [{ id: 'fundraising', icon: Heart, label: "Collecte de Fonds" }] : []),
        ].map(tab => (
          <button key={tab.id} onClick={() => {
            const restrictedTabs = ['events', 'agents', 'wallet', 'physical'];
            if (!profile?.is_verified && restrictedTabs.includes(tab.id)) {
              addToast(`Veuillez vérifier votre identité pour accéder à l'onglet ${tab.label}.`, 'error');
              setActiveTab('account');
              return;
            }
            setActiveTab(tab.id as OrganizerTab);
          }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg border border-orange-400/50' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
            <tab.icon size={16} /> {tab.label}
          </button>
        ))}
      </div>

      {/* Global Event Filter (Only visible on specific tabs) */}
      {['overview', 'sales', 'attendees', 'physical'].includes(activeTab) && (
        <div className="flex items-center gap-3 bg-slate-900/40 p-3 rounded-2xl border border-white/10 w-full md:w-max relative z-20 shadow-xl backdrop-blur-lg">
          <Calendar className="text-slate-400 shrink-0 ml-2" size={18} />
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            className="bg-transparent border-none text-white font-semibold focus:ring-0 cursor-pointer outline-none w-full appearance-none pr-8"
            style={{ WebkitAppearance: 'none', MozAppearance: 'none' }}
          >
            <option value="all" className="bg-slate-800">Tous les événements</option>
            {events.map(ev => (
              <option key={ev.id} value={ev.id} className="bg-slate-800">{ev.title}</option>
            ))}
          </select>
        </div>
      )}

      {/* Views */}
      <div className="relative z-20 block">
        {activeTab === 'overview' && <OverviewView events={filteredEvents} transactions={filteredTransactions} />}
        {activeTab === 'events' && <EventsListView events={events}
          onCreate={() => { setWizardEvent(null); setShowWizard(true); }}
          onEdit={(e: any) => { setWizardEvent(e); setShowWizard(true); }}
          onDelete={handleDeleteEvent}
          onExportBuyers={exportEventBuyers}
          onRequestCancel={(e: any) => { setCancelEventObj(e); setCancelReason(''); setCancelModalOpen(true); }}
          addToast={addToast} />}
        {activeTab === 'attendees' && <AttendeesView userId={user?.id} addToast={addToast} />}
        {activeTab === 'sales' && <SalesView stats={stats} eventSales={eventSales} transactions={filteredTransactions} events={filteredEvents} />}
        {activeTab === 'agents' && <PosTeamView events={events} transactions={transactions} addToast={addToast} />}
        {activeTab === 'crm' && <PushCampaignView events={events} addToast={addToast} />}
        {activeTab === 'marketing' && <MarketingView transactions={transactions} />}
        {activeTab === 'wallet' && <WalletView eventSales={eventSales} stats={stats} addToast={addToast} refreshData={fetchData} profile={profile} fetchProfile={fetchProfile} />}
        {activeTab === 'chatbot' && <ChatbotView events={events} addToast={addToast} />}
        {activeTab === 'account' && <AccountSettingsView userMode="organizer" />}
        {activeTab === 'physical' && <PhysicalTicketsView events={filteredEvents} transactions={filteredTransactions} addToast={addToast} />}
        {activeTab === 'fundraising' && <FundraisingTab organizerId={user?.id} addToast={addToast} />}
      </div>

      {showWizard && <CreateEventWizard initialData={wizardEvent} onCancel={() => { setShowWizard(false); setWizardEvent(null); }} onSave={handleSaveEvent} />}

      {/* Cancellation Modal */}
      {cancelModalOpen && cancelEventObj && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm pointer-events-auto cursor-pointer" onClick={() => setCancelModalOpen(false)}></div>
          <div className="bg-slate-800 p-8 rounded-3xl w-full max-w-lg relative pointer-events-auto border border-white/10 shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center shrink-0">
                <AlertTriangle size={32} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Annuler l'événement</h2>
                <p className="text-slate-400 text-sm mt-1">{cancelEventObj.title}</p>
              </div>
            </div>

            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6 text-red-200 text-sm leading-relaxed">
              <strong>Attention :</strong> L'annulation entraîne le remboursement des acheteurs.
              L'administration vérifiera cette demande avant de procéder aux remboursements.
              Votre solde potentiel (Wallet) pour cet événement sera annulé s'ils n'ont pas encore été payés.
            </div>

            <label className="block mb-6">
              <span className="text-slate-300 font-bold mb-2 block">Citez les motifs précis de cette annulation :</span>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={4}
                className="w-full bg-slate-900/50 border border-slate-700 focus:border-red-500 rounded-xl p-4 text-white focus:outline-none"
                placeholder="Exemple: Problème logistique majeur indépendant de notre volonté..."
              />
            </label>

            <div className="flex gap-4">
              <button
                onClick={() => setCancelModalOpen(false)}
                className="flex-1 px-6 py-3 rounded-xl border border-white/10 hover:bg-white/5 font-bold transition-colors"
              >
                Retour
              </button>
              <button
                onClick={submitCancellation}
                className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold transition-colors"
              >
                Confirmer la demande
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Subcomponents ───

const StatCard = ({ title, value, trend, colorClass }: any) => (
  <div className={`relative p-6 rounded-3xl border border-white/10 bg-slate-900/50 backdrop-blur-xl overflow-hidden group shadow-2xl`}>
    <div className={`absolute inset-0 opacity-10 bg-gradient-to-br ${colorClass} transition-opacity group-hover:opacity-20`} />
    <p className="text-slate-400 text-sm font-semibold uppercase tracking-wider relative z-10">{title}</p>
    <h3 className="text-3xl font-extrabold text-white mt-2 relative z-10">{value}</h3>
    <p className="text-slate-400 text-sm mt-2 relative z-10 font-medium flex items-center gap-1"><TrendingUp size={14} className="text-emerald-400" /> {trend}</p>
  </div>
);

const OverviewView = ({ events, transactions }: any) => {
  const chartData = useMemo(() => {
    const data = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayName = d.toLocaleDateString('fr-FR', { weekday: 'short' });
      const dayStart = new Date(d.setHours(0, 0, 0, 0));
      const dayEnd = new Date(d.setHours(23, 59, 59, 999));

      const dayTrx = transactions.filter((t: any) => {
        if (t.status !== 'completed') return false;
        const tDate = new Date(t.created_at);
        return tDate >= dayStart && tDate <= dayEnd;
      });

      const daySales = dayTrx.reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);
      const dayTickets = dayTrx.length;

      data.push({ name: dayName, sales: daySales, tickets: dayTickets, scans: 0 });
    }
    return data;
  }, [transactions]);

  // Real ticket distribution: group by ticket_type name from events' ticket_types
  // Real ticket distribution: group by ticket_type name from events' ticketTypes
  const ticketDistData = useMemo(() => {
    // Build a map of ticket_type_id -> name from all events
    const typeNameMap: Record<string, string> = {};
    if (events && Array.isArray(events)) {
      events.forEach((e: any) => {
        // e.ticketTypes is the mapped property name from fetchData
        if (e.ticketTypes && Array.isArray(e.ticketTypes)) {
          e.ticketTypes.forEach((tt: any) => {
            typeNameMap[tt.id] = tt.name || 'Standard';
          });
        }
      });
    }

    const countMap: Record<string, number> = {};
    if (transactions && Array.isArray(transactions)) {
      transactions
        .filter((t: any) => t.status === 'completed')
        .forEach((t: any) => {
          // Each transaction may have associated tickets (array from join)
          const ticketList = Array.isArray(t.tickets) ? t.tickets : (t.tickets ? [t.tickets] : []);
          if (ticketList.length > 0) {
            ticketList.forEach((tk: any) => {
              // Priority: 1. tk.ticket_type_id (UUID), 2. tk.ticket_type (UUID/Name), 3. 'Standard'
              const rawType = tk.ticket_type_id || tk.ticket_type || 'Standard';
              // Resolve UUID to human name if possible. If not found in map, use rawType (might be UUID)
              let name = typeNameMap[rawType] || rawType;
              if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name)) {
                name = 'Standard';
              }
              countMap[name] = (countMap[name] || 0) + 1;
            });
          } else {
            // Fallback: transaction without tickets join data
            countMap['Standard'] = (countMap['Standard'] || 0) + 1;
          }
        });
    }

    const PALETTE = ['#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899'];
    return Object.entries(countMap).map(([name, value], idx) => ({
      name, value, color: PALETTE[idx % PALETTE.length]
    }));
  }, [events, transactions]);

  const rev = transactions.filter((t: any) => t.status === 'completed').reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);
  const totalTickets = events.reduce((sum: number, e: any) => sum + (Number(e.sold) || 0), 0);
  // Real page views: sum views from each event owned by this organizer
  const totalViews = events.reduce((sum: number, e: any) => sum + (Number(e.views) || 0), 0);
  const convRate = totalViews > 0 ? Math.round((totalTickets / totalViews) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Revenus Générés" value={formatCurrency(rev)} trend="Global" colorClass="from-emerald-500 to-teal-500" />
        <StatCard title="Billets Vendus" value={totalTickets.toString()} trend="Global" colorClass="from-orange-500 to-amber-500" />
        <StatCard title="Vues page" value={totalViews.toString()} trend="Derniers jours" colorClass="from-rose-500 to-rose-500" />
        <StatCard title="Taux Conv." value={`${convRate}%`} trend="Moyenne" colorClass="from-amber-500 to-orange-500" />
      </div>
      <div className="glass-panel p-8 rounded-3xl border border-white/10 bg-slate-900/50 backdrop-blur-xl shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-white">Évolution des ventes (7 derniers jours)</h3>
        </div>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} /><stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
              <XAxis dataKey="name" stroke="#94a3b8" />
              <YAxis yAxisId="left" stroke="#94a3b8" tickFormatter={v => `${(v / 1000)}k`} />
              <YAxis yAxisId="right" orientation="right" stroke="#10b981" />
              <RechartsTooltip contentStyle={{ background: 'rgba(30, 41, 59, 0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }} formatter={(v: number, n: string) => n === 'sales' ? [formatCurrency(v), 'CA'] : [v, 'Billets']} labelStyle={{ color: '#94a3b8', marginBottom: '4px' }} cursor={{ stroke: '#475569', strokeWidth: 1, strokeDasharray: '4 4' }} />
              <Area yAxisId="left" type="monotone" dataKey="sales" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
              <Area yAxisId="right" type="monotone" dataKey="tickets" stroke="#10b981" strokeWidth={2} fill="none" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel p-8 rounded-3xl border border-white/10 bg-slate-900/50 backdrop-blur-xl shadow-2xl">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-white">Répartition des billets</h3>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={ticketDistData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                  {ticketDistData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} stroke="rgba(255,255,255,0.05)" strokeWidth={2} />)}
                </Pie>
                <RechartsTooltip contentStyle={{ background: 'rgba(30, 41, 59, 0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }} itemStyle={{ color: '#fff' }} />
                <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px', color: '#94a3b8' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-panel p-8 rounded-3xl border border-white/10 bg-slate-900/50 backdrop-blur-xl shadow-2xl">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-white">Scans aux entrées (7j)</h3>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" axisLine={false} tickLine={false} />
                <RechartsTooltip contentStyle={{ background: 'rgba(30, 41, 59, 0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
                <Bar dataKey="scans" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={'#3b82f6'} fillOpacity={0.8 + (index * 0.05)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Events ───
const EventsListView = ({ events, onCreate, onEdit, onDelete, onExportBuyers, onRequestCancel, addToast }: any) => {
  const [search, setSearch] = useState('');
  const filtered = events.filter((e: Event) => (e.title || '').toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6 block">
      <div className="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-md relative z-30">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Chercher un event..." className="w-full bg-slate-900/50 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:ring-2 focus:ring-orange-500 outline-none" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-20 pointer-events-auto">
        {filtered.map((e: Event | any) => (
          <div key={e.id} className="bg-slate-900/40 border border-white/10 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-xl group hover:border-orange-500/50 transition-all flex flex-col pointer-events-auto cursor-default">
            <div className="h-44 relative bg-slate-800 shrink-0 overflow-hidden cursor-pointer" onClick={() => onEdit(e)}>
              {e.image ? <img src={e.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="" /> : <div className="w-full h-full flex items-center justify-center"><ImageIcon size={48} className="text-slate-600" /></div>}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900 to-transparent pointer-events-none" />
              <div className="absolute top-4 right-4"><StatusBadge status={e.status} /></div>
              
              {e.cancellation_status && e.cancellation_status !== 'none' && (
                <div className="absolute top-4 left-4 bg-red-600/90 text-white text-xs font-bold px-3 py-1 rounded-full border border-red-500 shadow-xl flex items-center gap-1">
                  <AlertTriangle size={12} />
                  {e.cancellation_status === 'requested' ? 'Annulation en cours' : e.cancellation_status === 'approved' ? 'Annulé & Remboursé' : 'Annulation refusée'}
                </div>
              )}

              <div className="absolute bottom-4 left-4 right-4 pointer-events-none">
                <h3 className="text-xl font-extrabold text-white line-clamp-1">{e.title}</h3>
                <p className="text-slate-300 text-sm mt-1">{new Date(e.date).toLocaleDateString('fr-FR', { dateStyle: 'medium' })}</p>
              </div>
            </div>
            <div className="p-5 grow flex flex-col justify-between">
              <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                <div><span className="text-slate-500 text-xs uppercase font-bold block mb-1">Billets Vendus</span><div className="text-white font-bold">{e.sold} <span className="text-slate-500 font-normal">/ {e.capacity || '∞'}</span></div></div>
                <div><span className="text-slate-500 text-xs uppercase font-bold block mb-1">Revenus</span><div className="text-emerald-400 font-bold">{formatCurrency((e.sold || 0) * (e.price || 0))}</div></div>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden shrink-0 mb-4"><div className="h-full bg-orange-500 relative" style={{ width: `${Math.min(100, (e.sold / (e.capacity || 1)) * 100)}%` }} /></div>

              {/* Actions */}
              <div className="flex flex-col gap-2 pt-4 border-t border-white/10 mt-auto">
                <div className="flex items-center gap-2">
                  <button
                    onClick={(ev) => { ev.stopPropagation(); onEdit(e); }}
                    className="flex-1 flex justify-center items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white py-2 rounded-xl text-sm font-bold transition-colors">
                    <Edit2 size={16} /> Modifier
                  </button>
                  <button
                    onClick={(ev) => { ev.stopPropagation(); onExportBuyers(e.id, e.title); }}
                    title="Exporter les acheteurs en CSV"
                    className="flex-none flex justify-center items-center bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 p-2 rounded-xl transition-colors">
                    <Download size={16} />
                  </button>
                  <button
                    onClick={(ev) => { ev.stopPropagation(); onDelete(e.id); }}
                    className="flex-none flex justify-center items-center bg-red-500/10 hover:bg-red-500/20 text-red-500 p-2 rounded-xl transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
                
                {/* Cancellation Button */}
                {(new Date(e.date) > new Date() || e.status === 'published') && (!e.cancellation_status || e.cancellation_status === 'none' || e.cancellation_status === 'rejected') && (
                  <button
                    onClick={(ev) => { ev.stopPropagation(); onRequestCancel(e); }}
                    className="w-full flex justify-center items-center gap-2 bg-red-500/10 hover:bg-red-500/20 hover:text-red-400 border border-red-500/20 hover:border-red-500/40 text-red-500 py-2 rounded-xl text-[11px] uppercase tracking-wider font-extrabold transition-all">
                    <XOctagon size={14} /> Demander l'annulation
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Attendees ───
const AttendeesView = ({ userId, addToast }: any) => {
  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [eventFilter, setEventFilter] = useState('all');
  const [userEvents, setUserEvents] = useState<any[]>([]);
  const [attendees, setAttendees] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const ITEMS_PER_PAGE = 25;

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setCurrentPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  // Reset page on event filter change
  useEffect(() => { setCurrentPage(1); }, [eventFilter]);

  // Load organizer's events for the filter dropdown
  useEffect(() => {
    if (!userId) return;
    supabase.from('events').select('id, title').eq('organizer_id', userId).order('date', { ascending: false })
      .then(({ data }) => setUserEvents(data || []));
  }, [userId]);

  // Server-side fetch — Online buyers only, via transactions (not physical QR)
  const fetchAttendees = async () => {
    if (!userId) return;
    setLoading(true);
    const from = (currentPage - 1) * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    // 1. Get event IDs for this organizer (or specific event)
    let eventIds: string[];
    if (eventFilter !== 'all') {
      eventIds = [eventFilter];
    } else {
      const { data: evs } = await supabase.from('events').select('id').eq('organizer_id', userId);
      eventIds = (evs || []).map((e: any) => e.id);
    }

    if (eventIds.length === 0) { setAttendees([]); setTotalCount(0); setLoading(false); return; }

    // 2. Query via TRANSACTIONS (online purchases always have buyer info)
    let query = supabase
      .from('transactions')
      .select(`
        id,
        guest_name,
        guest_email,
        buyer_phone,
        status,
        method,
        events!inner(id, title),
        tickets(id, status, ticket_type)
      `, { count: 'exact' })
      .in('event_id', eventIds)
      .eq('status', 'completed')
      .neq('guest_name', 'Billet Physique (Revendeur)')  // exclude physical QR batches
      .order('created_at', { ascending: false });

    if (debouncedSearch) {
      query = query.or(`guest_name.ilike.%${debouncedSearch}%,guest_email.ilike.%${debouncedSearch}%,buyer_phone.ilike.%${debouncedSearch}%`);
    }

    const { data, count, error } = await query.range(from, to);

    if (error) {
      console.error('Erreur Participants:', error.message);
      setAttendees([]);
      setTotalCount(0);
    } else {
      const mapped = (data || []).map((t: any) => ({
        id: String(t.id).slice(0, 8).toUpperCase(),
        fullId: t.id,
        name: t.guest_name || t.guest_email || '—',
        event: t.events?.title || '—',
        ticketType: t.tickets?.[0]?.ticket_type || 'Standard',
        status: t.tickets?.[0]?.status || 'valid',
        realTicketId: t.tickets?.[0]?.id || null,
      }));
      setAttendees(mapped);
      setTotalCount(count || 0);
    }

    setLoading(false);
  };

  useEffect(() => { fetchAttendees(); }, [currentPage, debouncedSearch, eventFilter, userId]);

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  const handleToggleStatus = async (attendee: any, currentStatus: string) => {
    if (!attendee.realTicketId) {
      addToast("Ce billet n'est pas encore synchronisé, impossible de modifier son statut.", 'error');
      return;
    }
    const newStatus = currentStatus === 'revoked' ? 'valid' : 'revoked';
    const actionName = newStatus === 'revoked' ? 'désactiver' : 'réactiver';
    if (confirm(`Voulez-vous vraiment ${actionName} le billet de ${attendee.name} ?`)) {
      setLoadingAction(attendee.id);
      const { error } = await supabase.from('tickets').update({ status: newStatus }).eq('id', attendee.realTicketId);
      if (error) {
        addToast(`Erreur: ${error.message}`, 'error');
      } else {
        addToast(`Billet de ${attendee.name} ${newStatus === 'revoked' ? 'désactivé' : 'réactivé'} avec succès.`, 'success');
        setAttendees(prev => prev.map(a => a.id === attendee.id ? { ...a, status: newStatus } : a));
      }
      setLoadingAction(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3 bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-md">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un participant..." className="w-full bg-slate-900/50 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:ring-2 focus:ring-orange-500 outline-none" />
        </div>
        <select value={eventFilter} onChange={e => setEventFilter(e.target.value)} className="bg-slate-900/50 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:ring-2 focus:ring-orange-500 outline-none">
          <option value="all">Tous les événements</option>
          {userEvents.map((ev: any) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
        </select>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-xl relative z-20">
        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-slate-900/50">
          <h3 className="text-lg font-bold text-white">Billets Émis & Participants <span className="text-slate-400 text-sm font-normal">({totalCount})</span></h3>
        </div>
        {loading ? (
          <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-orange-400" size={28} /></div>
        ) : (
          <div className="overflow-x-auto relative">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-900/80 text-slate-400 uppercase text-xs font-bold tracking-wider">
                <tr><th className="px-6 py-4">Billet #ID</th><th className="px-6 py-4">Nom</th><th className="px-6 py-4">Événement</th><th className="px-6 py-4">Type</th><th className="px-6 py-4">Statut</th><th className="px-6 py-4">Action</th></tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {attendees.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">Aucun participant enregistré.</td></tr>
                ) : (
                  attendees.map((a: any) => (
                    <tr key={a.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 text-slate-500 font-mono text-xs font-bold">{a.id}</td>
                      <td className="px-6 py-4 text-white font-bold">{a.name}</td>
                      <td className="px-6 py-4 text-slate-300">{a.event}</td>
                      <td className="px-6 py-4 font-bold text-orange-400">{a.ticketType}</td>
                      <td className="px-6 py-4">
                        {a.status === 'revoked' ? (
                          <span className="px-2 py-1 rounded text-xs font-bold bg-red-500/20 text-red-500 border border-red-500/30 flex items-center gap-1 w-max"><XCircle size={12} /> Désactivé</span>
                        ) : a.status === 'scanned' ? (
                          <span className="px-2 py-1 rounded text-xs font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-1 w-max"><CheckCircle size={12} /> Scanné</span>
                        ) : (
                          <span className="px-2 py-1 rounded text-xs font-bold bg-emerald-500/20 text-emerald-400 flex items-center gap-1 w-max"><CheckCircle size={12} /> Actif</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {a.status === 'revoked' ? (
                          <button onClick={() => handleToggleStatus(a, a.status)} disabled={loadingAction === a.id} className="text-emerald-400 hover:text-white hover:bg-emerald-500/20 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 disabled:opacity-50">
                            {loadingAction === a.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />} Activer
                          </button>
                        ) : a.status === 'scanned' ? (
                          <span className="text-slate-500 text-xs font-medium italic">Déjà utilisé</span>
                        ) : (
                          <button onClick={() => handleToggleStatus(a, a.status)} disabled={loadingAction === a.id} className="text-red-400 hover:text-white hover:bg-red-500/20 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 disabled:opacity-50">
                            {loadingAction === a.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Désactiver
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-6 py-4 border-t border-white/5">
          <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={totalCount} itemsPerPage={ITEMS_PER_PAGE} />
        </div>
      </div>
    </div>
  );
};

const SalesView = ({ stats, eventSales }: any) => {
  const [salesPage, setSalesPage] = useState(1);
  const SALES_PER_PAGE = 10;

  const totalRevenuBrut = Number(stats?.totalGross || 0);
  const totalCommission = Number(stats?.totalCommission || 0);
  const totalNetAReverser = Number(stats?.totalNet || 0);

  const eventSalesList = (eventSales || []).filter((e: any) => Number(e.gross) > 0).map((e: any) => ({
    id: e.event_id,
    title: e.title,
    brut: Number(e.gross),
    comm: Number(e.comm),
    net: Number(e.base_net),
    ticketsSold: Number(e.tickets_sold),
    payoutStatus: e.payout_status || 'En attente'
  }));

  const totalSalesPages = Math.ceil(eventSalesList.length / SALES_PER_PAGE);
  const paginatedSales = eventSalesList.slice((salesPage - 1) * SALES_PER_PAGE, salesPage * SALES_PER_PAGE);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Revenu Brut" value={formatCurrency(totalRevenuBrut)} trend="Toutes ventes" colorClass="from-slate-700 to-slate-600" />
        <StatCard title="Commission Babipass" value={formatCurrency(totalCommission)} trend="Commission prélevée" colorClass="from-rose-500 to-rose-600" />
        <StatCard title="Total à vous reverser" value={formatCurrency(totalNetAReverser)} trend="Votre solde" colorClass="from-emerald-500 to-emerald-600" />
        <StatCard title="Déjà Transféré" value={formatCurrency(0)} trend="Reversements terminés" colorClass="from-blue-500 to-blue-600" />
      </div>

      <div className="bg-white/5 border border-white/10 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-xl relative z-20">
        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-slate-900/50">
          <h3 className="text-lg font-bold text-white">Suivi des Reversements (Payouts) <span className="text-slate-400 text-sm font-normal">({eventSalesList.length} événement{eventSalesList.length > 1 ? 's' : ''})</span></h3>
        </div>
        <div className="overflow-x-auto relative">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-900/80 text-slate-400 uppercase text-xs font-bold tracking-wider">
              <tr>
                <th className="px-6 py-4">Événement</th>
                <th className="px-6 py-4 text-right">Billets V.</th>
                <th className="px-6 py-4 text-right">Revenu Brut</th>
                <th className="px-6 py-4 text-right text-rose-400">Commission</th>
                <th className="px-6 py-4 text-right text-emerald-400">Net Organisateur</th>
                <th className="px-6 py-4 text-center">Statut Reversement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {paginatedSales.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-500">Aucune vente enregistrée pour le moment.</td></tr>
              ) : (
                paginatedSales.map((e: any) => (
                  <tr key={e.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 text-white font-bold">{e.title}</td>
                    <td className="px-6 py-4 text-right text-slate-300 font-mono">{e.ticketsSold}</td>
                    <td className="px-6 py-4 text-right text-slate-300 font-mono">{formatCurrency(e.brut)}</td>
                    <td className="px-6 py-4 text-right text-rose-400 font-mono">-{formatCurrency(e.comm)}</td>
                    <td className="px-6 py-4 text-right text-emerald-400 font-bold text-base bg-emerald-500/5">{formatCurrency(e.net)}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${e.payoutStatus === 'Transféré' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}>
                        {e.payoutStatus}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 border-t border-white/5">
          <Pagination currentPage={salesPage} totalPages={totalSalesPages} onPageChange={setSalesPage} totalItems={eventSalesList.length} itemsPerPage={SALES_PER_PAGE} />
        </div>
      </div>
    </div>
  );
};

const MarketingView = ({ transactions }: any) => {
  const [mapStyle, setMapStyle] = useState<'dark' | 'light' | 'satellite'>('dark');

  // Aggregate locations from transactions for the heatmap
  const locations = transactions
    .filter((t: any) => t.buyer_location && t.status === 'completed')
    .map((t: any) => t.buyer_location);

  // Group by city for quick stats
  const cityStatsMap = locations.reduce((acc: any, loc: any) => {
    const city = loc.city || 'Inconnu';
    acc[city] = (acc[city] || 0) + 1;
    return acc;
  }, {});

  const cityStatsList = Object.keys(cityStatsMap).map(city => ({
    city,
    count: cityStatsMap[city]
  })).sort((a, b) => b.count - a.count);

  const exportMetaTargets = () => {
    if (locations.length === 0) {
      alert('Aucune donnée géolocalisée disponible pour l\'export.');
      return;
    }

    // Build zone-level stats: group by commune/neighborhood first, then city
    type ZoneStat = {
      zone: string; commune: string; city: string; country: string;
      lat: string; lng: string; count: number; totalAmount: number;
      peakHour: number; transactions: any[];
    };

    const zoneMap: Record<string, ZoneStat> = {};

    transactions
      .filter((t: any) => t.buyer_location && t.status === 'completed')
      .forEach((t: any) => {
        const loc = t.buyer_location;
        const commune = loc.neighborhood || loc.suburb || loc.district || '';
        const city = loc.city || loc.town || loc.village || 'Inconnu';
        const zoneKey = commune ? `${commune}, ${city}` : city;
        const hour = t.created_at ? new Date(t.created_at).getHours() : 12;

        if (!zoneMap[zoneKey]) {
          zoneMap[zoneKey] = {
            zone: zoneKey, commune, city,
            country: loc.country_code || 'CI',
            lat: loc.lat ? String(loc.lat) : '',
            lng: loc.lng ? String(loc.lng) : '',
            count: 0, totalAmount: 0, peakHour: hour, transactions: []
          };
        }
        zoneMap[zoneKey].count++;
        zoneMap[zoneKey].totalAmount += Number(t.amount || 0);
        zoneMap[zoneKey].transactions.push(hour);
      });

    // Sort by count desc
    const zones = Object.values(zoneMap).sort((a, b) => b.count - a.count);
    const totalBuyers = zones.reduce((s, z) => s + z.count, 0);
    const maxCount = zones[0]?.count || 1;

    const headers = [
      'Zone (Cible Meta)',
      'Commune / Quartier',
      'Ville',
      'Pays',
      'Latitude',
      'Longitude',
      'Rayon recommandé (km)',
      'Nb acheteurs',
      '% audience',
      'Budget suggéré (%)',
      'Montant moyen (FCFA)',
      'Heure de pointe'
    ];

    const rows = zones.map(z => {
      const pct = ((z.count / totalBuyers) * 100).toFixed(1);
      const budgetPct = ((z.count / totalBuyers) * 100).toFixed(0);
      const avgAmount = z.count > 0 ? Math.round(z.totalAmount / z.count).toLocaleString('fr-FR') : '0';
      // Smart radius: dense urban = 2km, sparse = 10km
      const radius = z.count >= maxCount * 0.3 ? '2' : z.count >= maxCount * 0.1 ? '5' : '10';
      // Peak hour
      const hourCounts: Record<number, number> = {};
      z.transactions.forEach(h => { hourCounts[h] = (hourCounts[h] || 0) + 1; });
      const peakH = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '?';
      const peakLabel = `${peakH}h`;

      // Define clear representation if commune is missing or same as city
      const displayCommune = (z.commune && z.commune !== z.city) ? z.commune : '— (Ville entière)';
      const displayZone = (z.commune && z.commune !== z.city) ? `${z.commune}, ${z.city}` : z.city;

      return [displayZone, displayCommune, z.city, z.country, z.lat, z.lng, radius, z.count, `${pct}%`, `${budgetPct}%`, avgAmount, peakLabel];
    });

    const csvContent = [headers, ...rows]
      .map(row => row.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `babipass-meta-targets-${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };


  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-indigo-900/50 to-blue-900/50 border border-blue-500/20 p-6 rounded-3xl backdrop-blur-xl shadow-2xl relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-blue-500/10 blur-3xl rounded-full pointer-events-none" />
        <h3 className="text-xl font-extrabold text-white flex items-center gap-3">
          <Globe className="text-blue-400" size={24} /> Heatmap Intelligence
        </h3>
        <p className="text-slate-300 text-sm mt-2 max-w-2xl">
          Découvrez d'où proviennent vos acheteurs en temps réel. Utilisez ces données pour cibler vos campagnes Meta (Facebook/Instagram) sur les zones géographiques les plus réactives et optimiser votre budget publicitaire.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[500px]">
        <div className="lg:col-span-3 bg-slate-900/50 border border-white/10 rounded-3xl overflow-hidden shadow-2xl relative">
          <MapContainer center={[5.345317, -4.024429]} zoom={12} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }} className="z-10">
            <MapResizer />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url={
                mapStyle === 'dark' ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' :
                  mapStyle === 'light' ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png' :
                    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
              }
            />
            {locations.map((loc: any, idx: number) => (
              loc.lat && loc.lng && (
                <CircleMarker
                  key={idx}
                  center={[loc.lat, loc.lng]}
                  pathOptions={{
                    color: mapStyle === 'dark' ? '#ef4444' : '#ea580c',
                    fillColor: mapStyle === 'dark' ? '#f97316' : '#f97316',
                    fillOpacity: 0.8,
                    weight: 2
                  }}
                  radius={12}
                  className="animate-pulse drop-shadow-[0_0_8px_rgba(249,115,22,0.8)]"
                >
                  <LeafletTooltip className="text-sm font-bold bg-slate-900 border-none text-white shadow-2xl rounded-xl">
                    Achat depuis {loc.neighborhood || loc.city || 'cette zone'}
                  </LeafletTooltip>
                </CircleMarker>
              )
            ))}
          </MapContainer>

          {/* Map Controls Overlay */}
          <div className="absolute top-4 right-4 z-[400] bg-slate-900/80 backdrop-blur-md rounded-2xl border border-white/10 p-1 flex gap-1 shadow-2xl">
            {(['dark', 'light', 'satellite'] as const).map(style => (
              <button
                key={style}
                onClick={() => setMapStyle(style)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${mapStyle === style ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
              >
                {style === 'dark' ? 'Sombre' : style === 'light' ? 'Clair' : 'Satellite'}
              </button>
            ))}
          </div>

          {/* Map Floating Stats Overlay */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[400] flex gap-3 animate-in fade-in slide-in-from-bottom-5 duration-700">
            <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 px-5 py-3 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] flex items-center gap-4">
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Achats Géolocalisés</span>
                <span className="text-xl font-bold text-white leading-none mt-1">{locations.length}</span>
              </div>
              <div className="w-px h-8 bg-white/10" />
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Villes touchées</span>
                <span className="text-xl font-bold text-orange-400 leading-none mt-1">{cityStatsList.length}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/50 border border-white/10 rounded-3xl p-6 relative overflow-y-auto">
          <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Top Concentrations</h4>
          <div className="space-y-4">
            {cityStatsList.length === 0 ? (
              <p className="text-slate-500 text-sm">Pas assez de données géolocalisées.</p>
            ) : (
              cityStatsList.map((stat: any, i: number) => (
                <div key={i} className="bg-white/5 p-3 rounded-xl border border-white/5 hover:border-orange-500/30 transition-all hover:-translate-y-1 animate-in fade-in slide-in-from-right-4" style={{ animationDelay: `${i * 100}ms`, animationFillMode: 'both' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white font-bold">{stat.city}</span>
                    <span className="text-orange-400 font-bold text-lg bg-orange-500/10 px-2 py-0.5 rounded-lg">{stat.count}</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-orange-500 to-red-500 relative overflow-hidden" style={{ width: `${(stat.count / locations.length) * 100}%` }}>
                      <div className="absolute inset-0 bg-white/20 w-full animate-[shimmer_2s_infinite]" />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-8 pt-6 border-t border-white/10 space-y-2">
            <button
              onClick={exportMetaTargets}
              disabled={locations.length === 0}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-bold transition-all text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
            >
              <TrendingUp size={16} /> Exporter cibles Meta
            </button>
            <p className="text-center text-xs text-slate-500">
              {locations.length > 0 ? `${locations.length} points · CSV compatible Meta Ads` : 'Aucune donnée de localisation disponible.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const WalletView = ({ eventSales, stats, addToast, refreshData, profile, fetchProfile }: any) => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState<string>('');

  useEffect(() => {
    const fetchRequests = async () => {
      const { data } = await supabase.from('payout_requests')
        .select('*, events:event_id(title)')
        .order('created_at', { ascending: false });
      setRequests(data || []);
      setLoading(false);
    };
    fetchRequests();
  }, []);

  const eventStats = useMemo(() => {
    return (eventSales || []).map((ev: any) => {
      // Pour l'affichage UI "Avance Maximum" statut/montant, on garde la logique de la dernière demande:
      const advanceReq = requests.find(r => r.event_id === ev.event_id && r.type === 'cash_advance');
      const advanceStatus = advanceReq?.status || ev.advance_status || null;
      const advanceAmt = advanceReq?.amount || Number(ev.advance_amt || 0);

      const baseNet = Number(ev.base_net || 0);

      // Nouvelle logique : Trouver toutes les déductions réelles pour cet événement (Avances validées + Commissions wallet)
      const eventDeductions = requests.filter(r =>
        r.event_id === ev.event_id &&
        ((r.type === 'cash_advance' && r.status === 'paid') ||
          (r.type === 'physical_commission' && r.status === 'paid'))
      );
      const totalDeducted = eventDeductions.reduce((sum, r) => sum + Number(r.amount), 0);

      let remainingPayout = baseNet - totalDeducted;
      if (remainingPayout < 0) remainingPayout = 0; // Au cas où

      const advRate = Number(ev.adv_rate || 30);
      return {
        id: ev.event_id,
        title: ev.title,
        gross: Number(ev.gross || 0),
        baseNet,
        advanceStatus,
        advanceAmt,
        remainingPayout,
        advRate,
        totalDeducted, // Pour debug
        maxAdvance: Number(ev.max_advance || 0)
      };
    }).sort((a: any, b: any) => b.gross - a.gross);
  }, [eventSales, requests]);

  // Global aggregates from RPC
  const totalGross = Number(stats?.totalGross || 0);
  const totalNet = Number(stats?.totalNet || 0);
  const availableBalance = Number(stats?.availableBalance || 0);

  // Eligible events for a new cash advance
  const eligibleEvents = eventStats.filter((e: any) => e.gross > 0 && e.advanceStatus !== 'pending' && e.advanceStatus !== 'paid');
  const selectedEventStat = eligibleEvents.find((e: any) => e.id === selectedEventId);

  const requestAdvance = async () => {
    if (!selectedEventStat) return;
    if (selectedEventStat.maxAdvance <= 0) return;

    try {
      const { error } = await supabase.from('payout_requests').insert([{
        organizer_id: user?.id,
        event_id: selectedEventStat.id,
        amount: selectedEventStat.maxAdvance,
        type: 'cash_advance',
        status: 'pending'
      }]);

      if (error) throw error;

      addToast('Demande d\'avance validée pour cet événement ! L\'Admin a été notifié.', 'success');
      setSelectedEventId('');

      // Refresh
      const { data } = await supabase.from('payout_requests')
        .select('*, events:event_id(title)')
        .order('created_at', { ascending: false });
      setRequests(data || []);
      if (refreshData) refreshData();
    } catch (e: any) {
      addToast(`Erreur: ${e.message}`, 'error');
    }
  };

  return (
    <div className="space-y-6">

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900/60 border border-white/5 rounded-3xl p-6 shadow-xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-50 transition-opacity group-hover:opacity-100" />
          <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wider relative z-10">Ventes Brutes</h4>
          <p className="text-4xl font-extrabold text-white mt-2 relative z-10">{formatCurrency(totalGross)}</p>
          <div className="absolute top-6 right-6 p-3 bg-blue-500/10 rounded-2xl border border-blue-500/20">
            <TrendingUp className="text-blue-400" size={24} />
          </div>
        </div>

        <div className="bg-slate-900/60 border border-white/5 rounded-3xl p-6 shadow-xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-rose-500/5 to-transparent opacity-50 transition-opacity group-hover:opacity-100" />
          <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wider relative z-10">Commission Babipass</h4>
          <p className="text-4xl font-extrabold text-rose-400 mt-2 relative z-10">-{formatCurrency(totalGross - totalNet)}</p>
          <div className="absolute top-6 right-6 p-3 bg-rose-500/10 rounded-2xl border border-rose-500/20">
            <Activity className="text-rose-400" size={24} />
          </div>
        </div>

        <div className="bg-slate-900/60 border border-white/5 rounded-3xl p-6 shadow-xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-50 transition-opacity group-hover:opacity-100" />
          <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wider relative z-10">Revenu Net</h4>
          <p className="text-4xl font-extrabold text-emerald-400 mt-2 relative z-10">{formatCurrency(totalNet)}</p>
          <div className="absolute top-6 right-6 p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
            <Wallet className="text-emerald-400" size={24} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 px-2 mt-4">
        <h3 className="text-lg font-bold text-slate-300 relative z-10 flex items-center gap-2">
          <QrCode className="text-pink-400" size={20} /> Indicateurs Billets Physiques
        </h3>
        <div className="h-px bg-white/10 flex-1" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900/40 border border-white/5 rounded-3xl p-6 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-pink-500/5 to-transparent opacity-50 transition-opacity group-hover:opacity-100" />
          <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wider relative z-10 flex items-center gap-2">Billets Générés <span className="bg-white/10 text-[10px] px-2 py-0.5 rounded-full text-slate-300">Potentiel de vente</span></h4>
          <p className="text-4xl font-extrabold text-white mt-2 relative z-10">{Number(stats?.physicalCount || 0)} <span className="text-xl text-slate-400 font-medium">codes imprimés</span></p>
        </div>

        <div className="bg-slate-900/40 border border-white/5 rounded-3xl p-6 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-50 transition-opacity group-hover:opacity-100" />
          <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wider relative z-10">Commissions physiques payées</h4>
          <p className="text-4xl font-extrabold text-pink-400 mt-2 relative z-10">{formatCurrency(Number(stats?.physicalCommissionPaid || 0))}</p>
          <p className="text-xs text-slate-500 mt-1 relative z-10">Déjà réglé depuis votre wallet ou par Mobile Money.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-gradient-to-br from-slate-800 to-slate-900 border border-emerald-500/30 p-8 rounded-3xl shadow-2xl relative overflow-hidden">
          <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-emerald-500/10 blur-3xl rounded-full" />

          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-emerald-400 font-bold uppercase tracking-widest text-xs flex items-center gap-2 mb-2">
                <Shield size={14} /> Fonds Garantis Babipass
              </p>
              <h2 className="text-5xl font-black text-white drop-shadow-md">{formatCurrency(availableBalance)}</h2>
              <p className="text-slate-400 text-sm mt-3">Solde total net garanti après les éventuelles avances de trésorerie reversées.</p>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-orange-500/30 p-6 rounded-3xl shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-orange-400 mb-2 font-bold"><Banknote size={18} /> Cash Advance</div>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Débloquez une partie de vos fonds avant l'événement pour payer vos prestataires (Limité aux organisateurs vérifiés).
            </p>

            <div className="text-sm flex justify-between mb-1">
              <span className="text-slate-500">Plafond Actuel :</span>
              <span className="text-white font-bold">Variable par événement</span>
            </div>
          </div>

          <div className="mt-4">
            {profile?.business_status !== 'verified' ? (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-center space-y-3">
                <Building2 className="text-amber-400 mx-auto" size={28} />
                <p className="text-amber-300 text-sm font-bold">Vérification Business requise</p>
                <p className="text-slate-500 text-xs">Soumettez vos documents d'entreprise dans "Mon Compte" pour débloquer les avances.</p>
                <p className="text-amber-400/70 text-xs italic">
                  {profile?.business_status === 'pending' ? '⏳ Votre demande est en cours d\'examen.' : ''}
                  {profile?.business_status === 'rejected' ? '❌ Votre demande a été rejetée. Veuillez resoumettre.' : ''}
                </p>
              </div>
            ) : eligibleEvents.length > 0 ? (
              <>
                <select
                  value={selectedEventId}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                  className="w-full bg-slate-800 border-b-2 border-orange-500/50 px-4 py-3 text-white font-medium rounded-t-xl focus:outline-none focus:border-orange-500 mb-3 appearance-none cursor-pointer"
                >
                  <option value="" disabled>Sélectionner un événement</option>
                  {eligibleEvents.map((e: any) => (
                    <option key={e.id} value={e.id}>
                      {e.title} - Max {formatCurrency(e.maxAdvance)}
                    </option>
                  ))}
                </select>
                <button
                  onClick={requestAdvance}
                  disabled={!selectedEventStat}
                  className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl font-bold shadow-lg shadow-orange-500/20 transition-all text-sm"
                >
                  {selectedEventStat ? `Demander ${formatCurrency(selectedEventStat.maxAdvance)} (${selectedEventStat.advRate}%)` : "Sélectionnez un événement"}
                </button>
              </>
            ) : (
              <div className="text-center p-3 bg-white/5 rounded-xl border border-white/10">
                <p className="text-slate-400 text-sm">Tous vos événements ont déjà atteint leur plafond d'avance ou n'ont pas encore de ventes.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-slate-900/50 border border-white/10 rounded-3xl p-6 shadow-2xl">
        <h3 className="text-lg font-bold text-white mb-6">Récapitulatif & Avances par Événement</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-800/50 text-slate-400 uppercase text-xs font-bold tracking-wider">
              <tr>
                <th className="px-6 py-4">Événement</th>
                <th className="px-6 py-4">Ventes Brutes</th>
                <th className="px-6 py-4">Avance Maximum</th>
                <th className="px-6 py-4">Reste à Payer (Net)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {eventStats.map((e: any) => (
                <tr key={e.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4 text-white font-medium max-w-[200px] truncate">{e.title}</td>
                  <td className="px-6 py-4 text-slate-300 font-bold">{formatCurrency(e.gross)}</td>
                  <td className="px-6 py-4">
                    {e.advanceStatus === 'paid' ? (
                      <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-1 rounded">Encaissé : {formatCurrency(e.advanceAmt)}</span>
                    ) : e.advanceStatus === 'pending' ? (
                      <span className="text-amber-400 font-bold bg-amber-500/10 px-2 py-1 rounded">En attente : {formatCurrency(e.advanceAmt)}</span>
                    ) : e.advanceStatus === 'rejected' ? (
                      <span className="text-rose-400 font-bold bg-rose-500/10 px-2 py-1 rounded">Rejeté</span>
                    ) : (
                      <span className="text-slate-500">Non demandée (Max {formatCurrency(e.maxAdvance)} - {e.advRate}%)</span>
                    )}

                    {e.totalDeducted > e.advanceAmt && (
                      <div className="text-[10px] text-pink-400 mt-1 italic w-full">
                        + {formatCurrency(e.totalDeducted - e.advanceAmt)} comm. billets physiques
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-white font-black">{formatCurrency(e.remainingPayout)}</td>
                </tr>
              ))}
              {eventStats.length === 0 && (
                <tr><td colSpan={4} className="py-8 text-center text-slate-500">Aucun événement avec des ventes.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-slate-900/50 border border-white/10 rounded-3xl p-6 shadow-2xl">
        <h3 className="text-lg font-bold text-white mb-6">Historique des Demandes (Payouts & Cash Advance)</h3>

        {loading ? (
          <div className="py-10 text-center"><Loader2 size={32} className="animate-spin text-orange-500 mx-auto" /></div>
        ) : requests.length === 0 ? (
          <div className="py-10 text-center text-slate-500">Aucune demande de paiement effectuée.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-800/50 text-slate-400 uppercase text-xs font-bold tracking-wider">
                <tr>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Type</th>
                  <th className="px-6 py-4">Montant</th>
                  <th className="px-6 py-4">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {requests.map((r: any) => (
                  <tr key={r.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 text-slate-300">{new Date(r.created_at).toLocaleDateString('fr-FR')}</td>
                    <td className="px-6 py-4 text-white font-medium">
                      {r.type === 'cash_advance' ? 'Avance sur Recette' :
                        r.type === 'physical_commission' ? 'Déd. Wallet (Billets Physiques)' :
                          r.type === 'direct_physical_commission' ? 'Paiement Direct (Billets Phys.)' :
                            'Reversement Final'}
                      {r.events?.title && <div className="text-xs text-slate-500 mt-0.5">{r.events.title}</div>}
                    </td>
                    <td className="px-6 py-4 font-bold text-emerald-400">{formatCurrency(r.amount)}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${r.status === 'paid' ? 'bg-emerald-500/20 text-emerald-400' :
                        r.status === 'approved_for_print' ? 'bg-blue-500/20 text-blue-400' :
                          r.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                            'bg-amber-500/20 text-amber-400'
                        }`}>
                        {r.status === 'approved_for_print' ? 'APPROUVÉ IMPR.' : r.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};

// ─── Wizard ───
const CreateEventWizard = ({ onCancel, onSave, initialData }: any) => {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<{
    id?: string; isEdit?: boolean;
    title: string; date: string; location: string; city: string; country: string;
    price: number; capacity: number; image: string; description: string; category: string;
    video: string; gallery: string[]; coordinates?: { lat: number; lng: number };
    ticketTypes: { id: string; name: string; price: number; capacity: number; features: string[] }[];
    program: { time: string; title: string; description: string }[];
    practicalInfos: { icon: string; title: string; description: string }[];
    supportPhone: string;
    dialCode: string;
  }>(initialData ? {
    id: initialData.id,
    isEdit: true,
    title: initialData.title || '',
    date: (initialData.date && initialData.date.includes('Z')) ? initialData.date.slice(0, 16) : initialData.date || '',
    location: initialData.location || '',
    city: initialData.city || '',
    country: initialData.country || '',
    price: initialData.price || 0,
    category: initialData.category || '',
    capacity: initialData.capacity || 1000,
    image: initialData.image || '',
    description: initialData.description || '',
    video: initialData.video_url || initialData.video || '',
    gallery: initialData.gallery || [],
    coordinates: initialData.coordinates,
    ticketTypes: (initialData.ticketTypes && initialData.ticketTypes.length > 0)
      ? initialData.ticketTypes.map((t: any) => ({ id: t.id, name: t.name, price: t.price, capacity: t.quantity || t.capacity || 0, features: t.features || [] }))
      : [{ id: 't1', name: 'Standard', price: 5000, capacity: 500, features: ['Accès standard'] }],
    program: initialData.program || [],
    practicalInfos: initialData.practicalInfos || [],
    supportPhone: initialData.supportPhone || '',
    dialCode: initialData.dialCode || '+225'
  } : {
    title: '', date: '', location: '', city: '', country: '', price: 0, capacity: 1000,
    category: '', image: '', description: '', video: '', gallery: [],
    ticketTypes: [{ id: 't1', name: 'Standard', price: 5000, capacity: 500, features: ['Accès standard'] }],
    program: [],
    practicalInfos: [
      { icon: 'MapPin', title: 'Accès', description: 'Parking surveillé disponible.\nAccessible via Boulevard.' },
      { icon: 'ShieldCheck', title: 'Sécurité', description: 'Contrôle des sacs à l\'entrée.\nÉquipe médicale.' },
      { icon: 'Clock', title: 'Horaires', description: 'Ouverture : 18h00\nDébut : 20h00' }
    ],
    supportPhone: '',
    dialCode: '+225'
  });

  const [countries, setCountries] = useState<{ name: string, code: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string, name: string }[]>([]);
  const [uploadingVideo, setUploadingVideo] = useState(false);

  const handleVideoUpload = async (file: File) => {
    if (file.size > 25 * 1024 * 1024) {
      alert("La vidéo dépasse 25 Mo.");
      return;
    }
    setUploadingVideo(true);
    const fileName = `${Date.now()}-trailer-${file.name.replace(/\s+/g, '-')}`;
    try {
      const { data, error } = await supabase.storage.from('events').upload(`videos/${fileName}`, file, { cacheControl: '3600', upsert: false });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('events').getPublicUrl(data.path);
      setForm({ ...form, video: publicUrl });
    } catch (err: any) {
      console.error("Video upload error:", err);
      alert("Erreur d'upload vidéo : " + err.message);
    } finally {
      setUploadingVideo(false);
    }
  };

  useEffect(() => {
    supabase.from('supported_countries').select('name, code').eq('is_active', true).order('name')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setCountries(data);

          if (!form.isEdit) {
            getCountryDialCode(data[0].name).then(dial => {
              setForm(f => ({ ...f, country: data[0].name, dialCode: dial || '+225' }));
            });
          }
        }
      });

    supabase.from('event_categories').select('id, name').eq('is_active', true).order('display_order', { ascending: true })
      .then(({ data }) => {
        if (data && data.length > 0) {
          setCategories(data);
          if (!form.isEdit && !form.category) setForm(f => ({ ...f, category: data[0].name }));
        }
      });
  }, []);

  useEffect(() => {
    if (form.country) {
      getCountryDialCode(form.country).then(dial => {
        if (dial) setForm(f => ({ ...f, dialCode: dial }));
      });
    }
  }, [form.country]);

  const addGalleryImage = () => setForm({ ...form, gallery: [...form.gallery, ''] });
  const updateGalleryImage = (index: number, url: string) => {
    const newGallery = [...form.gallery];
    newGallery[index] = url;
    setForm({ ...form, gallery: newGallery });
  };
  const removeGalleryImage = (index: number) => {
    setForm({ ...form, gallery: form.gallery.filter((_, i) => i !== index) });
  };

  const addTicketType = () => setForm({ ...form, ticketTypes: [...form.ticketTypes, { id: `t${Date.now()}`, name: 'VIP', price: 15000, capacity: 50, features: [] }] });
  const updateTicketType = (index: number, field: string, value: any) => {
    const newTickets = [...form.ticketTypes];
    newTickets[index] = { ...newTickets[index], [field]: value };
    setForm({ ...form, ticketTypes: newTickets });
  };
  const removeTicketType = (index: number) => setForm({ ...form, ticketTypes: form.ticketTypes.filter((_, i) => i !== index) });

  const addProgramItem = () => setForm({ ...form, program: [...form.program, { time: '18:00', title: 'Nouvelle activité', description: '' }] });
  const updateProgramItem = (index: number, field: string, value: any) => {
    const newProg = [...form.program];
    newProg[index] = { ...newProg[index], [field]: value };
    setForm({ ...form, program: newProg });
  };
  const removeProgramItem = (index: number) => setForm({ ...form, program: form.program.filter((_, i) => i !== index) });

  const addPracticalInfo = () => setForm({ ...form, practicalInfos: [...form.practicalInfos, { icon: 'Info', title: 'Nouvelle Info', description: '' }] });
  const updatePracticalInfo = (index: number, field: string, value: any) => {
    const newInfos = [...form.practicalInfos];
    newInfos[index] = { ...newInfos[index], [field]: value };
    setForm({ ...form, practicalInfos: newInfos });
  };
  const removePracticalInfo = (index: number) => setForm({ ...form, practicalInfos: form.practicalInfos.filter((_, i) => i !== index) });

  const generateMagicTiers = () => {
    const totalCap = form.capacity || 1000;
    const basePrice = Math.max(5000, form.price || 5000);
    setForm({
      ...form,
      ticketTypes: [
        { id: `t${Date.now()}1`, name: 'Early Bird', price: Math.floor((basePrice * 0.8) / 100) * 100, capacity: Math.floor(totalCap * 0.2), features: ['Tarif réduit exclusif'] },
        { id: `t${Date.now()}2`, name: 'Standard', price: basePrice, capacity: Math.floor(totalCap * 0.5), features: ['Accès standard événement'] },
        { id: `t${Date.now()}3`, name: 'VIP', price: basePrice * 3 - 100, capacity: Math.floor(totalCap * 0.2), features: ['Coupe-file', 'Zone VIP', 'Conso offerte'] },
        { id: `t${Date.now()}4`, name: 'VVIP', price: basePrice * 10 - 100, capacity: Math.floor(totalCap * 0.1), features: ['Loge privée', 'Backstage', 'Champagne'] },
      ]
    });
  };

  return (
    <div className="fixed inset-0 z-[99999] flex justify-center items-center p-4">
      <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm pointer-events-auto" onClick={onCancel} />
      <div className="bg-slate-800 w-full max-w-3xl rounded-3xl border border-white/10 shadow-[0_0_4rem_rgba(99,102,241,0.2)] overflow-hidden relative z-10 pointer-events-auto flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-white/10 bg-slate-900/50 shrink-0">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-400">
              {form.isEdit ? 'Modifier un événement' : 'Créer un événement'}
            </h2>
            <button onClick={onCancel} className="text-slate-400 hover:text-white bg-slate-800 p-2 rounded-full"><X size={20} /></button>
          </div>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map(i => <div key={i} className={`h-2 flex-1 rounded-full ${step >= i ? 'bg-gradient-to-r from-orange-500 to-amber-500' : 'bg-slate-700'}`} />)}
          </div>
        </div>

        <div className="p-8 overflow-y-auto grow space-y-6">
          {step === 1 && (
            <div className="animate-in slide-in-from-right-10 duration-300 space-y-4">
              <h3 className="text-xl font-bold text-white mb-4">Informations Principales</h3>
              <label className="block"><span className="text-slate-400 font-semibold mb-1 block">Titre de l'événement</span><input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-orange-500 outline-none shadow-inner" placeholder="Ex: Concert Youssoupha 2026" /></label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block"><span className="text-slate-400 font-semibold mb-1 block">Date</span><input type="datetime-local" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-orange-500 outline-none" /></label>
                <label className="block">
                  <span className="text-slate-400 font-semibold mb-1 block">Pays d'Organisation</span>
                  <select required value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-orange-500 outline-none appearance-none">
                    {countries.length === 0 && <option value="">Chargement...</option>}
                    {countries.map(c => <option key={c.code} value={c.name}>{c.name}</option>)}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <label className="block">
                  <span className="text-slate-400 font-semibold mb-1 block">Catégorie</span>
                  <select required value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-orange-500 outline-none appearance-none">
                    {categories.length === 0 && <option value="">Chargement...</option>}
                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </label>
              </div>

              {/* Nouveau champ : Numéro de téléphone de l'infoline de l'événement lié au pays */}
              <label className="block mt-4">
                <span className="text-slate-400 font-semibold mb-1 block">Téléphone Support / Infoline (Affiché sur le billet)</span>
                <div className="relative flex items-center">
                  <div className="absolute left-0 top-0 bottom-0 flex items-center justify-center bg-slate-800/80 border-y border-l border-white/10 rounded-l-xl px-3 text-slate-300 font-mono font-bold text-sm">
                    {form.dialCode}
                  </div>
                  <input
                    type="tel"
                    required
                    value={form.supportPhone}
                    onChange={e => setForm({ ...form, supportPhone: e.target.value })}
                    className="w-full pl-20 bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-orange-500 outline-none font-mono tracking-wider shadow-inner"
                    placeholder="Ex: 01 23 45 67 89"
                  />
                </div>
                <p className="text-xs text-emerald-400 mt-1 italic">L'indicatif est déduit automatiquement de votre algorithme international lié au "{form.country}".</p>
              </label>
            </div>
          )}
          {step === 2 && (
            <div className="animate-in slide-in-from-right-10 duration-300 grid lg:grid-cols-2 gap-8">
              {/* Left Column: Editor */}
              <div className="space-y-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-white">Catégories de Billets</h3>
                </div>
                <div className="flex gap-2 w-full mb-4">
                  <button onClick={generateMagicTiers} className="flex-1 flex items-center justify-center gap-1 bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-500 text-white px-3 py-2 rounded-lg text-sm font-bold shadow-[0_0_15px_rgba(249,115,22,0.3)] hover:shadow-[0_0_20px_rgba(249,115,22,0.5)] transition-all animate-glow-pulse">✨ Magic Tiers (IA)</button>
                  <button onClick={addTicketType} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-1 shadow-lg"><Plus size={16} /> Ajouter</button>
                </div>

                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                  {form.ticketTypes.map((t, idx) => (
                    <div key={t.id} className="bg-slate-900/50 p-4 border border-white/10 hover:border-orange-500/30 rounded-2xl relative transition-all group focus-within:ring-1 focus-within:ring-orange-500">
                      {idx > 0 && <button onClick={() => removeTicketType(idx)} className="absolute top-4 right-4 text-red-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={18} /></button>}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
                        <label className="block"><span className="text-slate-400 text-xs font-bold mb-1 block">Nom</span><input value={t.name} onChange={e => updateTicketType(idx, 'name', e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-orange-500 text-sm" placeholder="Ex: Pass VIP" /></label>
                        <label className="block"><span className="text-slate-400 text-xs font-bold mb-1 block">Prix (FCFA)</span><input type="number" value={t.price} onChange={e => updateTicketType(idx, 'price', Number(e.target.value))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-orange-500 text-sm" /></label>
                        <label className="block"><span className="text-slate-400 text-xs font-bold mb-1 block">Qté dispo.</span><input type="number" value={t.capacity} onChange={e => updateTicketType(idx, 'capacity', Number(e.target.value))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-orange-500 text-sm" /></label>
                      </div>
                      <label className="block"><span className="text-slate-400 text-xs font-bold mb-1 block">Avantages (séparés par des virgules)</span><input value={t.features.join(', ')} onChange={e => updateTicketType(idx, 'features', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-orange-500 text-sm" placeholder="Ex: Accès Backstage, Boisson offerte..." /></label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column: Holographic Preview */}
              <div className="flex flex-col items-center justify-center p-6 bg-slate-900/30 rounded-3xl border border-white/5 relative perspective-1000 mt-8 lg:mt-0">
                <div className="absolute top-4 left-4 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-emerald-500 text-xs font-bold tracking-widest uppercase">Live Preview 3D</span>
                </div>

                {form.ticketTypes.length > 0 && (
                  <div className="ticket-hologram w-72 rounded-2xl p-6 hover-3d-tilt preserve-3d cursor-pointer mt-8 transition-all">
                    <div className="flex justify-between items-start mb-6">
                      <span className="font-extrabold text-white text-2xl tracking-tight leading-none">{form.ticketTypes[0].name || 'Ticket'}</span>
                      <QrCode className="text-orange-400/80" size={32} />
                    </div>
                    <div className="space-y-4 mb-6">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Prix Actuel (Yield Engine)</span>
                        <div className="text-3xl font-black text-emerald-400 drop-shadow-lg leading-none mt-1">{formatCurrency(form.ticketTypes[0].price || 0)}</div>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Avantages Inclus</span>
                        <ul className="text-xs text-slate-300 mt-2 space-y-1">
                          {form.ticketTypes[0].features.length > 0
                            ? form.ticketTypes[0].features.map((f, i) => (
                              <li key={i} className="flex items-center gap-1.5"><CheckCircle size={12} className="text-orange-500 shrink-0" /> <span className="line-clamp-1">{f}</span></li>
                            ))
                            : <li className="italic opacity-50">Aucun avantage défini</li>}
                        </ul>
                      </div>
                    </div>
                    <div className="mt-8 pt-4 border-t border-white/10 flex justify-between items-center text-xs text-slate-500">
                      <span className="font-mono bg-white/5 px-2 py-1 rounded">ID: {form.ticketTypes[0].id.substring(0, 8)}</span>
                      <span>{form.ticketTypes[0].capacity} places</span>
                    </div>
                  </div>
                )}

                <p className="text-slate-400 text-xs mt-8 font-medium text-center">
                  ✨ Le moteur Afro-Tech Yield ajuste ces prix dynamiquement <br /> selon la jauge et la demande pour maximiser vos revenus.
                </p>
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="animate-in slide-in-from-right-10 duration-300 space-y-4">
              <h3 className="text-xl font-bold text-white mb-4">Programme & Localisation</h3>

              <div className="bg-slate-900/50 p-4 rounded-2xl border border-white/10 mb-6">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-white font-bold block">Programme de l'événement</span>
                  <button onClick={addProgramItem} className="text-orange-400 text-sm font-bold hover:text-orange-300 flex items-center gap-1"><Plus size={14} /> Ajouter ligne</button>
                </div>
                <div className="space-y-3">
                  {form.program.length === 0 && <p className="text-slate-500 text-sm italic">Aucun programme défini.</p>}
                  {form.program.map((p, idx) => (
                    <div key={idx} className="flex gap-2 items-start bg-slate-800 p-2 rounded-xl group relative">
                      <input type="time" value={p.time} onChange={e => updateProgramItem(idx, 'time', e.target.value)} className="bg-slate-700 text-white rounded p-2 text-sm outline-none shrink-0" />
                      <div className="grow space-y-2">
                        <input value={p.title} onChange={e => updateProgramItem(idx, 'title', e.target.value)} placeholder="Titre de l'activité" className="w-full bg-slate-700 text-white rounded p-2 text-sm outline-none" />
                        <input value={p.description} onChange={e => updateProgramItem(idx, 'description', e.target.value)} placeholder="Description courte (optionnelle)" className="w-full bg-slate-700 text-slate-300 rounded p-2 text-xs outline-none" />
                      </div>
                      <button onClick={() => removeProgramItem(idx)} className="text-red-400 p-2 hover:bg-slate-700 rounded"><Trash2 size={16} /></button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-900/50 p-4 rounded-2xl border border-white/10 mb-6">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-white font-bold block">Infos Pratiques</span>
                  <button onClick={addPracticalInfo} className="text-orange-400 text-sm font-bold hover:text-orange-300 flex items-center gap-1"><Plus size={14} /> Ajouter info</button>
                </div>
                <div className="space-y-3">
                  {form.practicalInfos.length === 0 && <p className="text-slate-500 text-sm italic">Aucune info pratique définie.</p>}
                  {form.practicalInfos.map((info, idx) => (
                    <div key={idx} className="flex gap-2 items-start bg-slate-800 p-2 rounded-xl group relative">
                      <div className="grow space-y-2">
                        <div className="flex gap-2">
                          <input value={info.icon} onChange={e => updatePracticalInfo(idx, 'icon', e.target.value)} placeholder="Icône (ex: ShieldCheck, MapPin, Clock)" className="w-1/3 bg-slate-700 text-white rounded p-2 text-sm outline-none" />
                          <input value={info.title} onChange={e => updatePracticalInfo(idx, 'title', e.target.value)} placeholder="Titre (ex: Sécurité)" className="w-2/3 bg-slate-700 text-white rounded p-2 text-sm outline-none" />
                        </div>
                        <textarea rows={2} value={info.description} onChange={e => updatePracticalInfo(idx, 'description', e.target.value)} placeholder="Description détaillée" className="w-full bg-slate-700 text-slate-300 rounded p-2 text-xs outline-none resize-none" />
                      </div>
                      <button onClick={() => removePracticalInfo(idx)} className="text-red-400 p-2 hover:bg-slate-700 rounded mt-1"><Trash2 size={16} /></button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <label className="block"><span className="text-slate-400 font-semibold mb-1 block">Lieu (Nom de la salle)</span><input required value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-orange-500 outline-none" placeholder="Ex: Palais de la Culture" /></label>
                <label className="block"><span className="text-slate-400 font-semibold mb-1 block">Ville</span><input required value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-orange-500 outline-none" placeholder="Ex: Abidjan" /></label>
              </div>

              <div className="pt-2">
                <span className="text-slate-400 font-semibold mb-2 block">Emplacement Précis</span>
                <MapPicker
                  initialCoordinates={form.coordinates}
                  onLocationSelect={(coords) => setForm({ ...form, coordinates: coords })}
                />
              </div>
            </div>
          )}
          {step === 4 && (
            <div className="animate-in slide-in-from-right-10 duration-300 space-y-4">
              <h3 className="text-xl font-bold text-white mb-4">Média & Validation</h3>

              <label className="block">
                <span className="text-slate-400 font-semibold mb-1 block">Affiche Principale</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const fileName = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
                    try {
                      // Note : Le bucket 'events' doit avoir été créé avec les bonnes politiques publiques
                      const { data, error } = await supabase.storage.from('events').upload(`covers/${fileName}`, file, { cacheControl: '3600', upsert: false });
                      if (error) throw error;
                      const { data: { publicUrl } } = supabase.storage.from('events').getPublicUrl(data.path);
                      setForm({ ...form, image: publicUrl });
                    } catch (err) {
                      console.error("Erreur d'upload :", err);
                      alert("L'upload a échoué. Vérifiez vos autorisations Storage.");
                    }
                  }}
                  className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-orange-500 outline-none file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-orange-500/20 file:text-orange-400 hover:file:bg-orange-500/30"
                />
                {form.image && (
                  <div className="mt-2 relative inline-block">
                    <img src={form.image} className="h-32 object-cover rounded-xl border border-white/20" alt="Preview Cover" />
                  </div>
                )}
              </label>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-semibold mb-1 block">Galerie d'images (Optionnel)</span>
                  {form.gallery.length < 10 && (
                    <button type="button" onClick={addGalleryImage} className="text-orange-400 text-xs font-bold hover:text-orange-300 flex items-center gap-1"><Plus size={14} /> Ajouter photo</button>
                  )}
                </div>
                {form.gallery.map((url, i) => (
                  <div key={i} className="flex gap-2 items-center flex-col sm:flex-row bg-slate-900/30 p-2 rounded-xl">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const fileName = `${Date.now()}-gal-${file.name.replace(/\s+/g, '-')}`;
                        try {
                          const { data, error } = await supabase.storage.from('events').upload(`gallery/${fileName}`, file);
                          if (error) throw error;
                          const { data: { publicUrl } } = supabase.storage.from('events').getPublicUrl(data.path);
                          updateGalleryImage(i, publicUrl);
                        } catch (err) {
                          console.error("Erreur d'upload :", err);
                          alert("L'upload a échoué.");
                        }
                      }}
                      className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-2 text-white text-sm focus:ring-2 focus:ring-orange-500 outline-none file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-slate-700 file:text-slate-300 hover:file:bg-slate-600"
                    />
                    {url && <img src={url} className="h-12 w-16 object-cover rounded shadow-md shrink-0" alt={`Gallery ${i}`} />}
                    <button type="button" onClick={() => removeGalleryImage(i)} className="p-2 text-red-400 hover:text-white hover:bg-red-500 rounded-xl transition-colors shrink-0"><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <VideoUploadField
                  value={form.video || ''}
                  onChange={url => setForm({ ...form, video: url })}
                  onUpload={handleVideoUpload}
                  uploading={uploadingVideo}
                  label="Vidéo Promotionnelle (mp4 d'ici ou lien externe)"
                />
              </div>

              <label className="block"><span className="text-slate-400 font-semibold mb-1 block">Description</span><textarea rows={4} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-orange-500 outline-none resize-none" placeholder="Décrivez votre événement..." /></label>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-white/10 bg-slate-900/50 flex justify-between shrink-0">
          {step > 1 ? <button onClick={() => setStep(step - 1)} className="px-6 py-3 text-sm font-bold text-slate-300 hover:text-white bg-slate-800 rounded-xl">Précédent</button> : <div />}
          {step < 4 ? <button onClick={() => setStep(step + 1)} className="px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg">Suivant <ArrowRight size={18} /></button> :
            <button onClick={() => onSave(form)} className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:scale-105 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg transition-transform text-lg"><CheckCircle size={20} /> {form.isEdit ? 'Enregistrer' : 'Créer l\'événement'}</button>}
        </div>
      </div>
    </div>
  );
};

const StatusBadge = ({ status }: { status: string }) => {
  const styles: any = { published: 'bg-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.5)]', draft: 'bg-slate-700 text-slate-200', pending_review: 'bg-amber-500 text-white shadow-[0_0_10px_rgba(245,158,11,0.5)]', ended: 'bg-red-500 text-white' };
  return <span className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold border tracking-widest uppercase ${styles[status] || styles.draft}`}>{status.replace('_', ' ')}</span>;
};

const ChatbotView = ({ events, addToast }: any) => {
  const [selectedEventId, setSelectedEventId] = useState(events[0]?.id || '');
  const [aiContext, setAiContext] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Chat Simulator State
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{ sender: 'user' | 'bot', text: string }[]>([{ sender: 'bot', text: 'Bonjour ! Je suis l\'assistant IA de l\'événement. Comment puis-je vous aider ?' }]);

  useEffect(() => {
    const fetchContext = async () => {
      setLoading(true);
      const { data, error } = await supabase.from('events').select('ai_context').eq('id', selectedEventId).maybeSingle();
      if (!error && data) setAiContext(data.ai_context || '');
      else setAiContext('');
      setLoading(false);
    };
    if (selectedEventId) fetchContext();
  }, [selectedEventId]);

  const handleSaveContext = async () => {
    setSaving(true);
    const { error } = await supabase.from('events').update({ ai_context: aiContext }).eq('id', selectedEventId);
    if (error) {
      addToast(`Erreur: ${error.message}`, 'error');
    } else {
      addToast('Instructions IA sauvegardées avec succès !', 'success');
    }
    setSaving(false);
  };

  const handleSimulateMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = chatInput.trim();
    setChatHistory(prev => [...prev, { sender: 'user', text: userMsg }]);
    setChatInput('');

    // Simulate smart AI logic based on context
    setTimeout(() => {
      const isContextProvided = aiContext.trim().length > 10;
      let botReply = "Mmm... d'accord. J'y penserai ! (Ceci est une simulation locale, le vrai bot Qwen répondra d'une manière beaucoup plus pertinente et personnalisée !)";

      if (userMsg.toLowerCase().includes('parking') && isContextProvided) botReply = "Le Parking ? Laisse-moi vérifier nos directives... Ah ! S'il y a des consignes dans nos instructions, je transmettrai l'info exacte !";
      if (userMsg.toLowerCase().includes('prix') || userMsg.toLowerCase().includes('billet')) botReply = "Il reste très peu de billets ! Ne perdez pas de temps, prenez vos places directement sur Babipass.com ! 🎟️🔥";

      setChatHistory(prev => [...prev, { sender: 'bot', text: botReply }]);
    }, 1500);
  };

  if (!events.length) {
    return <div className="text-center py-10 text-slate-400">Créez d'abord un événement pour configurer l'Intelligence Artificielle.</div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-500">

      {/* Colonne Configuration */}
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-gradient-to-r from-purple-900/40 to-indigo-900/40 border border-purple-500/20 p-6 rounded-3xl backdrop-blur-xl shadow-2xl relative overflow-hidden">
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-purple-500/10 blur-3xl rounded-full pointer-events-none" />
          <h3 className="text-xl font-extrabold text-white flex items-center gap-3">
            <MessageSquare className="text-purple-400" size={24} /> Éduquer l'Intelligence Artificielle (Qwen)
          </h3>
          <p className="text-slate-300 text-sm mt-2 max-w-2xl">
            L'agent IA intégré lit ces instructions pour répondre intelligemment à vos participants sur WhatsApp 24/7. Donnez-lui toutes les informations utiles (parking, sécurité, consignes spéciales, objets interdits, etc.).
          </p>

          <select
            value={selectedEventId}
            onChange={e => setSelectedEventId(e.target.value)}
            className="mt-4 w-full md:w-1/2 bg-slate-900/80 border border-white/20 rounded-xl px-4 py-3 text-white appearance-none outline-none focus:ring-2 focus:ring-purple-500"
          >
            {events.map((e: any) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
        </div>

        <div className="bg-slate-900/50 border border-white/10 rounded-3xl p-6 shadow-2xl">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-white font-bold">Base de Connaissances Spécifique à ce Tiers</h4>
            {loading && <Loader2 className="animate-spin text-purple-500" size={16} />}
          </div>
          <div className="space-y-4">
            <p className="text-xs text-slate-400">
              L'IA connaît déjà les prix, le lieu, la date et le nombre de billets restants. Écrivez ici uniquement les règles supplémentaires ou "FAQ" que vos clients posent souvent.
            </p>
            <textarea
              rows={8}
              value={aiContext}
              onChange={e => setAiContext(e.target.value)}
              placeholder="Exemples : 
- Le parking VIP est situé par l'entrée Nord.
- Interdiction stricte de ramener de la nourriture de l'extérieur.
- Les portes ouvrent 2h avant.
- Les enfants de moins de 5 ans rentrent gratuitements sur présentation d'une pièce."
              className="w-full bg-slate-800 border border-white/10 text-white px-4 py-3 rounded-xl outline-none focus:border-purple-500 resize-none font-medium"
            />
            <button
              onClick={handleSaveContext}
              disabled={saving}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded-xl transition-colors shadow-lg shadow-purple-600/20 flex justify-center items-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle size={20} />}
              Sauvegarder les Instructions IA
            </button>
          </div>
        </div>
      </div>

      {/* Colonne Simulateur */}
      <div className="bg-slate-900 border-2 border-slate-700/50 rounded-[2.5rem] p-4 shadow-2xl relative h-[600px] flex flex-col items-center">
        {/* Notch simulation */}
        <div className="w-1/3 h-5 bg-slate-950 rounded-b-xl absolute top-0 left-1/2 -translate-x-1/2 z-10" />

        <div className="bg-[#111b21] w-full h-full rounded-[2rem] overflow-hidden flex flex-col relative">

          {/* WhatsApp Header */}
          <div className="bg-[#202c33] p-4 flex items-center gap-3 shadow-lg z-10">
            <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold">
              AT
            </div>
            <div>
              <h5 className="text-white font-semibold text-sm">Babipass Bot (Dev)</h5>
              <p className="text-[#8696a0] text-xs">Testeur en ligne</p>
            </div>
          </div>

          {/* Chat Background */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ backgroundColor: '#0b141a', backgroundImage: 'radial-gradient(circle at center, rgba(32, 44, 51, 0.4) 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
            {chatHistory.map((msg, i) => (
              <div key={i} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-xl p-3 text-sm shadow-md ${msg.sender === 'user' ? 'bg-[#005c4b] text-[#e9edef] rounded-tr-none' : 'bg-[#202c33] text-[#e9edef] rounded-tl-none'}`}>
                  {msg.text}
                </div>
              </div>
            ))}
          </div>

          {/* Chat Input */}
          <div className="bg-[#202c33] p-3 flex items-center gap-2">
            <form onSubmit={handleSimulateMessage} className="flex-1 flex gap-2">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Message (ex: Parking)"
                className="flex-1 bg-[#2a3942] text-white rounded-full px-4 py-2 text-sm outline-none"
              />
              <button type="submit" className="w-10 h-10 bg-emerald-600 rounded-full flex items-center justify-center text-white shrink-0 hover:bg-emerald-500 transition-colors">
                <Send size={16} className="-ml-1" />
              </button>
            </form>
          </div>
        </div>
      </div>

    </div>
  );
};

// ─── POS Team View ───
const PosTeamView = ({ events, transactions, addToast }: any) => {
  const { user } = useAuth();
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<any>(null);

  const fetchAgents = async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data, error } = await supabase.from('agents').select('*').eq('organizer_id', user.id);

    if (error || !data || data.length === 0) {
      // No agents found
      setAgents([]);
    } else {
      const enriched = data.map(agent => {
        const agentSales = transactions.filter((t: any) => t.agent_id === agent.id && t.is_cash && t.status === 'completed');
        const collected = agentSales.reduce((acc: number, cur: any) => acc + Number(cur.amount), 0);
        return { ...agent, cashCollected: collected, role: "Agent", lastActive: agent.created_at };
      });
      setAgents(enriched);
    }
    setLoading(false);
  };

  useEffect(() => { fetchAgents(); }, [transactions, user?.id]);

  const handleCashCollect = (agent: any) => {
    if (window.confirm(`Confirmer la récupération de ${formatCurrency(agent.cashCollected)} de la part de ${agent.name} ?`)) {
      addToast(`Cash collecté avec succès.`, 'success');
      // In production, insert a payout/reset transaction here logic
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 bg-white/5 p-6 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-xl">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-3 text-white">
            <Store className="text-orange-400" size={24} /> Mon Équipe de Vente (Guichets / POS)
          </h2>
          <p className="text-sm text-slate-400 mt-1">Créez des accès limités pour vos commerciaux terrains. Ils encaisseront l'espèce et émettront les billets directs.</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center justify-center gap-2 bg-gradient-to-r from-orange-600 to-amber-500 hover:opacity-90 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-orange-500/25 transition-all">
          <Plus size={18} /> Ajouter un Vendeur
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? <div className="col-span-full py-10 flex justify-center"><Loader2 className="animate-spin text-orange-500" size={32} /></div> :
          agents.map((agent, i) => (
            <div key={i} className="bg-slate-900/50 rounded-3xl border border-white/10 shadow-xl overflow-hidden hover:border-orange-500/30 transition-all p-6 relative group">
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-orange-500/20 text-orange-400 rounded-full flex items-center justify-center shrink-0 border border-orange-500/30 shadow-inner">
                    <User size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-lg leading-tight">{agent.name}</h3>
                    <p className="text-orange-400 text-xs font-medium">{agent.role}</p>
                  </div>
                </div>
                <button onClick={() => { setEditingAgent(agent); setShowModal(true); }} className="text-slate-500 hover:text-white p-2 bg-white/5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><Edit2 size={14} /></button>
              </div>

              <div className="space-y-3 mb-6 bg-slate-800/50 p-4 rounded-xl border border-white/5">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Identifiant</span>
                  <span className="text-white font-medium">{agent.agent_code || agent.phone || agent.email || 'N/A'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Code PIN</span>
                  <span className="text-white font-medium tracking-widest font-mono">****</span>
                </div>
              </div>

              <div className="pt-6 border-t border-white/10 text-center">
                <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Cash collecté (Espèces)</p>
                <p className="text-3xl font-black text-emerald-400 drop-shadow-md mb-4">{formatCurrency(agent.cashCollected)}</p>
                <button
                  disabled={agent.cashCollected === 0}
                  onClick={() => handleCashCollect(agent)}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                >
                  Collecter le Cash
                </button>
              </div>
            </div>
          ))}
      </div>

      {showModal && <AgentModal agent={editingAgent} onClose={() => { setShowModal(false); setEditingAgent(null); }} events={events} onSave={async (data: any) => {
        if (editingAgent) {
          // Mode Édition
          let pinHash = editingAgent.pin_hash;
          if (data.pin && data.pin.length === 4) {
            try {
              const { data: hashData } = await supabase.rpc('hash_pin', { input_pin: data.pin });
              pinHash = hashData;
            } catch (e) {
              console.warn("Hashing failed, staying with current or plain pin.");
            }
          }

          const { data: updated, error } = await supabase.from('agents').update({
            name: data.name,
            phone: data.phone,
            email: data.email || null,
            agent_type: data.agent_type || 'POS',
            pin_hash: pinHash,
            auth_pin: (data.pin && !pinHash) ? data.pin : (data.pin ? null : editingAgent.auth_pin),
            event_id: data.event_id === 'all' ? null : data.event_id,
          }).eq('id', editingAgent.id).select().single();

          if (error) {
            addToast("Échec de la mise à jour: " + error.message, "error");
            return;
          }

          setAgents(p => p.map(a => a.id === updated.id ? { ...a, ...updated } : a));
          addToast("Agent mis à jour avec succès !", "success");
        } else {
          // Mode Création
          const agentCode = `AGT-${Math.floor(1000 + Math.random() * 9000)}`;

          // Hasher le PIN de manière sécurisée via une fonction SQL
          let pinHash: string | null = null;
          try {
            const { data: hashData } = await supabase.rpc('hash_pin', { input_pin: data.pin });
            pinHash = hashData;
          } catch (e) {
            console.warn("Fonction hash_pin indisponible, PIN stocké en clair temporairement.");
          }

          const { data: newAgent, error } = await supabase.from('agents').insert([{
            organizer_id: user?.id,
            name: data.name,
            phone: data.phone,
            email: data.email || null,
            agent_type: data.agent_type || 'POS',
            auth_pin: pinHash ? null : data.pin, // PIN en clair seulement si le hash a échoué
            pin_hash: pinHash,
            event_id: data.event_id === 'all' ? null : data.event_id,
            agent_code: agentCode,
            is_active: true
          }]).select().single();

          if (error) {
            console.error(error);
            addToast("Échec de la création de l'agent: " + error.message, "error");
            return;
          }

          setAgents(p => [{ ...newAgent, cashCollected: 0 }, ...p]);
          addToast(`Agent déployé ! Code d'accès: ${agentCode} | PIN confidentiel`, "success");
        }
        setShowModal(false);
        setEditingAgent(null);
      }} />}
    </div>
  );
};

const AgentModal = ({ onClose, events, onSave, agent }: any) => {
  const [form, setForm] = useState(agent ? {
    name: agent.name || '',
    phone: agent.phone || '',
    email: agent.email || '',
    pin: '', // On ne préremplit pas le PIN pour la sécurité
    event_id: agent.event_id || 'all',
    agent_type: agent.agent_type || 'POS'
  } : { name: '', phone: '', email: '', pin: '', event_id: 'all', agent_type: 'POS' });
  const isPOS = form.agent_type === 'POS';

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm pointer-events-auto" onClick={onClose} />
      <div className="bg-slate-800 w-full max-w-md rounded-3xl border border-white/10 shadow-2xl relative z-10 overflow-hidden pointer-events-auto">
        <div className="p-6 border-b border-white/10 bg-slate-900/50 flex justify-between items-center">
          <h3 className="text-xl font-bold text-white flex items-center gap-2"><Key size={20} className="text-orange-400" /> {agent ? 'Modifier l\'Agent' : 'Nouvel Agent POS'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); onSave(form); }} className="p-6 space-y-4">
          {/* Sélecteur de type */}
          <div>
            <span className="text-slate-400 text-sm font-semibold mb-2 block">Type d'agent</span>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setForm({ ...form, agent_type: 'POS' })}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${form.agent_type === 'POS' ? 'border-orange-500 bg-orange-500/10 text-orange-400' : 'border-white/10 bg-slate-900/50 text-slate-400 hover:border-white/30'
                  }`}>
                <Store size={24} />
                <span className="font-bold text-sm">Agent POS</span>
                <span className="text-[10px] text-center leading-tight opacity-70">Vente de billets en espèces sur le terrain</span>
              </button>
              <button type="button" onClick={() => setForm({ ...form, agent_type: 'SCANNER' })}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${form.agent_type === 'SCANNER' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'border-white/10 bg-slate-900/50 text-slate-400 hover:border-white/30'
                  }`}>
                <QrCode size={24} />
                <span className="font-bold text-sm">Agent Scanneur</span>
                <span className="text-[10px] text-center leading-tight opacity-70">Contrôle d'accès à l'entrée de l'événement</span>
              </button>
            </div>
          </div>
          <label className="block">
            <span className="text-slate-400 text-sm font-semibold mb-1 block">Nom ou Prénom</span>
            <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-orange-500 outline-none" placeholder="Ex: Cédric Kouamé" />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-slate-400 text-sm font-semibold mb-1 block">Num. Téléphone</span>
              <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-orange-500 outline-none" placeholder="+225..." />
            </label>
            <label className="block">
              <span className="text-slate-400 text-sm font-semibold mb-1 block">Code PIN (4 chiffres)</span>
              <input required type="password" maxLength={4} pattern="\d{4}" title="Exactement 4 chiffres" value={form.pin} onChange={e => setForm({ ...form, pin: e.target.value })} className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white font-mono tracking-widest focus:ring-2 focus:ring-orange-500 outline-none" placeholder="1234" />
            </label>
          </div>
          <label className="block">
            <span className="text-slate-400 text-sm font-semibold mb-1 block">Email (optionnel, pour envoi de l'accès)</span>
            <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-orange-500 outline-none" placeholder="agent@example.com" />
          </label>
          {isPOS && (
            <label className="block">
              <span className="text-slate-400 text-sm font-semibold mb-1 block">Restreindre à un événement spécifique ?</span>
              <select value={form.event_id} onChange={e => setForm({ ...form, event_id: e.target.value })} className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-orange-500 outline-none appearance-none">
                <option value="all">Tous mes événements (Global)</option>
                {events.map((e: any) => <option key={e.id} value={e.id}>{e.title}</option>)}
              </select>
            </label>
          )}
          <div className={`p-4 rounded-xl flex gap-3 text-sm mt-4 ${isPOS ? 'bg-orange-500/10 border border-orange-500/20 text-orange-200' : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-200'}`}>
            <ShieldCheck className={`shrink-0 ${isPOS ? 'text-orange-400' : 'text-emerald-400'}`} size={20} />
            <p>{isPOS
              ? <>L'agent <strong>POS</strong> se connecte sur <strong>/agent/login</strong> et vend des billets en espèces. Son cash est visible dans votre tableau de bord. <span className="font-bold">PIN haché sécurisé.</span></>
              : <>L'agent <strong>Scanneur</strong> se connecte sur <strong>/agent/login</strong> et est redirigé vers l'interface de scan de billets à l'entrée uniquement.</>
            }</p>
          </div>
          <div className="pt-4 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-slate-300 hover:text-white">Annuler</button>
            <button type="submit" className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2">
              {agent ? 'Enregistrer les modifications' : 'Déployer l\'Agent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Push Campaign View (CRM) ───
const PushCampaignView = ({ events, addToast }: any) => {
  const { user } = useAuth();
  const [selectedEventId, setSelectedEventId] = useState<string>('all');
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;
  const [exportHistory, setExportHistoryState] = useState<{ date: string; count: number; event: string; format: string }[]>(() => {
    try { return JSON.parse(localStorage.getItem('babipass_crm_history') || '[]'); } catch { return []; }
  });
  const saveHistory = (history: any[]) => {
    setExportHistoryState(history);
    localStorage.setItem('babipass_crm_history', JSON.stringify(history));
  };

  const fetchContacts = async (eventId: string) => {
    if (!user?.id) return;
    setLoading(true);
    try {
      // Get events owned by this organizer
      let eventIds: string[] = [];
      if (eventId !== 'all') {
        eventIds = [eventId];
      } else {
        const { data: evs } = await supabase.from('events').select('id').eq('organizer_id', user.id);
        eventIds = (evs || []).map((e: any) => e.id);
      }

      if (eventIds.length === 0) { setContacts([]); setLoading(false); return; }

      const { data, error } = await supabase
        .from('transactions')
        .select('guest_name, guest_email, buyer_phone, amount, event_id, created_at, events(title)')
        .in('event_id', eventIds)
        .eq('status', 'completed')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Deduplicate by email or name
      const seen = new Set<string>();
      const unique = (data || []).filter((t: any) => {
        const key = t.guest_email || t.guest_name;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setContacts(unique);
    } catch (e: any) {
      addToast('Erreur lors du chargement des contacts : ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts(selectedEventId);
  }, [selectedEventId, user?.id]);

  const emailCount = contacts.filter((c: any) => c.guest_email).length;
  const noEmailCount = contacts.filter((c: any) => !c.guest_email).length;

  const handleExportCSV = () => {
    if (contacts.length === 0) { addToast('Aucun contact à exporter.', 'error'); return; }

    const headers = ['Nom', 'Email', 'Événement', 'Montant (FCFA)', 'Date achat'];
    const rows = contacts.map((c: any) => [
      c.guest_name || '',
      c.guest_email || '',
      (c.events as any)?.title || '',
      c.amount || '',
      c.created_at ? new Date(c.created_at).toLocaleDateString('fr-FR') : ''
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const eventName = events.find((e: any) => e.id === selectedEventId)?.title || 'Tous les événements';
    const date = new Date().toLocaleDateString('fr-FR').replace(/\//g, '-');
    link.href = url;
    link.download = `babipass-crm-${date}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    const newEntry = { date: new Date().toLocaleString('fr-FR'), count: contacts.length, event: eventName, format: 'CSV' };
    saveHistory([newEntry, ...exportHistory.slice(0, 9)]);
    addToast(`✅ ${contacts.length} contacts exportés avec succès !`, 'success');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 bg-white/5 p-6 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-xl">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-3 text-white">
            <Users className="text-emerald-400" size={24} /> CRM — Extraction de Données Contacts
          </h2>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Exportez la liste de vos acheteurs (téléphones + emails) en CSV pour les utiliser dans Mailchimp, Brevo, WhatsApp Business ou tout autre outil marketing.
          </p>
        </div>
      </div>

      {/* Filters + Stats */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-1 bg-slate-900/50 border border-white/10 rounded-2xl p-5 space-y-4">
          <h3 className="font-bold text-white text-sm">🎯 Filtrer par événement</h3>
          <select
            value={selectedEventId}
            onChange={e => setSelectedEventId(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500"
          >
            <option value="all">Tous mes événements</option>
            {events.map((e: any) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>

          <button
            onClick={handleExportCSV}
            disabled={loading || contacts.length === 0}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-500 hover:opacity-90 text-white px-5 py-3 rounded-xl font-bold shadow-lg shadow-emerald-500/25 transition-all disabled:opacity-40"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            Télécharger CSV
          </button>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10">
            <div className="text-center p-3 bg-slate-800/70 rounded-xl border border-white/5">
              <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">📧 Avec Email</p>
              <p className="text-xl font-bold text-emerald-400">{loading ? '...' : emailCount}</p>
            </div>
            <div className="text-center p-3 bg-slate-800/70 rounded-xl border border-white/5">
              <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">⚠️ Sans Email</p>
              <p className="text-xl font-bold text-amber-400">{loading ? '...' : noEmailCount}</p>
            </div>
            <div className="col-span-2 text-center p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
              <p className="text-[10px] text-emerald-400 uppercase font-bold mb-1">Total Contacts Uniques</p>
              <p className="text-2xl font-bold text-white">{loading ? '...' : contacts.length}</p>
            </div>
          </div>
        </div>

        {/* Preview Table */}
        <div className="md:col-span-2 bg-slate-900/50 border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 bg-slate-800/80 border-b border-white/5 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-300">Contacts ({contacts.length} au total)</span>
            {!loading && <span className="text-xs text-slate-500">Page {currentPage}/{Math.max(1, Math.ceil(contacts.length / PAGE_SIZE))}</span>}
          </div>
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            {loading ? (
              <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-emerald-500" size={28} /></div>
            ) : contacts.length === 0 ? (
              <div className="py-16 text-center text-slate-500 text-sm">Aucun acheteur trouvé pour ce filtre.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-900">
                  <tr className="text-left text-[10px] uppercase tracking-widest text-slate-500">
                    <th className="px-4 py-2">Nom</th>
                    <th className="px-4 py-2">Email</th>
                    <th className="px-4 py-2">Événement</th>
                    <th className="px-4 py-2">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map((c: any, idx: number) => (
                    <tr key={idx} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                      <td className="px-4 py-2.5 text-slate-300 font-medium">{c.guest_name || '—'}</td>
                      <td className="px-4 py-2.5">
                        {c.guest_email
                          ? <span className="text-blue-400 text-xs">{c.guest_email}</span>
                          : <span className="text-slate-600 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs truncate max-w-[120px]">{(c.events as any)?.title || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-400 text-xs">{c.amount ? `${Number(c.amount).toLocaleString('fr-FR')} FCFA` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {/* Pagination controls */}
          {contacts.length > PAGE_SIZE && (
            <div className="flex items-center justify-between px-5 py-3 bg-slate-800/40 border-t border-white/5">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-white disabled:opacity-30 flex items-center gap-1"
              >
                ← Précédent
              </button>
              <span className="text-xs text-slate-500">{(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, contacts.length)} / {contacts.length}</span>
              <button
                onClick={() => setCurrentPage(p => Math.min(Math.ceil(contacts.length / PAGE_SIZE), p + 1))}
                disabled={currentPage >= Math.ceil(contacts.length / PAGE_SIZE)}
                className="px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-white disabled:opacity-30 flex items-center gap-1"
              >
                Suivant →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Export History */}
      {exportHistory.length > 0 && (
        <div className="bg-slate-900/50 border border-white/10 rounded-2xl p-5">
          <h3 className="font-bold text-white text-sm mb-4">📋 Historique des exports</h3>
          <div className="space-y-2">
            {exportHistory.map((entry, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm p-3 bg-slate-800/60 rounded-xl border border-white/5">
                <div className="flex items-center gap-3">
                  <span className="text-emerald-400">✅</span>
                  <span className="text-slate-300">{entry.event}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span>{entry.count} contacts</span>
                  <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">{entry.format}</span>
                  <span>{entry.date}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Compatible Tools */}
      <div className="bg-gradient-to-r from-slate-900/50 to-slate-800/30 border border-white/10 rounded-2xl p-5">
        <h3 className="font-bold text-white text-sm mb-3">🔌 Compatible avec</h3>
        <div className="flex flex-wrap gap-2">
          {['Mailchimp', 'Brevo (Sendinblue)', 'WhatsApp Business', 'HubSpot', 'ActiveCampaign', 'Google Contacts', 'Excel / Google Sheets', 'Zoho CRM'].map(tool => (
            <span key={tool} className="px-3 py-1.5 bg-slate-800 border border-slate-700 text-slate-400 text-xs rounded-xl">
              {tool}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Composant : Billets Physiques ───


const PhysicalTicketsView = ({ events, transactions, addToast }: any) => {
  const { user } = useAuth();
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(50);
  const [columns, setColumns] = useState<number>(3);
  const [isGenerating, setIsGenerating] = useState(false);

  // Commission & wallet states
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [commissionRate, setCommissionRate] = useState<number>(0.08);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [pendingCommission, setPendingCommission] = useState<number>(0);

  // Payment Modal interactive states
  const [payMethod, setPayMethod] = useState<'paystack' | 'momo'>('paystack');
  const [momoPhone, setMomoPhone] = useState('');
  const [momoNetwork, setMomoNetwork] = useState('ORANGE_CI');
  const [paymentInProgress, setPaymentInProgress] = useState(false);

  const selectedEvent = events.find((e: any) => e.id === selectedEventId);

  const categories = selectedEvent?.ticketTypes?.length > 0
    ? selectedEvent.ticketTypes
    : [
      { id: 'cat-std', name: 'Standard PASS', price: selectedEvent?.price || 0 },
      { id: 'cat-vip', name: 'VIP PASS', price: selectedEvent?.price || 0 },
    ];

  const selectedCategory = categories.find((c: any) => c.id === selectedCategoryId);
  const ticketPrice = Number(selectedCategory?.price || selectedEvent?.price || 0);
  const commissionDue = Math.round(quantity * ticketPrice * commissionRate);
  const balanceSufficient = walletBalance >= commissionDue;

  // Physical tickets for analytics — fetched directly from Supabase
  const [physicalTxs, setPhysicalTxs] = useState<any[]>([]);

  const fetchPhysicalTxs = async (eventId?: string) => {
    if (!user?.id) return;
    let q = supabase
      .from('tickets')
      .select('id, event_id, status, created_at')
      .eq('guest_name', 'Billet Physique (Revendeur)');
    if (eventId) q = q.eq('event_id', eventId);
    const { data } = await q;
    setPhysicalTxs(data || []);
  };

  // Load wallet balance + commission rate when event selected
  useEffect(() => {
    if (!user?.id) return;
    const fetchRates = async () => {
      // 1. Wallet balance
      try {
        const { data: statsData, error: rpcErr } = await supabase.rpc('get_org_stats', { p_organizer_id: user.id });
        if (!rpcErr && statsData) setWalletBalance(Number(statsData.availableBalance || 0));
      } catch (e) {
        console.warn("Wallet RPC fallback:", e);
      }

      // 2. Commission Rate (Physical)
      if (selectedEventId) {
        // Strict global rule: always use the platform setting for physical tickets
        const globalPhysicalRate = await getPlatformSetting('default_physical_commission_rate');

        // Fallback to 8% only if no global setting exists
        const raw = globalPhysicalRate !== null ? Number(globalPhysicalRate) : 8;
        setCommissionRate(raw > 1 ? raw / 100 : raw);
      }

      // 3. Refresh analytics
      fetchPhysicalTxs(selectedEventId || undefined);
    };
    fetchRates();
  }, [user?.id, selectedEventId]);

  const generatePDFTickets = async () => {
    addToast(`⏳ Génération des signatures cryptographiques pour ${quantity} billets...`, "info");
    try {
      const { signTicket } = await import('../utils/crypto');
      const { generateMassTicketsPDF } = await import('../utils/pdfMassGenerator');

      const catName = categories.find((c: any) => c.id === selectedCategoryId)?.name || 'Billet Physique';
      const tickets = [];
      for (let i = 0; i < quantity; i++) {
        const tId = `PHY-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const payload = { tId, eId: selectedEvent.id, type: catName, usr: "PHY-BUYER" };
        const jws = await signTicket(payload);
        tickets.push({ id: tId, qrCode: jws });
      }

      const { data: trxData, error: trxError } = await supabase.from('transactions').insert([{
        event_id: selectedEvent.id,
        user_id: user?.id,
        amount: commissionDue,
        commission_rate: Math.round(commissionRate * 100),
        commission_amount: commissionDue,
        currency: selectedEvent.currency,
        status: 'valid',
        method: 'cash/pos',
        guest_name: `Lot de ${quantity} Billets Physiques`,
        guest_email: user?.email || 'organizer@local.com'
      }]).select().single();

      if (trxError) {
        console.warn("DB insert failed for transaction:", trxError);
        addToast("Erreur sauvegarde BDD (Transaction): " + trxError.message, "error");
      } else {
        const { error: tErr } = await supabase.from('tickets').insert(tickets.map((t: any) => ({
          id: t.id,
          event_id: selectedEvent.id,
          transaction_id: trxData?.id || null,
          status: 'valid',
          guest_name: 'Billet Physique (Revendeur)',
          guest_email: user?.email || 'organizer@local.com',
          ticket_type: catName,
          qr_code: t.qrCode
        })));

        if (tErr) {
          console.warn("DB insert failed for tickets:", tErr);
          addToast("Erreur sauvegarde BDD (Billets): " + tErr.message, "error");
        }
      }

      addToast("✅ Signatures créées ! Préparation du PDF...", "info");
      const success = await generateMassTicketsPDF(tickets, selectedEvent.title, catName, columns);

      if (success) {
        addToast("🖨️ Fichier PDF généré avec succès !", "success");
        setQuantity(50);
        fetchPhysicalTxs(selectedEventId || undefined);
      } else {
        throw new Error("Erreur lors de la génération du PDF");
      }
    } catch (err: any) {
      addToast(`Erreur : ${err.message}`, "error");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedEvent || !selectedCategoryId || quantity <= 0) {
      addToast("Veuillez remplir tous les champs correctement.", "error");
      return;
    }
    if (quantity > 200) {
      addToast("Limité à 200 billets par génération simultanée (Performances Navigateur).", "error");
      return;
    }

    setIsGenerating(true);

    if (commissionDue > 0) {
      addToast(`⏳ Vérification commission : ${commissionDue.toLocaleString('fr-FR')} FCFA...`, "info");
      const { data: commResult, error: commError } = await supabase.rpc('pay_physical_commission', {
        p_organizer_id: user?.id,
        p_event_id: selectedEventId,
        p_quantity: quantity,
        p_ticket_price: ticketPrice,
        p_commission_rate: commissionRate,
      });

      if (commError) {
        addToast(`Erreur vérification commission: ${commError.message}`, "error");
        setIsGenerating(false);
        return;
      }

      if (!commResult?.success) {
        if (commResult?.reason === 'pending_payment_exists') {
          addToast("⚠️ Une demande de paiement de commission est déjà en attente. Contactez l'admin.", "error");
          setIsGenerating(false);
          return;
        }
        setPendingCommission(commResult?.amount || commissionDue);
        setShowPaymentModal(true);
        setIsGenerating(false);
        return;
      }

      if (commResult?.method === 'wallet_deduction') {
        addToast(`✅ Commission déduite automatiquement de votre wallet.`, "success");
        setWalletBalance(prev => prev - commissionDue);
      } else if (commResult?.method === 'pre_approved_token') {
        addToast(`✅ Jeton de paiement anticipé consommé avec succès.`, "success");
      }
    }

    await generatePDFTickets();
  };

  const processCommissionPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentInProgress(true);
    const amountToPay = pendingCommission - walletBalance;

    try {
      let reference = '';
      if (payMethod === 'paystack') {
        const config = await PaystackService.getConfig();
        if (!config || !config.publicKey) throw new Error("Paystack non configuré");

        await new Promise((resolve, reject) => {
          const handler = (window as any).PaystackPop.setup({
            key: config.publicKey,
            email: user?.email || 'organizer@afritix.com',
            amount: Math.round(amountToPay * 100),
            currency: 'XOF',
            ref: 'comm_phy_' + Math.floor((Math.random() * 1000000000) + 1),
            callback: function (res: any) {
              reference = res.reference;
              resolve(true);
            },
            onClose: function () {
              reject(new Error("Paiement annulé."));
            }
          });
          handler.openIframe();
        });
      } else {
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Délai de 5 min dépassé.")), 300000));
        const res: any = await Promise.race([PawaPayService.requestUSSDPush(momoPhone, amountToPay, momoNetwork), timeoutPromise]);
        if (!res.success) throw new Error("Paiement Mobile Money échoué.");
        reference = res.pawaId;
      }

      addToast("✅ Paiement réussi ! Validation numérique en cours...", "info");
      const { error: confirmErr } = await supabase.rpc('confirm_physical_commission_payment', {
        p_organizer_id: user?.id,
        p_event_id: selectedEventId,
        p_amount: amountToPay,
        p_reference: reference
      });

      if (confirmErr) throw new Error("DB Error: " + confirmErr.message);

      setShowPaymentModal(false);
      addToast("🎉 Commission validée ! L'impression se lance automatiquement...", "success");
      await handleGenerate();

    } catch (err: any) {
      addToast(err.message || "Le paiement a échoué", "error");
    } finally {
      setPaymentInProgress(false);
    }
  };

  // Analytics — computed from server-fetched physicalTxs
  const totalPrinted = physicalTxs.length;
  const totalScanned = physicalTxs.filter((t: any) => t.status === 'completed' || t.status === 'checked_in' || t.status === 'used').length;
  const conversionRate = totalPrinted > 0 ? Math.round((totalScanned / totalPrinted) * 100) : 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* Payment Required Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" onClick={() => setShowPaymentModal(false)} />
          <div className="relative bg-slate-800 w-full max-w-lg rounded-3xl border border-orange-500/30 shadow-2xl p-8 z-10">
            <div className="w-14 h-14 bg-orange-500/20 rounded-2xl flex items-center justify-center mb-6 border border-orange-500/30 mx-auto">
              <Banknote className="text-orange-400" size={28} />
            </div>
            <h3 className="text-xl font-extrabold text-white text-center mb-2">Paiement Commission Requis</h3>
            <p className="text-slate-400 text-sm text-center mb-6">
              Votre solde wallet est insuffisant pour couvrir la commission de ce lot de billets physiques.
            </p>

            <div className="bg-slate-900/60 rounded-2xl p-5 border border-white/10 space-y-3 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Commission due</span>
                <span className="text-white font-bold">{pendingCommission.toLocaleString('fr-FR')} FCFA</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Votre solde wallet</span>
                <span className="text-orange-400 font-bold">{walletBalance.toLocaleString('fr-FR')} FCFA</span>
              </div>
              <div className="border-t border-white/10 pt-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">À payer</span>
                  <span className="text-rose-400 font-extrabold text-base">{(pendingCommission - walletBalance).toLocaleString('fr-FR')} FCFA</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 mb-4 bg-slate-900/50 p-1 border border-white/5 rounded-xl">
              <button type="button" onClick={() => setPayMethod('paystack')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${payMethod === 'paystack' ? 'bg-indigo-500 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                Carte / Paystack
              </button>
              <button type="button" onClick={() => setPayMethod('momo')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${payMethod === 'momo' ? 'bg-amber-500 text-white shadow' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                Mobile Money
              </button>
            </div>

            <form onSubmit={processCommissionPayment} className="space-y-4">
              {payMethod === 'momo' && (
                <div className="grid grid-cols-2 gap-4">
                  <select required value={momoNetwork} onChange={e => setMomoNetwork(e.target.value)} className="bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-orange-500 outline-none">
                    <option value="ORANGE_CI">Orange CI</option>
                    <option value="MTN_CI">MTN CI</option>
                    <option value="MOOV_CI">Moov CI</option>
                    <option value="WAVE_CI">Wave CI</option>
                    <option value="ORANGE_SN">Orange SN</option>
                    <option value="FREE_SN">Free SN</option>
                  </select>
                  <input type="tel" required value={momoPhone} onChange={e => setMomoPhone(e.target.value)} placeholder="N° Téléphone" className="bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-orange-500 outline-none" />
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowPaymentModal(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl font-bold transition-colors">
                  Annuler
                </button>
                <button type="submit" disabled={paymentInProgress} className="flex-1 bg-green-600 hover:bg-green-500 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors">
                  {paymentInProgress ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle size={20} />} Payer & Imprimer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main Form Card */}
      <div className="bg-slate-800/80 rounded-3xl p-6 md:p-8 border border-white/10 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Printer size={120} className="text-white" />
        </div>

        <h2 className="text-2xl font-black text-white mb-2 flex items-center gap-3 relative z-10">
          <Printer className="text-orange-400" size={28} /> Impression de Billets en Masse
        </h2>
        <p className="text-slate-400 max-w-2xl relative z-10 mb-8">
          Générez des QR Codes physiques certifiés avec le même niveau de sécurité (JWS) que les billets en ligne.
          Une commission Babipass est automatiquement calculée sur chaque lot imprimé.
        </p>

        <form onSubmit={handleGenerate} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 relative z-10">

          <div className="space-y-2 lg:col-span-2">
            <label className="text-sm font-bold text-slate-300">Événement</label>
            <select
              required
              value={selectedEventId}
              onChange={e => { setSelectedEventId(e.target.value); setSelectedCategoryId(''); }}
              className="w-full bg-slate-900/60 border border-white/10 rounded-xl px-4 py-3 text-white appearance-none focus:ring-2 focus:ring-orange-500 outline-none"
            >
              <option value="">Sélectionnez un événement...</option>
              {events.map((e: any) => (
                <option key={e.id} value={e.id}>{e.title}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-300">Catégorie</label>
            <select
              required
              value={selectedCategoryId}
              onChange={e => setSelectedCategoryId(e.target.value)}
              disabled={!selectedEventId}
              className="w-full bg-slate-900/60 border border-white/10 rounded-xl px-4 py-3 text-white appearance-none focus:ring-2 focus:ring-orange-500 outline-none disabled:opacity-50"
            >
              <option value="">Catégorie...</option>
              {categories.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-300">Quantité</label>
            <input
              required
              type="number"
              min="1"
              max="200"
              value={quantity}
              onChange={e => setQuantity(Number(e.target.value))}
              className="w-full bg-slate-900/60 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-orange-500 outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-300">Taille QR / Page</label>
            <select
              value={columns}
              onChange={e => setColumns(Number(e.target.value))}
              className="w-full bg-slate-900/60 border border-white/10 rounded-xl px-4 py-3 text-white appearance-none focus:ring-2 focus:ring-orange-500 outline-none"
            >
              <option value="2">2 colonnes (Format Géant)</option>
              <option value="3">3 colonnes (Recommandé)</option>
              <option value="4">4 colonnes (Compact)</option>
              <option value="6">6 colonnes (Petits QR)</option>
              <option value="8">8 colonnes (Format Mini)</option>
            </select>
          </div>

          {/* Commission Banner */}
          {selectedEventId && selectedCategoryId && (
            <div className={`lg:col-span-5 rounded-2xl p-4 border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${ticketPrice === 0
              ? 'bg-slate-700/40 border-slate-600/40'
              : balanceSufficient
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-orange-500/10 border-orange-500/30'
              }`}>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {ticketPrice === 0 ? (
                    <span className="text-slate-400 text-sm font-bold">🎁 Événement gratuit — aucune commission</span>
                  ) : balanceSufficient ? (
                    <span className="text-emerald-400 text-sm font-bold">✅ Commission payée par déduction wallet</span>
                  ) : (
                    <span className="text-orange-400 text-sm font-bold">⚠️ Paiement externe requis</span>
                  )}
                </div>
                {ticketPrice > 0 && (
                  <p className="text-xs text-slate-400 font-mono">
                    {quantity} billets × {ticketPrice.toLocaleString('fr-FR')} FCFA × {(commissionRate * 100).toFixed(0)}%
                    {' = '}
                    <span className="text-white font-bold">{commissionDue.toLocaleString('fr-FR')} FCFA</span>
                    {' · '}Votre wallet : <span className={balanceSufficient ? 'text-emerald-400' : 'text-orange-400'}>{walletBalance.toLocaleString('fr-FR')} FCFA</span>
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="lg:col-span-5 border-t border-white/5 pt-6 mt-2 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
              <ShieldCheck size={16} /> QR Codes JWS Haute Sécurité Inclus
            </div>

            <button
              type="submit"
              disabled={isGenerating || !selectedEventId || !selectedCategoryId}
              className="w-full sm:w-auto bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-95"
            >
              {isGenerating ? (
                <><Loader2 size={20} className="animate-spin" /> Traitement en cours...</>
              ) : (
                <><Printer size={20} /> Imprimer {quantity} Billet(s)</>
              )}
            </button>
          </div>

        </form>
      </div>

      {/* Analytics Dashboard */}
      <h3 className="text-xl font-bold text-white mt-8 mb-4 flex items-center gap-2">
        <Activity className="text-blue-400" size={24} /> Intelligence Billets Physiques
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900/60 border border-white/5 rounded-3xl p-6 shadow-xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent transition-opacity group-hover:opacity-100 opacity-50" />
          <h4 className="text-slate-400 text-sm font-semibold uppercase tracking-wider relative z-10">Total Imprimés</h4>
          <p className="text-4xl font-extrabold text-white mt-2 relative z-10">{totalPrinted}</p>
          <div className="absolute top-6 right-6 p-3 bg-blue-500/10 rounded-2xl border border-blue-500/20">
            <Printer className="text-blue-400" size={24} />
          </div>
        </div>

        <div className="bg-slate-900/60 border border-white/5 rounded-3xl p-6 shadow-xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent transition-opacity group-hover:opacity-100 opacity-50" />
          <h4 className="text-slate-400 text-sm font-semibold uppercase tracking-wider relative z-10">Scannés & Consommés</h4>
          <p className="text-4xl font-extrabold text-white mt-2 relative z-10">{totalScanned}</p>
          <div className="absolute top-6 right-6 p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
            <CheckCircle className="text-emerald-400" size={24} />
          </div>
        </div>

        <div className="bg-slate-900/60 border border-white/5 rounded-3xl p-6 shadow-xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent transition-opacity group-hover:opacity-100 opacity-50" />
          <h4 className="text-slate-400 text-sm font-semibold uppercase tracking-wider relative z-10">Taux de Conversion (Scan)</h4>
          <p className="text-4xl font-extrabold text-orange-400 mt-2 relative z-10">{conversionRate}%</p>
          <div className="absolute top-6 right-6 p-3 bg-orange-500/10 rounded-2xl border border-orange-500/20">
            <TrendingUp className="text-orange-400" size={24} />
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full mt-4 overflow-hidden relative z-10">
            <div className="h-full bg-orange-400 transition-all duration-1000" style={{ width: `${conversionRate}%` }} />
          </div>
        </div>
      </div>

      {/* Information Panel */}
      <div className="grid md:grid-cols-3 gap-6 pt-4">
        <div className="bg-slate-800/40 p-6 rounded-2xl border border-white/5">
          <div className="w-10 h-10 bg-orange-500/20 rounded-full flex items-center justify-center mb-4 border border-orange-500/30">
            <Key size={20} className="text-orange-400" />
          </div>
          <h3 className="text-white font-bold mb-2">Non-Duplicables</h3>
          <p className="text-slate-400 text-sm">Chaque QR code contient une signature anti-fraude cryptée unique. Même imprimé, il ne peut pas être falsifié.</p>
        </div>
        <div className="bg-slate-800/40 p-6 rounded-2xl border border-white/5">
          <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center mb-4 border border-emerald-500/30">
            <Clock size={20} className="text-emerald-400" />
          </div>
          <h3 className="text-white font-bold mb-2">Usage Unique</h3>
          <p className="text-slate-400 text-sm">Lorsqu'un billet physique est flashé à l'entrée avec TicketScanner, il est désactivé définitivement.</p>
        </div>
        <div className="bg-slate-800/40 p-6 rounded-2xl border border-white/5">
          <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center mb-4 border border-blue-500/30">
            <Banknote size={20} className="text-blue-400" />
          </div>
          <h3 className="text-white font-bold mb-2">Commission automatique</h3>
          <p className="text-slate-400 text-sm">La commission Babipass est déduite de votre wallet ou facturée avant chaque lot. Aucune surprise après l'événement.</p>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// ─── FUNDRAISING TAB ──────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
const EMPTY_FUNDRAISING_FORM = { title: '', description: '', image: '', goal_amount: '', currency: 'FCFA', end_date: '' };

const FundraisingTab: React.FC<{ organizerId: string | undefined; addToast: (m: string, t?: any) => void }> = ({ organizerId, addToast }) => {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [statsMap, setStatsMap] = useState<Record<string, { total_raised: number; contributor_count: number }>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>(EMPTY_FUNDRAISING_FORM);
  const [uploadingImg, setUploadingImg] = useState(false);
  const imgRef = React.useRef<HTMLInputElement>(null);

  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) { addToast('Format invalide. Choisissez une image.', 'error'); return; }
    if (file.size > 5 * 1024 * 1024) { addToast('Image trop lourde (max 5 Mo).', 'error'); return; }
    setUploadingImg(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const filename = `fundraising/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage.from('events').upload(filename, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('events').getPublicUrl(filename);
      setForm((prev: any) => ({ ...prev, image: urlData.publicUrl }));
      addToast('Image uploadée !', 'success');
    } catch (err: any) {
      addToast('Erreur upload: ' + err.message, 'error');
    } finally {
      setUploadingImg(false);
    }
  };

  const fetchCampaigns = async () => {
    if (!organizerId) return;
    setLoading(true);
    const { data } = await supabase.from('fundraising_campaigns').select('*').eq('organizer_id', organizerId).order('created_at', { ascending: false });
    const list = data || [];
    setCampaigns(list);
    if (list.length > 0) {
      const { data: s } = await supabase.from('campaign_stats').select('campaign_id, total_raised, contributor_count').in('campaign_id', list.map((c: any) => c.id));
      const map: Record<string, any> = {};
      (s || []).forEach((r: any) => { map[r.campaign_id] = r; });
      setStatsMap(map);
    }
    setLoading(false);
  };

  useEffect(() => { fetchCampaigns(); }, [organizerId]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FUNDRAISING_FORM);
    setShowForm(true);
  };

  const openEdit = (c: any) => {
    setEditingId(c.id);
    setForm({ title: c.title, description: c.description || '', image: c.image || '', goal_amount: String(c.goal_amount || ''), currency: c.currency || 'FCFA', end_date: c.end_date || '' });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title) return;
    setSaving(true);
    const payload: any = { title: form.title, description: form.description, image: form.image, goal_amount: Number(form.goal_amount) || 0, currency: form.currency, end_date: form.end_date || null };
    payload.slug = await getUniqueSlug(form.title, 'fundraising_campaigns', editingId || undefined);
    if (editingId) {
      const { error } = await supabase.from('fundraising_campaigns').update({ ...payload, approval_status: 'pending' }).eq('id', editingId);
      if (error) { addToast(error.message, 'error'); }
      else { addToast('Campagne mise à jour ! Elle repassera en validation admin.', 'success'); setShowForm(false); setEditingId(null); setForm(EMPTY_FUNDRAISING_FORM); fetchCampaigns(); }
    } else {
      const { error } = await supabase.from('fundraising_campaigns').insert([{ ...payload, organizer_id: organizerId }]);
      if (error) { addToast(error.message, 'error'); }
      else { addToast('Campagne créée ! Elle sera visible après validation de l\'admin.', 'success'); setShowForm(false); setForm(EMPTY_FUNDRAISING_FORM); fetchCampaigns(); }
    }
    setSaving(false);
  };

  const handleDelete = async (c: any) => {
    if (!confirm(`Supprimer définitivement la campagne "${c.title}" et toutes ses contributions ?`)) return;
    const { error } = await supabase.from('fundraising_campaigns').delete().eq('id', c.id);
    if (error) addToast(error.message, 'error');
    else { addToast('Campagne supprimée.', 'info'); fetchCampaigns(); }
  };

  const handleEnd = async (id: string) => {
    if (!confirm('Marquer cette campagne comme terminée ? Les dons seront bloqués.')) return;
    await supabase.from('fundraising_campaigns').update({ status: 'ended' }).eq('id', id);
    addToast('Campagne clôturée.', 'info');
    fetchCampaigns();
  };

  const publicUrl = (c: any) => `${window.location.origin}/collecte/${c.slug || c.id}`;

  const approvalBadge = (c: any) => {
    if (c.approval_status === 'approved') return <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">✅ Approuvée</span>;
    if (c.approval_status === 'rejected') return <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-red-500/20 text-red-400 border border-red-500/30">❌ Refusée</span>;
    return <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">⏳ En attente</span>;
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-orange-400" size={32} /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2"><Heart className="text-orange-400" size={24} /> Collectes de Fonds</h2>
          <p className="text-slate-400 text-sm mt-1">Créez des campagnes de financement. Chaque campagne est validée par l'admin avant publication.</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-gradient-to-r from-orange-600 to-amber-500 hover:scale-105 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-orange-500/25">
          <Plus size={18} /> Nouvelle campagne
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="bg-[#1e293b] border border-white/10 rounded-2xl p-6 space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white">{editingId ? '✏️ Modifier la campagne' : '➕ Créer une nouvelle campagne'}</h3>
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="text-slate-400 hover:text-white"><X size={20} /></button>
          </div>
          {editingId && <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2">⚠️ Toute modification remettra la campagne en attente de validation admin.</p>}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-1">Titre *</label>
              <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Ex: Financement de mon gala 2026" className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-1">Objectif ({form.currency})</label>
              <input type="number" min="0" value={form.goal_amount} onChange={e => setForm({ ...form, goal_amount: e.target.value })} placeholder="5000000" className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 text-sm" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-300 mb-1">Description</label>
              <textarea rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Décrivez votre projet, son but, et pourquoi les gens devraient contribuer..." className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 text-sm resize-none" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-300 mb-2">Image de couverture</label>
              <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }} />
              <div onClick={() => imgRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleImageUpload(f); }} className="relative cursor-pointer rounded-xl border-2 border-dashed border-slate-600 hover:border-orange-500/60 hover:bg-orange-500/5 transition-all overflow-hidden">
                {uploadingImg ? (
                  <div className="flex flex-col items-center gap-2 py-8"><Loader2 size={28} className="animate-spin text-orange-400" /><p className="text-orange-400 text-sm font-bold">Upload en cours...</p></div>
                ) : form.image ? (
                  <div className="relative h-36"><img src={form.image} alt="preview" className="w-full h-full object-cover" /><div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"><p className="text-white text-xs font-bold">Cliquer pour remplacer</p></div></div>
                ) : (
                  <div className="py-8 flex flex-col items-center gap-2"><div className="w-12 h-12 rounded-xl bg-slate-700 flex items-center justify-center"><Plus size={22} className="text-slate-400" /></div><p className="text-slate-300 text-sm font-bold">Glisser-déposer ou cliquer</p><p className="text-slate-500 text-xs">PNG, JPG, WEBP — max 5 Mo</p></div>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2"><div className="flex-1 h-px bg-slate-700" /><span className="text-slate-500 text-xs">ou coller une URL</span><div className="flex-1 h-px bg-slate-700" /></div>
              <input value={form.image} onChange={e => setForm({ ...form, image: e.target.value })} placeholder="https://..." className="mt-2 w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-1">Date de fin</label>
              <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-orange-500 text-sm" />
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="px-5 py-2 rounded-xl text-slate-400 hover:text-white text-sm font-bold transition-colors">Annuler</button>
            <button type="submit" disabled={saving} className="flex items-center gap-2 bg-orange-600 hover:bg-orange-500 text-white px-6 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />} {editingId ? 'Mettre à jour' : 'Créer la campagne'}
            </button>
          </div>
        </form>
      )}

      {campaigns.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-white/10 rounded-2xl">
          <Heart size={48} className="mx-auto text-slate-600 mb-4" />
          <p className="text-slate-400 font-bold">Aucune campagne pour l'instant</p>
          <p className="text-slate-600 text-sm mt-1">Cliquez sur "Nouvelle campagne" pour commencer.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {campaigns.map((c: any) => {
            const s = statsMap[c.id] || { total_raised: 0, contributor_count: 0 };
            const progress = c.goal_amount > 0 ? Math.min((s.total_raised / c.goal_amount) * 100, 100) : 0;
            const isApproved = c.approval_status === 'approved';
            const canEdit = c.approval_status !== 'approved';
            return (
              <div key={c.id} className={`bg-[#1e293b] border rounded-2xl overflow-hidden ${c.approval_status === 'rejected' ? 'border-red-500/30' : c.approval_status === 'approved' ? 'border-emerald-500/20' : 'border-white/10'}`}>
                {c.image && <img src={c.image} alt={c.title} className="w-full h-32 object-cover" />}
                <div className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <h3 className="font-bold text-white">{c.title}</h3>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {approvalBadge(c)}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${c.status === 'active' ? 'bg-slate-700 text-slate-300' : 'bg-slate-800 text-slate-500'}`}>{c.status === 'active' ? 'Active' : 'Terminée'}</span>
                    </div>
                  </div>

                  {c.approval_status === 'rejected' && c.rejection_reason && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 text-xs text-red-300">
                      <span className="font-bold">Motif du refus :</span> {c.rejection_reason}
                    </div>
                  )}

                  {!isApproved && c.approval_status === 'pending' && (
                    <p className="text-xs text-amber-400/80">⏳ En cours de validation par l'équipe Babipass.</p>
                  )}

                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-orange-400 font-bold">{s.total_raised.toLocaleString()} {c.currency}</span>
                      <span className="text-slate-400">{c.goal_amount > 0 ? `sur ${c.goal_amount.toLocaleString()}` : 'Objectif libre'}</span>
                    </div>
                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="text-xs text-slate-400"><Users size={10} className="inline mr-1" />{s.contributor_count} contributeur{s.contributor_count > 1 ? 's' : ''}</p>
                  </div>

                  <div className="flex gap-2 pt-1 flex-wrap">
                    <button onClick={() => { navigator.clipboard.writeText(publicUrl(c)); addToast('Lien copié !', 'success'); }} className="flex items-center gap-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded-lg font-bold transition-colors">
                      <Link size={12} /> Copier lien
                    </button>
                    <a href={publicUrl(c)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded-lg font-bold transition-colors">
                      <Eye size={12} /> Voir
                    </a>
                    {canEdit && (
                      <button onClick={() => openEdit(c)} className="flex items-center gap-1.5 text-xs bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 px-3 py-1.5 rounded-lg font-bold transition-colors">
                        <Edit2 size={12} /> Modifier
                      </button>
                    )}
                    <button onClick={() => handleDelete(c)} className="flex items-center gap-1.5 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-3 py-1.5 rounded-lg font-bold transition-colors">
                      <Trash2 size={12} /> Supprimer
                    </button>
                    {isApproved && c.status === 'active' && (
                      <button onClick={() => handleEnd(c.id)} className="flex items-center gap-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-400 px-3 py-1.5 rounded-lg font-bold transition-colors ml-auto">
                        Terminer
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};



