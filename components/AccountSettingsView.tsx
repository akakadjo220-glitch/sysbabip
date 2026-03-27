import { User, Lock, Save, Loader2, Shield, LogOut, Building2, FileText, MapPin, CheckCircle2, Clock, XCircle, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import { useContext, useState, useEffect } from 'react';

export const AccountSettingsView = ({ userMode }: { userMode: 'admin' | 'organizer' }) => {
    const { user, handleLogout } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    const [profileData, setProfileData] = useState({
        name: user?.name || '',
        email: user?.email || '',
        phone: '',
        company: '', // For organizers
        avatarBase64: '' // For the logo
    });

    const [kyb, setKyb] = useState({
        businessStatus: 'none' as 'none' | 'pending' | 'verified' | 'rejected',
        rejectionReason: '',
        businessDocUrl: '',
        addressProofUrl: ''
    });
    const [kybLoading, setKybLoading] = useState(false);
    const [kybSuccess, setKybSuccess] = useState('');
    const [kybError, setKybError] = useState('');
    const [businessDocFile, setBusinessDocFile] = useState<File | null>(null);
    const [addressProofFile, setAddressProofFile] = useState<File | null>(null);

    const [securityData, setSecurityData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });

    useEffect(() => {
        if (user?.id) {
            // Load existing profile from Supabase
            const loadProfile = async () => {
                try {
                    const { data } = await supabase.from('profiles').select('name, phone, company, avatar, business_status, business_rejection_reason, business_doc_url, address_proof_url').eq('id', user.id).maybeSingle();
                    if (data) {
                        setProfileData(prev => ({
                            ...prev,
                            name: data.name || user.name || '',
                            phone: data.phone || '',
                            company: data.company || '',
                            avatarBase64: data.avatar || ''
                        }));
                        setKyb({
                            businessStatus: data.business_status || 'none',
                            rejectionReason: data.business_rejection_reason || '',
                            businessDocUrl: data.business_doc_url || '',
                            addressProofUrl: data.address_proof_url || ''
                        });
                    }
                } catch (e) {
                    console.error("Erreur de chargement du profil:", e);
                }
            };
            loadProfile();
        }
    }, [user]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Image compression & Base64 encoding
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 300;
                const MAX_HEIGHT = 300;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                // Convert to minimal Base64 string (~30-50kb)
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                setProfileData(prev => ({ ...prev, avatarBase64: dataUrl }));
            };
            img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
    };

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setSuccess('');
        setErrorMsg('');

        try {
            // Update profile to Supabase
            const { error } = await supabase.from('profiles').update({
                name: profileData.name,
                phone: profileData.phone,
                company: profileData.company,
                avatar: profileData.avatarBase64
            }).eq('id', user?.id);

            if (error) throw error;

            setSuccess('Profil mis à jour avec succès !');
            // Clear success message after 3 seconds
            setTimeout(() => setSuccess(''), 3000);
        } catch (err: any) {
            setErrorMsg(err.message || "Erreur lors de la mise à jour du profil.");
        } finally {
            setLoading(false);
        }
    };

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setSuccess('');
        setErrorMsg('');

        if (securityData.newPassword !== securityData.confirmPassword) {
            setErrorMsg("Les nouveaux mots de passe ne correspondent pas.");
            setLoading(false);
            return;
        }

        try {
            // Mise à jour réelle du mot de passe via Supabase Auth (la session active garantit la sécurité)
            const { error } = await supabase.auth.updateUser({ password: securityData.newPassword });
            if (error) throw error;

            setSuccess('Mot de passe mis à jour avec succès !');
            setSecurityData({ currentPassword: '', newPassword: '', confirmPassword: '' });
            setTimeout(() => setSuccess(''), 3000);
        } catch (err: any) {
            setErrorMsg(err.message || "Erreur lors de la modification du mot de passe.");
        } finally {
            setLoading(false);
        }
    };

    const handleLogoutClick = async () => {
        if (handleLogout) {
            handleLogout();
        } else {
            await supabase.auth.signOut();
            navigate('/login');
        }
    };

    const handleKybSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!businessDocFile || !addressProofFile) {
            setKybError('Veuillez sélectionner les deux documents requis.');
            return;
        }
        setKybLoading(true);
        setKybError('');
        setKybSuccess('');
        try {
            // Upload business doc
            const bizPath = `kyb/${user?.id}/business_doc_${Date.now()}`;
            const { error: bizErr } = await supabase.storage.from('documents').upload(bizPath, businessDocFile, { upsert: true });
            if (bizErr) throw bizErr;
            const { data: bizUrl } = supabase.storage.from('documents').getPublicUrl(bizPath);

            // Upload address proof
            const addrPath = `kyb/${user?.id}/address_proof_${Date.now()}`;
            const { error: addrErr } = await supabase.storage.from('documents').upload(addrPath, addressProofFile, { upsert: true });
            if (addrErr) throw addrErr;
            const { data: addrUrl } = supabase.storage.from('documents').getPublicUrl(addrPath);

            // Update profile
            const { error: profileErr } = await supabase.from('profiles').update({
                business_status: 'pending',
                business_doc_url: bizUrl.publicUrl,
                address_proof_url: addrUrl.publicUrl,
                business_rejection_reason: null
            }).eq('id', user?.id);
            if (profileErr) throw profileErr;

            setKyb(prev => ({ ...prev, businessStatus: 'pending', businessDocUrl: bizUrl.publicUrl, addressProofUrl: addrUrl.publicUrl }));
            setKybSuccess('Documents soumis ! Un administrateur les examinera sous peu.');
            setBusinessDocFile(null);
            setAddressProofFile(null);
        } catch (err: any) {
            setKybError(err.message || 'Erreur lors de la soumission des documents.');
        } finally {
            setKybLoading(false);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500 max-w-4xl mx-auto">

            {success && (
                <div className="bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 px-6 py-4 rounded-xl flex items-center gap-3 font-semibold shadow-lg">
                    <Shield size={20} />
                    {success}
                </div>
            )}

            {errorMsg && (
                <div className="bg-red-500/20 border border-red-500/50 text-red-400 px-6 py-4 rounded-xl flex items-center gap-3 font-semibold shadow-lg">
                    <Shield size={20} />
                    {errorMsg}
                </div>
            )}

            {/* Profil Personnel */}
            <div className="bg-slate-900/50 backdrop-blur-xl p-6 md:p-8 rounded-3xl border border-white/10 shadow-2xl">
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
                    <div className="w-12 h-12 bg-blue-500/20 text-blue-500 rounded-xl flex items-center justify-center">
                        <User size={24} />
                    </div>
                    Informations du Profil
                </h3>

                <form onSubmit={handleUpdateProfile} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Nom de l'organisateur (Sera affiché sur les billets)</label>
                            <input
                                type="text"
                                value={profileData.name}
                                onChange={e => setProfileData({ ...profileData, name: e.target.value })}
                                placeholder="Nom complet ou de la structure"
                                className="w-full bg-slate-900/60 border border-slate-700/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Adresse E-mail</label>
                            <input
                                type="email"
                                value={profileData.email}
                                disabled
                                className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-3 text-slate-400 cursor-not-allowed"
                            />
                            <p className="text-xs text-slate-500 mt-1">L'e-mail ne peut pas être modifié.</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Téléphone</label>
                            <input
                                type="tel"
                                value={profileData.phone}
                                onChange={e => setProfileData({ ...profileData, phone: e.target.value })}
                                placeholder="+225 01 02 03 04 05"
                                className="w-full bg-slate-900/60 border border-slate-700/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                            />
                        </div>
                        {userMode === 'organizer' && (
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">Structure / Agence</label>
                                <input
                                    type="text"
                                    value={profileData.company}
                                    onChange={e => setProfileData({ ...profileData, company: e.target.value })}
                                    placeholder="Ex: AfriEvent Group"
                                    className="w-full bg-slate-900/60 border border-slate-700/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                                />
                            </div>
                        )}
                        {userMode === 'organizer' && (
                            <div className="md:col-span-2 mt-2 p-4 bg-slate-800/50 rounded-xl border border-white/5">
                                <label className="block text-sm font-medium text-slate-300 mb-3">Logo de l'Organisation (Pour vos billets)</label>
                                <div className="flex items-center gap-6">
                                    <div className="w-24 h-24 bg-slate-900 rounded-xl border-2 border-dashed border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
                                        {profileData.avatarBase64 ? (
                                            <img src={profileData.avatarBase64} alt="Logo" className="w-full h-full object-contain" />
                                        ) : (
                                            <div className="text-slate-500 text-xs text-center">Aucun<br />logo</div>
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <input
                                            type="file"
                                            accept="image/png, image/jpeg, image/jpg"
                                            onChange={handleFileChange}
                                            className="block w-full text-sm text-slate-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-blue-500/10 file:text-blue-400 hover:file:bg-blue-500/20 cursor-pointer transition-colors"
                                        />
                                        <p className="text-xs text-slate-500 mt-2">Format Recommandé: Carré, max 2Mo. Sera compressé automatiquement.</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="flex justify-end pt-4">
                        <button
                            type="submit"
                            disabled={loading}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                            Mettre à jour le profil
                        </button>
                    </div>
                </form>
            </div>

            {/* Sécurité */}
            <div className="bg-slate-900/50 backdrop-blur-xl p-6 md:p-8 rounded-3xl border border-white/10 shadow-2xl">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 bg-red-500/20 text-red-500 rounded-xl flex items-center justify-center">
                        <Lock size={24} />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white">Sécurité & Connexion</h3>
                        <p className="text-slate-400 text-sm">Modifiez votre mot de passe d'accès.</p>
                    </div>
                </div>

                <form onSubmit={handleUpdatePassword} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-slate-300 mb-2">Mot de passe actuel</label>
                            <input
                                type="password"
                                value={securityData.currentPassword}
                                onChange={e => setSecurityData({ ...securityData, currentPassword: e.target.value })}
                                className="w-full md:max-w-md bg-slate-900/60 border border-slate-700/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500 transition-colors"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Nouveau mot de passe</label>
                            <input
                                type="password"
                                value={securityData.newPassword}
                                onChange={e => setSecurityData({ ...securityData, newPassword: e.target.value })}
                                className="w-full bg-slate-900/60 border border-slate-700/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500 transition-colors"
                                required
                                minLength={8}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Confirmer le nouveau mot de passe</label>
                            <input
                                type="password"
                                value={securityData.confirmPassword}
                                onChange={e => setSecurityData({ ...securityData, confirmPassword: e.target.value })}
                                className="w-full bg-slate-900/60 border border-slate-700/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500 transition-colors"
                                required
                                minLength={8}
                            />
                        </div>
                    </div>
                    <div className="flex justify-end pt-4">
                        <button
                            type="submit"
                            disabled={loading || !securityData.newPassword}
                            className="bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 hover:border-slate-500 px-8 py-3 rounded-xl font-bold flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? <Loader2 size={18} className="animate-spin" /> : <Lock size={18} />}
                            Changer le mot de passe
                        </button>
                    </div>
                </form>
            </div>

            {/* Business Verification (KYB) */}
            {userMode === 'organizer' && (
                <div className="bg-slate-900/50 backdrop-blur-xl p-6 md:p-8 rounded-3xl border border-white/10 shadow-2xl">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 bg-amber-500/20 text-amber-400 rounded-xl flex items-center justify-center">
                            <Building2 size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white">Vérification Business (KYB)</h3>
                            <p className="text-slate-400 text-sm">Requis pour demander des avances et recevoir vos reversements.</p>
                        </div>
                        <div className="ml-auto">
                            {kyb.businessStatus === 'verified' && (
                                <span className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1.5 rounded-xl text-sm font-bold">
                                    <CheckCircle2 size={16} /> Entreprise Vérifiée
                                </span>
                            )}
                            {kyb.businessStatus === 'pending' && (
                                <span className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 px-3 py-1.5 rounded-xl text-sm font-bold">
                                    <Clock size={16} /> En cours d'examen
                                </span>
                            )}
                            {kyb.businessStatus === 'rejected' && (
                                <span className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-1.5 rounded-xl text-sm font-bold">
                                    <XCircle size={16} /> Rejeté
                                </span>
                            )}
                        </div>
                    </div>

                    {kyb.businessStatus === 'verified' ? (
                        <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl text-emerald-300 text-sm">
                            ✅ Votre entreprise a été vérifiée. Vous avez accès à toutes les fonctionnalités financières.
                        </div>
                    ) : kyb.businessStatus === 'pending' ? (
                        <div className="space-y-4">
                            <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl text-amber-300 text-sm">
                                ⏳ Vos documents sont en cours d'examen par notre équipe. Ce processus peut prendre 24-48h.
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {kyb.businessDocUrl && (
                                    <a href={kyb.businessDocUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 transition-colors">
                                        <FileText className="text-blue-400 shrink-0" size={20} />
                                        <span className="text-white text-sm font-medium truncate">Document d'entreprise soumis</span>
                                    </a>
                                )}
                                {kyb.addressProofUrl && (
                                    <a href={kyb.addressProofUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 transition-colors">
                                        <MapPin className="text-purple-400 shrink-0" size={20} />
                                        <span className="text-white text-sm font-medium truncate">Preuve d'adresse soumise</span>
                                    </a>
                                )}
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleKybSubmit} className="space-y-6">
                            {kyb.businessStatus === 'rejected' && kyb.rejectionReason && (
                                <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-start gap-3">
                                    <AlertTriangle className="text-red-400 shrink-0 mt-0.5" size={18} />
                                    <div>
                                        <p className="text-red-400 font-bold text-sm">Motif du rejet :</p>
                                        <p className="text-red-300/80 text-sm mt-1">{kyb.rejectionReason}</p>
                                    </div>
                                </div>
                            )}

                            {kybSuccess && (
                                <div className="bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 px-4 py-3 rounded-xl text-sm font-semibold">
                                    {kybSuccess}
                                </div>
                            )}
                            {kybError && (
                                <div className="bg-red-500/20 border border-red-500/50 text-red-400 px-4 py-3 rounded-xl text-sm font-semibold">
                                    {kybError}
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3 hover:border-blue-500/40 transition-colors">
                                    <div className="flex items-center gap-2">
                                        <FileText className="text-blue-400" size={18} />
                                        <label className="text-sm font-bold text-white">Document d'Entreprise / Kbis</label>
                                    </div>
                                    <p className="text-slate-500 text-xs">Extrait de Kbis, registre de commerce ou tout document officiel équivalent.</p>
                                    <input
                                        type="file"
                                        accept=".pdf,.jpg,.jpeg,.png"
                                        onChange={e => setBusinessDocFile(e.target.files?.[0] || null)}
                                        className="block w-full text-sm text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-blue-500/10 file:text-blue-400 hover:file:bg-blue-500/20 cursor-pointer"
                                        required
                                    />
                                    {businessDocFile && <p className="text-blue-400 text-xs font-medium">✔ {businessDocFile.name}</p>}
                                </div>

                                <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3 hover:border-purple-500/40 transition-colors">
                                    <div className="flex items-center gap-2">
                                        <MapPin className="text-purple-400" size={18} />
                                        <label className="text-sm font-bold text-white">Preuve d'Adresse</label>
                                    </div>
                                    <p className="text-slate-500 text-xs">Facture d'utilité, relevé bancaire ou document officiel de moins de 3 mois.</p>
                                    <input
                                        type="file"
                                        accept=".pdf,.jpg,.jpeg,.png"
                                        onChange={e => setAddressProofFile(e.target.files?.[0] || null)}
                                        className="block w-full text-sm text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-purple-500/10 file:text-purple-400 hover:file:bg-purple-500/20 cursor-pointer"
                                        required
                                    />
                                    {addressProofFile && <p className="text-purple-400 text-xs font-medium">✔ {addressProofFile.name}</p>}
                                </div>
                            </div>

                            <div className="flex justify-end">
                                <button
                                    type="submit"
                                    disabled={kybLoading || !businessDocFile || !addressProofFile}
                                    className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-lg"
                                >
                                    {kybLoading ? <Loader2 size={18} className="animate-spin" /> : <Building2 size={18} />}
                                    Soumettre pour Validation
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            )}

            {/* Déconnexion */}
            <div className="bg-red-500/10 backdrop-blur-xl p-6 md:p-8 rounded-3xl border border-red-500/20 shadow-2xl flex flex-col sm:flex-row gap-6 items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-red-500/20 text-red-500 rounded-xl flex items-center justify-center shrink-0">
                        <LogOut size={24} />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-red-400">Déconnexion de l'espace</h3>
                        <p className="text-red-400/70 text-sm">Fermez votre session en toute sécurité sur cet appareil.</p>
                    </div>
                </div>
                <button
                    onClick={handleLogoutClick}
                    className="w-full sm:w-auto bg-red-500/20 hover:bg-red-500 hover:text-white text-red-500 border border-red-500/50 px-8 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
                >
                    <LogOut size={18} />
                    Se déconnecter
                </button>
            </div>

        </div>
    );
};
