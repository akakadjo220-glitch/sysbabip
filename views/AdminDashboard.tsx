import React, { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Shield, CheckCircle, Search, Users, Calendar, CreditCard, XCircle, Trash2, Edit2, Ban, Plus, Save, X, Check, Loader2, Eye, AlertCircle, RefreshCw, Globe, Settings, Smartphone, Mail, Banknote, User, Coins, Building2, FileText, MapPin, Clock, AlertTriangle, CheckCircle2, Tags, Heart, Download } from 'lucide-react';
import { formatCurrency, EXCHANGE_RATES } from '../constants';
import { UserRole, UserProfile, Event } from '../types';
import { supabase } from '../supabaseClient';
import { MapPicker } from '../components/MapPicker';
import { AccountSettingsView } from '../components/AccountSettingsView';
import { Pagination } from '../components/Pagination';
import { getPlatformSettings, clearSettingsCache } from '../utils/platformSettings';
import { getUniqueSlug } from '../utils/slugUtils';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b'];
type AdminTab = 'overview' | 'users' | 'events' | 'finance' | 'kyb' | 'ads' | 'countries' | 'templates' | 'settings' | 'account' | 'categories' | 'fundraising' | 'refunds';

import { EMAIL_TEMPLATES, EmailTemplateType } from '../constants';
import { VideoUploadField } from '../components/LazyVideo';

// ─── Toast ────────────────────────────────────────────────────────────────────
type ToastType = 'success' | 'error' | 'info';
interface Toast { id: number; message: string; type: ToastType; }

