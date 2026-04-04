import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Mail, Phone, Lock, ArrowRight, Loader2, Target, Gift, ExternalLink, User } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import { getCountryDialCode } from '../utils/countryCodes';

const SERVER_URL = 'https://qg4skow800g8kookksgswsg4.188.241.58.227.sslip.io';

export const AmbassadorLogin = () => {
    const [searchParams] = useSearchParams();
    const redirectUrl = searchParams.get('redirect') || '/ambassador';

    // ---- Mode: signup vs login ----
    const [isSignUp, setIsSignUp] = useState(false);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');

    // ---- Sign-up: phone number (obligatoire) ----
    const [signupPhone, setSignupPhone] = useState('');
    const [signupCountryCode, setSignupCountryCode] = useState('+225');

    // ---- Country dial codes ----
    const [dialOptions, setDialOptions] = useState<{ code: string, flag: string, rawCode: string }[]>([]);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [otpStep, setOtpStep] = useState(false);
    const [otpCode, setOtpCode] = useState('');

    const { setRole, user } = useAuth();
    const navigate = useNavigate();

    const getFlagEmoji = (countryCode: string) => {
        try {
            const codePoints = countryCode.toUpperCase().split('').map(c => 127397 + c.charCodeAt(0));
            return String.fromCodePoint(...codePoints);
        } catch { return '🌍'; }
    };

    useEffect(() => {
        const fetchCountries = async () => {
            try {
                const { data } = await supabase.from('supported_countries').select('name, code').eq('is_active', true).order('name');
                if (data && data.length > 0) {
                    const options = await Promise.all(data.map(async (c) => {
                        const dial = await getCountryDialCode(c.code);
                        return { code: dial || '+225', flag: getFlagEmoji(c.code), rawCode: c.code };
                    }));
                    const unique = options.reduce((acc, cur) => {
                        if (!acc.find((x: any) => x.code === cur.code)) return [...acc, cur];
                        return acc;
                    }, [] as any[]);
                    setDialOptions(unique);
                }
            } catch { }
        };
        fetchCountries();
    }, []);

    useEffect(() => {
        if (user && (user as any).role === UserRole.ORGANIZER) {
            setError("Les organisateurs ne peuvent pas accéder au programme Ambassadeur.");
        }
    }, [user]);

    // Build full phone for signup (stored on profile)
    const getFullSignupPhone = () => {
        let p = signupPhone.replace(/\D/g, '');
        if (p.startsWith('0')) p = p.substring(1);
        return `${signupCountryCode}${p}`;
    };

    // ── SIGNUP ────────────────────────────────────────────────────────────
    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            // Check email not already used
            const { data: existing } = await supabase
                .from('profiles')
                .select('email')
                .eq('email', email.trim().toLowerCase())
                .limit(1);

            if (existing && existing.length > 0) {
                throw new Error("Cet email est déjà associé à un compte. Veuillez vous connecter.");
            }

            // Create user in Supabase Auth (email confirmation disabled, we handle it ourselves)
            const { error: signUpError } = await supabase.auth.signUp({
                email: email.trim().toLowerCase(),
                password,
                options: {
                    emailRedirectTo: undefined,
                    data: {
                        role: 'AMBASSADOR',
                        name: fullName.trim() || email.split('@')[0],
                        phone: getFullSignupPhone(),
                    }
                }
            });

            if (signUpError) throw signUpError;

            // Send OTP via our server (branded email)
            const serverRes = await fetch(`${SERVER_URL}/api/auth/ambassador-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim().toLowerCase(), name: fullName.trim() })
            });
            const serverData = await serverRes.json();
            if (!serverData.success) throw new Error(serverData.error || "Erreur lors de l'envoi du code.");

            setOtpStep(true);
            setSuccessMsg('');
        } catch (err: any) {
            let msg = err.message || "Erreur lors de l'inscription.";
            if (msg.includes('already registered')) msg = "Cet email est déjà associé à un compte.";
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    // ── LOGIN ─────────────────────────────────────────────────────────────
    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            let loginEmail = email.trim().toLowerCase();

            const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
            if (signInError) throw signInError;

            if (data.user) {
                const { data: prof } = await supabase.from('profiles').select('role').eq('id', data.user.id).single();
                if (prof && (prof.role === 'USER' || prof.role === 'GUEST')) {
                    await supabase.from('profiles').update({ role: 'AMBASSADOR' }).eq('id', data.user.id);
                }
                setRole(UserRole.AMBASSADOR);
                localStorage.setItem('afritix_user_role', 'AMBASSADOR');
                navigate(redirectUrl);
            }
        } catch (err: any) {
            let msg = err.message || "Identifiants incorrects.";
            if (msg.includes('Invalid login credentials')) msg = "Identifiants incorrects. Vérifiez votre email et mot de passe.";
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    // ── OTP VERIFY (after signup) ─────────────────────────────────────────
    const handleVerifyOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const cleanEmail = email.trim().toLowerCase();

            // Verify OTP against our auth_otps table (set by the server)
            const { data: otpData, error: otpFetchError } = await supabase
                .from('auth_otps')
                .select('*')
                .eq('email', cleanEmail)
                .eq('otp_code', otpCode)
                .maybeSingle();

            if (otpFetchError || !otpData) {
                throw new Error("Code incorrect ou expiré. Vérifiez votre email.");
            }

            // Sign in the newly created user
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: cleanEmail,
                password
            });
            if (signInError) throw signInError;

            // Update profile: phone + role + name
            const { data: { user: authedUser } } = await supabase.auth.getUser();
            if (authedUser) {
                await supabase.from('profiles').upsert([{
                    id: authedUser.id,
                    email: cleanEmail,
                    phone: getFullSignupPhone(),
                    name: fullName.trim() || cleanEmail.split('@')[0],
                    role: 'AMBASSADOR'
                }], { onConflict: 'id' });
            }

            // Clean up OTP
            await supabase.from('auth_otps').delete().eq('email', cleanEmail);

            setSuccessMsg("Compte créé ! Redirection en cours...");
            setRole(UserRole.AMBASSADOR);
            localStorage.setItem('afritix_user_role', 'AMBASSADOR');
            setTimeout(() => navigate(redirectUrl), 1500);
        } catch (err: any) {
            setError(err.message || "Code incorrect. Vérifiez le code reçu par email.");
        } finally {
            setLoading(false);
        }
    };

    // ─────────────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-[#0f172a] flex">
            {/* Left: Branding */}
            <div className="hidden lg:flex flex-1 relative bg-indigo-950 overflow-hidden items-center justify-center">
                <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1557804506-669a67965ba0?q=80&w=2000&auto=format&fit=crop')] bg-cover bg-center opacity-20 mix-blend-overlay" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] via-[#0f172a]/70 to-transparent" />
                <div className="relative z-10 p-12 max-w-2xl text-center space-y-6">
                    <div className="inline-flex items-center justify-center w-24 h-24 bg-indigo-500/20 rounded-3xl border-2 border-indigo-400/30 backdrop-blur-xl shadow-2xl mb-2">
                        <Gift className="text-indigo-400" size={48} />
                    </div>
                    <h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
                        Devenez Ambassadeur
                    </h1>
                    <p className="text-xl text-slate-300 font-medium leading-relaxed max-w-lg mx-auto">
                        Partagez vos événements préférés et gagnez des commissions sur chaque vente générée par votre lien.
                    </p>
                    <div className="grid grid-cols-2 gap-4 mt-8 pt-8 border-t border-white/10 text-left">
                        <div className="bg-white/5 backdrop-blur-sm p-4 rounded-2xl border border-white/10">
                            <Target className="text-pink-400 mb-2" size={24} />
                            <h3 className="font-bold text-white mb-1">Ciblez vos amis</h3>
                            <p className="text-xs text-slate-400">Générez des liens uniques pour chaque événement.</p>
                        </div>
                        <div className="bg-white/5 backdrop-blur-sm p-4 rounded-2xl border border-white/10">
                            <Gift className="text-indigo-400 mb-2" size={24} />
                            <h3 className="font-bold text-white mb-1">Gagnez du Cash</h3>
                            <p className="text-xs text-slate-400">Retrait direct sur Mobile Money (Wave, OM, MTN).</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right: Form */}
            <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:px-20 xl:px-32 relative z-20">
                <div className="mx-auto w-full max-w-md">
                    <div className="text-center mb-8">
                        <h2 className="text-3xl font-extrabold text-white mb-2">
                            {isSignUp ? 'Créer mon compte' : 'Espace Ambassadeur'}
                        </h2>
                        <p className="text-slate-400 font-medium">
                            {isSignUp ? 'Inscrivez-vous au programme d\'affiliation' : 'Rejoignez le programme d\'affiliation Babipass'}
                        </p>
                    </div>

                    {/* Alerts */}
                    {error && (
                        <div className="mb-6 bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                            {error}
                        </div>
                    )}
                    {successMsg && (
                        <div className="mb-6 bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                            {successMsg}
                        </div>
                    )}

                    {/* ── SIGNUP FORM ── */}
                    {isSignUp && !otpStep && (
                        <form onSubmit={handleSignup} className="space-y-5 animate-in fade-in slide-in-from-right-4">
                            {/* Full name */}
                            <div>
                                <label className="block text-sm font-bold text-slate-300 mb-1.5">Nom complet</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <User className="h-5 w-5 text-slate-500" />
                                    </div>
                                    <input
                                        type="text"
                                        required
                                        value={fullName}
                                        onChange={e => setFullName(e.target.value)}
                                        className="w-full pl-11 bg-slate-900/50 border border-white/10 rounded-xl h-12 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-600"
                                        placeholder="Jean Dupont"
                                    />
                                </div>
                            </div>

                            {/* Email */}
                            <div>
                                <label className="block text-sm font-bold text-slate-300 mb-1.5">Adresse Email</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <Mail className="h-5 w-5 text-slate-500" />
                                    </div>
                                    <input
                                        type="email"
                                        required
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        className="w-full pl-11 bg-slate-900/50 border border-white/10 rounded-xl h-12 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-600"
                                        placeholder="vous@email.com"
                                    />
                                </div>
                            </div>

                            {/* Phone (obligatoire) */}
                            <div>
                                <label className="block text-sm font-bold text-slate-300 mb-1.5">
                                    Numéro de téléphone <span className="text-indigo-400">*</span>
                                    <span className="ml-2 text-xs text-slate-500 font-normal">(pour vos retraits Mobile Money)</span>
                                </label>
                                <div className="flex w-full h-12">
                                    <select
                                        value={signupCountryCode}
                                        onChange={e => setSignupCountryCode(e.target.value)}
                                        className="bg-slate-900/60 border border-slate-700 rounded-l-xl pl-3 pr-2 text-slate-300 focus:outline-none focus:border-indigo-500 transition-all border-r-0 cursor-pointer text-sm w-[110px]"
                                    >
                                        {dialOptions.length > 0 ? dialOptions.map(opt => (
                                            <option key={opt.code + opt.rawCode} value={opt.code}>{opt.flag} {opt.code}</option>
                                        )) : (
                                            <option value="+225">🇨🇮 +225</option>
                                        )}
                                    </select>
                                    <div className="relative flex-1">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <Phone className="h-4 w-4 text-slate-500" />
                                        </div>
                                        <input
                                            type="tel"
                                            required
                                            value={signupPhone}
                                            onChange={e => setSignupPhone(e.target.value.replace(/[^0-9]/g, ''))}
                                            className="w-full pl-9 bg-slate-900/50 border border-white/10 border-l-0 rounded-r-xl h-full text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-600 font-mono tracking-wider"
                                            placeholder="0708090000"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Password */}
                            <div>
                                <label className="block text-sm font-bold text-slate-300 mb-1.5">Mot de passe</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <Lock className="h-5 w-5 text-slate-500" />
                                    </div>
                                    <input
                                        type="password"
                                        required
                                        minLength={8}
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        className="w-full pl-11 bg-slate-900/50 border border-white/10 rounded-xl h-12 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-600 font-mono tracking-widest"
                                        placeholder="Minimum 8 caractères"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:scale-[1.02] text-white rounded-xl h-12 font-bold shadow-lg transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
                            >
                                {loading ? <Loader2 className="animate-spin" size={20} /> : <><span>Créer mon compte</span> <ArrowRight size={18} /></>}
                            </button>
                        </form>
                    )}

                    {/* ── OTP STEP (after signup) ── */}
                    {isSignUp && otpStep && (
                        <form onSubmit={handleVerifyOtp} className="space-y-5 animate-in slide-in-from-right-10">
                            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 text-center">
                                <h3 className="text-white font-bold mb-2">Vérifiez votre email ✉️</h3>
                                <p className="text-sm text-slate-300">
                                    Un code de confirmation a été envoyé à <strong className="text-indigo-300">{email}</strong>. Entrez-le ci-dessous pour activer votre compte.
                                </p>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-300 mb-1.5">Code de vérification</label>
                                <input
                                    type="text"
                                    required
                                    value={otpCode}
                                    onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl h-14 text-center text-3xl tracking-[1em] font-mono text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                    placeholder="------"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={loading || otpCode.length !== 6}
                                className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:scale-[1.02] text-white rounded-xl h-12 font-bold shadow-lg transition-all disabled:opacity-50"
                            >
                                {loading ? <Loader2 className="animate-spin" size={20} /> : "Valider et entrer"}
                            </button>
                        </form>
                    )}

                    {/* ── LOGIN FORM ── */}
                    {!isSignUp && (
                        <div>
                            <form onSubmit={handleLogin} className="space-y-5 animate-in fade-in">
                                {/* Email field */}
                                <div>
                                    <label className="block text-sm font-bold text-slate-300 mb-1.5">Adresse Email</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                            <Mail className="h-5 w-5 text-slate-500" />
                                        </div>
                                        <input
                                            type="email"
                                            required
                                            value={email}
                                            onChange={e => setEmail(e.target.value)}
                                            className="w-full pl-11 bg-slate-900/50 border border-white/10 rounded-xl h-12 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-600"
                                            placeholder="vous@email.com"
                                        />
                                    </div>
                                </div>

                                {/* Password */}
                                <div>
                                    <label className="block text-sm font-bold text-slate-300 mb-1.5">Mot de passe</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                            <Lock className="h-5 w-5 text-slate-500" />
                                        </div>
                                        <input
                                            type="password"
                                            required
                                            value={password}
                                            onChange={e => setPassword(e.target.value)}
                                            className="w-full pl-11 bg-slate-900/50 border border-white/10 rounded-xl h-12 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-600 font-mono tracking-widest"
                                            placeholder="••••••••"
                                        />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:scale-[1.02] text-white rounded-xl h-12 font-bold shadow-lg transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
                                >
                                    {loading ? <Loader2 className="animate-spin" size={20} /> : <><span>Se Connecter</span> <ArrowRight size={18} /></>}
                                </button>
                            </form>
                        </div>
                    )}

                    {/* Footer links */}
                    <div className="mt-8 text-center border-t border-white/10 pt-8 space-y-4">
                        {isSignUp ? (
                            <button onClick={() => { setIsSignUp(false); setOtpStep(false); setError(''); setSuccessMsg(''); }} className="text-slate-400 hover:text-white text-sm font-medium transition-colors">
                                Déjà ambassadeur ? <span className="text-indigo-400 font-bold ml-1">Se connecter</span>
                            </button>
                        ) : (
                            <button onClick={() => { setIsSignUp(true); setError(''); setSuccessMsg(''); }} className="text-slate-400 hover:text-white text-sm font-medium transition-colors">
                                Nouveau ? <span className="text-indigo-400 font-bold ml-1">Créer un compte Ambassadeur</span>
                            </button>
                        )}
                        <br />
                        <Link to="/" className="inline-flex mt-2 items-center gap-1 text-slate-500 hover:text-slate-300 text-xs font-bold transition-colors">
                            <ExternalLink size={12} /> Retour à l'accueil Babipass
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};
