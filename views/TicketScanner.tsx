import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, CheckCircle, XCircle, RefreshCw, Wifi, WifiOff, Radio, Loader2, KeyRound, Cloud, CloudOff, Download, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import { verifyTicket, TicketPayload } from '../utils/crypto';
import { Html5Qrcode } from 'html5-qrcode';
import { ScannerService, AgentAuthError, ScannerNetworkError } from '../services/ScannerService';

// ─── Constants ────────────────────────────────────────────────────────────────
const CACHE_TTL_MS      = 6 * 60 * 60 * 1000; // 6h

// ─── Types ────────────────────────────────────────────────────────────────────
type ScanResult = 'idle' | 'success' | 'error';
type ScanMode   = 'qr' | 'nfc';

interface PendingSync { ticketId: string; scannedAt: string; }
interface TicketCacheEntry { status: 'valid' | 'used' | 'revoked' | 'partial'; fetchedAt: number; }

// ─── Pure helpers (outside component = stable references) ─────────────────────
const getPendingSyncs = (agentCode: string): PendingSync[] => {
  if (!agentCode) return [];
  try { return JSON.parse(localStorage.getItem(`babipass_pending_syncs_${agentCode}`) || '[]'); } catch { return []; }
};
const addPendingSync = (ticketId: string, agentCode: string) => {
  if (!agentCode) return;
  const queue = getPendingSyncs(agentCode);
  if (!queue.find(p => p.ticketId === ticketId)) {
    queue.push({ ticketId, scannedAt: new Date().toISOString() });
    localStorage.setItem(`babipass_pending_syncs_${agentCode}`, JSON.stringify(queue));
  }
};
const getLocalScans = (agentCode: string): Record<string, string> => {
  if (!agentCode) return {};
  try { return JSON.parse(localStorage.getItem(`afriTix_local_scans_${agentCode}`) || '{}'); } catch { return {}; }
};
const markLocalScan = (ticketId: string, agentCode: string) => {
  if (!agentCode) return;
  const scans = getLocalScans(agentCode);
  scans[ticketId] = new Date().toISOString();
  localStorage.setItem(`afriTix_local_scans_${agentCode}`, JSON.stringify(scans));
};
const getCachedStatus = (ticketId: string, agentCode: string): TicketCacheEntry['status'] | null => {
  if (!agentCode) return null;
  try {
    const cache: Record<string, TicketCacheEntry> = JSON.parse(localStorage.getItem(`babipass_ticket_cache_${agentCode}`) || '{}');
    const entry = cache[ticketId];
    if (!entry || Date.now() - entry.fetchedAt > CACHE_TTL_MS) return null;
    return entry.status;
  } catch { return null; }
};
const setCachedStatus = (ticketId: string, status: TicketCacheEntry['status'], agentCode: string) => {
  if (!agentCode) return;
  try {
    const cache: Record<string, TicketCacheEntry> = JSON.parse(localStorage.getItem(`babipass_ticket_cache_${agentCode}`) || '{}');
    cache[ticketId] = { status, fetchedAt: Date.now() };
    localStorage.setItem(`babipass_ticket_cache_${agentCode}`, JSON.stringify(cache));
  } catch { /* ignore */ }
};

