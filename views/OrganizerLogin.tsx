import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, Phone, ArrowRight, Loader2, Calendar, ShieldCheck } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { SERVER_URL } from '../config';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import { EmailService } from '../services/EmailService';
import { WhatsAppService } from '../services/WhatsAppService';
import { AccountService } from '../services/AccountService';
import { getCountryDialCode } from '../utils/countryCodes';

export const OrganizerLogin = () => {
    const [isPhoneMode, setIsPhoneMode] = useState(false);
    const [isSignUp, setIsSignUp] = useState(false);
    const [isResetMode, setIsResetMode] = useState(false);
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [countryCode, setCountryCode] = useState('+225');
    const [dialOptions, setDialOptions] = useState<{ code: string, flag: string, rawCode: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    // OTP Auth states
    const [otpStep, setOtpStep] = useState(false);
    const [otpCode, setOtpCode] = useState('');
    const [resetStep, setResetStep] = useState(false);
    const [resolvedResetEmail, setResolvedResetEmail] = useState(''); // Email réel trouvé en base lors du reset

    const navigate = useNavigate();
    const { user, handleLogout, setRole } = useAuth();

    const getFlagEmoji = (countryCode: string) => {
        try {
            const codePoints = countryCode
                .toUpperCase()
                .split('')
                .map(char => 127397 + char.charCodeAt(0));
            return String.fromCodePoint(...codePoints);
        } catch (e) { return countryCode; }
    };

    useEffect(() => {
        const loadCountries = async () => {
            try {
                const { data } = await supabase.from('supported_countries').select('name, code').eq('is_active', true).order('name');
                if (data && data.length > 0) {
                    const options = await Promise.all(data.map(async (c) => {
                        const dial = await getCountryDialCode(c.code);
                        return { code: dial || '+225', flag: getFlagEmoji(c.code), rawCode: c.code };
                    }));

                    // Filter out duplicates (if any) and set dialOptions
                    const uniqueOptions = options.reduce((acc, current) => {
                        const x = acc.find((item: any) => item.code === current.code);
                        if (!x) return acc.concat([current]);
                        return acc;
                    }, [] as any[]);

                    setDialOptions(uniqueOptions);
                    if (uniqueOptions.length > 0 && countryCode === '+225') {
                        // Keep +225 if it's there as default, or select the first available
                        const hasDefault = uniqueOptions.find((o: any) => o.code === '+225');
                        if (!hasDefault) setCountryCode(uniqueOptions[0].code);
                    }
                }
            } catch (err) { console.error("Could not fetch countries for dial codes", err); }
        };
        loadCountries();
    }, []);

    const getFullPhone = (val: string) => `${countryCode}${val}`; // Pas de suppression du 0 : +2250544246972 est le bon format CI
    const getFormattedIdentifier = () => isPhoneMode ? `${getFullPhone(identifier)}@organizer.babipass.local` : identifier;

    // Le code est généré, stocké et envoyé (email + WhatsApp) par le serveur ;
    // il n'est jamais visible ni vérifiable depuis le navigateur.
    // Pour « reset », le serveur n'envoie qu'aux coordonnées enregistrées du compte.
    const requestVerification = async (email: string, targetPhone?: string, purpose: 'signup' | 'reset' = 'signup') => {
        const res = await fetch(`${SERVER_URL}/api/auth/otp/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email,
                purpose,
                phone: purpose === 'signup' && targetPhone ? targetPhone.replace(/\s/g, '') : undefined
            })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
            throw new Error(data.error || "Impossible d'envoyer le code de vérification.");
        }
    };

    const verifyOtpAndSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const formattedIdentifier = getFormattedIdentifier();

            // Vérification du code côté serveur (expiration + nombre d'essais limités)
            const otpRes = await fetch(`${SERVER_URL}/api/auth/otp/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: formattedIdentifier, code: otpCode, purpose: 'signup' })
            });
            const otpData = await otpRes.json().catch(() => ({}));
            if (!otpRes.ok || !otpData.success) {
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
                    name: isPhoneMode ? getFullPhone(identifier) : identifier.split('@')[0],
                    phone: isPhoneMode ? getFullPhone(identifier) : getFullPhone(phoneNumber),
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
            let formattedIdentifier: string;

            if (isPhoneMode) {
                // Chercher le vrai email en base en testant plusieurs formats du numéro
                const rawInput = identifier.trim();
                const resolvedEmail = await AccountService.resolvePhone(rawInput, getFullPhone(rawInput));

                if (!resolvedEmail) {
                    throw new Error("Aucun compte trouvé avec ce numéro. Vérifiez votre numéro et l'indicatif sélectionné.");
                }

                formattedIdentifier = resolvedEmail;
                setResolvedResetEmail(resolvedEmail); // Mémoriser pour l'étape de confirmation
                console.log('[Reset] Compte trouvé :', formattedIdentifier);
            } else {
                formattedIdentifier = identifier;
            }

            // Envoyer le code OTP (WhatsApp + Email)
            await requestVerification(formattedIdentifier, undefined, 'reset');
            setResetStep(true);
            setSuccessMsg("Code de réinitialisation envoyé ! Vérifiez vos messages WhatsApp ou email.");
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
            // Utiliser l'email réel résolu lors de la demande de reset (évite les incohérences de format)
            const formattedIdentifier = resolvedResetEmail || getFormattedIdentifier();
            console.log('[ResetConfirm] Email utilisé:', formattedIdentifier);

            const res = await fetch(`${SERVER_URL}/api/auth/reset-password`, {
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
            let errorMessage = err.message || "Code incorrect.";
            if (errorMessage.includes("Invalid login credentials") || errorMessage.includes("Email not confirmed")) {
                errorMessage = "Identifiants incorrects ou numéro introuvable.";
            }
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const formattedIdentifier = getFormattedIdentifier();

            if (isSignUp) {
                // Vérifier si ce numéro/email est déjà enregistré
                const rawInput = identifier.trim();
                const accountExists = isPhoneMode
                    ? await AccountService.exists({ phone: rawInput, fullPhone: getFullPhone(rawInput) })
                    : await AccountService.exists({ email: formattedIdentifier });

                if (accountExists) {
                    throw new Error("Ce numéro/email est déjà inscrit. Veuillez vous connecter ou utiliser \"Mot de passe oublié\".");
                }

                // Étape 1: Au lieu de signUp directement, demander vérification email (+ WhatsApp si mode téléphone)
                await requestVerification(formattedIdentifier, isPhoneMode ? getFullPhone(identifier) : getFullPhone(phoneNumber));
                setOtpStep(true);
            } else {
                // Connexion : résoudre le vrai email stocké en base si mode téléphone
                let loginEmail = formattedIdentifier;

                if (isPhoneMode) {
                    const rawInput = identifier.trim();
                    const resolvedEmail = await AccountService.resolvePhone(rawInput, getFullPhone(rawInput));

                    if (!resolvedEmail) {
                        throw new Error("Aucun compte trouvé avec ce numéro de téléphone.");
                    }
                    loginEmail = resolvedEmail;
                }

                // Connexion avec le vrai email résolu
                const { data, error } = await supabase.auth.signInWithPassword({
                    email: loginEmail,
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
            let errorMessage = err.message || "Identifiants incorrects. Veuillez réessayer.";
            if (errorMessage.includes("Invalid login credentials") || errorMessage.includes("Email not confirmed")) {
                errorMessage = "Identifiants incorrects ou numéro introuvable.";
            }
            setError(errorMessage);
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
                        <img src="https://insforgeinst.site/images/2026/07/09/log-babipass.png" alt="Babipass Logo" className="w-full h-full object-contain p-2" />
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
                        <div className="w-28 h-28 md:w-24 md:h-24 rounded-2xl overflow-hidden shadow-lg shadow-orange-500/20 mb-3">
                            <img src="https://insforgeinst.site/images/2026/07/09/log-babipass.png" alt="Babipass" className="w-full h-full object-contain p-1" />
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
                                        {!isPhoneMode && <Mail className="absolute left-4 top-3.5 text-slate-500" size={20} />}
                                        {isPhoneMode ? (
                                            <div className="flex w-full">
                                                <select
                                                    value={countryCode}
                                                    onChange={(e) => setCountryCode(e.target.value)}
                                                    className="bg-slate-900/60 border border-slate-700 rounded-l-xl pl-3 pr-8 py-3 text-slate-300 focus:outline-none focus:border-orange-500 transition-all border-r-0 cursor-pointer text-sm w-[100px]"
                                                >
                                                    {dialOptions.length > 0 ? dialOptions.map(opt => (
                                                        <option key={opt.code + opt.rawCode + '1'} value={opt.code}>{opt.code} {opt.flag}</option>
                                                    )) : (
                                                        <option value="+225">+225 🇨🇮</option>
                                                    )}
                                                </select>
                                                <input
                                                    type="tel"
                                                    value={identifier}
                                                    onChange={(e) => setIdentifier(e.target.value)}
                                                    placeholder="0777 00 00 00"
                                                    className="flex-1 w-full bg-slate-900/60 border border-slate-700 rounded-r-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                                                    required
                                                />
                                            </div>
                                        ) : (
                                            <input
                                                type="email"
                                                value={identifier}
                                                onChange={(e) => setIdentifier(e.target.value)}
                                                placeholder="organisateur@afritix.com"
                                                className="w-full bg-slate-900/60 border border-slate-700 rounded-xl pl-12 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                                                required
                                            />
                                        )}
                                    </div>
                                </div>

                                {!isResetMode && isSignUp && !isPhoneMode && (
                                    <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                        <label className="block text-sm font-medium text-slate-300 mb-2">
                                            Numéro WhatsApp / Téléphone
                                        </label>
                                        <div className="relative flex w-full">
                                            <select
                                                value={countryCode}
                                                onChange={(e) => setCountryCode(e.target.value)}
                                                className="bg-slate-900/60 border border-slate-700 rounded-l-xl pl-3 pr-8 py-3 text-slate-300 focus:outline-none focus:border-orange-500 transition-all border-r-0 cursor-pointer text-sm w-[100px]"
                                            >
                                                {dialOptions.length > 0 ? dialOptions.map(opt => (
                                                    <option key={opt.code + opt.rawCode + '2'} value={opt.code}>{opt.code} {opt.flag}</option>
                                                )) : (
                                                    <option value="+225">+225 🇨🇮</option>
                                                )}
                                            </select>
                                            <input
                                                type="tel"
                                                value={phoneNumber}
                                                onChange={(e) => setPhoneNumber(e.target.value)}
                                                placeholder="0777 00 00 00"
                                                className="flex-1 w-full bg-slate-900/60 border border-slate-700 rounded-r-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
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
                                            const formattedIdentifier = getFormattedIdentifier();
                                            try {
                                                await requestVerification(formattedIdentifier, isPhoneMode ? getFullPhone(identifier) : getFullPhone(phoneNumber));
                                                setSuccessMsg("Nouveau code envoyé !");
                                            } catch (err: any) {
                                                setError(err.message);
                                            }
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
