import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Mail, Phone, Lock, ArrowRight, Loader2, Target, Gift, ExternalLink } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import { WhatsAppService } from '../services/WhatsAppService';
import { getCountryDialCode } from '../utils/countryCodes';

export const AmbassadorLogin = () => {
    const [searchParams] = useSearchParams();
    const redirectUrl = searchParams.get('redirect') || '/ambassador';
    
    const [isPhoneMode, setIsPhoneMode] = useState(false);
    const [isSignUp, setIsSignUp] = useState(false);
    const [isResetMode, setIsResetMode] = useState(false);
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [countryCode, setCountryCode] = useState('+225');
    const [dialOptions, setDialOptions] = useState<{code: string, flag: string, rawCode: string}[]>([]);

    const getFlagEmoji = (countryCode: string) => {
        try {
            const codePoints = countryCode
                .toUpperCase()
                .split('')
                .map(char => 127397 + char.charCodeAt(0));
            return String.fromCodePoint(...codePoints);
        } catch(e) { return countryCode; }
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
                    
                    const uniqueOptions = options.reduce((acc, current) => {
                        const x = acc.find((item: any) => item.code === current.code);
                        if (!x) return acc.concat([current]);
                        return acc;
                    }, [] as any[]);

                    setDialOptions(uniqueOptions);
                    if (uniqueOptions.length > 0 && countryCode === '+225') {
                        const hasDefault = uniqueOptions.find((o: any) => o.code === '+225');
                        if (!hasDefault) setCountryCode(uniqueOptions[0].code);
                    }
                }
            } catch (err) {}
        };
        fetchCountries();
    }, []);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    const [otpStep, setOtpStep] = useState(false);
    const [otpCode, setOtpCode] = useState('');
    const [resetStep, setResetStep] = useState(false);
    const [resolvedResetEmail, setResolvedResetEmail] = useState('');

    const { setRole, user } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (user && user.role === UserRole.ORGANIZER) {
            setError("Les organisateurs ne peuvent pas accéder au programme Ambassadeur.");
        }
    }, [user]);

    const getFullPhone = (raw: string) => {
        let p = raw.replace(/\D/g, '');
        if (p.startsWith('0')) p = p.substring(1);
        return `${countryCode}${p}`;
    };

    const getFormattedIdentifier = () => {
        if (!isPhoneMode) return identifier.trim();
        const baseEmail = getFullPhone(phoneNumber || identifier).replace('+', '');
        return `${baseEmail}@ambassador.babipass.local`;
    };

    const requestVerification = async (emailOrPhoneEmail: string, whatsappNumber?: string) => {
        const { error } = await supabase.auth.signInWithOtp({
            email: emailOrPhoneEmail,
            options: { shouldCreateUser: false }
        });
        if (error) throw error;

        if (whatsappNumber) {
            try {
                // Generate secure 6-digit OTP
                const waOtp = Math.floor(100000 + Math.random() * 900000).toString();
                
                await supabase.from('auth_otps').upsert({
                    email: emailOrPhoneEmail,
                    otp: waOtp,
                    created_at: new Date().toISOString()
                });

                await WhatsAppService.sendMessage(
                    whatsappNumber,
                    `Votre code de vérification Babipass Ambassadeur est : *${waOtp}*.\nNe le partagez avec personne.`
                );
            } catch (waError) {
                console.warn("Échec de l'envoi WhatsApp, repli sur l'email standard utilisé par Supabase.", waError);
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const formattedIdentifier = getFormattedIdentifier();

            if (isSignUp) {
                // Recherche intelligente pour empêcher les doublons
                let noPlus = '', rawInput = '', noCountry = '';
                if (isPhoneMode) {
                    rawInput = (phoneNumber || identifier).trim();
                    const fullPhone = getFullPhone(rawInput);
                    noPlus = fullPhone.replace('+', '');
                    noCountry = rawInput.replace(/^0+/, '');
                } else {
                    noPlus = formattedIdentifier;
                    rawInput = formattedIdentifier;
                    noCountry = formattedIdentifier;
                }

                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('email')
                    .or(`email.like.%${noPlus}%,email.like.%${rawInput}%,email.like.%${noCountry}%,name.like.%${noPlus}%,name.like.%${rawInput}%`)
                    .limit(1);

                if (profiles && profiles.length > 0) {
                    throw new Error("Ce compte existe déjà. Veuillez vous connecter.");
                }

                const { data, error } = await supabase.auth.signUp({
                    email: formattedIdentifier,
                    password,
                    options: {
                        data: {
                            role: 'AMBASSADOR',
                            name: isPhoneMode ? `Ambassadeur ${rawInput}` : formattedIdentifier.split('@')[0],
                        }
                    }
                });

                if (error) throw error;
                await requestVerification(formattedIdentifier, isPhoneMode ? getFullPhone(identifier || phoneNumber) : undefined);
                setOtpStep(true);

            } else {
                // Login
                let loginEmail = formattedIdentifier;

                if (isPhoneMode) {
                    const rawInput = (identifier || phoneNumber).trim();
                    const fullPhone = getFullPhone(rawInput);
                    const noPlus = fullPhone.replace('+', '');
                    const noCountry = rawInput.replace(/^0+/, '');

                    const { data: profiles } = await supabase
                        .from('profiles')
                        .select('email, role')
                        .or(`email.like.%${noPlus}%,email.like.%${rawInput}%,email.like.%${noCountry}%,name.like.%${noPlus}%,name.like.%${rawInput}%`)
                        .limit(1);

                    if (profiles && profiles.length > 0) {
                        if (profiles[0].role === 'ORGANIZER') {
                            throw new Error("Connexion refusée. Les comptes Organisateur ne peuvent pas être Ambassadeur.");
                        }
                        loginEmail = profiles[0].email;
                    } else {
                        throw new Error("Aucun compte trouvé avec ce numéro.");
                    }
                }

                const { data, error } = await supabase.auth.signInWithPassword({
                    email: loginEmail,
                    password,
                });

                if (error) throw error;

                if (data.user) {
                    // Update user role to AMBASSADOR if they were GUEST/USER
                    const { data: prof } = await supabase.from('profiles').select('role').eq('id', data.user.id).single();
                    if (prof && (prof.role === 'USER' || prof.role === 'GUEST')) {
                        await supabase.from('profiles').update({ role: 'AMBASSADOR' }).eq('id', data.user.id);
                    }

                    setRole(UserRole.AMBASSADOR);
                    localStorage.setItem('afritix_user_role', 'AMBASSADOR');
                    navigate(redirectUrl);
                }
            }
        } catch (err: any) {
            console.error(err);
            let errorMessage = err.message || "Identifiants incorrects. Veuillez réessayer.";
            if (errorMessage.includes("Invalid login credentials")) errorMessage = "Identifiants incorrects.";
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const formattedIdentifier = getFormattedIdentifier();
            let isVerified = false;

            if (isPhoneMode) {
                const { data } = await supabase.from('auth_otps')
                    .select('*')
                    .eq('email', formattedIdentifier)
                    .eq('otp', otpCode)
                    .single();

                if (data) isVerified = true;
            }

            if (!isVerified) {
                const { error: verifyError } = await supabase.auth.verifyOtp({
                    email: formattedIdentifier,
                    token: otpCode,
                    type: 'email'
                });
                if (verifyError) throw verifyError;
            }

            if (isSignUp) {
                // Auto sign in après l'inscription validée
                const { error: signInError } = await supabase.auth.signInWithPassword({
                    email: formattedIdentifier,
                    password
                });
                if (signInError) throw signInError;
            }

            // Cleanup OTP
            await supabase.from('auth_otps').delete().eq('email', formattedIdentifier);

            setSuccessMsg("Redirection en cours...");
            setRole(UserRole.AMBASSADOR);
            localStorage.setItem('afritix_user_role', 'AMBASSADOR');
            
            setTimeout(() => navigate(redirectUrl), 1500);

        } catch (err: any) {
            setError(err.message || "Code incorrect.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0f172a] flex">
            {/* Left side: Branding */}
            <div className="hidden lg:flex flex-1 relative bg-indigo-900 overflow-hidden items-center justify-center">
                <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1557804506-669a67965ba0?q=80&w=2000&auto=format&fit=crop')] bg-cover bg-center opacity-30 mix-blend-overlay"></div>
                <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] via-[#0f172a]/80 to-transparent"></div>

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

            {/* Right side: Login Form */}
            <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:px-20 xl:px-32 relative z-20">
                <div className="mx-auto w-full max-w-md">
                    <div className="text-center mb-8">
                        <h2 className="text-3xl font-extrabold text-white mb-2">
                            {isSignUp ? 'Créer mon compte' : 'Espace Ambassadeur'}
                        </h2>
                        <p className="text-slate-400 font-medium">Rejoignez le programme d'affiliation Babipass</p>
                    </div>

                    {!otpStep && !resetStep && (
                        <div className="bg-slate-900/50 p-1.5 rounded-xl flex mb-8 border border-white/5">
                            <button
                                onClick={() => { setIsPhoneMode(false); setIdentifier(''); }}
                                className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${!isPhoneMode ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                            >
                                Email
                            </button>
                            <button
                                onClick={() => { setIsPhoneMode(true); setIdentifier(''); }}
                                className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${isPhoneMode ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                            >
                                Téléphone
                            </button>
                        </div>
                    )}

                    {error && (
                        <div className="mb-6 bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div>
                            {error}
                        </div>
                    )}

                    {successMsg && (
                        <div className="mb-6 bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                            {successMsg}
                        </div>
                    )}

                    {!otpStep && !resetStep && (
                        <form onSubmit={handleSubmit} className="space-y-5">
                            {isPhoneMode ? (
                                <div>
                                    <label className="block text-sm font-bold text-slate-300 mb-1.5">Numéro WhatsApp</label>
                                    <div className="flex w-full h-12">
                                        <select
                                            value={countryCode}
                                            onChange={(e) => setCountryCode(e.target.value)}
                                            className="bg-slate-900/60 border border-slate-700 rounded-l-xl pl-3 pr-8 py-3 text-slate-300 focus:outline-none focus:border-indigo-500 transition-all border-r-0 cursor-pointer text-sm w-[100px]"
                                        >
                                            {dialOptions.length > 0 ? dialOptions.map(opt => (
                                                <option key={opt.code + opt.rawCode} value={opt.code}>{opt.code} {opt.flag}</option>
                                            )) : (
                                                <option value="+225">+225 🇨🇮</option>
                                            )}
                                        </select>
                                        <input
                                            type="tel"
                                            required
                                            value={identifier || phoneNumber}
                                            onChange={(e) => {
                                                setIdentifier(e.target.value);
                                                setPhoneNumber(e.target.value);
                                            }}
                                            className="flex-1 bg-slate-900/50 border border-white/10 rounded-r-xl px-4 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-600 font-mono tracking-wider"
                                            placeholder="Ex: 0544246972"
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-sm font-bold text-slate-300 mb-1.5">Adresse Email</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                            <Mail className="h-5 w-5 text-slate-500" />
                                        </div>
                                        <input
                                            type="email"
                                            required
                                            value={identifier}
                                            onChange={(e) => setIdentifier(e.target.value)}
                                            className="w-full pl-11 bg-slate-900/50 border border-white/10 rounded-xl h-12 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-600"
                                            placeholder="vous@email.com"
                                        />
                                    </div>
                                </div>
                            )}

                            <div>
                                <div className="flex justify-between items-center mb-1.5">
                                    <label className="block text-sm font-bold text-slate-300">Mot de passe</label>
                                    {!isSignUp && (
                                        <button type="button" onClick={() => setIsResetMode(true)} className="text-xs font-bold text-indigo-400 hover:text-indigo-300">
                                            Mot de passe oublié ?
                                        </button>
                                    )}
                                </div>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <Lock className="h-5 w-5 text-slate-500" />
                                    </div>
                                    <input
                                        type="password"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full pl-11 bg-slate-900/50 border border-white/10 rounded-xl h-12 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-600 font-mono tracking-widest"
                                        placeholder="••••••••"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:scale-[1.02] text-white rounded-xl h-12 font-bold shadow-lg transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-50"
                            >
                                {loading ? <Loader2 className="animate-spin" size={20} /> : (
                                    <>
                                        {isSignUp ? "Créer mon compte" : "Se Connecter"} <ArrowRight size={18} />
                                    </>
                                )}
                            </button>
                        </form>
                    )}

                    {otpStep && (
                        <form onSubmit={handleVerifyOtp} className="space-y-5 animate-in slide-in-from-right-10">
                            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 text-center">
                                <h3 className="text-white font-bold mb-2">Vérification requise</h3>
                                <p className="text-sm text-slate-300">
                                    Entrez le code à 6 chiffres envoyé sur <strong>{identifier || phoneNumber}</strong>
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-300 mb-1.5">Code de vérification</label>
                                <input
                                    type="text"
                                    required
                                    value={otpCode}
                                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl h-14 text-center text-3xl tracking-[1em] font-mono text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                    placeholder="------"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={loading || otpCode.length !== 6}
                                className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:scale-[1.02] text-white rounded-xl h-12 font-bold shadow-lg transition-all disabled:opacity-50"
                            >
                                {loading ? <Loader2 className="animate-spin" size={20} /> : "Valider et se connecter"}
                            </button>
                        </form>
                    )}

                    <div className="mt-8 text-center border-t border-white/10 pt-8">
                        {isSignUp ? (
                            <button onClick={() => { setIsSignUp(false); setError(''); }} className="text-slate-400 hover:text-white text-sm font-medium transition-colors">
                                Déjà ambassadeur ? <span className="text-indigo-400 font-bold ml-1">Se connecter</span>
                            </button>
                        ) : (
                            <button onClick={() => { setIsSignUp(true); setError(''); }} className="text-slate-400 hover:text-white text-sm font-medium transition-colors">
                                Nouveau sur le programme ? <span className="text-indigo-400 font-bold ml-1">S'inscrire</span>
                            </button>
                        )}
                        <br/>
                        <Link to="/" className="inline-flex mt-6 items-center gap-1 text-slate-500 hover:text-slate-300 text-xs font-bold transition-colors">
                            <ExternalLink size={12}/> Retour à l'accueil Babipass
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};
