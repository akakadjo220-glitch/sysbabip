import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { UserRole } from '../types';

// ─── Configuration de l'auto-déconnexion ───────────────────────────────────
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;  // 30 minutes d'inactivité
const WARNING_BEFORE_MS = 2 * 60 * 1000;  // Avertissement 2 min avant
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keypress', 'touchstart', 'scroll', 'click'];

const AuthContext = createContext<{
    role: UserRole;
    setRole: (role: UserRole) => void;
    user: any;
    authLoading: boolean;
    userCountry: string | null;
    setUserCountry: (country: string) => void;
    handleLogout: () => void;
    showInactivityWarning: boolean;
    extendSession: () => void;
}>({
    role: UserRole.GUEST,
    setRole: () => { },
    user: null,
    authLoading: true,
    userCountry: null,
    setUserCountry: () => { },
    handleLogout: () => { },
    showInactivityWarning: false,
    extendSession: () => { },
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [role, setRole] = useState<UserRole>(() => {
        const savedRole = localStorage.getItem('afritix_user_role');
        if (savedRole && Object.values(UserRole).includes(savedRole as UserRole)) {
            return savedRole as UserRole;
        }
        return UserRole.GUEST;
    });
    const [userCountry, setUserCountryState] = useState<string | null>(() => {
        return localStorage.getItem('afriTix_user_country') || null;
    });
    const [user, setUser] = useState<any>(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [showInactivityWarning, setShowInactivityWarning] = useState(false);

    const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const setUserCountry = (country: string) => {
        setUserCountryState(country);
        localStorage.setItem('afriTix_user_country', country);
    };

    // ─── Déconnexion / Nettoyage ──────────────────────────────────────────────
    const handleLogout = useCallback(async () => {
        if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
        if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
        setShowInactivityWarning(false);
        setRole(UserRole.GUEST);
        localStorage.removeItem('afritix_auth_token');
        localStorage.removeItem('afritix_user_role');
        localStorage.removeItem('afritix_current_agent');
        setUser(null);
        await supabase.auth.signOut();
    }, []);

    // ─── Réinitialisation du timer d'inactivité ────────────────────────────────
    const resetInactivityTimer = useCallback((currentRole: UserRole) => {
        if (currentRole === UserRole.GUEST) return;

        if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
        if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
        setShowInactivityWarning(false);

        warningTimerRef.current = setTimeout(() => {
            setShowInactivityWarning(true);
        }, INACTIVITY_TIMEOUT_MS - WARNING_BEFORE_MS);

        logoutTimerRef.current = setTimeout(() => {
            handleLogout();
        }, INACTIVITY_TIMEOUT_MS);
    }, [handleLogout]);

    const extendSession = useCallback(() => {
        resetInactivityTimer(role);
    }, [resetInactivityTimer, role]);

    // ─── Écoute des événements d'activité ─────────────────────────────────────
    useEffect(() => {
        if (role === UserRole.GUEST) {
            if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
            if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
            setShowInactivityWarning(false);
            return;
        }

        const handleActivity = () => resetInactivityTimer(role);

        ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, handleActivity, { passive: true }));
        resetInactivityTimer(role);

        return () => {
            ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, handleActivity));
            if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
            if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
        };
    }, [role, resetInactivityTimer]);

    // ─── Fonction utilitaire pour appliquer le rôle ───────────────────────────
    const setRoleWithStorage = (newRole: UserRole) => {
        setRole(newRole);
        localStorage.setItem('afritix_user_role', newRole);
    };

    // ─── Résolution du rôle : DB → localStorage → user_metadata → GUEST ──────
    const resolveRole = (profile: any, authUser: any) => {
        // Priority 1: DB profile role
        if (profile?.role && Object.values(UserRole).includes(profile.role as UserRole)) {
            setRoleWithStorage(profile.role as UserRole);
            return;
        }
        // Priority 2: localStorage (persists across refreshes)
        const savedRole = localStorage.getItem('afritix_user_role') as UserRole;
        if (savedRole && Object.values(UserRole).includes(savedRole) && savedRole !== UserRole.GUEST) {
            setRole(savedRole);
            return;
        }
        // Priority 3: Supabase user_metadata
        const metaRole = authUser?.user_metadata?.role as string;
        if (metaRole && Object.values(UserRole).includes(metaRole as UserRole)) {
            setRoleWithStorage(metaRole as UserRole);
            return;
        }
    };

    // ─── État pour déclencher le fetch de profil HORS du lock GoTrue ─────
    const [pendingUserId, setPendingUserId] = useState<string | null>(null);

    // ─── Initialisation session Supabase ─────────────────────────────
    // IMPORTANT: Le callback onAuthStateChange s'exécute dans un lock exclusif GoTrue.
    // Faire des appels async Supabase (from().select()) ici causerait un DEADLOCK
    // car chaque requête appelle getSession() qui essaie d'acquérir le même lock.
    // Solution: callback SYNCHRONE + fetch de profil dans un useEffect séparé.
    useEffect(() => {
        // Safety timeout : résoudre authLoading dans tous les cas après 20s
        const safetyTimer = setTimeout(() => {
            console.warn("AuthContext: Safety timeout 20s reached — forcing authLoading=false");
            setAuthLoading(false);
        }, 20000);

        // Callback NON-ASYNC pour éviter le deadlock GoTrue
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event, session) => {
                console.log(`AuthContext: Event ${event} for ${session?.user?.email || 'no-user'}`);
                
                if (event === 'USER_UPDATED') return;

                if (session?.user) {
                    // 1. Définir l'utilisateur de base immédiatement (infos session uniquement)
                    setUser(session.user);
                    
                    // 2. Résolution immédiate du rôle depuis localStorage/metadata (PAS de DB)
                    //    Le fetch du profil DB se fera dans le useEffect pendingUserId ci-dessous
                    resolveRole(null, session.user);
                    
                    // 3. Déclencher le fetch de profil HORS du lock GoTrue
                    setPendingUserId(session.user.id);
                } else {
                    // Pas de session
                    if (event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') {
                        setUser(null);
                        setRole(UserRole.GUEST);
                        localStorage.removeItem('afritix_user_role');
                        localStorage.removeItem('afritix_current_agent');
                        setPendingUserId(null);
                    }
                }

                // Libérer authLoading ici : on a au minimum le rôle localStorage/metadata
                setAuthLoading(false);
                clearTimeout(safetyTimer);
                console.log("AuthContext: Auth Loading finished (sync callback)");
            }
        );

        return () => {
            subscription.unsubscribe();
            clearTimeout(safetyTimer);
        };
    }, []);

    // ─── Fetch du profil HORS du lock GoTrue ─────────────────────────
    // Ce useEffect se déclenche quand pendingUserId change (= quand onAuthStateChange
    // a détecté un user). Il fait le fetch du profil en arrière-plan, SANS bloquer
    // le rendu ni le lock GoTrue.
    useEffect(() => {
        if (!pendingUserId) return;
        
        let cancelled = false;
        const fetchProfile = async () => {
            try {
                console.log("AuthContext: Fetching profile for", pendingUserId);
                const { data: profile, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', pendingUserId)
                    .maybeSingle();

                if (cancelled) return;

                if (error) {
                    console.warn("AuthContext: Profile fetch error (non-blocking)", error);
                    return; // Le rôle est déjà résolu depuis localStorage/metadata
                }

                if (profile) {
                    // Enrichir le user avec les données du profil
                    setUser((prev: any) => prev ? { ...prev, ...profile } : profile);
                    // Re-résoudre le rôle avec la source DB (priorité 1)
                    resolveRole(profile, null);
                    console.log("AuthContext: Profile loaded, role resolved from DB");
                }
            } catch (err) {
                if (!cancelled) {
                    console.error("AuthContext: Profile fetch error (non-blocking)", err);
                }
            }
        };

        fetchProfile();
        return () => { cancelled = true; };
    }, [pendingUserId]);

    return (
        <AuthContext.Provider value={{
            role,
            setRole: setRoleWithStorage,
            user,
            authLoading,
            userCountry,
            setUserCountry,
            handleLogout,
            showInactivityWarning,
            extendSession,
        }}>
            {children}
        </AuthContext.Provider>
    );
};