const ToastContainer: React.FC<{ toasts: Toast[]; onRemove: (id: number) => void }> = ({ toasts, onRemove }) => (
  <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
    {toasts.map(t => (
      <div key={t.id} className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border text-sm font-medium ${t.type === 'success' ? 'bg-emerald-900 border-emerald-500 text-emerald-100' : t.type === 'error' ? 'bg-red-900 border-red-500 text-red-100' : 'bg-slate-800 border-slate-600 text-slate-100'}`}>
        {t.type === 'success' ? <CheckCircle size={16} /> : t.type === 'error' ? <AlertCircle size={16} /> : <Eye size={16} />}
        <span className="flex-1">{t.message}</span>
        <button onClick={() => onRemove(t.id)} className="opacity-60 hover:opacity-100 shrink-0"><X size={14} /></button>
      </div>
    ))}
  </div>
);

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ revenue: 0, commission: 0, physicalCommission: 0, paidPayouts: 0, userCount: 0, activeEvents: 0, pendingEvents: 0 });
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (message: string, type: ToastType = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  };
  const removeToast = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  const fetchData = async () => {
    setLoading(true);
    try {

      const { data: statsData } = await supabase.rpc('get_admin_stats');
      if (statsData) setStats(statsData as any);
    } catch (err: any) {
      addToast(`Erreur chargement: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSaveUser = async (user: UserProfile) => {
    const isNew = user.id.startsWith('new-');
    if (!isNew) {
      const { error } = await supabase.from('profiles').update({ name: user.name, role: user.role, status: user.status, avatar: user.avatar }).eq('id', user.id);
      if (error) throw new Error(error.message);
      addToast('Profil mis à jour !', 'success');
    } else {
      const { data: authData, error: authError } = await supabase.auth.signUp({ email: user.email, password: 'Babipass2024!', options: { data: { name: user.name, role: user.role } } });
      if (authError || !authData.user) throw new Error(authError?.message || 'Impossible de créer compte');
      await supabase.from('profiles').upsert([{ id: authData.user.id, name: user.name, email: user.email, role: user.role, status: 'active' }]);
      addToast('Utilisateur créé !', 'success');
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!window.confirm('Supprimer cet utilisateur ?')) return;
    const { error } = await supabase.from('profiles').delete().eq('id', id);
    if (error) { addToast(`Erreur: ${error.message}`, 'error'); return; }
    addToast('Utilisateur supprimé.', 'success');
  };

  const toggleBanUser = async (id: string) => {
    const { data: user } = await supabase.from('profiles').select('status').eq('id', id).single();
    if (!user) return;
    const newStatus = user.status === 'banned' ? 'active' : 'banned';
    const { error } = await supabase.from('profiles').update({ status: newStatus }).eq('id', id);
    if (error) { addToast(`Erreur: ${error.message}`, 'error'); return; }
    addToast(newStatus === 'banned' ? 'Utilisateur banni.' : 'Utilisateur réactivé.', 'success');
  };

  const approveUser = async (id: string) => {
    const { error } = await supabase.from('profiles').update({ status: 'active' }).eq('id', id);
    if (error) { addToast(`Erreur: ${error.message}`, 'error'); return; }
    addToast('Organisateur approuvé.', 'success');
  };

  const handleEventAction = async (id: string, action: 'approve' | 'reject' | 'delete') => {
    if (action === 'delete') {
      if (!window.confirm('Supprimer cet événement définitivement ?')) return false;
      const { error } = await supabase.from('events').delete().eq('id', id);
      if (error) {
        // Handle Foreign Key Constraints explicitly by cascading locally
        if (error.message.includes('foreign key') || error.code === '23503') {
          await supabase.from('tickets').delete().eq('event_id', id);
          await supabase.from('transactions').delete().eq('event_id', id);
          await supabase.from('ticket_types').delete().eq('event_id', id);
          await supabase.from('event_programs').delete().eq('event_id', id);
          const retry = await supabase.from('events').delete().eq('id', id);
          if (retry.error) {
            addToast(`Erreur: ${retry.error.message}`, 'error');
            return false;
          }
        } else {
          addToast(`Erreur: ${error.message}`, 'error');
          return false;
        }
      }
      addToast('Événement supprimé.', 'success');
      return true;
    }
    const newStatus = action === 'approve' ? 'published' : 'draft';
    const { error } = await supabase.from('events').update({ status: newStatus }).eq('id', id);
    if (error) { addToast(`Erreur: ${error.message}`, 'error'); return false; }
    addToast(action === 'approve' ? '✅ Événement publié !' : 'Événement mis en brouillon.', 'success');
    return true;
  };

  const handleSaveEvent = async (eventData: Partial<Event> & any, id?: string) => {
    // Nettoyer et mapper les données pour la base de données Supabase (supprimer propriétés camelCase, id, etc.)
    const payload: any = { ...eventData };
    delete payload.id;
    delete payload.endDate;
    delete payload.organizer;
    delete payload.ticketTypes;

    if (eventData.endDate !== undefined) payload.end_date = eventData.endDate;
    if (eventData.organizer !== undefined) payload.organizer_name = eventData.organizer;

    // Allow resetting to global default by setting to null if empty
    if (eventData.commission_rate === undefined) payload.commission_rate = null;
    if (eventData.physical_commission_rate === undefined) payload.physical_commission_rate = null;

    if (payload.title) {
      payload.slug = await getUniqueSlug(payload.title, 'events', id);
    }

    if (id) {
      const { error } = await supabase.from('events').update(payload).eq('id', id);
      if (error) { addToast(error.message, 'error'); return false; }
      addToast('Événement mis à jour !', 'success');
    } else {
      const { error } = await supabase.from('events').insert([{ ...payload, status: payload.status || 'draft' }]);
      if (error) { addToast(error.message, 'error'); return false; }
      addToast('Événement créé !', 'success');
    }
    return true;
  };

  // ─── Render ───
  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <Loader2 className="animate-spin text-orange-500" size={48} />
      <p className="text-slate-400">Chargement du tableau de bord...</p>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative z-10 block">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* Header UI */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/5 backdrop-blur-xl p-6 rounded-3xl border border-white/10 shadow-xl relative z-20">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-400 flex items-center gap-3">
            <Shield className="text-orange-400 shrink-0" size={32} /> Administration
          </h1>
          <p className="text-slate-400 mt-2 font-medium">Supervisez et gérez l'ensemble de la plateforme Babipass.</p>
        </div>
        <button onClick={fetchData} className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white px-5 py-2.5 rounded-xl font-semibold border border-white/10 transition-all shadow-lg backdrop-blur-md">
          <RefreshCw size={16} /> Actualiser
        </button>
      </div>

      {/* Tabs Menu */}
      <div className="flex overflow-x-auto space-x-2 bg-slate-900/40 p-1.5 rounded-2xl border border-white/10 w-full no-scrollbar relative z-20 shadow-2xl backdrop-blur-lg">
        {[
          { id: 'overview', icon: Shield, label: "Vue d'ensemble" },
          { id: 'users', icon: Users, label: 'Utilisateurs' },
          { id: 'events', icon: Calendar, label: 'Événements' },
          { id: 'fundraising', icon: Heart, label: 'Collectes de Fonds' },
          { id: 'finance', icon: CreditCard, label: 'Finance' },
          { id: 'kyb', icon: Building2, label: 'Vérif. Business' },
          { id: 'ads', icon: Eye, label: 'Publicités' },
          { id: 'categories', icon: Tags, label: 'Catégories' },
          { id: 'countries', icon: Globe, label: 'Pays' },
          { id: 'templates', icon: Mail, label: 'Templates d\'Emails' },
          { id: 'refunds', icon: AlertTriangle, label: 'Annulations & Remb.' },
          { id: 'settings', icon: Settings, label: 'Configurations API' },
          { id: 'account', icon: User, label: 'Mon Compte' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as AdminTab)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg border border-orange-400/50' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
            <tab.icon size={16} /> {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content Area - z-20 for clicks */}
      <div className="relative z-20 block">
        {activeTab === 'overview' && <OverviewTab stats={stats} />}
        {activeTab === 'users' && <UsersTab onSave={handleSaveUser} onDelete={handleDeleteUser} onToggleBan={toggleBanUser} onApprove={approveUser} addToast={addToast} />}
        {activeTab === 'events' && <EventsTab onAction={handleEventAction} onSave={handleSaveEvent} addToast={addToast} />}
        {activeTab === 'finance' && <FinanceTab stats={stats} addToast={addToast} />}
        {activeTab === 'kyb' && <KybReviewTab addToast={addToast} />}
        {activeTab === 'ads' && <AdBannersTab addToast={addToast} />}
        {activeTab === 'categories' && <EventCategoriesTab addToast={addToast} />}
        {activeTab === 'countries' && <CountriesTab />}
        { activeTab === 'templates' && <EmailTemplatesManager addToast={addToast} /> }
        { activeTab === 'fundraising' && <AdminFundraisingTab addToast={addToast} /> }
        { activeTab === 'refunds' && <RefundsManagementView addToast={addToast} /> }
        { activeTab === 'settings' && <SettingsTab /> }
        {activeTab === 'account' && <AccountSettingsView userMode="admin" />}
      </div>
    </div>
  );
};

// ─── Subcomponents ───────────────────────────────────────────────────────────

const OverviewTab = ({ stats }: any) => {
  const [chartData, setChartData] = useState<{ name: string, value: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchChartData = async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_revenue_by_country');
      if (!error && data) {
        setChartData(data);
      }
      setLoading(false);
    };
    fetchChartData();
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPI title="Volume Total" value={formatCurrency(stats.revenue)} trend="+12% ce mois" color="from-orange-500 to-blue-500" />
        <KPI title="Commissions" value={formatCurrency(stats.commission)} trend="+8% vs hier" color="from-amber-500 to-rose-500" />
        <KPI title="Utilisateurs" value={stats.userCount} trend="Actifs" color="from-emerald-500 to-teal-500" />
        <KPI title="Événements" value={stats.activeEvents} trend={`${stats.pendingEvents} à valider`} color="from-amber-500 to-orange-500" />
      </div>

      <div className="glass-panel p-8 rounded-3xl border border-white/10 bg-slate-900/50 backdrop-blur-xl shadow-2xl">
        <h3 className="text-lg font-bold text-white mb-6">Volume de Transactions par Pays</h3>
        <div className="h-80 w-full relative z-0">
          {loading ? (
            <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-orange-400" size={32} /></div>
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background: 'rgba(30, 41, 59, 0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }} formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="value" fill="#8b5cf6" radius={[6, 6, 0, 0]}>
                  {chartData.map((_, i) => <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-500">Aucune donnée par pays</div>
          )}
        </div>
      </div>
    </div>
  );
};

const KPI = ({ title, value, trend, color }: any) => (
  <div className={`relative p-6 rounded-3xl border border-white/10 bg-slate-900/50 backdrop-blur-xl overflow-hidden group shadow-2xl`}>
    <div className={`absolute inset-0 opacity-10 bg-gradient-to-br ${color} transition-opacity group-hover:opacity-20`} />
    <p className="text-slate-400 text-sm font-semibold uppercase tracking-wider relative z-10">{title}</p>
    <h3 className="text-3xl font-extrabold text-white mt-2 relative z-10">{value}</h3>
    <p className="text-slate-400 text-sm mt-2 relative z-10 font-medium">{trend}</p>
  </div>
);

// ─── Events Tab ───
const EventsTab = ({ onAction, onSave, addToast }: any) => {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [loadingActions, setLoadingActions] = useState<Record<string, boolean>>({});

  const [currentPage, setCurrentPage] = useState(1);
  const [events, setEvents] = useState<Event[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const ITEMS_PER_PAGE = 20;

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setCurrentPage(1); }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page when filter changes
  useEffect(() => { setCurrentPage(1); }, [filter]);

  // Server-side fetch
  const fetchEvents = async () => {
    setLoading(true);
    const from = (currentPage - 1) * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    let query = supabase.from('events').select('*', { count: 'exact' }).order('created_at', { ascending: false });

    if (filter !== 'all') {
      query = query.eq('status', filter);
    }

    if (debouncedSearch) {
      query = query.or(`title.ilike.%${debouncedSearch}%,organizer_name.ilike.%${debouncedSearch}%`);
    }

    const { data, count, error } = await query.range(from, to);
    if (error) { addToast?.(`Erreur chargement événements: ${error.message}`, 'error'); }

    setEvents((data || []).map((e: any) => ({
      id: e.id, title: e.title || 'Sans titre', description: e.description || '', date: e.date || e.start_date || new Date().toISOString(), endDate: e.end_date, location: e.location || '', city: e.city || '', country: e.country || '', price: Number(e.price) || 0, currency: e.currency || 'FCFA', image: e.image || e.cover_image || '', category: e.category || '', organizer: e.organizer_name || e.organizer || '', sold: Number(e.sold) || 0, capacity: Number(e.capacity) || 0, status: e.status || 'draft',
      commission_rate: e.commission_rate, physical_commission_rate: e.physical_commission_rate
    } as Event)));
    setTotalCount(count || 0);
    setLoading(false);
  };

  useEffect(() => { fetchEvents(); }, [currentPage, debouncedSearch, filter]);

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  const performAction = async (id: string, action: 'approve' | 'reject' | 'delete') => {
    setLoadingActions(p => ({ ...p, [id]: true }));
    await onAction(id, action);
    setLoadingActions(p => ({ ...p, [id]: false }));
    fetchEvents();
  };

  const handleSave = async (d: any, id?: string) => {
    await onSave(d, id);
    setIsModalOpen(false);
    fetchEvents();
  };

  return (
    <div className="space-y-6 block">
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-md relative z-30">
        <div className="flex gap-2 bg-slate-900/50 p-1 rounded-xl w-full md:w-auto overflow-x-auto no-scrollbar">
          {['all', 'pending_review', 'published', 'draft'].map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-4 py-2 rounded-lg text-sm font-bold capitalize transition-all whitespace-nowrap ${filter === f ? 'bg-orange-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>
              {f.replace('_', ' ')}
            </button>
          ))}
        </div>
        <div className="flex gap-3 w-full md:w-auto relative z-30">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un événement..." className="w-full bg-slate-900/50 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:ring-2 focus:ring-orange-500 outline-none backdrop-blur-sm" />
          </div>
          <button onClick={() => { setEditingEvent(null); setIsModalOpen(true); }} className="bg-orange-600 hover:bg-orange-500 text-white px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg hover:shadow-orange-500/25 transition-all relative z-50 pointer-events-auto cursor-pointer">
            <Plus size={16} /> Créer
          </button>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-xl relative z-20">
        {loading ? (
          <div className="flex justify-center items-center py-16"><Loader2 className="animate-spin text-orange-400" size={28} /></div>
        ) : (
          <div className="overflow-x-auto relative">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-900/80 text-slate-400 uppercase text-xs font-bold tracking-wider">
                <tr>
                  <th className="px-6 py-4">Événement</th>
                  <th className="px-6 py-4">Lieu / Date</th>
                  <th className="px-6 py-4">Statut</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {events.map((event: Event) => (
                  <tr key={event.id} className="hover:bg-white/5 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        {event.image ? <img src={event.image} alt="" className="w-12 h-12 rounded-xl object-cover shadow-md" /> : <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center"><Calendar className="text-orange-400" /></div>}
                        <div>
                          <div className="text-white font-bold">{event.title}</div>
                          <div className="text-slate-400 text-xs mt-0.5">{event.organizer || 'Babipass'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-300">
                      <div className="font-medium">{event.city || 'Non spécifié'}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{new Date(event.date).toLocaleDateString('fr-FR')}</div>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={event.status} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 relative z-30 pointer-events-auto">
                        <button onClick={() => performAction(event.id, 'delete')} className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors" title="Supprimer">
                          {loadingActions[event.id] ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                        </button>
                        <button onClick={() => { setEditingEvent(event); setIsModalOpen(true); }} className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Éditer">
                          <Edit2 size={16} />
                        </button>
                        {event.status === 'pending_review' && (
                          <button onClick={() => performAction(event.id, 'approve')} className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/30 font-bold text-xs flex items-center gap-1.5 transition-all">
                            <Check size={14} /> Approuver
                          </button>
                        )}
                        {(event.status === 'pending_review' || event.status === 'published') && (
                          <button onClick={() => performAction(event.id, 'reject')} className="px-3 py-1.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-500/30 font-bold text-xs flex items-center gap-1.5 transition-all">
                            <X size={14} /> Rejeter
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {events.length === 0 && <tr><td colSpan={4} className="py-12 text-center text-slate-500 font-medium">Aucun événement trouvé</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-6 py-4 border-t border-white/5">
          <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={totalCount} itemsPerPage={ITEMS_PER_PAGE} />
        </div>
      </div>

      {isModalOpen && <EventModal event={editingEvent} onClose={() => setIsModalOpen(false)} onSave={handleSave} />}
    </div>
  );
};

// ─── Users Tab ───
const UsersTab = ({ onSave, onDelete, onToggleBan, onApprove, addToast }: any) => {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const ITEMS_PER_PAGE = 20;

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setCurrentPage(1); }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Server-side fetch with .range() and .ilike()
  const fetchUsers = async () => {
    setLoading(true);
    const from = (currentPage - 1) * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    let query = supabase.from('profiles').select('*', { count: 'exact' }).order('created_at', { ascending: false });

    if (debouncedSearch) {
      query = query.or(`name.ilike.%${debouncedSearch}%,email.ilike.%${debouncedSearch}%`);
    }

    const { data, count, error } = await query.range(from, to);
    if (error) { addToast?.(`Erreur: ${error.message}`, 'error'); }

    setUsers((data || []).map((u: any) => ({
      id: u.id, name: u.name || u.full_name || 'Utilisateur', email: u.email || '',
      role: (u.role as UserRole) || UserRole.USER, status: u.status || 'active',
      joinedAt: u.created_at, avatar: u.avatar || u.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name || 'U')}&background=6366f1&color=fff`,
    })));
    setTotalCount(count || 0);
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, [currentPage, debouncedSearch]);

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  const handleSave = async (u: UserProfile) => {
    await onSave(u);
    setIsModalOpen(false);
    fetchUsers(); // Refresh server data
  };

  const handleDelete = async (id: string) => {
    await onDelete(id);
    fetchUsers();
  };

  const handleBan = async (id: string) => {
    await onToggleBan(id);
    fetchUsers();
  };

  const handleApprove = async (id: string) => {
    await onApprove(id);
    fetchUsers();
  };

  return (
    <div className="space-y-6 block">
      <div className="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-md relative z-30">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un utilisateur..." className="w-full bg-slate-900/50 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:ring-2 focus:ring-orange-500 outline-none" />
        </div>
        <button onClick={() => { setEditingUser(null); setIsModalOpen(true); }} className="bg-orange-600 hover:bg-orange-500 text-white px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg relative z-50 pointer-events-auto cursor-pointer">
          <Plus size={16} /> Ajouter
        </button>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-xl relative z-20">
        {loading ? (
          <div className="flex justify-center items-center py-16"><Loader2 className="animate-spin text-orange-400" size={28} /></div>
        ) : (
          <div className="overflow-x-auto relative">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-900/80 text-slate-400 uppercase text-xs font-bold tracking-wider">
                <tr>
                  <th className="px-6 py-4">Utilisateur</th>
                  <th className="px-6 py-4">Rôle / Statut</th>
                  <th className="px-6 py-4">Inscription</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.map((user: UserProfile) => (
                  <tr key={user.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 flex items-center gap-4">
                      <img src={user.avatar} className="w-10 h-10 rounded-full border border-white/10 shadow-sm" alt="" onError={e => (e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=6366f1&color=fff`)} />
                      <div>
                        <div className="text-white font-bold">{user.name}</div>
                        <div className="text-slate-400 text-xs mt-0.5">{user.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col items-start gap-1.5">
                        <RoleBadge role={user.role} />
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest ${user.status === 'active' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : user.status === 'pending' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                          {user.status === 'active' ? 'Actif' : user.status === 'pending' ? 'En attente' : 'Banni'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-400 font-medium">{user.joinedAt ? new Date(user.joinedAt).toLocaleDateString('fr-FR') : '—'}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 relative z-30 pointer-events-auto">
                        {user.status === 'pending' && user.role === 'ORGANIZER' && (
                          <button onClick={() => handleApprove(user.id)} className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/30 font-bold text-xs flex items-center gap-1.5 transition-all mr-2">
                            <Check size={14} /> Valider
                          </button>
                        )}
                        <button onClick={() => { setEditingUser(user); setIsModalOpen(true); }} className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"><Edit2 size={16} /></button>
                        <button onClick={() => handleBan(user.id)} className={`p-2 rounded-lg transition-colors ${user.status === 'banned' ? 'text-emerald-400 hover:bg-emerald-400/10' : 'text-slate-400 hover:text-amber-400 hover:bg-amber-400/10'}`}>
                          <Ban size={16} />
                        </button>
                        <button onClick={() => handleDelete(user.id)} className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && <tr><td colSpan={4} className="py-12 text-center text-slate-500">Aucun utilisateur trouvé</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-6 py-4 border-t border-white/5">
          <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={totalCount} itemsPerPage={ITEMS_PER_PAGE} />
        </div>
      </div>

      {isModalOpen && <UserModal user={editingUser} onClose={() => setIsModalOpen(false)} onSave={handleSave} />}
    </div>
  );
};

// ─── Finance Tab ───
const CashAdvanceManager = ({ addToast }: { addToast: (msg: string, type: 'success' | 'error') => void }) => {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = async () => {
    setLoading(true);
    // Fetch payout requests and join with profiles to get organizer name
    const { data } = await supabase.from('payout_requests').select(`
      *,
      profiles:organizer_id (
        name,
        email
      )
    `).order('created_at', { ascending: false });

    setRequests(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleAction = async (id: string, action: string) => {
    if (!id) {
      console.error('handleAction: Missing ID');
      return;
    }

    // NOTE: Removal of window.confirm which was blocking execution silently for some users

    try {
      setLoading(true);

      const { data, error } = await supabase.rpc('update_payout_status', {
        p_request_id: id,
        p_new_status: action
      });

      if (error) {
        console.error('Supabase RPC error:', error);
        addToast(`Erreur système: ${error.message}`, 'error');
      } else if (data && data.success === false) {
        console.error('Business logic error:', data.error);
        addToast(`Erreur: ${data.error}`, 'error');
      } else {
        addToast('Statut mis à jour !', 'success');
        await fetchRequests();
      }
    } catch (err: any) {
      console.error('Catch error in handleAction:', err);
      addToast(`Erreur fatale: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="py-8 text-center"><Loader2 className="animate-spin text-orange-500 mx-auto" /></div>;
  if (requests.length === 0) return <p className="text-slate-400 text-sm">Aucune demande de paiement.</p>;

  return (
    <div className="overflow-x-auto relative">
      <table className="w-full text-left text-sm whitespace-nowrap">
        <thead className="bg-slate-900/80 text-slate-400 uppercase text-xs font-bold tracking-wider">
          <tr>
            <th className="px-6 py-4">Date</th>
            <th className="px-6 py-4">Organisateur</th>
            <th className="px-6 py-4">Type</th>
            <th className="px-6 py-4">Montant</th>
            <th className="px-6 py-4">Statut</th>
            <th className="px-6 py-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {requests.map((r, i) => (
            <tr key={r.id || i} className="hover:bg-white/5 transition-colors">
              <td className="px-6 py-4 text-slate-300">{new Date(r.created_at).toLocaleDateString('fr-FR')}</td>
              <td className="px-6 py-4 text-white font-medium">
                {r.profiles?.name || 'Inconnu'}
                <div className="text-xs text-slate-500">{r.profiles?.email}</div>
              </td>
              <td className="px-6 py-4">
                <span className="bg-indigo-500/20 text-indigo-400 px-2 py-1 rounded text-xs font-bold uppercase">
                  {r.type === 'cash_advance' ? 'Cash Advance' : 'Payout'}
                </span>
              </td>
              <td className="px-6 py-4 text-white font-bold">{formatCurrency(r.amount)}</td>
              <td className="px-6 py-4">
                <span className={`px-2 py-1 rounded text-xs font-bold ${r.status === 'paid' ? 'bg-emerald-500/20 text-emerald-400' :
                    r.status === 'approved_for_print' ? 'bg-blue-500/20 text-blue-400' :
                      r.status === 'pending_payment' ? 'bg-purple-500/20 text-purple-400' :
                        r.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                          'bg-amber-500/20 text-amber-400'
                  }`}>
                  {r.status === 'approved_for_print' ? 'APPROUVÉ IMPR.' :
                    r.status === 'pending_payment' ? 'PAIEMENT REQUIS' :
                      r.status.toUpperCase()}
                </span>
              </td>
              <td className="px-6 py-4 text-right">
                <div className="flex justify-end items-center gap-3">
                  {r.status === 'pending' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAction(r.id, 'paid')}
                        className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white rounded-lg font-bold transition-colors text-xs flex items-center gap-1"
                      >
                        <Check size={14} /> Payer
                      </button>
                      <button
                        onClick={() => handleAction(r.id, 'rejected')}
                        className="px-3 py-1.5 bg-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white rounded-lg font-bold transition-colors text-xs flex items-center gap-1"
                      >
                        <X size={14} /> Rejeter
                      </button>
                    </div>
                  )}
                  {r.status === 'pending_payment' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAction(r.id, 'approved_for_print')}
                        className="px-3 py-1.5 bg-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-white rounded-lg font-bold transition-colors text-xs flex items-center gap-1"
                      >
                        <Check size={14} /> Approuver (Passe-droit Impr.)
                      </button>
                      <button
                        onClick={() => handleAction(r.id, 'rejected')}
                        className="px-3 py-1.5 bg-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white rounded-lg font-bold transition-colors text-xs flex items-center gap-1"
                      >
                        <X size={14} /> Rejeter
                      </button>
                    </div>
                  )}
                  {r.status === 'paid' && r.resolved_at && (
                    <span className="text-[10px] text-slate-500 italic">Le {new Date(r.resolved_at).toLocaleDateString()}</span>
                  )}
                  <select
                    value={r.status}
                    onChange={(e) => handleAction(r.id, e.target.value)}
                    className="bg-slate-800 border border-white/10 rounded-lg px-2 py-1 text-[10px] font-bold text-slate-400 outline-none focus:border-orange-500 cursor-pointer"
                  >
                    <option value="pending">En attente (Avance)</option>
                    <option value="pending_payment">En attente (Paiement Comm.)</option>
                    <option value="approved_for_print">Approuvé (Passe-droit Impr.)</option>
                    <option value="paid">Payé / Consommé</option>
                    <option value="rejected">Rejeté</option>
                  </select>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const PayoutsManager = ({ addToast }: { addToast: (msg: string, type: 'success' | 'error') => void }) => {
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPayouts = async () => {
      setLoading(true);
      const { data } = await supabase.from('admin_event_payouts_view')
        .select('*')
        .gt('payout_amount', 0)
        .order('revenue', { ascending: false });

      if (data) {
        setPayouts(data.map(d => ({
          eid: d.event_id,
          event: d.event_title,
          org: d.organizer_name,
          date: d.event_date,
          revenue: d.revenue,
          commission: d.commission,
          advanceDeducted: d.advance_deducted,
          payoutAmount: d.payout_amount
        })));
      }
      setLoading(false);
    };
    fetchPayouts();
  }, []);

  if (loading) return <div className="p-8 text-center text-slate-400 font-bold animate-pulse">Chargement des opérations en cours...</div>;
  if (payouts.length === 0) return <p className="text-slate-400 text-sm">Aucun revenu généré à reverser.</p>;

  return (
    <div className="space-y-4">
      {payouts.map((p, i) => (
        <div key={i} className="flex flex-col md:flex-row items-center justify-between p-4 bg-slate-900/50 rounded-xl border border-white/5 gap-4">
          <div className="text-left w-full md:w-auto">
            <p className="font-bold text-white text-lg">{p.event}</p>
            <p className="text-slate-400 text-sm">Organisateur: <span className="text-amber-400 font-medium">{p.org}</span></p>
          </div>
          <div className="flex gap-4 md:gap-6 items-center w-full md:w-auto overflow-x-auto justify-between md:justify-end">
            <div className="text-center select-none">
              <p className="text-xs text-slate-500">Revenus Générés</p>
              <p className="font-bold text-slate-300">{formatCurrency(p.revenue)}</p>
            </div>
            <div className="text-center select-none">
              <p className="text-xs text-slate-500">Commission (8%)</p>
              <p className="font-bold text-rose-400">-{formatCurrency(p.commission)}</p>
            </div>
            {p.advanceDeducted > 0 && (
              <div className="text-center select-none">
                <p className="text-xs text-slate-500">Avance Déduite</p>
                <p className="font-bold text-orange-400">-{formatCurrency(p.advanceDeducted)}</p>
              </div>
            )}
            <div className="text-center select-none bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20 mr-2">
              <p className="text-xs text-emerald-400">À Reverser</p>
              <p className="font-bold text-emerald-400 text-lg">{formatCurrency(p.payoutAmount)}</p>
            </div>

            {new Date(p.date) > new Date() ? (
              <button
                disabled
                className="bg-slate-700/50 text-slate-400 px-5 py-2.5 rounded-xl text-sm font-bold border border-white/5 cursor-not-allowed whitespace-nowrap"
                title={`Déblocable après le ${new Date(p.date).toLocaleDateString('fr-FR')}`}
              >
                Déblocable le {new Date(p.date).toLocaleDateString('fr-FR')}
              </button>
            ) : (
              <button
                onClick={() => addToast(`Virement de ${formatCurrency(p.payoutAmount)} initié vers ${p.org}`, 'success')}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap shadow-[0_0_15px_rgba(16,185,129,0.3)]"
              >
                Payer le reliquat
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

const CashierManager = () => {
  const [agents, setAgents] = useState<any[]>([]);
  const [totalCash, setTotalCash] = useState(0);

  useEffect(() => {
    const fetchAgents = async () => {
      const { data, error } = await supabase.rpc('get_agent_cash_stats');
      if (!error && data) {
        setAgents(data);
        setTotalCash(data.reduce((acc: number, a: any) => acc + (a.cashCollected || 0), 0));
      }
    };
    fetchAgents();
  }, []);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl">
          <p className="text-emerald-400 text-xs font-bold uppercase tracking-wider">Cash Total en Circulation</p>
          <p className="text-2xl font-black text-white mt-1">{formatCurrency(totalCash)}</p>
        </div>
      </div>

      {agents.length === 0 && (
        <p className="text-slate-400 py-4 text-center">Aucun cash actuellement détenu par vos guichets.</p>
      )}

      {agents.map((agent, i) => (
        <div key={i} className="flex flex-col md:flex-row items-center justify-between p-4 bg-slate-900/50 rounded-xl border border-white/5 gap-4">
          <div className="flex items-center gap-4 w-full md:w-auto text-left">
            <div className="w-10 h-10 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center shrink-0">
              <User size={20} />
            </div>
            <div>
              <p className="font-bold text-white">{agent.name}</p>
              <p className="text-slate-400 text-xs">{agent.role} • Actif le {new Date(agent.lastActive).toLocaleDateString()}</p>
            </div>
          </div>
          <div className="flex gap-6 items-center w-full md:w-auto justify-between md:justify-end">
            <div className="text-center select-none bg-slate-800 px-4 py-2 rounded-lg border border-white/5">
              <p className="text-xs text-slate-400">Cash Détenu</p>
              <p className="font-black text-emerald-400 text-xl">{formatCurrency(agent.cashCollected)}</p>
            </div>
            <button
              onClick={() => alert(`Confirmer la réception de ${formatCurrency(agent.cashCollected)} remis en main propre par ${agent.name} ?`)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] whitespace-nowrap"
            >
              Collecter & Remettre à zéro
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

const FinanceTab = ({ stats, addToast }: any) => {
  const [trxPage, setTrxPage] = useState(1);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [totalTrx, setTotalTrx] = useState(0);
  const [loading, setLoading] = useState(true);
  const TRX_PER_PAGE = 25;

  const fetchTransactions = async () => {
    setLoading(true);
    const from = (trxPage - 1) * TRX_PER_PAGE;
    const to = from + TRX_PER_PAGE - 1;

    const { data, count, error } = await supabase
      .from('transactions')
      .select('*, events!inner(title)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      addToast?.(`Erreur transactions: ${error.message}`, 'error');
    } else {
      setTransactions(data || []);
      setTotalTrx(count || 0);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTransactions();
  }, [trxPage]);

  const totalTrxPages = Math.ceil(totalTrx / TRX_PER_PAGE);

  return (
    <div className="space-y-6 block">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <KPI title="CA Global" value={formatCurrency(stats.revenue)} trend="Total encaissé" color="from-orange-600 to-orange-400" />
        <KPI title="Bénéfice Ligne" value={formatCurrency(stats.commission)} trend="Commission (Web)" color="from-rose-600 to-rose-400" />
        <KPI title="Bénéfice Physique" value={formatCurrency(Number(stats.physicalCommission) || 0)} trend="Commission (Impression)" color="from-purple-600 to-purple-400" />
        <KPI title="Dû Organisateurs" value={formatCurrency(stats.paidPayouts)} trend="A reverser" color="from-teal-600 to-teal-400" />
      </div>

      <div className="bg-white/5 border border-white/10 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-xl relative z-20">
        <div className="p-6 border-b border-white/10 flex items-center gap-3">
          <Banknote className="text-emerald-400" size={24} />
          <h3 className="text-lg font-bold text-white">Contrôle des Guichets (Cash)</h3>
        </div>
        <div className="p-6">
          <CashierManager />
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-xl relative z-20">
        <div className="p-6 border-b border-white/10 flex items-center gap-3">
          <Banknote className="text-orange-400" size={24} />
          <h3 className="text-lg font-bold text-white">Demandes de Cash Advance & Payouts</h3>
        </div>
        <div className="p-6">
          <CashAdvanceManager addToast={addToast} />
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-xl relative z-20">
        <div className="p-6 border-b border-white/10"><h3 className="text-lg font-bold text-white">Reversements (Payouts) calculés automatiquement</h3></div>
        <div className="p-6">
          <PayoutsManager addToast={addToast} />
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-xl relative z-20">
        <div className="p-6 border-b border-white/10"><h3 className="text-lg font-bold text-white">Dernières Transactions ({totalTrx})</h3></div>
        {loading ? (
          <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-orange-400" size={28} /></div>
        ) : (
          <div className="overflow-x-auto relative">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-900/80 text-slate-400 uppercase text-xs font-bold tracking-wider">
                <tr>
                  <th className="px-6 py-4">ID</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Événement</th>
                  <th className="px-6 py-4">Montant</th>
                  <th className="px-6 py-4">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {transactions.map((t: any, i: number) => (
                  <tr key={t.id || i} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 text-slate-500 font-mono text-xs">{String(t.id).slice(0, 8)}</td>
                    <td className="px-6 py-4 text-slate-400 text-xs">{new Date(t.created_at).toLocaleString('fr-FR')}</td>
                    <td className="px-6 py-4 text-slate-300 font-medium">{t.events?.title || '—'}</td>
                    <td className="px-6 py-4 text-white font-bold">{formatCurrency(Number(t.amount))}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${t.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' : t.status === 'valid' ? 'bg-blue-500/20 text-blue-400' : 'bg-amber-500/20 text-amber-400'}`}>
                        {t.status === 'valid' ? 'Valide (Physique)' : t.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {transactions.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-500">Aucune transaction</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-6 py-4 border-t border-white/5">
          <Pagination currentPage={trxPage} totalPages={totalTrxPages} onPageChange={setTrxPage} totalItems={totalTrx} itemsPerPage={TRX_PER_PAGE} />
        </div>
      </div>
    </div>
  );
};

// ─── Modals (Z-Index 50 to override all) ───
const UserModal = ({ user, onClose, onSave }: any) => {
  const [form, setForm] = useState(user || { name: '', email: '', role: UserRole.USER, status: 'active' });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm pointer-events-auto" onClick={onClose} />
      <div className="bg-slate-800 w-full max-w-md rounded-3xl border border-white/10 shadow-2xl relative z-10 overflow-hidden pointer-events-auto">
        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-slate-900/50">
          <h3 className="text-xl font-bold text-white">{user ? 'Modifier' : 'Nouveau'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>
        <form onSubmit={async e => {
          e.preventDefault();
          setSaving(true);
          setErrorMsg('');
          try {
            await onSave({ id: user?.id || 'new-' + Date.now(), ...form });
          } catch (err: any) {
            setErrorMsg(err.message || "Une erreur est survenue");
            setSaving(false);
          }
        }} className="p-6 space-y-4">
          {errorMsg && <div className="p-3 bg-red-500/20 text-red-200 border border-red-500/30 rounded-xl text-sm font-bold">{errorMsg}</div>}
          <label className="block">
            <span className="text-slate-400 text-sm font-semibold mb-1 block">Nom complet</span>
            <input required type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-orange-500 outline-none" />
          </label>
          <label className="block">
            <span className="text-slate-400 text-sm font-semibold mb-1 block">Email</span>
            <input required type="email" disabled={!!user} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-orange-500 outline-none disabled:opacity-50" />
          </label>
          <label className="block">
            <span className="text-slate-400 text-sm font-semibold mb-1 block">Rôle</span>
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-orange-500 outline-none appearance-none">
              {Object.values(UserRole).map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <div className="pt-4 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-slate-300 hover:text-white">Annuler</button>
            <button type="submit" disabled={saving} className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2">
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Enregistrer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const EventModal = ({ event, onClose, onSave }: any) => {
  const [form, setForm] = useState<{
    id?: string; title: string; date: string; location: string; city: string; country: string;
    category: string; price: number; status: string; video: string; gallery: string[]; image: string;
    coordinates?: { lat: number; lng: number };
    commission_rate?: number; physical_commission_rate?: number;
  }>(event || { title: '', date: '', location: '', city: '', country: '', category: 'Concert', price: 0, status: 'draft', video: '', gallery: [], image: '', commission_rate: undefined, physical_commission_rate: undefined });
  const [saving, setSaving] = useState(false);

  const [countries, setCountries] = useState<{ name: string, code: string }[]>([]);
  useEffect(() => {
    supabase.from('supported_countries').select('name, code').eq('is_active', true).order('name')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setCountries(data);
          if (!event?.country) setForm(f => ({ ...f, country: data[0].name }));
        }
      });
  }, [event]);

  const addGalleryImage = () => setForm({ ...form, gallery: [...(form.gallery || []), ''] });
  const updateGalleryImage = (index: number, url: string) => {
    const newGallery = [...(form.gallery || [])];
    newGallery[index] = url;
    setForm({ ...form, gallery: newGallery });
  };
  const removeGalleryImage = (index: number) => {
    setForm({ ...form, gallery: (form.gallery || []).filter((_, i) => i !== index) });
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm pointer-events-auto" onClick={onClose} />
      <div className="bg-slate-800 w-full max-w-2xl rounded-3xl border border-white/10 shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh] pointer-events-auto">
        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-slate-900/50 shrink-0">
          <h3 className="text-xl font-bold text-white">{event ? 'Éditer Événement' : 'Créer Événement'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>
        <form onSubmit={async e => { e.preventDefault(); setSaving(true); await onSave(form); }} className="p-6 overflow-y-auto space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="sm:col-span-2 block">
              <span className="text-slate-400 text-sm font-semibold mb-1 block">Titre</span>
              <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-orange-500 outline-none" />
            </label>
            <label className="block">
              <span className="text-slate-400 text-sm font-semibold mb-1 block">Date</span>
              <input type="date" required value={form.date?.split('T')[0] || ''} onChange={e => setForm({ ...form, date: e.target.value })} className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-orange-500 outline-none" />
            </label>
            <label className="block">
              <span className="text-slate-400 text-sm font-semibold mb-1 block">Pays</span>
              <select required value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-orange-500 outline-none appearance-none">
                {countries.length === 0 && <option value="">Chargement...</option>}
                {countries.map(c => <option key={c.code} value={c.name}>{c.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-slate-400 text-sm font-semibold mb-1 block">Statut</span>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-orange-500 outline-none">
                <option value="draft">Brouillon</option>
                <option value="pending_review">En attente</option>
                <option value="published">Publié</option>
              </select>
            </label>
            <label className="block">
              <span className="text-slate-400 text-sm font-semibold mb-1 block">Commission API en Ligne (%)</span>
              <input type="number" step="0.1" value={form.commission_rate ?? ''} onChange={e => setForm({ ...form, commission_rate: e.target.value ? parseFloat(e.target.value) : undefined })} placeholder="Ex: 8.0 (Vide = Taux Global)" className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-rose-500 outline-none" />
            </label>

            <div className="sm:col-span-2 pt-2">
              <span className="text-slate-400 text-sm font-semibold mb-2 block">Emplacement Précis sur la Carte</span>
              <MapPicker
                initialCoordinates={form.coordinates}
                onLocationSelect={(coords) => setForm({ ...form, coordinates: coords })}
              />
            </div>
            <label className="block">
              <span className="text-slate-400 text-sm font-semibold mb-1 block">Vidéo Promotionnelle</span>
              <input value={form.video || ''} onChange={e => setForm({ ...form, video: e.target.value })} className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-orange-500 outline-none" placeholder="Lien YouTube ou MP4" />
            </label>
            <label className="sm:col-span-2 block">
              <span className="text-slate-400 text-sm font-semibold mb-1 block">Affiche Principale</span>
              <input value={form.image || ''} onChange={e => setForm({ ...form, image: e.target.value })} className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-orange-500 outline-none" placeholder="https://..." />
            </label>
            <div className="sm:col-span-2 space-y-2 mt-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm font-semibold mb-1 block">Galerie d'images</span>
                {(form.gallery || []).length < 10 && (
                  <button type="button" onClick={addGalleryImage} className="text-orange-400 text-xs font-bold hover:text-orange-300 flex items-center gap-1"><Plus size={14} /> Ajouter photo</button>
                )}
              </div>
              {(form.gallery || []).map((url, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input value={url} onChange={e => updateGalleryImage(i, e.target.value)} className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-2 text-white text-sm focus:ring-2 focus:ring-orange-500 outline-none" placeholder={`URL Image Supplémentaire ${i + 1}`} />
                  <button type="button" onClick={() => removeGalleryImage(i)} className="p-2 text-white bg-red-500/80 hover:bg-red-500 rounded-xl transition-colors"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          </div>
          <div className="pt-4 flex justify-end gap-3 border-t border-white/10 mt-6 pt-6">
            <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-slate-300 hover:text-white">Annuler</button>
            <button type="submit" disabled={saving} className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2">
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Enregistrer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Helpers ───
const RoleBadge = ({ role }: { role: string }) => (
  <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold border uppercase tracking-widest bg-slate-800 text-slate-300 border-slate-700">
    {role}
  </span>
);

const StatusBadge = ({ status }: { status: string }) => {
  const styles: any = {
    published: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    draft: 'bg-slate-700/50 text-slate-400 border-slate-600/50',
    pending_review: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    ended: 'bg-red-500/20 text-red-400 border-red-500/30'
  };
  return <span className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold border tracking-widest uppercase ${styles[status] || styles.draft}`}>{status.replace('_', ' ')}</span>;
};

// ─── Countries Tab ───
const CountriesTab = () => {
  const [countries, setCountries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCountry, setEditingCountry] = useState<any>(null);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const addToast = (message: string, type: ToastType = 'info') => {
    const id = Date.now() + Math.random(); setToasts(p => [...p, { id, message, type }]); setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 5000);
  };

  const loadCountries = async () => {
    setLoading(true);
    const { data } = await supabase.from('supported_countries').select('*').order('name');
    if (data) setCountries(data);
    setLoading(false);
  };

  useEffect(() => { loadCountries(); }, []);

  const handleSave = async (payload: any) => {
    if (payload.id && !payload.id.startsWith('new-')) {
      const { error } = await supabase.from('supported_countries').update({ name: payload.name, code: payload.code, currency: payload.currency, logo: payload.logo, is_active: payload.is_active }).eq('id', payload.id);
      if (error) throw error;
      addToast('Pays mis à jour !', 'success');
    } else {
      const { id, ...insertData } = payload;
      const { error } = await supabase.from('supported_countries').insert([insertData]);
      if (error) throw error;
      addToast('Nouveau pays ajouté !', 'success');
    }
    loadCountries();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Supprimer ce pays ?")) return;
    const { error } = await supabase.from('supported_countries').delete().eq('id', id);
    if (error) addToast(`Erreur: ${error.message}`, 'error');
    else { addToast('Pays supprimé', 'success'); loadCountries(); }
  };

  const toggleStatus = async (id: string, current: boolean) => {
    const { error } = await supabase.from('supported_countries').update({ is_active: !current }).eq('id', id);
    if (error) addToast(`Erreur`, 'error'); else loadCountries();
  };

  return (
    <div className="space-y-6 block">
      <ToastContainer toasts={toasts} onRemove={id => setToasts(p => p.filter(t => t.id !== id))} />
      <div className="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-md relative z-30">
        <div><h3 className="text-white font-bold px-2">Pays & Devises</h3></div>
        <button onClick={() => { setEditingCountry(null); setIsModalOpen(true); }} className="bg-orange-600 hover:bg-orange-500 text-white px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg relative z-50 pointer-events-auto">
          <Plus size={16} /> Ajouter Pays
        </button>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-xl relative z-20">
        <div className="overflow-x-auto relative">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-900/80 text-slate-400 uppercase text-xs font-bold tracking-wider">
              <tr>
                <th className="px-6 py-4">Pays</th>
                <th className="px-6 py-4">Code ISO</th>
                <th className="px-6 py-4">Devise</th>
                <th className="px-6 py-4">Statut</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr><td colSpan={5} className="py-8 text-center"><Loader2 className="animate-spin text-orange-500 mx-auto" /></td></tr>
              ) : countries.map(c => (
                <tr key={c.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4 text-white font-bold flex items-center gap-3">
                    <img src={c.logo || `https://flagcdn.com/w40/${c.code.toLowerCase()}.png`} alt={c.name} className="w-8 h-6 object-cover rounded shadow" />
                    {c.name}
                  </td>
                  <td className="px-6 py-4 text-slate-400">{c.code}</td>
                  <td className="px-6 py-4 text-slate-400">{c.currency}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${c.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                      {c.is_active ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 relative z-30 pointer-events-auto">
                      <button onClick={() => toggleStatus(c.id, c.is_active)} className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title={c.is_active ? "Désactiver" : "Activer"}><Ban size={16} /></button>
                      <button onClick={() => { setEditingCountry(c); setIsModalOpen(true); }} className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"><Edit2 size={16} /></button>
                      <button onClick={() => handleDelete(c.id)} className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && countries.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-500">Aucun pays configuré</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && <CountryModal country={editingCountry} onClose={() => setIsModalOpen(false)} onSave={async c => { await handleSave(c); setIsModalOpen(false); }} />}
    </div>
  );
};

const CountryModal = ({ country, onClose, onSave }: any) => {
  const [form, setForm] = useState(country || { name: '', code: '', currency: 'FCFA', logo: '', is_active: true });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm pointer-events-auto" onClick={onClose} />
      <div className="bg-slate-800 w-full max-w-sm rounded-3xl border border-white/10 shadow-2xl relative z-10 overflow-hidden pointer-events-auto">
        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-slate-900/50">
          <h3 className="text-xl font-bold text-white">{country ? 'Modifier le pays' : 'Nouveau pays'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>
        <form onSubmit={async e => {
          e.preventDefault(); setSaving(true); setErrorMsg('');
          try { await onSave({ id: country?.id || 'new-' + Date.now(), ...form }); }
          catch (err: any) { setErrorMsg(err.message); setSaving(false); }
        }} className="p-6 space-y-4">
          {errorMsg && <div className="p-3 bg-red-500/20 text-red-200 border border-red-500/30 rounded-xl text-sm font-bold">{errorMsg}</div>}
          <label className="block">
            <span className="text-slate-400 text-sm font-semibold mb-1 block">Nom du pays</span>
            <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-orange-500 outline-none" placeholder="ex: Sénégal" />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-slate-400 text-sm font-semibold mb-1 block">Code ISO (2)</span>
              <input required maxLength={2} value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-orange-500 outline-none uppercase" placeholder="SN" />
            </label>
            <label className="block">
              <span className="text-slate-400 text-sm font-semibold mb-1 block">Devise</span>
              <input required value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value.toUpperCase() })} className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-orange-500 outline-none uppercase" placeholder="FCFA" />
            </label>
          </div>
          <label className="block">
            <span className="text-slate-400 text-sm font-semibold mb-1 block">URL du Logo / Drapeau (Optionnel)</span>
            <input value={form.logo || ''} onChange={e => setForm({ ...form, logo: e.target.value })} className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-orange-500 outline-none" placeholder="https://..." />
          </label>
          <label className="flex items-center gap-3 pt-2">
            <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} className="w-5 h-5 rounded border-white/10 bg-slate-900/50 text-orange-500 focus:ring-orange-500" />
            <span className="text-slate-300 font-medium">Activer ce pays</span>
          </label>
          <div className="pt-4 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-slate-300 hover:text-white">Annuler</button>
            <button type="submit" disabled={saving} className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2">
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Enregistrer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Email Templates Tab ───
const EmailTemplatesManager = ({ addToast }: { addToast: (message: string, type?: ToastType) => void }) => {
  const [templates, setTemplates] = useState<EmailTemplateType[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(EMAIL_TEMPLATES[0] ? EMAIL_TEMPLATES[0].id : '');

  // Charger les templates depuis Supabase (partagé entre tous les navigateurs)
  useEffect(() => {
    const loadTemplates = async () => {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('value')
        .eq('key', 'email_templates')
        .maybeSingle();

      if (data?.value && Array.isArray(data.value)) {
        const saved = data.value as EmailTemplateType[];
        // Merge: keep saved customizations, but add any new default templates not yet in Supabase
        const merged = [
          ...saved,
          ...EMAIL_TEMPLATES.filter(def => !saved.find(s => s.id === def.id))
        ];
        setTemplates(merged);
      } else {
        setTemplates(EMAIL_TEMPLATES);
      }
    };
    loadTemplates();
  }, []);

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  const handleUpdateTemplate = (field: 'defaultSubject' | 'defaultHtml', value: string) => {
    const updated = templates.map(t =>
      t.id === selectedTemplateId ? { ...t, [field]: value } : t
    );
    setTemplates(updated);
  };

  const handleSave = async () => {
    try {
      const { error } = await supabase
        .from('platform_settings')
        .upsert({ key: 'email_templates', value: templates as any }, { onConflict: 'key' });

      if (error) {
        addToast("Erreur de sauvegarde: " + error.message, 'error');
      } else {
        addToast("Templates d'emails sauvegardés avec succès !", 'success');
      }
    } catch (err: any) {
      addToast("Erreur inattendue: " + (err?.message || 'Vérifiez votre connexion'), 'error');
    }
  };

  const handleReset = async () => {
    if (window.confirm("Voulez-vous vraiment restaurer les modèles par défaut ? Vos modifications actuelles seront perdues.")) {
      setTemplates(EMAIL_TEMPLATES);
      await supabase
        .from('platform_settings')
        .upsert({ key: 'email_templates', value: EMAIL_TEMPLATES as any }, { onConflict: 'key' });
      addToast("Templates restaurés aux valeurs d'usine.", 'info');
    }
  };

  if (!selectedTemplate) return null;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 h-[calc(100vh-200px)] overflow-y-auto border border-white/5 bg-slate-900/50 p-6 rounded-3xl pb-20 no-scrollbar relative z-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/50 p-4 border border-white/5 rounded-2xl">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2"><Mail size={24} className="text-indigo-400" /> Éditeur de Modèles d'Emails</h2>
          <p className="text-slate-400 text-sm mt-1">Personnalisez les messages envoyés automatiquement par Babipass.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={handleReset} className="px-4 py-2 bg-slate-800 text-white rounded-xl hover:bg-slate-700 transition font-medium flex items-center gap-2 border border-white/5">
            <RefreshCw size={18} /> Restaurer Défaut
          </button>
          <button onClick={handleSave} className="px-5 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition font-medium flex items-center gap-2 shadow-lg shadow-indigo-500/25 border border-indigo-400/20">
            <Save size={18} /> Sauvegarder
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar Selector */}
        <div className="lg:col-span-1 space-y-3">
          <h3 className="text-slate-400 uppercase text-xs font-bold tracking-wider mb-2 ml-1">Vos Modèles</h3>
          {templates.map(t => (
            <button
              key={t.id}
              onClick={() => setSelectedTemplateId(t.id)}
              className={`w-full text-left p-4 rounded-xl border transition-all ${selectedTemplateId === t.id
                ? 'bg-indigo-500/10 border-indigo-500/50 text-white'
                : 'bg-slate-900/50 border-white/5 text-slate-400 hover:bg-slate-800'
                }`}
            >
              <div className="font-semibold">{t.name}</div>
              <div className="text-xs mt-1 opacity-70 line-clamp-2">{t.description}</div>
            </button>
          ))}

          <div className="mt-8 p-4 bg-slate-900/80 border border-slate-700 rounded-xl relative z-30">
            <h4 className="text-sm font-bold text-indigo-400 mb-2">Variables Disponibles</h4>
            <p className="text-xs text-slate-400 mb-3">Cliquez pour copier. N'utilisez que celles-ci.</p>
            <div className="flex flex-wrap gap-2">
              {selectedTemplate.variables.map(v => (
                <span key={v} onClick={() => navigator.clipboard.writeText(v)} className="px-2 py-1 bg-slate-800 text-indigo-300 text-xs font-mono rounded cursor-pointer hover:bg-slate-700 hover:text-white transition-colors border border-indigo-500/20">
                  {v}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 mt-4 leading-tight italic">
              Les variables seront automatiquement remplacées par Babipass lors de l'envoi de l'email au client.
            </p>
          </div>
        </div>

        {/* Editor Area */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-slate-900/50 backdrop-blur-xl border border-white/10 p-6 rounded-2xl shadow-xl relative z-30">
            <label className="block text-sm font-medium text-slate-300 mb-2">Objet de l'email</label>
            <input
              type="text"
              value={selectedTemplate.defaultSubject}
              onChange={e => handleUpdateTemplate('defaultSubject', e.target.value)}
              className="w-full bg-slate-950/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 relative z-30">
            {/* HTML Source */}
            <div className="bg-slate-900/50 backdrop-blur-xl border border-white/10 flex flex-col rounded-2xl shadow-xl overflow-hidden h-[600px]">
              <div className="px-4 py-3 bg-slate-800/80 border-b border-white/5 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-300 flex items-center gap-2"><Edit2 size={16} /> Code HTML Brut</span>
              </div>
              <textarea
                value={selectedTemplate.defaultHtml}
                onChange={e => handleUpdateTemplate('defaultHtml', e.target.value)}
                className="w-full flex-1 bg-[#1e1e1e] text-[#d4d4d4] p-4 font-mono text-sm focus:outline-none resize-none"
                spellCheck="false"
              />
            </div>

            {/* Live Preview */}
            <div className="bg-slate-900/50 backdrop-blur-xl border border-white/10 flex flex-col rounded-2xl shadow-xl overflow-hidden h-[600px]">
              <div className="px-4 py-3 bg-slate-800/80 border-b border-white/5 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-300 flex items-center gap-2"><Eye size={16} /> Aperçu Visuel</span>
              </div>
              <div className="flex-1 bg-white overflow-y-auto w-full flex items-center justify-center p-4">
                <div className="w-full max-w-[600px] shadow-2xl rounded-xl border border-gray-200 overflow-hidden" dangerouslySetInnerHTML={{ __html: selectedTemplate.defaultHtml }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


const SettingsTab = () => {
  const [waConfig, setWaConfig] = useState({
    provider: 'wasender',
    wasenderUrl: 'https://api.wasender.com/v1',
    instanceId: '',
    token: '',
    evolutionUrl: '',
    evolutionInstance: '',
    evolutionApiKey: ''
  });
  const [openrouterApiKey, setOpenrouterApiKey] = useState('');
  const [supportConfig, setSupportConfig] = useState({ whatsapp: '', email: '' });
  const [smtpConfig, setSmtpConfig] = useState({ host: '', user: '', pass: '', port: '', senderName: 'Babipass' });
  const [paystackConfig, setPaystackConfig] = useState({ publicKey: '', secretKey: '' });
  const [pawapayConfig, setPawapayConfig] = useState({ merchantId: '', jwtToken: '' });
  const [feexpayConfig, setFeexpayConfig] = useState({ shopId: '', token: '' });
  const [intouchConfig, setIntouchConfig] = useState({ partnerId: '', login: '', password: '' });
  const [paydunyaConfig, setPaydunyaConfig] = useState({ masterKey: '', privateKey: '', token: '' });

  const [affiliateConfig, setAffiliateConfig] = useState({ type: 'percentage', value: 5 });

  const [paymentToggles, setPaymentToggles] = useState({
    paystack: true,
    pawapay: true,
    feexpay: false,
    intouch: false,
    paydunya: false
  });

  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>(EXCHANGE_RATES);
  const [globalRates, setGlobalRates] = useState({ commission: 8, advance: 30, physical: 2.0, fundraising: 5.0 });

  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      const { data } = await supabase
        .from('platform_settings')
        .select('key, value')
        .in('key', ['wa_config', 'smtp_config', 'paystack_config', 'pawapay_config',
          'feexpay_config', 'intouch_config', 'paydunya_config',
          'affiliate_config', 'payment_toggles', 'exchange_rates',
          'default_commission_rate', 'default_advance_rate', 'default_physical_commission_rate', 'openrouter_api_key', 'support_config']);

      if (data) {
        const map = Object.fromEntries(data.map((r: any) => [r.key, r.value]));
        if (map.wa_config) setWaConfig(map.wa_config);
        if (map.openrouter_api_key) setOpenrouterApiKey(map.openrouter_api_key);
        if (map.smtp_config) setSmtpConfig(map.smtp_config);
        if (map.paystack_config) setPaystackConfig(map.paystack_config);
        if (map.pawapay_config) setPawapayConfig(map.pawapay_config);
        if (map.feexpay_config) setFeexpayConfig(map.feexpay_config);
        if (map.intouch_config) setIntouchConfig(map.intouch_config);
        if (map.paydunya_config) setPaydunyaConfig(map.paydunya_config);
        if (map.affiliate_config) setAffiliateConfig(map.affiliate_config);
        if (map.payment_toggles) setPaymentToggles(map.payment_toggles);
        if (map.exchange_rates) setExchangeRates(map.exchange_rates);
        if (map.support_config) setSupportConfig(map.support_config);

        let comm = 8;
        let adv = 30;
        let phys = 2.0;
        let fund = 5.0;
        if (map.default_commission_rate) comm = Number(map.default_commission_rate);
        if (map.default_advance_rate) adv = Number(map.default_advance_rate);
        if (map.default_physical_commission_rate) phys = Number(map.default_physical_commission_rate);
        if (map.default_fundraising_commission_rate) fund = Number(map.default_fundraising_commission_rate);
        setGlobalRates({ commission: comm, advance: adv, physical: phys, fundraising: fund });
      }
    };
    loadSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus(null);
    const rows = [
      { key: 'wa_config', value: waConfig },
      { key: 'openrouter_api_key', value: openrouterApiKey },
      { key: 'smtp_config', value: smtpConfig },
      { key: 'paystack_config', value: paystackConfig },
      { key: 'pawapay_config', value: pawapayConfig },
      { key: 'feexpay_config', value: feexpayConfig },
      { key: 'intouch_config', value: intouchConfig },
      { key: 'paydunya_config', value: paydunyaConfig },
      { key: 'affiliate_config', value: affiliateConfig },
      { key: 'payment_toggles', value: paymentToggles },
      { key: 'exchange_rates', value: exchangeRates },
      { key: 'default_commission_rate', value: globalRates.commission },
      { key: 'default_physical_commission_rate', value: globalRates.physical },
      { key: 'default_advance_rate', value: globalRates.advance },
      { key: 'default_fundraising_commission_rate', value: globalRates.fundraising },
      { key: 'support_config', value: supportConfig },
    ];

    try {
      const { error } = await supabase
        .from('platform_settings')
        .upsert(rows, { onConflict: 'key' });

      if (error) {
        setSaveStatus({ ok: false, msg: 'Erreur: ' + error.message });
      } else {
        setSaveStatus({ ok: true, msg: 'Configurations sauvegardées avec succès ✅' });
        clearSettingsCache();
        setTimeout(() => setSaveStatus(null), 4000);
      }
    } catch (err: any) {
      setSaveStatus({ ok: false, msg: 'Erreur inattendue: ' + (err?.message || 'Vérifiez votre connexion') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2"><Settings size={24} className="text-orange-500" /> Configurations API</h2>
          <p className="text-slate-400 text-sm mt-1">Gérez les connexions aux services tiers et aux moyens de paiement</p>
        </div>
      </div>

      <div className="bg-slate-900/50 backdrop-blur-xl p-6 md:p-8 rounded-3xl border border-white/10 shadow-2xl mb-8">
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><CreditCard size={20} className="text-emerald-500" /> Passerelles de Paiement (Activation)</h3>
        <p className="text-slate-400 text-sm mb-6">Activez ou désactivez les moyens de paiement disponibles pour les acheteurs lors de l'Event Checkout.</p>
        <div className="flex flex-wrap gap-6">
          {Object.entries(paymentToggles).map(([key, isActive]) => {
            const labels: any = { paystack: 'Paystack (Carte Bancaire)', pawapay: 'PawaPay (Mobile Money)', feexpay: 'FeexPay (Bénin)', intouch: 'InTouch (Multi-MM)', paydunya: 'PayDunya (Sénégal)' };
            const colors: any = { paystack: 'text-indigo-400', pawapay: 'text-amber-400', feexpay: 'text-green-400', intouch: 'text-red-400', paydunya: 'text-blue-400' };
            return (
              <label key={key} className="flex items-center gap-3 bg-slate-800/50 px-5 py-3 rounded-xl border border-white/5 cursor-pointer hover:bg-slate-800 transition-colors">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setPaymentToggles({ ...paymentToggles, [key]: e.target.checked })}
                  className="w-5 h-5 rounded border-white/10 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                />
                <span className={`font-bold ${colors[key]}`}>{labels[key]}</span>
              </label>
            )
          })}
        </div>
      </div>

      <div className="bg-slate-900/50 backdrop-blur-xl p-6 md:p-8 rounded-3xl border border-white/10 shadow-2xl mb-8">
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><Coins size={20} className="text-amber-500" /> Taux de Change & Devises (Cross-Border)</h3>
        <p className="text-slate-400 text-sm mb-6">Définissez vos taux de change. La monnaie de base de l'application est le FCFA (1 XOF = 1 XOF).</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {Object.entries(exchangeRates).map(([currency, rate]) => (
            currency !== 'XOF' && currency !== 'XAF' ? (
              <div key={currency}>
                <label className="block text-sm font-medium text-slate-300 mb-1">1 XOF en {currency}</label>
                <input
                  type="number"
                  step="0.0001"
                  value={rate}
                  onChange={(e) => setExchangeRates({ ...exchangeRates, [currency]: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>
            ) : null
          ))}
        </div>
      </div>

      <div className="bg-slate-900/50 backdrop-blur-xl p-6 md:p-8 rounded-3xl border border-white/10 shadow-2xl mb-8">
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><Banknote size={20} className="text-rose-500" /> Taux Globaux de la Plateforme</h3>
        <p className="text-slate-400 text-sm mb-6">Ces taux s'appliqueront par défaut à tout nouvel événement créé. (Les événements déjà créés conserveront leurs anciens taux pour la fiabilité comptable).</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Commission Platforme (%)</label>
            <input
              type="number"
              step="0.1"
              value={globalRates.commission}
              onChange={(e) => setGlobalRates({ ...globalRates, commission: parseFloat(e.target.value) || 0 })}
              className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 font-mono"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Commission Billet Phys. (%)</label>
            <input
              type="number"
              step="0.1"
              value={globalRates.physical}
              onChange={(e) => setGlobalRates({ ...globalRates, physical: parseFloat(e.target.value) || 0 })}
              className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 font-mono"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Plafond d'Avance (%)</label>
            <input
              type="number"
              step="1"
              value={globalRates.advance}
              onChange={(e) => setGlobalRates({ ...globalRates, advance: parseFloat(e.target.value) || 0 })}
              className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Commission Collectes Fonds (%)</label>
            <input
              type="number"
              step="0.1"
              value={globalRates.fundraising}
              onChange={(e) => setGlobalRates({ ...globalRates, fundraising: parseFloat(e.target.value) || 0 })}
              className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* WhatsApp Provider */}
        <div className="bg-slate-900/50 backdrop-blur-xl p-6 md:p-8 rounded-3xl border border-white/10 shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-emerald-500/20 text-emerald-500 rounded-xl flex items-center justify-center">
                <Smartphone size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">WhatsApp API</h3>
                <p className="text-slate-400 text-sm">Passerelle WhatsApp Business</p>
              </div>
            </div>
            {/* Toggle Provider */}
            <div className="flex bg-slate-800 p-1 rounded-lg border border-white/5">
              <button
                onClick={() => setWaConfig({ ...waConfig, provider: 'wasender' })}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${waConfig.provider === 'wasender' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                WaSender
              </button>
              <button
                onClick={() => setWaConfig({ ...waConfig, provider: 'evolution' })}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${waConfig.provider === 'evolution' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                Evolution API
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {waConfig.provider === 'wasender' ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Base URL de l'API</label>
                  <input
                    type="text"
                    value={waConfig.wasenderUrl || ''}
                    onChange={e => setWaConfig({ ...waConfig, wasenderUrl: e.target.value })}
                    placeholder="https://api.wasender.com/v1"
                    className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Instance ID</label>
                  <input
                    type="text"
                    value={waConfig.instanceId || ''}
                    onChange={e => setWaConfig({ ...waConfig, instanceId: e.target.value })}
                    placeholder="Ex: instance12345"
                    className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Token API</label>
                  <input
                    type="password"
                    value={waConfig.token || ''}
                    onChange={e => setWaConfig({ ...waConfig, token: e.target.value })}
                    placeholder="••••••••••••••••"
                    className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Base URL de l'API</label>
                  <input
                    type="text"
                    value={waConfig.evolutionUrl || ''}
                    onChange={e => setWaConfig({ ...waConfig, evolutionUrl: e.target.value })}
                    placeholder="https://api.monsite.com"
                    className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Nom d'Instance</label>
                    <input
                      type="text"
                      value={waConfig.evolutionInstance || ''}
                      onChange={e => setWaConfig({ ...waConfig, evolutionInstance: e.target.value })}
                      placeholder="Ex: afritix-bot"
                      className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Global API Key</label>
                    <input
                      type="password"
                      value={waConfig.evolutionApiKey || ''}
                      onChange={e => setWaConfig({ ...waConfig, evolutionApiKey: e.target.value })}
                      placeholder="••••••••••••••••"
                      className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* OpenRouter AI Provider */}
        <div className="bg-slate-900/50 backdrop-blur-xl p-6 md:p-8 rounded-3xl border border-white/10 shadow-2xl lg:col-span-2">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-purple-500/20 text-purple-500 rounded-xl flex items-center justify-center">
              <Shield size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Intelligence Artificielle (Qwen)</h3>
              <p className="text-slate-400 text-sm">Base de connaissances et closer AI via OpenRouter</p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">OpenRouter API Key</label>
            <input
              type="password"
              value={openrouterApiKey || ''}
              onChange={e => setOpenrouterApiKey(e.target.value)}
              placeholder="sk-or-v1-*****************"
              className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 font-mono"
            />
          </div>
        </div>

        {/* Support Contact Config */}
        <div className="bg-slate-900/50 backdrop-blur-xl p-6 md:p-8 rounded-3xl border border-white/10 shadow-2xl lg:col-span-2">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-rose-500/20 text-rose-500 rounded-xl flex items-center justify-center">
              <Mail size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Contacts Support (Humain & IA)</h3>
              <p className="text-slate-400 text-sm">Transmis au Chatbot IA pour rediriger les clients en cas de besoin</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Numéro WhatsApp Support</label>
              <input
                type="text"
                value={supportConfig.whatsapp || ''}
                onChange={e => setSupportConfig(prev => ({ ...prev, whatsapp: e.target.value }))}
                placeholder="+225 01 02 03 04 05"
                className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Email Support</label>
              <input
                type="email"
                value={supportConfig.email || ''}
                onChange={e => setSupportConfig(prev => ({ ...prev, email: e.target.value }))}
                placeholder="support@babipass.com"
                className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
              />
            </div>
          </div>
        </div>

        {/* SMTP Provider */}
        <div className="bg-slate-900/50 backdrop-blur-xl p-6 md:p-8 rounded-3xl border border-white/10 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-blue-500/20 text-blue-500 rounded-xl flex items-center justify-center">
              <Mail size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Serveur Mail (SMTP)</h3>
              <p className="text-slate-400 text-sm">Envoi des billets par courriel</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-300 mb-1">Hôte SMTP</label>
                <input
                  type="text"
                  value={smtpConfig.host}
                  onChange={e => setSmtpConfig({ ...smtpConfig, host: e.target.value })}
                  placeholder="smtp.mailgun.org"
                  className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Port</label>
                <input
                  type="text"
                  value={smtpConfig.port}
                  onChange={e => setSmtpConfig({ ...smtpConfig, port: e.target.value })}
                  placeholder="587"
                  className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Nom d'utilisateur</label>
              <input
                type="text"
                value={smtpConfig.user}
                onChange={e => setSmtpConfig({ ...smtpConfig, user: e.target.value })}
                placeholder="postmaster@votre-domaine.com"
                className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Mot de passe</label>
              <input
                type="password"
                value={smtpConfig.pass}
                onChange={e => setSmtpConfig({ ...smtpConfig, pass: e.target.value })}
                placeholder="••••••••••••••••"
                className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Nom de l'expéditeur (affiché dans les mails)</label>
              <input
                type="text"
                value={(smtpConfig as any).senderName || ''}
                onChange={e => setSmtpConfig({ ...smtpConfig, senderName: e.target.value } as any)}
                placeholder="Babipass"
                className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              <p className="text-xs text-slate-500 mt-1">Ex: "Babipass" → apparaîtra comme <span className="text-slate-300 font-mono">Babipass &lt;email@gmail.com&gt;</span> dans la boîte du destinataire.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
        {/* Paystack Provider */}
        <div className="bg-slate-900/50 backdrop-blur-xl p-6 md:p-8 rounded-3xl border border-white/10 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-indigo-500/20 text-indigo-500 rounded-xl flex items-center justify-center">
              <CreditCard size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Paystack API</h3>
              <p className="text-slate-400 text-sm">Passerelle Cartes Bancaires</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Public Key</label>
              <input
                type="text"
                value={paystackConfig.publicKey}
                onChange={e => setPaystackConfig({ ...paystackConfig, publicKey: e.target.value })}
                placeholder="pk_live_..."
                className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Secret Key</label>
              <input
                type="password"
                value={paystackConfig.secretKey}
                onChange={e => setPaystackConfig({ ...paystackConfig, secretKey: e.target.value })}
                placeholder="sk_live_..."
                className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
          </div>
        </div>



        {/* PawaPay Provider */}
        <div className={`backdrop-blur-xl p-6 md:p-8 rounded-3xl border shadow-2xl transition-all ${paymentToggles.pawapay ? 'bg-slate-900/50 border-white/10' : 'bg-slate-900/20 border-white/5 opacity-60'}`}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-amber-500/20 text-amber-500 rounded-xl flex items-center justify-center">
              <Smartphone size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">PawaPay API</h3>
              <p className="text-slate-400 text-sm">Passerelle Mobile Money (Orange, MTN...)</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Merchant ID</label>
              <input
                type="text"
                value={pawapayConfig.merchantId}
                onChange={e => setPawapayConfig({ ...pawapayConfig, merchantId: e.target.value })}
                placeholder="Ex: afritix_mm_01"
                className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">JWT Token</label>
              <input
                type="password"
                value={pawapayConfig.jwtToken}
                onChange={e => setPawapayConfig({ ...pawapayConfig, jwtToken: e.target.value })}
                placeholder="eyJh..."
                className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
          </div>
        </div>

        {/* FeexPay Provider */}
        <div className={`backdrop-blur-xl p-6 md:p-8 rounded-3xl border shadow-2xl transition-all ${paymentToggles.feexpay ? 'bg-slate-900/50 border-white/10' : 'bg-slate-900/20 border-white/5 opacity-60'}`}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-green-500/20 text-green-500 rounded-xl flex items-center justify-center font-bold text-xl uppercase">F</div>
            <div>
              <h3 className="text-xl font-bold text-white">FeexPay API</h3>
              <p className="text-slate-400 text-sm">Passerelle Bénin / Afrique de l'Ouest</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Shop ID</label>
              <input
                type="text"
                value={feexpayConfig.shopId}
                onChange={e => setFeexpayConfig({ ...feexpayConfig, shopId: e.target.value })}
                placeholder="Ex: 5f8b9..."
                className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-green-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Token Secret</label>
              <input
                type="password"
                value={feexpayConfig.token}
                onChange={e => setFeexpayConfig({ ...feexpayConfig, token: e.target.value })}
                placeholder="fp_live_..."
                className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-green-500 font-mono"
              />
            </div>
          </div>
        </div>

        {/* InTouch Provider */}
        <div className={`backdrop-blur-xl p-6 md:p-8 rounded-3xl border shadow-2xl transition-all ${paymentToggles.intouch ? 'bg-slate-900/50 border-white/10' : 'bg-slate-900/20 border-white/5 opacity-60'}`}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-red-500/20 text-red-500 rounded-xl flex items-center justify-center font-bold text-xl uppercase">I</div>
            <div>
              <h3 className="text-xl font-bold text-white">Guichet InTouch</h3>
              <p className="text-slate-400 text-sm">Multi-Mobile Money (Francophone)</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Partner ID</label>
              <input
                type="text"
                value={intouchConfig.partnerId}
                onChange={e => setIntouchConfig({ ...intouchConfig, partnerId: e.target.value })}
                placeholder="Ex: PTN-123"
                className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-red-500 font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Login</label>
                <input
                  type="text"
                  value={intouchConfig.login}
                  onChange={e => setIntouchConfig({ ...intouchConfig, login: e.target.value })}
                  placeholder="admin@afritix"
                  className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-red-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Mot de passe</label>
                <input
                  type="password"
                  value={intouchConfig.password}
                  onChange={e => setIntouchConfig({ ...intouchConfig, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-red-500 font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        {/* PayDunya Provider */}
        <div className={`backdrop-blur-xl p-6 md:p-8 rounded-3xl border shadow-2xl transition-all ${paymentToggles.paydunya ? 'bg-slate-900/50 border-white/10' : 'bg-slate-900/20 border-white/5 opacity-60'}`}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-blue-500/20 text-blue-500 rounded-xl flex items-center justify-center font-bold text-xl uppercase">P</div>
            <div>
              <h3 className="text-xl font-bold text-white">PayDunya API</h3>
              <p className="text-slate-400 text-sm">Passerelle Sénégal & UEMOA</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Master Key</label>
              <input
                type="text"
                value={paydunyaConfig.masterKey}
                onChange={e => setPaydunyaConfig({ ...paydunyaConfig, masterKey: e.target.value })}
                placeholder="Ex: pk_live_..."
                className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Private Key</label>
                <input
                  type="password"
                  value={paydunyaConfig.privateKey}
                  onChange={e => setPaydunyaConfig({ ...paydunyaConfig, privateKey: e.target.value })}
                  placeholder="sk_live_..."
                  className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Token</label>
                <input
                  type="password"
                  value={paydunyaConfig.token}
                  onChange={e => setPaydunyaConfig({ ...paydunyaConfig, token: e.target.value })}
                  placeholder="••••••••"
                  className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-r from-fuchsia-900/40 to-purple-900/40 backdrop-blur-xl p-6 md:p-8 rounded-3xl border border-fuchsia-500/20 shadow-2xl mt-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-fuchsia-500/20 text-fuchsia-400 rounded-xl flex items-center justify-center">
            <Users size={24} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">Programme d'Affiliation (Ambassadeurs)</h3>
            <p className="text-slate-400 text-sm">Configurez la rémunération des utilisateurs partageant leurs liens</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <label className="block">
            <span className="text-slate-400 text-sm font-semibold mb-1 block">Type de Commission</span>
            <select
              value={affiliateConfig.type}
              onChange={e => setAffiliateConfig({ ...affiliateConfig, type: e.target.value })}
              className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-fuchsia-500 outline-none appearance-none"
            >
              <option value="percentage">Pourcentage du prix du billet (%)</option>
              <option value="fixed">Montant fixe (FCFA)</option>
            </select>
          </label>
          <label className="block">
            <span className="text-slate-400 text-sm font-semibold mb-1 block">Valeur ({affiliateConfig.type === 'percentage' ? '%' : 'FCFA'})</span>
            <input
              type="number"
              value={affiliateConfig.value}
              onChange={e => setAffiliateConfig({ ...affiliateConfig, value: Number(e.target.value) })}
              className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-fuchsia-500 outline-none"
            />
          </label>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-end items-center gap-4 mt-8">
        {saveStatus && (
          <p className={`text-sm font-medium ${saveStatus.ok ? 'text-emerald-400' : 'text-red-400'}`}>
            {saveStatus.msg}
          </p>
        )}
        <button
          onClick={() => {/* test connexion */ }}
          className="px-6 py-3 rounded-xl font-bold bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
        >
          Tester la connexion
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-orange-600 hover:bg-orange-500 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-[0_0_20px_rgba(249,115,22,0.3)] hover:shadow-[0_0_30px_rgba(249,115,22,0.5)] flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
          Enregistrer les configurations
        </button>
      </div>
    </div>
  );
};

// ─── KYB Business Verification Review Panel ─────────────────────────────────
const KybReviewTab = ({ addToast }: { addToast: (msg: string, type?: any) => void }) => {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectModal, setRejectModal] = useState<{ id: string; name: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState(false);

  const fetchRequests = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email, business_status, business_doc_url, address_proof_url, business_rejection_reason, created_at')
      .neq('business_status', 'none')
      .order('created_at', { ascending: false });
    if (error) addToast('Erreur chargement KYB: ' + error.message, 'error');
    setRequests(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchRequests(); }, []);

  const handleApprove = async (userId: string) => {
    setProcessing(true);
    const { error } = await supabase.rpc('review_business_kyb', { p_user_id: userId, p_status: 'verified', p_reason: null });
    if (error) { addToast('Erreur: ' + error.message, 'error'); }
    else { addToast('✅ Entreprise vérifiée avec succès !', 'success'); fetchRequests(); }
    setProcessing(false);
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    setProcessing(true);
    const { error } = await supabase.rpc('review_business_kyb', { p_user_id: rejectModal.id, p_status: 'rejected', p_reason: rejectReason });
    if (error) { addToast('Erreur: ' + error.message, 'error'); }
    else { addToast('Demande rejetée.', 'info'); fetchRequests(); }
    setRejectModal(null);
    setRejectReason('');
    setProcessing(false);
  };

  const statusBadge = (status: string) => {
    if (status === 'pending') return <span className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 px-3 py-1 rounded-full text-xs font-bold"><Clock size={12} /> En attente</span>;
    if (status === 'verified') return <span className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-xs font-bold"><CheckCircle2 size={12} /> Vérifié</span>;
    if (status === 'rejected') return <span className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-1 rounded-full text-xs font-bold"><XCircle size={12} /> Rejeté</span>;
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/5 backdrop-blur-xl p-6 rounded-3xl border border-white/10 shadow-xl">
        <div>
          <h2 className="text-xl font-extrabold text-white flex items-center gap-3"><Building2 className="text-amber-400" size={24} /> Vérification Business (KYB)</h2>
          <p className="text-slate-400 text-sm mt-1">Examinez et validez les documents d'entreprise soumis par les organisateurs.</p>
        </div>
        <button onClick={fetchRequests} className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white px-4 py-2 rounded-xl font-semibold border border-white/10 text-sm transition-all">
          <RefreshCw size={14} /> Actualiser
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-orange-500" size={40} /></div>
      ) : requests.length === 0 ? (
        <div className="bg-white/5 border border-white/10 rounded-3xl p-16 text-center">
          <Building2 className="text-slate-600 mx-auto mb-4" size={48} />
          <p className="text-slate-400 font-semibold">Aucune demande de vérification business.</p>
        </div>
      ) : (
        <div className="bg-slate-900/50 border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-800/60 text-slate-400 uppercase text-xs font-bold tracking-wider">
              <tr>
                <th className="px-6 py-4">Organisateur</th>
                <th className="px-6 py-4">Statut</th>
                <th className="px-6 py-4">Documents</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {requests.map((r: any) => (
                <tr key={r.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4">
                    <p className="text-white font-bold">{r.name || 'Sans nom'}</p>
                    <p className="text-slate-500 text-xs">{r.email}</p>
                    {r.business_status === 'rejected' && r.business_rejection_reason && (
                      <p className="text-red-400/70 text-xs italic mt-1 max-w-xs truncate">Motif: {r.business_rejection_reason}</p>
                    )}
                  </td>
                  <td className="px-6 py-4">{statusBadge(r.business_status)}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-2">
                      {r.business_doc_url && (
                        <a href={r.business_doc_url} target="_blank" rel="noreferrer"
                          className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-xs font-medium transition-colors">
                          <FileText size={14} /> Doc. Entreprise
                        </a>
                      )}
                      {r.address_proof_url && (
                        <a href={r.address_proof_url} target="_blank" rel="noreferrer"
                          className="flex items-center gap-2 text-purple-400 hover:text-purple-300 text-xs font-medium transition-colors">
                          <MapPin size={14} /> Preuve d'Adresse
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-400 text-xs">{new Date(r.created_at).toLocaleDateString('fr-FR')}</td>
                  <td className="px-6 py-4">
                    {r.business_status === 'pending' && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleApprove(r.id)}
                          disabled={processing}
                          className="flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50">
                          <Check size={14} /> Approuver
                        </button>
                        <button
                          onClick={() => setRejectModal({ id: r.id, name: r.name })}
                          disabled={processing}
                          className="flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50">
                          <X size={14} /> Rejeter
                        </button>
                      </div>
                    )}
                    {r.business_status === 'verified' && (
                      <button
                        onClick={() => setRejectModal({ id: r.id, name: r.name })}
                        className="text-slate-500 hover:text-red-400 text-xs font-medium transition-colors">
                        Révoquer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Rejection Modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-8 shadow-2xl w-full max-w-md">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center"><AlertTriangle className="text-red-400" size={24} /></div>
              <div>
                <h3 className="text-white font-bold text-lg">Rejeter la demande</h3>
                <p className="text-slate-400 text-sm">{rejectModal.name}</p>
              </div>
            </div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Motif du rejet (optionnel)</label>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Expliquez pourquoi la demande est rejetée (documents illisibles, document expiré, etc.)..."
              rows={4}
              className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-red-500 resize-none mb-6"
            />
            <div className="flex gap-3">
              <button onClick={() => { setRejectModal(null); setRejectReason(''); }}
                className="flex-1 bg-white/5 hover:bg-white/10 text-slate-300 py-3 rounded-xl font-bold transition-all">
                Annuler
              </button>
              <button onClick={handleReject} disabled={processing}
                className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white py-3 rounded-xl font-bold transition-all">
                {processing ? <Loader2 size={18} className="animate-spin mx-auto" /> : 'Confirmer le rejet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── AdBannersTab ─────────────────────────────────────────────────────────────
const BADGE_COLOR_OPTIONS = [
  { value: 'orange', label: '🟠 Orange' },
  { value: 'blue', label: '🔵 Bleu' },
  { value: 'green', label: '🟢 Vert' },
  { value: 'purple', label: '🟣 Violet' },
  { value: 'red', label: '🔴 Rouge' },
];

const BADGE_COLOR_STYLES: Record<string, string> = {
  orange: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  blue: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  green: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  purple: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  red: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
};

const EMPTY_BANNER = {
  id: '',
  title: '',
  subtitle: '',
  image_url: '',
  video_url: '',
  cta_label: 'En savoir plus',
  cta_url: '',
  badge_label: '',
  badge_color: 'orange',
  display_order: 0,
  is_active: true,
};

const AdBannersTab: React.FC<{ addToast: (msg: string, type?: any) => void }> = ({ addToast }) => {
  const [banners, setBanners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>(EMPTY_BANNER);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const imgInputRef = React.useRef<HTMLInputElement>(null);

  const handleVideoUpload = async (file: File) => {
    if (!file.type.startsWith('video/')) { addToast('Format invalide. Choisissez une vidéo.', 'error'); return; }
    if (file.size > 25 * 1024 * 1024) { addToast('Vidéo trop lourde (max 25 Mo).', 'error'); return; }
    setUploadingVideo(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'mp4';
      const filename = `banners_videos/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage.from('events').upload(filename, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('events').getPublicUrl(filename);
      setForm((prev: any) => ({ ...prev, video_url: urlData.publicUrl }));
      addToast('Vidéo uploadée !', 'success');
    } catch (err: any) {
      addToast('Erreur upload : ' + err.message, 'error');
    } finally {
      setUploadingVideo(false);
    }
  };

  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) { addToast('Format invalide. Choisissez une image.', 'error'); return; }
    if (file.size > 5 * 1024 * 1024) { addToast('Image trop lourde (max 5 Mo).', 'error'); return; }
    setUploadingImg(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const filename = `banners/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage.from('events').upload(filename, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('events').getPublicUrl(filename);
      setForm((prev: any) => ({ ...prev, image_url: urlData.publicUrl }));
      addToast('Image uploadée !', 'success');
    } catch (err: any) {
      addToast('Erreur upload : ' + err.message, 'error');
    } finally {
      setUploadingImg(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleImageUpload(file);
  };

  const fetchBanners = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('ad_banners')
      .select('*')
      .order('display_order', { ascending: true });
    if (error) { addToast('Erreur chargement bannières', 'error'); }
    else setBanners(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchBanners(); }, []);

  const openNew = () => {
    setForm({ ...EMPTY_BANNER, display_order: (banners.length + 1) });
    setIsEditing(false);
    setShowForm(true);
  };

  const openEdit = (b: any) => {
    setForm({ ...b });
    setIsEditing(true);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title || !form.image_url) { addToast('Titre et image requis.', 'error'); return; }
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        subtitle: form.subtitle || null,
        image_url: form.image_url,
        video_url: form.video_url || null,
        cta_label: form.cta_label || 'En savoir plus',
        cta_url: form.cta_url || null,
        badge_label: form.badge_label || null,
        badge_color: form.badge_color || 'orange',
        display_order: Number(form.display_order) || 0,
        is_active: form.is_active,
        updated_at: new Date().toISOString(),
      };

      if (isEditing) {
        const { error } = await supabase.from('ad_banners').update(payload).eq('id', form.id);
        if (error) throw error;
        addToast('Bannière mise à jour !', 'success');
      } else {
        const { error } = await supabase.from('ad_banners').insert([payload]);
        if (error) throw error;
        addToast('Bannière créée !', 'success');
      }
      setShowForm(false);
      fetchBanners();
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Supprimer cette bannière ?')) return;
    const { error } = await supabase.from('ad_banners').delete().eq('id', id);
    if (error) { addToast(error.message, 'error'); return; }
    addToast('Bannière supprimée.', 'success');
    fetchBanners();
  };

  const handleToggle = async (b: any) => {
    const { error } = await supabase.from('ad_banners').update({ is_active: !b.is_active }).eq('id', b.id);
    if (error) { addToast(error.message, 'error'); return; }
    addToast(b.is_active ? 'Bannière désactivée.' : 'Bannière activée !', 'success');
    fetchBanners();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Eye className="text-orange-400" size={24} /> Espaces Publicitaires
          </h2>
          <p className="text-slate-400 text-sm mt-1">Gérez les bannières affichées sur la page d'accueil.</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-orange-500/30">
          <Plus size={18} /> Nouvelle Bannière
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-slate-800/60 border border-white/10 rounded-2xl p-6 space-y-4 animate-in slide-in-from-top-2 fade-in duration-300">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-white text-lg">{isEditing ? 'Modifier la Bannière' : 'Nouvelle Bannière'}</h3>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
          </div>

          {/* Live Preview */}
          {form.image_url && (
            <div className="relative h-32 rounded-xl overflow-hidden border border-white/10">
              <img src={form.image_url} alt="Preview" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#0f172a]/90 via-[#0f172a]/50 to-transparent flex flex-col justify-center p-4">
                {form.badge_label && (
                  <span className={`inline-flex w-fit px-2 py-0.5 rounded-full text-[10px] font-bold border mb-1 ${BADGE_COLOR_STYLES[form.badge_color || 'orange']}`}>
                    {form.badge_label}
                  </span>
                )}
                <p className="text-white font-black text-sm leading-tight line-clamp-1">{form.title || 'Titre de la bannière'}</p>
                {form.subtitle && <p className="text-slate-300 text-xs mt-0.5 line-clamp-1">{form.subtitle}</p>}
              </div>
              <span className="absolute top-2 right-2 text-white/40 text-[9px] font-bold uppercase tracking-widest">Aperçu</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">Titre *</label>
              <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                placeholder="Titre accrocheur..." />
            </div>

            {/* Image Upload Zone — full width */}
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-400 mb-2 uppercase">Image de Fond *</label>

              {/* Drop Zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => imgInputRef.current?.click()}
                className={`relative cursor-pointer rounded-xl border-2 border-dashed transition-all p-6 text-center ${dragOver ? 'border-orange-400 bg-orange-500/10' : 'border-slate-600 hover:border-orange-500/60 hover:bg-orange-500/5'
                  }`}
              >
                <input
                  ref={imgInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }}
                />
                {uploadingImg ? (
                  <div className="flex flex-col items-center gap-2 py-2">
                    <Loader2 size={28} className="animate-spin text-orange-400" />
                    <p className="text-orange-400 text-sm font-bold">Upload en cours...</p>
                  </div>
                ) : form.image_url ? (
                  <div className="relative h-28 rounded-lg overflow-hidden -m-2">
                    <img src={form.image_url} alt="preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                      <p className="text-white text-xs font-bold">Cliquer pour changer</p>
                    </div>
                  </div>
                ) : (
                  <div className="py-4 flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-xl bg-slate-700 flex items-center justify-center">
                      <Plus size={22} className="text-slate-400" />
                    </div>
                    <p className="text-slate-300 text-sm font-bold">Glisser-déposer ou cliquer pour uploader</p>
                    <p className="text-slate-500 text-xs">PNG, JPG, WEBP — max 5 Mo</p>
                  </div>
                )}
              </div>

              {/* URL Fallback */}
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-px bg-slate-700" />
                <span className="text-slate-500 text-xs">ou coller une URL</span>
                <div className="flex-1 h-px bg-slate-700" />
              </div>
              <input
                value={form.image_url}
                onChange={e => setForm({ ...form, image_url: e.target.value })}
                className="mt-2 w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 text-sm"
                placeholder="https://images.unsplash.com/..."
              />
            </div>

            <div className="md:col-span-2">
              <VideoUploadField
                value={form.video_url || ''}
                onChange={(val) => setForm({ ...form, video_url: val })}
                onUpload={handleVideoUpload}
                uploading={uploadingVideo}
                label="Vidéo de Fond (MP4, WEBM ou lien YouTube/Vimeo)"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">Sous-titre / Description</label>
              <input value={form.subtitle} onChange={e => setForm({ ...form, subtitle: e.target.value })}
                className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                placeholder="Description courte et percutante..." />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">Texte du bouton CTA</label>
              <input value={form.cta_label} onChange={e => setForm({ ...form, cta_label: e.target.value })}
                className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                placeholder="En savoir plus" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">Lien CTA (URL)</label>
              <input value={form.cta_url} onChange={e => setForm({ ...form, cta_url: e.target.value })}
                className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                placeholder="https://... ou /organizer/login" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">Badge (texte)</label>
              <input value={form.badge_label} onChange={e => setForm({ ...form, badge_label: e.target.value })}
                className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                placeholder="Sponsorisé, Promo, Nouveau..." />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">Couleur du Badge</label>
              <select value={form.badge_color} onChange={e => setForm({ ...form, badge_color: e.target.value })}
                className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-orange-500">
                {BADGE_COLOR_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">Ordre d'affichage</label>
              <input type="number" value={form.display_order} onChange={e => setForm({ ...form, display_order: e.target.value })}
                className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                min="0" />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <label className="text-sm font-medium text-slate-300">Active</label>
              <button onClick={() => setForm({ ...form, is_active: !form.is_active })}
                className={`w-12 h-6 rounded-full transition-colors relative ${form.is_active ? 'bg-orange-500' : 'bg-slate-700'}`}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${form.is_active ? 'left-7' : 'left-1'}`} />
              </button>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-3 bg-gradient-to-r from-orange-600 to-amber-500 text-white rounded-xl font-bold transition-all hover:brightness-110 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {isEditing ? 'Mettre à jour' : 'Créer la Bannière'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold transition-all">
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Banners List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-orange-500" size={36} /></div>
      ) : banners.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Eye size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg font-bold">Aucune bannière pour l'instant</p>
          <p className="text-sm mt-1">Créez votre première bannière publicitaire.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {banners.map((b, i) => (
            <div key={b.id} className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${b.is_active ? 'bg-slate-800/50 border-white/10' : 'bg-slate-900/30 border-slate-800 opacity-60'}`}>
              {/* Thumbnail */}
              <div className="w-24 h-14 rounded-xl overflow-hidden shrink-0 border border-white/10">
                <img src={b.image_url} alt={b.title} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).src = 'https://placehold.co/96x56/1e293b/475569?text=?'; }} />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  {b.badge_label && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${BADGE_COLOR_STYLES[b.badge_color || 'orange']}`}>
                      {b.badge_label}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-600 font-mono">#{b.display_order}</span>
                </div>
                <p className="text-white font-bold text-sm truncate">{b.title}</p>
                {b.subtitle && <p className="text-slate-400 text-xs truncate">{b.subtitle}</p>}
                {b.cta_url && <p className="text-orange-400/60 text-[10px] truncate mt-0.5">{b.cta_url}</p>}
              </div>

              {/* Status badge */}
              <div className={`px-3 py-1 rounded-full text-xs font-bold shrink-0 ${b.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-500'}`}>
                {b.is_active ? '● Actif' : '○ Inactif'}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => handleToggle(b)} title={b.is_active ? 'Désactiver' : 'Activer'}
                  className={`p-2 rounded-lg transition-all ${b.is_active ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400'}`}>
                  {b.is_active ? <Ban size={15} /> : <CheckCircle size={15} />}
                </button>
                <button onClick={() => openEdit(b)} className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-all">
                  <Edit2 size={15} />
                </button>
                <button onClick={() => handleDelete(b.id)} className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-all">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const EventCategoriesTab = ({ addToast }: any) => {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ id: '', name: '', icon: '', display_order: 0, is_active: true });
  const [isEditing, setIsEditing] = useState(false);

  const fetchCategories = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('event_categories').select('*').order('display_order', { ascending: true }).order('created_at', { ascending: false });
    if (!error && data) setCategories(data);
    setLoading(false);
  };

  useEffect(() => { fetchCategories(); }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return addToast('Nom de catégorie requis', 'error');

    const payload = {
      name: form.name.trim(),
      icon: form.icon.trim() || null,
      display_order: Number(form.display_order),
      is_active: form.is_active
    };

    if (isEditing && form.id) {
      const { error } = await supabase.from('event_categories').update(payload).eq('id', form.id);
      if (error) { addToast(error.message, 'error'); return; }
      addToast('Catégorie modifiée', 'success');
    } else {
      const { error } = await supabase.from('event_categories').insert([payload]);
      if (error) { addToast(error.message, 'error'); return; }
      addToast('Catégorie ajoutée', 'success');
    }

    setForm({ id: '', name: '', icon: '', display_order: 0, is_active: true });
    setIsEditing(false);
    fetchCategories();
  };

  const handleEdit = (cat: any) => {
    setForm(cat);
    setIsEditing(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Supprimer cette catégorie ?")) return;
    const { error } = await supabase.from('event_categories').delete().eq('id', id);
    if (error) addToast(error.message, 'error');
    else { addToast('Catégorie supprimée', 'success'); fetchCategories(); }
  };

  const handleToggleActive = async (cat: any) => {
    const { error } = await supabase.from('event_categories').update({ is_active: !cat.is_active }).eq('id', cat.id);
    if (!error) fetchCategories();
  };

  return (
    <div className="space-y-6">
      <div className="glass-panel p-6 rounded-3xl border border-white/10 bg-slate-900/50">
        <h3 className="text-xl font-bold text-white mb-6">Gérer les Catégories</h3>

        <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <div className="md:col-span-2">
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nom de la catégorie" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500" required />
          </div>
          <div>
            <input value={form.icon || ''} onChange={e => setForm({ ...form, icon: e.target.value })} placeholder="Icon (ex: Music)" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500" />
          </div>
          <div>
            <input type="number" value={form.display_order} onChange={e => setForm({ ...form, display_order: Number(e.target.value) })} placeholder="Ordre" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500" />
          </div>
          <div className="flex gap-2">
            {isEditing && <button type="button" onClick={() => { setIsEditing(false); setForm({ id: '', name: '', icon: '', display_order: 0, is_active: true }); }} className="bg-slate-700 hover:bg-slate-600 text-white rounded-xl px-4 py-3 transition-colors shrink-0"><X size={20} /></button>}
            <button type="submit" className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl px-4 py-3 transition-colors flex items-center justify-center gap-2">
              <Save size={20} /> {isEditing ? 'Modifier' : 'Ajouter'}
            </button>
          </div>
        </form>

        {loading ? (
          <div className="flex justify-center p-8"><Loader2 className="animate-spin text-orange-500" /></div>
        ) : (
          <div className="bg-slate-800/50 rounded-2xl overflow-hidden border border-slate-700">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-800 text-slate-400 uppercase text-xs font-bold">
                <tr>
                  <th className="px-6 py-4">Nom</th>
                  <th className="px-6 py-4">Icon (Lucide)</th>
                  <th className="px-6 py-4">Ordre</th>
                  <th className="px-6 py-4 text-center">Statut</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {categories.map(c => (
                  <tr key={c.id} className="hover:bg-slate-800/80 transition-colors">
                    <td className="px-6 py-4 font-bold text-white">{c.name}</td>
                    <td className="px-6 py-4">{c.icon || '-'}</td>
                    <td className="px-6 py-4">{c.display_order}</td>
                    <td className="px-6 py-4 text-center">
                      <button onClick={() => handleToggleActive(c)} className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${c.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                        {c.is_active ? 'Actif' : 'Inactif'}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                      <button onClick={() => handleEdit(c)} className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"><Edit2 size={16} /></button>
                      <button onClick={() => handleDelete(c.id)} className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-500 rounded-lg transition-colors"><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
                {categories.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">Aucune catégorie</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── AdminFundraisingTab ───────────────────────────────────────────────────────────
const AdminFundraisingTab = ({ addToast }: any) => {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [statsMap, setStatsMap] = useState<Record<string, { total_raised: number; contributor_count: number }>>({});
  const [adminStats, setAdminStats] = useState({ total_raised: 0, total_platform_fees: 0, total_contributors: 0, active_campaigns: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [rejectModal, setRejectModal] = useState<{ id: string; title: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [acting, setActing] = useState(false);

  const fetchCampaigns = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('fundraising_campaigns').select('*').order('created_at', { ascending: false });
    if (error) console.error("Error fetching campaigns:", error);
    let list = data || [];

    // Fetch profiles manually to avoid PostgREST foreign key errors
    if (list.length > 0) {
      const orgIds = [...new Set(list.map((c: any) => c.organizer_id))];
      const { data: profs } = await supabase.from('profiles').select('id, name, email').in('id', orgIds);
      if (profs) {
        const profMap = Object.fromEntries(profs.map(p => [p.id, p]));
        list = list.map(c => ({ ...c, profiles: profMap[c.organizer_id] }));
      }
    }
    setCampaigns(list);

    const { data: adminData } = await supabase.rpc('get_admin_fundraising_stats');
    if (adminData && adminData.length > 0) {
      setAdminStats(adminData[0]);
    }

    if (list.length > 0) {
      const { data: s } = await supabase.from('campaign_stats').select('campaign_id, total_raised, contributor_count').in('campaign_id', list.map((c: any) => c.id));
      const map: Record<string, any> = {};
      (s || []).forEach((r: any) => { map[r.campaign_id] = r; });
      setStatsMap(map);
    }
    setLoading(false);
  };

  useEffect(() => { fetchCampaigns(); }, []);

  const handleApprove = async (id: string) => {
    setActing(true);
    const { error } = await supabase.from('fundraising_campaigns').update({ approval_status: 'approved', rejection_reason: null }).eq('id', id);
    if (error) addToast(error.message, 'error');
    else { addToast('✅ Campagne approuvée ! Elle est maintenant visible au public.', 'success'); fetchCampaigns(); }
    setActing(false);
  };

  const handleRejectConfirm = async () => {
    if (!rejectModal) return;
    setActing(true);
    const { error } = await supabase.from('fundraising_campaigns').update({ approval_status: 'rejected', rejection_reason: rejectReason || 'Refus administratif.' }).eq('id', rejectModal.id);
    if (error) addToast(error.message, 'error');
    else { addToast('❌ Campagne refusée.', 'info'); setRejectModal(null); setRejectReason(''); fetchCampaigns(); }
    setActing(false);
  };

  const handleForceEnd = async (id: string) => {
    if (!window.confirm('Forcer la clôture de cette campagne ? Les dons seront bloqués.')) return;
    await supabase.from('fundraising_campaigns').update({ status: 'ended' }).eq('id', id);
    addToast('Campagne clôturée de force.', 'info'); fetchCampaigns();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Supprimer définitivement cette campagne et ses contributions ?')) return;
    const { error } = await supabase.from('fundraising_campaigns').delete().eq('id', id);
    if (error) addToast(error.message, 'error');
    else { addToast('Campagne supprimée.', 'success'); fetchCampaigns(); }
  };

  const allStats = campaigns.reduce((acc, c) => {
    const s = statsMap[c.id] || { total_raised: 0, contributor_count: 0 };
    return { total_raised: acc.total_raised + s.total_raised, contributors: acc.contributors + s.contributor_count };
  }, { total_raised: 0, contributors: 0 });

  const filtered = campaigns.filter(c => filter === 'all' || c.approval_status === filter);
  const pendingCount = campaigns.filter(c => c.approval_status === 'pending').length;

  const approvalBadge = (status: string) => {
    if (status === 'approved') return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">✅ Approuvée</span>;
    if (status === 'rejected') return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-bold bg-red-500/10 text-red-400 border border-red-500/20">❌ Refusée</span>;
    return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">⏳ En attente</span>;
  };

  if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-orange-500" size={32} /></div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Rejection Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#1e293b] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white">❌ Refuser la campagne</h3>
            <p className="text-slate-400 text-sm">Campagne : <span className="text-white font-bold">{rejectModal.title}</span></p>
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-1">Motif du refus (optionnel)</label>
              <textarea rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Ex: Contenu non conforme à nos conditions d'utilisation..." className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm resize-none focus:outline-none focus:border-red-500" />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setRejectModal(null)} className="px-5 py-2 rounded-xl text-slate-400 hover:text-white text-sm font-bold">Annuler</button>
              <button onClick={handleRejectConfirm} disabled={acting} className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white px-5 py-2 rounded-xl text-sm font-bold disabled:opacity-50">
                {acting ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />} Confirmer le refus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total collecté', value: formatCurrency(allStats.total_raised, 'FCFA'), icon: '💰', color: 'from-orange-500/20 to-amber-500/10' },
          { label: 'Revenus Plateforme', value: formatCurrency(adminStats.total_platform_fees || 0, 'FCFA'), icon: '📈', color: 'from-emerald-500/20 to-teal-500/10' },
          { label: 'Total donateurs', value: allStats.contributors, icon: '👥', color: 'from-blue-500/20 to-indigo-500/10' },
          { label: 'En attente', value: pendingCount, icon: '⏳', color: pendingCount > 0 ? 'from-amber-500/20 to-orange-500/10' : 'from-slate-700/50 to-slate-800/30' },
        ].map((kpi, i) => (
          <div key={i} className={`bg-gradient-to-br ${kpi.color} rounded-2xl border border-white/10 p-5`}>
            <p className="text-2xl mb-1">{kpi.icon}</p>
            <p className="text-2xl font-black text-white">{kpi.value}</p>
            <p className="text-slate-400 text-xs font-semibold mt-1">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Filter + Table */}
      <div className="bg-slate-900/40 border border-white/10 rounded-3xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h3 className="text-lg font-bold text-white flex items-center gap-2"><Heart className="text-orange-400" size={20} /> Gestion des Collectes</h3>
          <div className="flex gap-2">
            {(['all', 'pending', 'approved', 'rejected'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-colors ${filter === f ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                {f === 'all' ? 'Toutes' : f === 'pending' ? '⏳ En attente' : f === 'approved' ? '✅ Approuvées' : '❌ Refusées'}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20"><Heart size={40} className="mx-auto text-slate-600 mb-3" /><p className="text-slate-400">Aucune campagne dans cette catégorie.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-800/80 text-slate-400 uppercase text-xs font-bold">
                <tr>
                  <th className="px-6 py-4">Campagne</th>
                  <th className="px-6 py-4">Organisateur</th>
                  <th className="px-6 py-4">Collecté</th>
                  <th className="px-6 py-4 text-center">Validation</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((c: any) => {
                  const st = statsMap[c.id] || { total_raised: 0, contributor_count: 0 };
                  return (
                    <tr key={c.id} className={`hover:bg-white/5 transition-colors ${c.approval_status === 'pending' ? 'bg-amber-500/5' : ''}`}>
                      <td className="px-6 py-4 max-w-xs">
                        <p className="font-bold text-white truncate">{c.title}</p>
                        {c.rejection_reason && <p className="text-xs text-red-400 mt-0.5 truncate">Motif : {c.rejection_reason}</p>}
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-white font-medium">{c.profiles?.name || '—'}</p>
                        <p className="text-slate-500 text-xs">{c.profiles?.email}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-orange-400 font-extrabold">{formatCurrency(st.total_raised, c.currency)}</p>
                        <p className="text-xs text-slate-500"><Users size={10} className="inline mr-1" />{st.contributor_count} contrib.</p>
                      </td>
                      <td className="px-6 py-4 text-center">{approvalBadge(c.approval_status)}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2 flex-wrap">
                          <a href={`/collecte/${c.slug || c.id}`} target="_blank" rel="noreferrer" className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors" title="Voir"><Eye size={15} /></a>
                          {c.approval_status !== 'approved' && (
                            <button onClick={() => handleApprove(c.id)} disabled={acting} className="flex items-center gap-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg font-bold transition-colors disabled:opacity-50">
                              <Check size={13} /> Approuver
                            </button>
                          )}
                          {c.approval_status !== 'rejected' && (
                            <button onClick={() => setRejectModal({ id: c.id, title: c.title })} className="flex items-center gap-1 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg font-bold transition-colors">
                              <XCircle size={13} /> Refuser
                            </button>
                          )}
                          {c.status === 'active' && c.approval_status === 'approved' && (
                            <button onClick={() => handleForceEnd(c.id)} className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-400 px-3 py-1.5 rounded-lg font-bold transition-colors" title="Clôturer de force">Clôturer</button>
                          )}
                          <button onClick={() => handleDelete(c.id)} className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors" title="Supprimer"><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};


// ─── Refunds Management View ──────────────────────────────────────────────────
const RefundsManagementView = ({ addToast }: any) => {
  const [activeSubTab, setActiveSubTab] = useState<'requests' | 'pending'>('requests');
  const [requests, setRequests] = useState<any[]>([]);
  const [pendingRefunds, setPendingRefunds] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRefundsData = async () => {
    setLoading(true);
    // 1. Fetch requested cancellations
    const { data: reqData, error: err1 } = await supabase
      .from('events')
      .select('id, title, date, organizer_id, cancellation_status, cancellation_reason, profiles(name, email)')
      .eq('cancellation_status', 'requested')
      .order('created_at', { ascending: false });
    
    if (err1) addToast('Erreur requêtes annulation: ' + err1.message, 'error');
    else setRequests(reqData || []);

    // 2. Fetch pending refunds transactions
    const { data: refData, error: err2 } = await supabase
      .from('transactions')
      .select('id, guest_name, guest_email, buyer_phone, amount, method, status, refund_status, event_id, created_at, events(title)')
      .eq('refund_status', 'pending')
      .order('created_at', { ascending: true });
    
    if (err2) addToast('Erreur transactions à rembourser: ' + err2.message, 'error');
    else setPendingRefunds(refData || []);

    setLoading(false);
  };

  useEffect(() => {
    fetchRefundsData();
  }, []);

  const handleApproveCancel = async (eventId: string, title: string) => {
    if (!confirm(`Voulez-vous APPROUVER l'annulation de l'événement "${title}" ? Toutes ses transactions 'success' passeront en statut 'pending' pour remboursement.`)) return;
    const { data, error } = await supabase.rpc('approve_event_cancellation', { p_event_id: eventId });
    if (error) {
      addToast('Erreur: ' + error.message, 'error');
    } else {
      addToast('Annulation approuvée. Les acheteurs peuvent maintenant être remboursés.', 'success');
      fetchRefundsData();
    }
  };

  const handleRejectCancel = async (eventId: string) => {
    if (!confirm('Rejeter cette demande d\'annulation ?')) return;
    const { error } = await supabase.from('events').update({ cancellation_status: 'rejected' }).eq('id', eventId);
    if (error) addToast('Erreur: ' + error.message, 'error');
    else {
      addToast('Demande refusée.', 'success');
      fetchRefundsData();
    }
  };

  const markAsRefunded = async (txId: string) => {
    if (!confirm('Confirmer le remboursement manuel de cette transaction ?')) return;
    const { error } = await supabase.from('transactions').update({ refund_status: 'refunded' }).eq('id', txId);
    if (error) addToast('Erreur: ' + error.message, 'error');
    else {
      addToast('Transaction marquée comme remboursée.', 'success');
      setPendingRefunds(prev => prev.filter(t => t.id !== txId));
    }
  };

  const exportPendingRefunds = () => {
    if (pendingRefunds.length === 0) return addToast('Aucun remboursement en attente.', 'error');
    const headers = ['ID Tx', 'Evenement', 'Acheteur', 'Email', 'Téléphone', 'Moyen', 'Montant (FCFA)', 'Date'];
    const rows = pendingRefunds.map(t => [
      t.id, t.events?.title || '—', t.guest_name || '—', t.guest_email || '—', t.buyer_phone || '—',
      t.method || '—', t.amount || 0, new Date(t.created_at).toLocaleDateString()
    ]);
    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `remboursements-en-attente-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-md">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-3 text-white">
            <AlertTriangle className="text-red-400" size={24} /> Annulations & Remboursements
          </h2>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Validez les demandes d'annulation d'événements et gérez les remboursements manuels des transactions.
          </p>
        </div>
        <button onClick={fetchRefundsData} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl transition-all">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex space-x-2 bg-slate-900/40 p-1.5 rounded-2xl border border-white/10 w-full mb-6 relative">
        <button onClick={() => setActiveSubTab('requests')} className={`flex-1 flex justify-center py-2.5 rounded-xl text-sm font-bold transition-all ${activeSubTab === 'requests' ? 'bg-red-600/20 border border-red-500/50 text-red-100' : 'text-slate-400 hover:text-white'}`}>Demandes d'Annulation ({requests.length})</button>
        <button onClick={() => setActiveSubTab('pending')} className={`flex-1 flex justify-center py-2.5 rounded-xl text-sm font-bold transition-all ${activeSubTab === 'pending' ? 'bg-orange-500/20 border border-orange-500/50 text-orange-100' : 'text-slate-400 hover:text-white'}`}>Billets à Rembourser ({pendingRefunds.length})</button>
      </div>

      {activeSubTab === 'requests' && (
        <div className="grid gap-4">
          {requests.length === 0 ? (
            <div className="text-center p-8 bg-slate-900/50 rounded-2xl border border-white/10 text-slate-500">Aucune demande en attente.</div>
          ) : requests.map(req => (
            <div key={req.id} className="bg-slate-900/50 border border-red-500/20 p-5 rounded-2xl flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
              <div className="flex-1">
                <h3 className="font-bold text-lg text-white mb-1">{req.title} <span className="text-xs bg-slate-800 px-2 py-1 rounded text-slate-400 ml-2">ID: {req.id.slice(0,8)}</span></h3>
                <p className="text-sm text-slate-400 mb-3"><strong>Organisateur :</strong> {req.profiles?.name} ({req.profiles?.email})</p>
                <div className="bg-red-900/20 border justify-center border-red-500/20 p-3 rounded-xl text-sm italic text-red-200">
                  "{req.cancellation_reason}"
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => handleRejectCancel(req.id)} className="px-4 py-2 border border-slate-700 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold transition">Refuser</button>
                <button onClick={() => handleApproveCancel(req.id, req.title)} className="px-4 py-2 border border-red-500 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-bold transition shadow-lg shadow-red-500/20">Approuver & Rembourser</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeSubTab === 'pending' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-slate-900/50 p-4 border border-white/10 rounded-2xl">
            <span className="text-slate-300 font-bold">{pendingRefunds.length} transactions à rembourser manuellement</span>
            <button onClick={exportPendingRefunds} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-4 py-2 text-white font-bold rounded-xl text-sm"><Download size={16}/> Exporter CSV (Batch)</button>
          </div>
          
          <div className="overflow-x-auto bg-slate-900/50 rounded-3xl border border-white/10">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-800/80 uppercase text-xs font-bold text-slate-400">
                <tr>
                  <th className="px-4 py-3">Tx ID</th>
                  <th className="px-4 py-3">Événement</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3">Montant</th>
                  <th className="px-4 py-3">Acheteur (Tel / Email)</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {pendingRefunds.map(t => (
                  <tr key={t.id} className="hover:bg-white/5">
                    <td className="px-4 py-3 font-mono text-[10px] text-slate-500">{t.id}</td>
                    <td className="px-4 py-3 text-white font-medium">{t.events?.title || '—'}</td>
                    <td className="px-4 py-3 font-bold text-orange-400">{t.method}</td>
                    <td className="px-4 py-3 font-bold text-emerald-400">{t.amount?.toLocaleString('fr-FR')} F</td>
                    <td className="px-4 py-3 text-xs leading-relaxed max-w-[200px] truncate">{t.guest_name} <br/> <span className="text-slate-500">{t.buyer_phone || t.guest_email}</span></td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => markAsRefunded(t.id)} className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 rounded-lg text-xs font-bold transition">Marqué Remboursé</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pendingRefunds.length === 0 && <div className="p-8 text-center text-slate-500 font-medium">Tout est en règle. Rien à rembourser.</div>}
          </div>
        </div>
      )}
    </div>
  );
};





