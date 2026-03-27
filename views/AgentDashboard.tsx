import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { UserRole, Event } from '../types';
import { formatCurrency } from '../constants';
import { QrCode, LogOut, Banknote, Search, ShieldCheck, Star, Users, CheckCircle, Loader2 } from 'lucide-react';

export const AgentDashboard = () => {
    const navigate = useNavigate();
    const [events, setEvents] = useState<Event[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

    // Form POS (Point of Sale)
    const [buyerContact, setBuyerContact] = useState('');
    const [ticketQuantity, setTicketQuantity] = useState(1);
    const [ticketType, setTicketType] = useState<'standard' | 'vip'>('standard');
    const [processingSale, setProcessingSale] = useState(false);
    const [saleSuccess, setSaleSuccess] = useState(false);

    // Agent Data from localStorage (set during login)
    const [agent, setAgent] = useState({ name: "Agent Inconnu", collectedCash: 0 });

    useEffect(() => {
        const stored = localStorage.getItem('afritix_current_agent');
        if (stored) {
            setAgent({ ...JSON.parse(stored), collectedCash: 0 });
        }
    }, []);

    useEffect(() => {
        const fetchEvents = async () => {
            const { data } = await supabase.from('events').select('*').limit(3);
            if (data) {
                setEvents(data as Event[]);
                setSelectedEvent(data[0] as Event);
            }
            setLoading(false);
        };
        fetchEvents();
    }, []);

    const calculateTotal = () => {
        if (!selectedEvent) return 0;
        return ticketType === 'standard'
            ? selectedEvent.price * ticketQuantity
            : (selectedEvent.price * 2.5) * ticketQuantity;
    };

    const handleCashSale = async (e: React.FormEvent) => {
        e.preventDefault();
        setProcessingSale(true);

        try {
            // 1. Simuler l'enregistrement de la transaction (is_cash = true)
            // 2. Simuler la création du billet JWS Inviolable
            // 3. Simuler l'envoi du SMS/WhatsApp

            await new Promise(resolve => setTimeout(resolve, 2000));
            setSaleSuccess(true);
            setBuyerContact('');
            setTicketQuantity(1);

            // Hide success after 3s
            setTimeout(() => setSaleSuccess(false), 3000);

        } catch (error) {
            console.error(error);
        } finally {
            setProcessingSale(false);
        }
    };

    if (loading) return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><Loader2 className="animate-spin text-fuchsia-500" size={40} /></div>;

    return (
        <div className="min-h-screen bg-[#0f172a] text-slate-50 flex flex-col md:flex-row pb-24 md:pb-0">
            {/* Sidebar / Topbar Agent */}
            <div className="w-full md:w-80 bg-slate-800/50 border-b md:border-b-0 md:border-r border-slate-700 p-6 flex flex-col">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h2 className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-400">
                            Guichet POS
                        </h2>
                        <p className="text-sm text-slate-400">Agent: {agent.name}</p>
                    </div>
                    <button onClick={() => { localStorage.removeItem('afritix_current_agent'); navigate('/agent/login') }} className="p-2 bg-slate-800 rounded-full hover:bg-slate-700">
                        <LogOut size={18} className="text-rose-400" />
                    </button>
                </div>

                <div className="bg-gradient-to-br from-emerald-600/20 to-teal-600/20 border border-emerald-500/30 rounded-2xl p-6 mb-8 text-center shadow-[0_0_30px_rgba(16,185,129,0.1)]">
                    <p className="text-slate-400 text-sm font-semibold mb-1 uppercase tracking-wider">Caisse Cash</p>
                    <p className="text-3xl font-black text-emerald-400">{formatCurrency(agent.collectedCash)}</p>
                    <p className="text-xs text-emerald-500/80 mt-2 flex items-center justify-center gap-1">
                        <ShieldCheck size={12} /> Sécurisé
                    </p>
                </div>

                <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar hidden md:block">
                    <h3 className="text-sm font-bold text-slate-400 uppercase mb-4">Événements Assignés</h3>
                    {events.map(ev => (
                        <div
                            key={ev.id}
                            onClick={() => setSelectedEvent(ev)}
                            className={`p-4 rounded-xl cursor-pointer transition-all ${selectedEvent?.id === ev.id ? 'bg-emerald-500/20 border border-emerald-500/50' : 'bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50'}`}
                        >
                            <h4 className="font-bold text-sm truncate">{ev.title}</h4>
                            <p className="text-xs text-slate-400 mt-1">{new Date(ev.date).toLocaleDateString()}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Terminal View */}
            <div className="flex-1 p-4 md:p-8 flex items-center justify-center overflow-y-auto">
                <div className="w-full max-w-lg">

                    {saleSuccess && (
                        <div className="mb-6 bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 p-4 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
                            <CheckCircle size={24} />
                            <div>
                                <p className="font-bold">Transaction Réussie !</p>
                                <p className="text-sm opacity-90">Le billet a été envoyé par SMS/WhatsApp.</p>
                            </div>
                        </div>
                    )}

                    <form onSubmit={handleCashSale} className="bg-slate-800/40 backdrop-blur-xl border border-slate-700 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
                        {/* Status Header */}
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />

                        <div className="text-center mb-8">
                            <div className="inline-flex w-16 h-16 rounded-2xl bg-slate-800 border-2 border-slate-700 items-center justify-center mb-4 shadow-inner">
                                <QrCode size={32} className="text-emerald-400" />
                            </div>
                            <h1 className="text-2xl font-black mb-1">Caisse Rapide</h1>
                            <p className="text-slate-400">{selectedEvent?.title}</p>
                        </div>

                        {/* Contact Field */}
                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="block text-sm font-bold text-slate-400 mb-2">Contact de l'acheteur (SMS/WhatsApp)</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        required
                                        placeholder="Ex: +225 01 02 03 04"
                                        value={buyerContact}
                                        onChange={(e) => setBuyerContact(e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 pl-11 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                                    />
                                    <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                                </div>
                            </div>

                            {/* Ticket Type Toggle */}
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setTicketType('standard')}
                                    className={`p-3 rounded-xl border flex flex-col items-center justify-center transition-all ${ticketType === 'standard' ? 'bg-slate-700 border-emerald-500/50 text-white shadow-[0_0_15px_rgba(16,185,129,0.15)]' : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:bg-slate-800'}`}
                                >
                                    <Users size={20} className="mb-1" />
                                    <span className="font-bold text-sm">Standard</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setTicketType('vip')}
                                    className={`p-3 rounded-xl border flex flex-col items-center justify-center transition-all ${ticketType === 'vip' ? 'bg-gradient-to-br from-amber-600/20 to-orange-600/20 border-amber-500/50 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.15)]' : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:bg-slate-800'}`}
                                >
                                    <Star size={20} className="mb-1" />
                                    <span className="font-bold text-sm">VIP</span>
                                </button>
                            </div>

                            {/* Quantity */}
                            <div className="flex items-center justify-between bg-slate-900 rounded-xl border border-slate-800 p-2">
                                <button type="button" onClick={() => setTicketQuantity(Math.max(1, ticketQuantity - 1))} className="w-10 h-10 rounded-lg bg-slate-800 font-bold hover:bg-slate-700 transition">-</button>
                                <span className="font-bold text-lg">{ticketQuantity}</span>
                                <button type="button" onClick={() => setTicketQuantity(ticketQuantity + 1)} className="w-10 h-10 rounded-lg bg-slate-800 font-bold hover:bg-slate-700 transition">+</button>
                            </div>
                        </div>

                        {/* Total & Submit */}
                        <div className="pt-6 border-t border-slate-800">
                            <div className="flex items-end justify-between mb-6">
                                <span className="text-slate-400 font-semibold">À encaisser (Cash)</span>
                                <span className="text-3xl font-black text-white">{formatCurrency(calculateTotal())}</span>
                            </div>

                            <button
                                type="submit"
                                disabled={processingSale || !buyerContact}
                                className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 text-lg transition-all ${processingSale ? 'bg-emerald-600/50 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)]'}`}
                            >
                                {processingSale ? (
                                    <><Loader2 size={24} className="animate-spin" /> Enregistrement...</>
                                ) : (
                                    <><Banknote size={24} /> Valider l'Encaissement</>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};
