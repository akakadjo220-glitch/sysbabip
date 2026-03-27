import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Lock, ArrowRight, Loader2, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import { supabase } from '../supabaseClient';

export const AdminLogin: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const { setRole } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            // 1. Authentification Supabase standard
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (authError || !authData.user) {
                throw new Error(authError?.message || "Identifiants incorrects.");
            }

            // 2. Vérification stricte du rôle dans la table profiles
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('role, status')
                .eq('id', authData.user.id)
                .single();

            console.log("Profil Admin vérifié:", profile);

            if (profileError || !profile) {
                supabase.auth.signOut();
                throw new Error("Profil introuvable ou droits insuffisants.");
            }

            if (profile.role !== 'ADMIN') {
                supabase.auth.signOut();
                throw new Error(`Accès refusé. Rôle actuel: ${profile.role}. Vous n'avez pas les droits d'administration.`);
            }

            if (profile.status !== 'active') {
                supabase.auth.signOut();
                throw new Error("Votre compte administrateur est suspendu ou inactif.");
            }

            // 3. Connexion réussie
            setRole(UserRole.ADMIN);
            localStorage.setItem('afritix_user_role', 'ADMIN');
            navigate('/admin');

        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Erreur lors de la connexion.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 relative overflow-hidden">
            {/* Background décors */}
            <div className="absolute top-[-10%] right-[-5%] w-96 h-96 bg-amber-500/20 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute bottom-[-10%] left-[-5%] w-96 h-96 bg-orange-600/20 rounded-full blur-[100px] pointer-events-none" />

            <div className="w-full max-w-md bg-slate-900/80 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-white/10 relative z-10">
                <div className="flex justify-center mb-6">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center overflow-hidden border border-amber-500/30">
                        <img src="https://supabasekong-l4cw40oks4kso84ko44ogkkw.188.241.58.227.sslip.io/storage/v1/object/public/events/verso.png" alt="Babipass Logo" className="w-full h-full object-contain" />
                    </div>
                </div>

                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold text-white mb-2">Accès Administrateur</h1>
                    <p className="text-slate-400">Système central Babipass</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Adresse Email</label>
                        <div className="relative">
                            <Mail className="absolute left-4 top-3.5 text-slate-500" size={20} />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all cursor-text font-mono"
                                placeholder="admin@domain.com"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Mot de passe</label>
                        <div className="relative">
                            <Lock className="absolute left-4 top-3.5 text-slate-500" size={20} />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-mono tracking-widest cursor-text"
                                placeholder="••••••••"
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
                        disabled={loading || !email || !password}
                        className="w-full mt-4 bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-500 hover:to-orange-400 text-white font-bold py-3.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-500/25 disabled:opacity-50 disabled:cursor-not-allowed group"
                    >
                        {loading ? (
                            <Loader2 className="animate-spin" size={20} />
                        ) : (
                            <>
                                Déverrouiller le système
                                <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-8 pt-6 border-t border-white/5 text-center">
                    <p className="text-xs text-slate-500 flex items-center justify-center gap-1">
                        <Shield size={12} /> Espace hyper-sécurisé. Toute tentative d'accès non autorisé est journalisée.
                    </p>
                </div>
            </div>
        </div>
    );
};
