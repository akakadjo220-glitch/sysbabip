import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, Phone, ArrowRight, Loader2, Calendar, ShieldCheck } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import { EmailService } from '../services/EmailService';

export const OrganizerLogin = () => {
    const [isPhoneMode, setIsPhoneMode] = useState(false);
    const [isSignUp, setIsSignUp] = useState(false);
    const [isResetMode, setIsResetMode] = useState(false);
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    // OTP Auth states
    const [otpStep, setOtpStep] = useState(false);
    const [otpCode, setOtpCode] = useState('');
    const [resetStep, setResetStep] = useState(false);

    const navigate = useNavigate();
    const { user, handleLogout, setRole } = useAuth();

    const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

    const requestVerification = async (email: string) => {
        const code = generateOTP();

        // On supprime tout ancien OTP pour cet email (permet de contourner l'absence de politique UPDATE)
        await supabase.from('auth_otps').delete().eq('email', email);

        // Puis on insère le nouveau code
        const { error: otpError } = await supabase.from('auth_otps').insert([{
            email,
            otp_code: code
        }]);

        if (otpError) {
            console.error("Erreur d'insertion OTP:", otpError);
            throw new Error(`Impossible d'enregistrer l'OTP dans la base de données: ${otpError.message}`);
        }

        // 2. Envoyer le mail depuis le navigateur vers notre relai SMTP Node.js via le nouveau système de template
        const emailData = await EmailService.buildFromTemplate('welcome_otp', {
            otpCode: code,
            recipientEmail: email
        });

        try {
            // Appel au microservice
            await EmailService.sendTicketEmail(email, emailData.subject, emailData.html);
        } catch (e) {
            console.error("Échec de l'envoi d'email via le service", e);
        }

        return code;
    };

    const verifyOtpAndSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const formattedIdentifier = isPhoneMode ? `${identifier}@organizer.afritix.local` : identifier;

            // Dans une vraie app, on vérifie contre la base de données. 
            // Ici pour le mock UX on vérifie si ça existe dans auth_otps côté db
            const { data: otpData } = await supabase
                .from('auth_otps')
                .select('*')
                .eq('email', formattedIdentifier)
                .eq('otp_code', otpCode)
                .maybeSingle();

            if (!otpData && otpCode !== '123456') { // fallback de démo
                throw new Error("Code de vérification invalide ou expiré.");
            }

            // Inscription finale via GoTrue
            const { data: authData, error: signUpError } = await supabase.auth.signUp({
                email: formattedIdentifier,
                password,
                options: { data: { role: 'ORGANIZER' } }
            });

            if (signUpError) throw signUpError;

            // Insertion dans la table profiles (visibilité Admin)
            if (authData?.user) {
                await supabase.from('profiles').upsert([{
                    id: authData.user.id,
                    email: formattedIdentifier,
                    name: isPhoneMode ? identifier : identifier.split('@')[0],
                    phone: isPhoneMode ? identifier : phoneNumber,
                    role: 'ORGANIZER',
                    status: 'pending' // L'organisateur doit être approuvé
                }], { onConflict: 'id' });
            }

            // Tentative de connexion automatique si la session n'est pas fournie (ex: confirmation email activée)
            if (authData && !authData.session) {
                const { error: signInError } = await supabase.auth.signInWithPassword({
                    email: formattedIdentifier,
                    password
                });
                if (signInError) {
                    throw new Error(`Inscription réussie, mais connexion impossible: ${signInError.message}. (Si "Confirm Email" est activé dans Supabase, veuillez le désactiver pour ce flux personnalisé).`);
                }
            }

            // Nettoyage de l'OTP
            await supabase.from('auth_otps').delete().eq('email', formattedIdentifier);

            setSuccessMsg("Inscription validée avec succès ! Redirection...");
            setRole(UserRole.ORGANIZER);
            localStorage.setItem('afritix_user_role', 'ORGANIZER');

            setTimeout(() => navigate('/organizer'), 1500);

        } catch (err: any) {
            setError(err.message || "Code OTP incorrect. Veuillez réessayer.");
        } finally {
            setLoading(false);
        }
    };

    const handleResetPasswordRequest = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccessMsg('');

        try {
            const formattedIdentifier = isPhoneMode ? `${identifier}@organizer.afritix.local` : identifier;
            await requestVerification(formattedIdentifier);
            setResetStep(true);
            setSuccessMsg("Code de réinitialisation envoyé ! Vérifiez vos messages.");
        } catch (err: any) {
            setError(err.message || "Erreur lors de l'envoi du code.");
        } finally {
            setLoading(false);
        }
    };

    const handleResetPasswordConfirm = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const formattedIdentifier = isPhoneMode ? `${identifier}@organizer.afritix.local` : identifier;

            const res = await fetch('https://qg4skow800g8kookksgswsg4.188.241.58.227.sslip.io/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: formattedIdentifier, otp_code: otpCode, new_password: password })
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || "Erreur serveur : n'oubliez pas d'ajouter SUPABASE_SERVICE_ROLE_KEY dans Coolify.");
            }

            setSuccessMsg("Mot de passe modifié avec succès ! Connexion...");
            
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: formattedIdentifier,
                password
            });
            if (signInError) throw signInError;

            setRole(UserRole.ORGANIZER);
            localStorage.setItem('afritix_user_role', 'ORGANIZER');
            setTimeout(() => navigate('/organizer'), 1500);
        } catch (err: any) {
            setError(err.message || "Code incorrect.");
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const formattedIdentifier = isPhoneMode ? `${identifier}@organizer.afritix.local` : identifier;

            if (isSignUp) {
                // Étape 1: Au lieu de signUp directement, demander vérification email
                await requestVerification(formattedIdentifier);
                setOtpStep(true);
            } else {
                // Connexion standards (SignInWithPassword)
                const { data, error } = await supabase.auth.signInWithPassword({
                    email: formattedIdentifier,
                    password,
                });

                if (error) {
                    throw error;
                }

                if (data.user) {
                    setRole(UserRole.ORGANIZER);
                    localStorage.setItem('afritix_user_role', 'ORGANIZER');
                    navigate('/organizer');
                }
            }
        } catch (err: any) {
            console.error(err);
            setError(err.message || "Identifiants incorrects. Veuillez réessayer.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0f172a] flex">
            {/* Left side: Animated branding */}
            <div className="hidden lg:flex flex-1 relative bg-orange-900 overflow-hidden items-center justify-center">
                <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1540039155732-684736733f11?q=80&w=2000&auto=format&fit=crop')] bg-cover bg-center opacity-20 mix-blend-overlay"></div>
                <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] via-[#0f172a]/80 to-transparent"></div>

                <div className="relative z-10 p-12 max-w-2xl text-center space-y-6">
                    <div className="inline-flex items-center justify-center w-36 h-36 bg-orange-500/10 rounded-3xl border-2 border-orange-400/30 backdrop-blur-xl shadow-2xl mb-6 overflow-hidden">
                        <img src="https://supabasekong-l4cw40oks4kso84ko44ogkkw.188.241.58.227.sslip.io/storage/v1/object/public/events/verso.png" alt="Babipass Logo" className="w-full h-full object-contain p-2" />
                    </div>
                    <h1 className="text-5xl font-black text-white leading-tight drop-shadow-2xl">
                        Gérez vos événements <br />avec <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-400">Babipass Pro</span>
                    </h1>
                    <p className="text-xl text-indigo-200 font-light leading-relaxed">
                        Accédez à votre tableau de bord organisateur, suivez vos ventes en temps réel, communiquez avec vos participants via WhatsApp et gérez vos entrées.
                    </p>
                </div>
            </div>

            {/* Right side: Login form */}
            <div className="w-full lg:w-[600px] flex items-center justify-center p-8 relative z-20">
                <div className="w-full max-w-md space-y-8 animate-in slide-in-from-right-8 fade-in duration-500">

                    <div className="flex flex-col items-center mb-2">
                        <div className="w-20 h-20 rounded-2xl overflow-hidden shadow-lg shadow-orange-500/20 mb-3">
                            <img src="https://supabasekong-l4cw40oks4kso84ko44ogkkw.188.241.58.227.sslip.io/storage/v1/object/public/events/verso.png" alt="Babipass" className="w-full h-full object-contain" />
                        </div>
                        <h2 className="text-3xl font-bold text-white mb-1">
                            {isResetMode ? "Mot de passe oublié" : isSignUp ? "Créer un compte" : "Espace Organisateur"}
                        </h2>
                        <p className="text-slate-400 text-center">
                            {isResetMode ? `Saisissez votre ${isPhoneMode ? 'téléphone' : 'email'} pour réinitialiser.` : isSignUp ? "Rejoignez Babipass Pro pour créer vos événements." : "Connectez-vous à votre tableau de bord."}
                        </p>
                    </div>

                    <div className="bg-[#1e293b]/80 backdrop-blur-xl border border-white/10 p-1 rounded-xl flex">
                        <button
                            onClick={() => { setIsPhoneMode(false); setIdentifier(''); }}
                            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${!isPhoneMode ? 'bg-orange-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'
                                }`}
                        >
                            Email
                        </button>
                        <button
                            onClick={() => { setIsPhoneMode(true); setIdentifier(''); }}
                            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${isPhoneMode ? 'bg-orange-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'
                                }`}
                        >
                            Téléphone
                        </button>
                    </div>

                    <form onSubmit={isResetMode ? (resetStep ? handleResetPasswordConfirm : handleResetPasswordRequest) : (otpStep ? verifyOtpAndSignUp : handleSubmit)} className="space-y-6">
                        {error && (
                            <div className="bg-red-500/10 border border-red-500/50 text-red-500 text-sm p-4 rounded-xl">
                                {error}
                            </div>
                        )}
                        {successMsg && (
                            <div className="bg-emerald-500/10 border border-emerald-500/50 text-emerald-500 text-sm p-4 rounded-xl">
                                {successMsg}
                            </div>
                        )}

                        {!otpStep && !resetStep ? (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">
                                        {isPhoneMode ? "Numéro WhatsApp" : "Adresse Email"}
                                    </label>
                                    <div className="relative">
                                        {isPhoneMode ? <Phone className="absolute left-4 top-3.5 text-slate-500" size={20} /> : <Mail className="absolute left-4 top-3.5 text-slate-500" size={20} />}
                                        <input
                                            type={isPhoneMode ? "tel" : "email"}
                                            value={identifier}
                                            onChange={(e) => setIdentifier(e.target.value)}
                                            placeholder={isPhoneMode ? "+225 01 23 45 67" : "organisateur@afritix.com"}
                                            className="w-full bg-slate-900/60 border border-slate-700 rounded-xl pl-12 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                                            required
                                        />
                                    </div>
                                </div>

                                {!isResetMode && isSignUp && !isPhoneMode && (
                                    <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                        <label className="block text-sm font-medium text-slate-300 mb-2">
                                            Numéro WhatsApp / Téléphone
                                        </label>
                                        <div className="relative">
                                            <Phone className="absolute left-4 top-3.5 text-slate-500" size={20} />
                                            <input
                                                type="tel"
                                                value={phoneNumber}
                                                onChange={(e) => setPhoneNumber(e.target.value)}
                                                placeholder="+225 01 23 45 67"
                                                className="w-full bg-slate-900/60 border border-slate-700 rounded-xl pl-12 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                                                required
                                            />
                                        </div>
                                    </div>
                                )}

                                {!isResetMode && (
                                    <div>
                                        <div className="flex justify-between items-center mb-2">
                                            <label className="block text-sm font-medium text-slate-300">Mot de passe</label>
                                            {!isSignUp && <button type="button" onClick={() => setIsResetMode(true)} className="text-xs text-orange-400 hover:text-orange-300">Mot de passe oublié ?</button>}
                                        </div>
                                        <div className="relative">
                                            <Lock className="absolute left-4 top-3.5 text-slate-500" size={20} />
                                            <input
                                                type="password"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                placeholder="••••••••"
                                                className="w-full bg-slate-900/60 border border-slate-700 rounded-xl pl-12 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                                                required
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-4 animate-in fade-in zoom-in duration-300">
                                <div className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-xl text-center mb-6">
                                    <ShieldCheck className="mx-auto text-orange-400 mb-2" size={32} />
                                    <p className="text-sm text-slate-300">Un code à 6 chiffres a été envoyé à <strong>{identifier}</strong>.<br />Veuillez le saisir pour {isResetMode ? "réinitialiser votre mot de passe" : "valider la création de votre compte"}.</p>
                                </div>
                                <div className="relative">
                                    <input
                                        type="text"
                                        maxLength={6}
                                        value={otpCode}
                                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                                        placeholder="------"
                                        className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all text-center text-3xl tracking-[1em] font-mono"
                                        required
                                    />
                                </div>
                                {isResetMode && resetStep && (
                                    <div className="mt-4 animate-in fade-in zoom-in duration-300">
                                        <label className="block text-sm font-medium text-slate-300 mb-2">Nouveau mot de passe</label>
                                        <div className="relative">
                                            <Lock className="absolute left-4 top-3.5 text-slate-500" size={20} />
                                            <input
                                                type="password"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                placeholder="Nouveau mot de passe"
                                                className="w-full bg-slate-900/60 border border-slate-700 rounded-xl pl-12 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                                                required
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-500 text-white font-bold py-3.5 px-6 rounded-xl transition-all transform active:scale-[0.98] shadow-lg shadow-orange-600/30 flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? <Loader2 size={20} className="animate-spin" /> : (
                                <>
                                    {isResetMode ? (resetStep ? "Modifier le mot de passe" : "Recevoir le code") : isSignUp ? "S'inscrire" : "Se Connecter"} <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </button>

                        <div className="text-center mt-6">
                            {isResetMode ? (
                                <button type="button" onClick={() => { setIsResetMode(false); setResetStep(false); setOtpCode(''); }} className="text-sm font-medium text-slate-400 hover:text-white transition-colors">
                                    Retour à la connexion
                                </button>
                            ) : !otpStep ? (
                                <button
                                    type="button"
                                    onClick={() => setIsSignUp(!isSignUp)}
                                    className="text-sm font-medium text-slate-400 hover:text-white transition-colors"
                                >
                                    {isSignUp ? "Vous avez déjà un compte ? Connectez-vous" : "Nouveau sur Babipass ? S'inscrire"}
                                </button>
                            ) : (
                                <div className="space-y-4">
                                    <button
                                        type="button"
                                        disabled={loading}
                                        onClick={async () => {
                                            setLoading(true);
                                            const formattedIdentifier = isPhoneMode ? `${identifier}@organizer.afritix.local` : identifier;
                                            await requestVerification(formattedIdentifier);
                                            setSuccessMsg("Nouveau code envoyé !");
                                            setLoading(false);
                                            setTimeout(() => setSuccessMsg(''), 3000);
                                        }}
                                        className="text-sm font-medium text-orange-400 hover:text-orange-300 transition-colors block w-full"
                                    >
                                        Renvoyer le code de vérification
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setOtpStep(false)}
                                        className="text-sm font-medium text-slate-400 hover:text-white transition-colors block w-full"
                                    >
                                        Modifier l'adresse email / téléphone
                                    </button>
                                </div>
                            )}
                        </div>

                        <p className="text-center text-sm text-slate-500 mt-6 md:hidden">
                            Babipass Pro nécessite un compte approuvé.
                        </p>
                    </form>

                    <div className="absolute top-4 left-4 md:hidden">
                        <Link to="/" className="text-slate-400 hover:text-white flex items-center gap-2 text-sm font-medium">
                            Retour
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};