// ─── Main Component ───────────────────────────────────────────────────────────
export const TicketScanner: React.FC = () => {
  const navigate = useNavigate();
  const { setRole } = useAuth();
  const [agentCode, setAgentCode] = useState<string>('');
  const [sessionTimeLeft, setSessionTimeLeft] = useState<string>('');

  const [result, setResult]                   = useState<ScanResult>('idle');
  const [cameraActive, setCameraActive]       = useState(false);
  const [scanning, setScanning]               = useState(false);
  const [isOnline, setIsOnline]               = useState(navigator.onLine);
  const [scanMode, setScanMode]               = useState<ScanMode>('qr');
  const [manualToken, setManualToken]         = useState('');
  const [scannedPayload, setScannedPayload]   = useState<TicketPayload | null>(null);
  const [errorReason, setErrorReason]         = useState('');
  const [agentName, setAgentName]             = useState('Agent');
  const [scansCount, setScansCount]           = useState(0);
  const [pendingCount, setPendingCount]       = useState(0);
  const [nfcSupported, setNfcSupported]       = useState(false);
  const [nfcStatus, setNfcStatus]             = useState('');
  const [syncing, setSyncing]                 = useState(false);
  const [cacheSize, setCacheSize]             = useState(0);
  const [lastSyncInfo, setLastSyncInfo]       = useState('');
  const [cameraError, setCameraError]         = useState<string>('');
  const cameraStoppingRef = useRef<Promise<void> | null>(null);

  // Keep a stable ref for processToken to use in camera/NFC callbacks
  const processTokenRef = useRef<((token: string) => Promise<void>) | null>(null);
  // Déconnexion appelée quand le serveur refuse la session agent (jeton expiré / agent désactivé)
  const handleLogoutRef = useRef<(() => void) | null>(null);
  // Keep online state accessible in callbacks without re-creating them
  const isOnlineRef = useRef(navigator.onLine);

  // ─── Counter refresh ────────────────────────────────────────────────────
  const refreshCounters = useCallback(() => {
    if (!agentCode) return;
    setScansCount(Object.keys(getLocalScans(agentCode)).length);
    setPendingCount(getPendingSyncs(agentCode).length);
    try {
      const cache: Record<string, TicketCacheEntry> = JSON.parse(localStorage.getItem(`babipass_ticket_cache_${agentCode}`) || '{}');
      setCacheSize(Object.keys(cache).length);
    } catch { setCacheSize(0); }
  }, [agentCode]);

  // ─── Sync queue → Supabase ──────────────────────────────────────────────
  const flushPendingSyncs = useCallback(async () => {
    if (!agentCode) return;
    const queue = getPendingSyncs(agentCode);
    if (queue.length === 0) return;
    setSyncing(true);
    let failed: PendingSync[] = queue;
    let conflicts = 0;
    try {
      // Le serveur valide chaque scan hors-ligne comme un scan normal.
      const results = await ScannerService.sync(queue.map(item => item.ticketId));
      const byCode = new Map(results.map(r => [r.code, r.result]));
      failed = queue.filter(item => {
        const result = byCode.get(item.ticketId);
        if (!result || result === 'error') return true;
        if (result === 'ok') setCachedStatus(item.ticketId, 'used', agentCode);
        if (result === 'already_used') { conflicts++; setCachedStatus(item.ticketId, 'used', agentCode); }
        return false;
      });
    } catch (err) {
      if (err instanceof AgentAuthError) { handleLogoutRef.current?.(); }
    }
    localStorage.setItem(`babipass_pending_syncs_${agentCode}`, JSON.stringify(failed));
    const synced = queue.length - failed.length;
    if (conflicts > 0) {
      setLastSyncInfo(`⚠️ ${synced} billet(s) synchronisé(s), dont ${conflicts} déjà entré(s) par un autre accès pendant la coupure`);
    } else if (synced > 0) {
      setLastSyncInfo(`✅ ${synced} billet(s) synchronisé(s)`);
    }
    setSyncing(false);
    refreshCounters();
  }, [agentCode, refreshCounters]);

  // ─── Pre-cache for offline ──────────────────────────────────────────────
  const preCacheEventTickets = useCallback(async () => {
    if (!isOnlineRef.current || !agentCode) return;
    setSyncing(true);
    try {
      // Le serveur ne renvoie que les billets des événements de l'agent.
      const data = await ScannerService.snapshot();
      if (data) {
        const cache: Record<string, TicketCacheEntry> = {};
        const now = Date.now();
        for (const t of data) cache[t.id] = { status: t.status as TicketCacheEntry['status'], fetchedAt: now };
        localStorage.setItem(`babipass_ticket_cache_${agentCode}`, JSON.stringify(cache));
        setLastSyncInfo(`📥 ${data.length} billet(s) mis en cache hors-ligne`);
        refreshCounters();
      }
    } catch (e) {
      console.error('Pre-cache failed:', e);
      if (e instanceof AgentAuthError) handleLogoutRef.current?.();
    }
    setSyncing(false);
  }, [agentCode, refreshCounters]);

  // ─── Init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem('afritix_current_agent');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setAgentName(parsed.name || 'Agent');
        setAgentCode(parsed.code || parsed.id || 'GENERIC');
      } catch (_) {}
    }
    setNfcSupported('NDEFReader' in window);

    const onOnline = () => {
      setIsOnline(true);
      isOnlineRef.current = true;
      setTimeout(flushPendingSyncs, 500);
    };
    const onOffline = () => {
      setIsOnline(false);
      isOnlineRef.current = false;
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [flushPendingSyncs]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('afritix_user_role');
    localStorage.removeItem('afritix_current_agent');
    localStorage.removeItem('afritix_agent_session_expires_at');
    ScannerService.clearSession();
    setRole(UserRole.GUEST);
    navigate('/agent/login');
  }, [navigate, setRole]);

  useEffect(() => { handleLogoutRef.current = handleLogout; }, [handleLogout]);

  // Session activity & expiration checker
  useEffect(() => {
    const checkSession = () => {
      const expiration = localStorage.getItem('afritix_agent_session_expires_at');
      if (!expiration) return;
      
      const timeLeftMs = Number(expiration) - Date.now();
      if (timeLeftMs <= 0) {
        alert("⏱️ Votre session a expiré. Veuillez vous reconnecter.");
        handleLogout();
        return;
      }
      
      const totalMinutes = Math.max(0, Math.floor(timeLeftMs / (60 * 1000)));
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      
      if (hours > 0) {
        setSessionTimeLeft(`${hours}h ${minutes}m`);
      } else {
        setSessionTimeLeft(`${minutes}m`);
      }
    };
    
    checkSession();
    const interval = setInterval(checkSession, 15000); // Check every 15s
    return () => clearInterval(interval);
  }, [handleLogout]);

  useEffect(() => {
    if (agentCode) {
      refreshCounters();
    }
  }, [agentCode, refreshCounters]);

  // ─── Camera (QR) ────────────────────────────────────────────────────────
  useEffect(() => {
    let html5QrCode: Html5Qrcode | null = null;
    let mounted = true;
    let initPromise: Promise<any> | null = null;

    if (cameraActive) {
      setTimeout(() => {
        if (!mounted) return;
        const el = document.getElementById('qr-reader');
        if (!el) return;
        
        const startCamera = async () => {
          setCameraError('');
          
          // Attendre la libération complète du matériel de la caméra précédente si elle est en train de s'arrêter
          if (cameraStoppingRef.current) {
            try {
              await cameraStoppingRef.current;
            } catch (e) {
              console.warn("Échec de l'attente du stop de la caméra précédente:", e);
            }
          }
          
          if (!mounted) return;

          try {
            html5QrCode = new Html5Qrcode('qr-reader');
            
            // Démarrage forcé uniquement sur la caméra arrière (facingMode: 'environment')
            // Demande d'une résolution Full HD (1080p) idéale pour scanner de loin, sans contraintes strictes pour préserver la compatibilité.
            const promise = html5QrCode.start(
              { facingMode: 'environment' },
              { 
                fps: 24,
                videoConstraints: {
                  facingMode: 'environment',
                  width: { ideal: 1920 },
                  height: { ideal: 1080 }
                },
                qrbox: (width, height) => {
                  const min = Math.min(width, height);
                  return { width: min * 0.75, height: min * 0.75 };
                }
              },
              (decoded) => { if (processTokenRef.current) processTokenRef.current(decoded); },
              () => {}
            );
            
            initPromise = promise;
            await promise;
          } catch (err: any) {
            if (!mounted) return;
            console.error('Camera error:', err);
            setCameraError("Impossible d'accéder à la caméra arrière. Veuillez autoriser l'accès à la caméra dans les paramètres de votre navigateur et vous assurer que vous utilisez HTTPS.");
          }
        };

        startCamera();
      }, 500); // Wait slightly longer for DOM to settle
    }

    return () => {
      mounted = false;
      const cleanup = async () => {
        if (initPromise) {
           await initPromise.catch(() => {}); // Wait for start to finish to avoid stopping a starting camera
        }
        if (html5QrCode && html5QrCode.isScanning) {
           try {
             await html5QrCode.stop();
             html5QrCode.clear();
           } catch(e) { console.error("Html5Qrcode Stop Error", e); }
        }
      };
      cameraStoppingRef.current = cleanup();
    };
  }, [cameraActive]);

  // ─── NFC ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (scanMode !== 'nfc' || !nfcSupported) return;
    let active = true;
    (async () => {
      try {
        const reader = new (window as any).NDEFReader();
        await reader.scan();
        setNfcStatus("En attente d'un badge NFC...");
        reader.addEventListener('reading', ({ message }: any) => {
          if (!active) return;
          for (const record of message.records) {
            if (record.recordType === 'text') {
              const decoder = new TextDecoder(record.encoding || 'utf-8');
              if (processTokenRef.current) processTokenRef.current(decoder.decode(record.data));
              return;
            }
          }
          setResult('error');
          setErrorReason('Badge NFC sans données de billet reconnu.');
        });
      } catch (err: any) { setNfcStatus(`NFC non accessible: ${err.message}`); }
    })();
    return () => { active = false; };
  }, [scanMode, nfcSupported]);

  // ─── Core Token Processing (Online via server, Offline-First fallback) ───
  const fail = (reason: string) => { setResult('error'); setErrorReason(reason); };

  // Validation hors-ligne : cache des statuts + file de synchronisation.
  const processOffline = async (token: string) => {
    let ticketId: string | null = null;
    let payload: TicketPayload | null = null;

    // Identifiant nu (TIX-…, PHY-…) : on vérifie qu'il figure dans le cache de l'agent.
    const isBareTicketId = token.length < 80 && !token.startsWith('eyJ');
    if (isBareTicketId && getCachedStatus(token, agentCode)) {
      ticketId = token;
      payload = { tId: token, eId: '', type: 'Billet', usr: 'Participant', iat: Date.now() };
    }

    // Anciens QR signés (JWS) : vérification cryptographique locale.
    if (!ticketId) {
      const cryptoResult = await verifyTicket(token);
      if (cryptoResult.valid && cryptoResult.payload) {
        ticketId = cryptoResult.payload.tId;
        payload = cryptoResult.payload;
      }
    }

    if (!ticketId || !payload) return fail('Billet inconnu du cache hors-ligne. Reconnectez-vous pour le vérifier.');
    if (getLocalScans(agentCode)[ticketId]) return fail('Billet déjà scanné dans cette session !');

    const cachedStatus = getCachedStatus(ticketId, agentCode);
    if (cachedStatus === 'revoked') return fail("Ce billet a été révoqué par l'organisateur.");
    if (cachedStatus === 'used') return fail('Billet déjà utilisé ! Accès refusé.');
    if (cachedStatus === 'partial') return fail('Billet réservé en paiement fractionné : solde non réglé. Accès refusé.');

    addPendingSync(ticketId, agentCode);
    setCachedStatus(ticketId, 'used', agentCode);
    markLocalScan(ticketId, agentCode);
    setScannedPayload(payload);
    setResult('success');
    refreshCounters();
  };

  const processToken = async (rawToken: string) => {
    if (scanning) return;
    setScanning(true);
    setCameraActive(false);
    await new Promise(r => setTimeout(r, 400));
    const token = rawToken.trim();

    try {
      if (!isOnlineRef.current) {
        await processOffline(token);
        return;
      }

      let response;
      try {
        response = await ScannerService.scan(token);
      } catch (err) {
        if (err instanceof AgentAuthError) {
          alert("⏱️ Votre session agent n'est plus valide. Veuillez vous reconnecter.");
          handleLogout();
          return;
        }
        if (err instanceof ScannerNetworkError) {
          // Serveur injoignable malgré la connexion : bascule hors-ligne.
          await processOffline(token);
          return;
        }
        throw err;
      }

      const { result: scanResult, ticket } = response;
      const payload: TicketPayload | null = ticket
        ? { tId: ticket.id, eId: ticket.event_id || '', type: ticket.ticket_type || 'Standard', usr: ticket.guest_name || 'Participant', iat: Date.now() }
        : null;

      switch (scanResult) {
        case 'ok':
          setCachedStatus(ticket!.id, 'used', agentCode);
          markLocalScan(ticket!.id, agentCode);
          setScannedPayload(payload);
          setResult('success');
          refreshCounters();
          break;
        case 'season_ok':
          markLocalScan(ticket!.id, agentCode);
          setScannedPayload(payload);
          setResult('success');
          refreshCounters();
          break;
        case 'season_already':
          fail('✅ Pass Saison déjà utilisé pour ce match.');
          break;
        case 'already_used':
          if (ticket) setCachedStatus(ticket.id, 'used', agentCode);
          fail('Billet déjà utilisé ! Accès refusé.');
          break;
        case 'revoked':
          if (ticket) setCachedStatus(ticket.id, 'revoked', agentCode);
          fail("Ce billet a été révoqué par l'organisateur.");
          break;
        case 'partial':
          fail('Billet réservé en paiement fractionné : solde non réglé. Accès refusé.');
          break;
        case 'transferred':
          fail('Ce billet a été transféré à une autre personne : il n\'est plus valable.');
          break;
        case 'wrong_event':
          fail("Ce billet n'est pas valable pour cet événement.");
          break;
        default:
          fail('QR Code invalide ou inconnu dans le système.');
      }
    } catch (err) {
      console.error('processToken error:', err);
      fail('Erreur lors de la validation.');
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => { processTokenRef.current = processToken; });

  // ─── Handlers ────────────────────────────────────────────────────────────
  const reset = () => {
    setResult('idle'); setManualToken(''); setScannedPayload(null); setErrorReason('');
    if (scanMode === 'qr') setCameraActive(true);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualToken.trim()) processToken(manualToken.trim());
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-md mx-auto flex flex-col gap-3 pb-8">

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Contrôle d'accès</h2>
          <p className="text-slate-400 text-sm flex items-center gap-1.5 flex-wrap">
            <span>📱 {agentName}</span>
            <span>•</span>
            <span>{scansCount} scan{scansCount !== 1 ? 's' : ''}</span>
            {sessionTimeLeft && (
              <>
                <span>•</span>
                <span className="text-amber-400 flex items-center gap-1 font-mono">⏱️ {sessionTimeLeft}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${isOnline
            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50'
            : 'bg-red-500/20 text-red-400 border-red-500/50'}`}>
            {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
            {isOnline ? 'Connecté' : 'Hors-ligne'}
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center justify-center p-2 bg-slate-800 hover:bg-red-600/20 hover:text-red-400 border border-slate-700 rounded-xl text-slate-400 transition-all"
            title="Se déconnecter"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {/* Sync / Offline Status */}
      {(pendingCount > 0 || syncing || lastSyncInfo) && (
        <div className={`flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border ${syncing
          ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
          : pendingCount > 0
          ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
          : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'}`}>
          <span className="flex items-center gap-2">
            {syncing
              ? <><Loader2 size={12} className="animate-spin" /> Synchronisation...</>
              : pendingCount > 0
              ? <><CloudOff size={12} /> {pendingCount} scan(s) en attente de sync</>
              : <><Cloud size={12} /> {lastSyncInfo}</>}
          </span>
          {isOnline && pendingCount > 0 && !syncing && (
            <button onClick={flushPendingSyncs} className="underline text-xs hover:opacity-80">Sync</button>
          )}
        </div>
      )}

      {/* Pre-cache button */}
      {isOnline && (
        <button
          onClick={preCacheEventTickets}
          disabled={syncing}
          className="flex items-center justify-center gap-2 w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl text-xs font-bold text-slate-300 transition-all disabled:opacity-50"
        >
          {syncing ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          {cacheSize > 0 ? `Mettre à jour le cache (${cacheSize} billets)` : 'Télécharger billets pour hors-ligne'}
        </button>
      )}

      {/* Mode Toggle */}
      <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700 w-max mx-auto">
        <button onClick={() => { setScanMode('qr'); reset(); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${scanMode === 'qr' ? 'bg-orange-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>
          <Camera size={16} /> QR Code
        </button>
        <button onClick={() => { setScanMode('nfc'); setResult('idle'); setCameraActive(false); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${scanMode === 'nfc' ? 'bg-orange-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>
          <Radio size={16} /> NFC
        </button>
      </div>

      {/* Scanner Area */}
      <div className="relative rounded-3xl overflow-hidden bg-black shadow-2xl border-4 border-slate-800" style={{ minHeight: 380 }}>

        {/* NFC Mode */}
        {scanMode === 'nfc' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-slate-900">
            {!nfcSupported
              ? <div className="text-center space-y-4">
                  <div className="w-24 h-24 bg-red-500/20 rounded-full flex items-center justify-center mx-auto border-2 border-red-500/50"><Radio size={40} className="text-red-400" /></div>
                  <h3 className="text-xl font-bold text-white">NFC non supporté</h3>
                  <p className="text-slate-400 text-sm max-w-xs mx-auto">Utilisez Chrome sur Android.</p>
                </div>
              : result === 'success'
              ? <SuccessScreen payload={scannedPayload} onReset={reset} isOffline={!isOnline} />
              : result === 'error'
              ? <ErrorScreen reason={errorReason} onReset={reset} />
              : <div className="text-center space-y-6 w-full">
                  <div className="w-32 h-32 bg-slate-800 rounded-full flex items-center justify-center mx-auto relative">
                    <div className="absolute inset-0 border-4 border-orange-500/30 rounded-full animate-ping" />
                    <Radio size={48} className="text-orange-500" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Approchez le badge NFC</h3>
                    <p className="text-slate-400 text-sm mt-2">{nfcStatus || 'Initialisation NFC...'}</p>
                  </div>
                </div>
            }
          </div>
        )}

        {/* QR Mode */}
        {scanMode === 'qr' && (
          <>
            {/* Le div qr-reader DOIT rester dans le DOM tant que le mode QR est actif pour que html5QrCode.stop() ne plante pas */}
            <div id="qr-reader" className={`absolute inset-0 w-full h-full [&>video]:object-cover opacity-80 z-0 ${!(cameraActive && result === 'idle') ? 'hidden' : ''}`} />
            
            {/* Camera active */}
            {cameraActive && result === 'idle' && (
              <>
                {cameraError && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-slate-950/95 text-center space-y-4">
                    <XCircle className="text-red-500 animate-pulse" size={48} />
                    <p className="text-white font-semibold text-base px-4">{cameraError}</p>
                    <p className="text-slate-400 text-xs max-w-xs">Cet objectif est peut-être désactivé, non supporté ou déjà utilisé par une autre application en arrière-plan.</p>
                  </div>
                )}
                <div className="absolute inset-0 z-10 flex flex-col pointer-events-none">
                  <div className="flex-1 bg-black/50" />
                  <div className="flex h-64">
                    <div className="flex-1 bg-black/50" />
                    <div className="w-64 border-2 border-emerald-500 rounded-2xl relative">
                      <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.8)] animate-[scan_2s_ease-in-out_infinite]" />
                    </div>
                    <div className="flex-1 bg-black/50" />
                  </div>
                  <div className="flex-1 bg-black/50 flex items-center justify-center">
                    <p className="text-white font-medium bg-black/40 px-4 py-2 rounded-full backdrop-blur-md text-sm">
                      {!isOnline ? '📴 Hors-ligne — QR signé uniquement' : 'Placez le QR Code dans le cadre'}
                    </p>
                  </div>
                </div>
                {/* Manual input overlay */}
                <div className="absolute top-4 left-4 right-4 z-20">
                  <form onSubmit={handleManualSubmit} className="flex gap-2">
                    <input type="text" value={manualToken} onChange={e => setManualToken(e.target.value)}
                      placeholder="Coller le token JWS..." className="flex-1 bg-black/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-400 text-sm backdrop-blur-md focus:outline-none focus:border-emerald-500 font-mono" />
                    <button type="submit" disabled={!manualToken.trim() || scanning} className="bg-emerald-600 hover:bg-emerald-500 text-white p-3 rounded-xl disabled:opacity-50 transition-colors"><KeyRound size={20} /></button>
                  </form>
                </div>
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30">
                  <button type="button" onClick={() => setCameraActive(false)} className="bg-slate-800 hover:bg-slate-700 text-white px-8 py-2.5 rounded-full font-bold shadow-lg border border-slate-700 text-sm whitespace-nowrap transition-colors">Fermer Caméra</button>
                </div>
              </>
            )}

            {/* Idle screen */}
            {!cameraActive && result === 'idle' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-slate-900 space-y-5">
                {scanning
                  ? <div className="flex flex-col items-center gap-4">
                      <Loader2 size={48} className="text-orange-500 animate-spin" />
                      <p className="text-white font-bold">Validation en cours...</p>
                    </div>
                  : <>
                    <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center"><Camera size={40} className="text-slate-400" /></div>
                    <button onClick={() => setCameraActive(true)} className="bg-orange-600 hover:bg-orange-500 text-white px-8 py-3 rounded-xl font-bold w-full shadow-lg flex justify-center items-center gap-2 transition-all">
                      <Camera size={20} /> Lancer le Scan Vidéo
                    </button>
                    
                    <div className="w-full bg-slate-800/50 border border-slate-700 p-4 rounded-xl text-left">
                      <p className="text-xs text-slate-400 mb-2 uppercase font-bold tracking-wider flex items-center gap-1"><KeyRound size={12} /> Saisie manuelle</p>
                      <form onSubmit={handleManualSubmit} className="flex gap-2">
                        <input type="text" value={manualToken} onChange={e => setManualToken(e.target.value)} placeholder="Token JWS du billet..."
                          className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-orange-500 font-mono" />
                        <button type="submit" disabled={!manualToken.trim() || scanning} className="bg-emerald-600 hover:bg-emerald-500 text-white p-2 rounded-lg disabled:opacity-50"><CheckCircle size={18} /></button>
                      </form>
                    </div>
                    {!isOnline && (
                      <div className="w-full p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-center">
                        <p className="text-amber-400 text-xs font-semibold">
                          📴 Hors-ligne — Vérification cryptographique uniquement<br />
                          {cacheSize > 0 ? `${cacheSize} billet(s) en cache local` : 'Aucun cache — connectez-vous pour télécharger'}
                        </p>
                      </div>
                    )}
                  </>
                }
              </div>
            )}

            {result === 'success' && <div className="absolute inset-0 flex items-center justify-center bg-slate-900 p-6"><SuccessScreen payload={scannedPayload} onReset={reset} isOffline={!isOnline} /></div>}
            {result === 'error'   && <div className="absolute inset-0 flex items-center justify-center bg-slate-900 p-6"><ErrorScreen reason={errorReason} onReset={reset} /></div>}
          </>
        )}
      </div>

      <style>{`
        @keyframes scan { 0%,100%{top:0%;opacity:0}10%{opacity:1}90%{opacity:1}99%{top:100%;opacity:0} }
        #qr-reader video { width:100%!important;height:100%!important;object-fit:cover!important; }
      `}</style>
    </div>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────────────
const SuccessScreen: React.FC<{ payload: TicketPayload | null; onReset: () => void; isOffline: boolean }> = ({ payload, onReset, isOffline }) => (
  <div className="text-center space-y-6 animate-in zoom-in duration-300 w-full">
    <div className="w-32 h-32 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto border-4 border-emerald-500 relative">
      <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-ping" />
      <CheckCircle size={64} className="text-emerald-500" />
    </div>
    <div>
      <h3 className="text-3xl font-bold text-white">Accès Autorisé</h3>
      <p className="text-emerald-400 font-medium text-lg mt-2">{payload?.usr || 'Participant'}</p>
      <p className="text-slate-400 mt-1">Catégorie : {payload?.type || 'Standard'}</p>
      <p className="text-slate-500 text-xs mt-1 font-mono">{payload?.tId}</p>
      {isOffline && <p className="mt-3 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-1.5 inline-block">📴 Hors-ligne — Sync auto à la reconnexion</p>}
    </div>
    <button onClick={onReset} className="flex items-center justify-center w-full bg-slate-800 hover:bg-slate-700 text-white py-4 rounded-xl font-bold transition-colors">
      <RefreshCw size={20} className="mr-2" /> Scanner suivant
    </button>
  </div>
);

const ErrorScreen: React.FC<{ reason: string; onReset: () => void }> = ({ reason, onReset }) => (
  <div className="text-center space-y-6 animate-in zoom-in duration-300 w-full">
    <div className="w-32 h-32 bg-red-500/20 rounded-full flex items-center justify-center mx-auto border-4 border-red-500">
      <XCircle size={64} className="text-red-500" />
    </div>
    <div>
      <h3 className="text-3xl font-bold text-white">Accès Refusé</h3>
      <p className="text-red-400 font-medium text-lg mt-2">{reason}</p>
    </div>
    <button onClick={onReset} className="flex items-center justify-center w-full bg-slate-800 hover:bg-slate-700 text-white py-4 rounded-xl font-bold transition-colors">
      <RefreshCw size={20} className="mr-2" /> Réessayer
    </button>
  </div>
);
