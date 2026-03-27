import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QrCode, Lock, ArrowRight, Loader2, UserSquare } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import { supabase } from '../supabaseClient';

export const AgentLogin: React.FC = () => {
    const [agentCode, setAgentCode] = useState('');
    const [pin, setPin] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const { setRole } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            // Utilisation de la fonction RPC sécurisée (SECURITY DEFINER)
            // Cette fonction vérifie les identifiants côté serveur et contourne le RLS.
            const { data, error: rpcError } = await supabase.rpc('agent_login', {
                p_agent_code: agentCode.toUpperCase(),
                p_pin: pin,
            });

            if (rpcError) {
                throw new Error(rpcError.message || 'Erreur serveur lors de la connexion.');
            }

            if (!data || data.success === false) {
                throw new Error(data?.error || 'Identifiant Agent ou Code PIN invalide.');
            }

            const agent = data.agent;

            // Connexion réussie — redirection selon le type d'agent
            setRole(UserRole.STAFF);
            localStorage.setItem('afritix_user_role', UserRole.STAFF);
            localStorage.setItem('afritix_current_agent', JSON.stringify(agent));
            setLoading(false);

            // 🏪 Agent POS → interface de vente terrain
            // 📱 Agent Scanneur → interface de scan des billets à l'entrée
            if (agent.agent_type === 'SCANNER') {
                navigate('/scanner');
            } else {
                navigate('/agent');
            }

        } catch (err: any) {
            setError(err.message || 'Identifiant Agent ou Code PIN invalide.');
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 relative overflow-hidden">
            <div className="absolute top-[-10%] right-[-5%] w-96 h-96 bg-emerald-500/20 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute bottom-[-10%] left-[-5%] w-96 h-96 bg-teal-600/20 rounded-full blur-[100px] pointer-events-none" />

            <div className="w-full max-w-md bg-slate-900/80 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-white/10 relative z-10">
                <div className="flex justify-center mb-6">
                    <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center border border-emerald-500/30">
                        <QrCode className="text-emerald-500" size={32} />
                    </div>
                </div>

                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold text-white mb-2">Terminal Agent</h1>
                    <p className="text-slate-400">Scanner & Guichet Babipass</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">ID Agent / Scanner</label>
                        <div className="relative">
                            <UserSquare className="absolute left-4 top-3.5 text-slate-500" size={20} />
                            <input
                                type="text"
                                value={agentCode}
                                onChange={(e) => setAgentCode(e.target.value.toUpperCase())}
                                className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all uppercase"
                                placeholder="ex: AGT-102"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Code PIN (4 chiffres)</label>
                        <div className="relative">
                            <Lock className="absolute left-4 top-3.5 text-slate-500" size={20} />
                            <input
                                type="password"
                                maxLength={4}
                                pattern="\d{4}"
                                value={pin}
                                onChange={(e) => setPin(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono tracking-widest"
                                placeholder="••••"
                                required
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm text-center">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading || !agentCode || pin.length !== 4}
                        className="w-full mt-4 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold py-3.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed group"
                    >
                        {loading ? (
                            <Loader2 className="animate-spin" size={20} />
                        ) : (
                            <>
                                Ouvrir le Guichet
                                <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
};
