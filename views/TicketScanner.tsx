import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, CheckCircle, XCircle, RefreshCw, Wifi, WifiOff, Radio, Loader2, KeyRound, Cloud, CloudOff, Download } from 'lucide-react';
import { verifyTicket, TicketPayload } from '../utils/crypto';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '../supabaseClient';

// ─── Constants ────────────────────────────────────────────────────────────────
const PENDING_SYNCS_KEY = 'babipass_pending_syncs';
const LOCAL_SCANS_KEY   = 'afriTix_local_scans';
const TICKET_CACHE_KEY  = 'babipass_ticket_cache';
const CACHE_TTL_MS      = 6 * 60 * 60 * 1000; // 6h

// ─── Types ────────────────────────────────────────────────────────────────────
type ScanResult = 'idle' | 'success' | 'error';
type ScanMode   = 'qr' | 'nfc';

interface PendingSync { ticketId: string; scannedAt: string; }
interface TicketCacheEntry { status: 'valid' | 'used' | 'revoked'; fetchedAt: number; }

// ─── Pure helpers (outside component = stable references) ─────────────────────
const getPendingSyncs = (): PendingSync[] => {
  try { return JSON.parse(localStorage.getItem(PENDING_SYNCS_KEY) || '[]'); } catch { return []; }
};
const addPendingSync = (ticketId: string) => {
  const queue = getPendingSyncs();
  if (!queue.find(p => p.ticketId === ticketId)) {
    queue.push({ ticketId, scannedAt: new Date().toISOString() });
    localStorage.setItem(PENDING_SYNCS_KEY, JSON.stringify(queue));
  }
};
const getLocalScans = (): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(LOCAL_SCANS_KEY) || '{}'); } catch { return {}; }
};
const markLocalScan = (ticketId: string) => {
  const scans = getLocalScans();
  scans[ticketId] = new Date().toISOString();
  localStorage.setItem(LOCAL_SCANS_KEY, JSON.stringify(scans));
};
const getCachedStatus = (ticketId: string): 'valid' | 'used' | 'revoked' | null => {
  try {
    const cache: Record<string, TicketCacheEntry> = JSON.parse(localStorage.getItem(TICKET_CACHE_KEY) || '{}');
    const entry = cache[ticketId];
    if (!entry || Date.now() - entry.fetchedAt > CACHE_TTL_MS) return null;
    return entry.status;
  } catch { return null; }
};
const setCachedStatus = (ticketId: string, status: 'valid' | 'used' | 'revoked') => {
  try {
    const cache: Record<string, TicketCacheEntry> = JSON.parse(localStorage.getItem(TICKET_CACHE_KEY) || '{}');
    cache[ticketId] = { status, fetchedAt: Date.now() };
    localStorage.setItem(TICKET_CACHE_KEY, JSON.stringify(cache));
  } catch { /* ignore */ }
};

// ─── Main Component ───────────────────────────────────────────────────────────
export const TicketScanner: React.FC = () => {
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

  // Keep a stable ref for processToken to use in camera/NFC callbacks
  const processTokenRef = useRef<((token: string) => Promise<void>) | null>(null);
  // Keep online state accessible in callbacks without re-creating them
  const isOnlineRef = useRef(navigator.onLine);

  // ─── Counter refresh ────────────────────────────────────────────────────
  const refreshCounters = () => {
    setScansCount(Object.keys(getLocalScans()).length);
    setPendingCount(getPendingSyncs().length);
    try {
      const cache: Record<string, TicketCacheEntry> = JSON.parse(localStorage.getItem(TICKET_CACHE_KEY) || '{}');
      setCacheSize(Object.keys(cache).length);
    } catch { setCacheSize(0); }
  };

  // ─── Sync queue → Supabase ──────────────────────────────────────────────
  const flushPendingSyncs = useCallback(async () => {
    const queue = getPendingSyncs();
    if (queue.length === 0) return;
    setSyncing(true);
    const failed: PendingSync[] = [];
    for (const item of queue) {
      try {
        const { error } = await supabase.from('tickets').update({ status: 'used' }).eq('id', item.ticketId);
        if (error) failed.push(item);
        else setCachedStatus(item.ticketId, 'used');
      } catch { failed.push(item); }
    }
    localStorage.setItem(PENDING_SYNCS_KEY, JSON.stringify(failed));
    const synced = queue.length - failed.length;
    if (synced > 0) setLastSyncInfo(`✅ ${synced} billet(s) synchronisé(s)`);
    setSyncing(false);
    refreshCounters();
  }, []); // no dependencies — uses only stable helpers

  // ─── Pre-cache for offline ──────────────────────────────────────────────
  const preCacheEventTickets = useCallback(async () => {
    if (!isOnlineRef.current) return;
    setSyncing(true);
    try {
      const stored = localStorage.getItem('afritix_current_agent');
      const agent = stored ? JSON.parse(stored) : null;

      let query = supabase.from('tickets').select('id, status').in('status', ['valid', 'used', 'revoked']);
      
      // Filtrer par événement spécifique si l'agent est assigné à un événement
      if (agent?.event_id) {
        query = query.eq('event_id', agent.event_id);
      }
      
      const { data } = await query.limit(5000);
      if (data) {
        const cache: Record<string, TicketCacheEntry> = {};
        const now = Date.now();
        for (const t of data) cache[t.id] = { status: t.status, fetchedAt: now };
        localStorage.setItem(TICKET_CACHE_KEY, JSON.stringify(cache));
        setLastSyncInfo(`📥 ${data.length} billet(s) mis en cache hors-ligne`);
        refreshCounters();
      }
    } catch (e) { console.error('Pre-cache failed:', e); }
    setSyncing(false);
  }, []); // no dependencies

  // ─── Init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem('afritix_current_agent');
    if (stored) {
      try { setAgentName(JSON.parse(stored).name || 'Agent'); } catch (_) {}
    }
    refreshCounters();
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
  }, [flushPendingSyncs]); // flushPendingSyncs is stable (no deps)

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
        
        try {
          html5QrCode = new Html5Qrcode('qr-reader');
          // On demande la caméra haute résolution pour lire les QR JWS denses
          initPromise = html5QrCode.start(
            { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } as MediaTrackConstraints,
            { fps: 15 }, // Pas de qrbox = scanne toute l'image HD, idéal pour QR denses
            (decoded) => { if (processTokenRef.current) processTokenRef.current(decoded); },
            () => {}
          ).catch((err) => {
            if (!mounted) return;
            console.error('Camera error:', err);
            alert("Erreur d'accès à la caméra. Vérifiez les permissions et utilisez HTTPS.");
            setCameraActive(false);
          });
        } catch (e) {
          console.error("Camera init crash", e);
        }
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
      cleanup();
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

  // ─── Core Token Processing (Offline-First) ───────────────────────────────
  const processToken = async (token: string) => {
    if (scanning) return;
    setScanning(true);
    setCameraActive(false);
    await new Promise(r => setTimeout(r, 400));

    try {
      let ticketId: string | null = null;
      let payload: TicketPayload | null = null;
      const online = isOnlineRef.current;

      // Step 1 — Cryptographic verification (works offline)
      const cryptoResult = await verifyTicket(token);
      if (cryptoResult.valid && cryptoResult.payload) {
        ticketId = cryptoResult.payload.tId;
        payload  = cryptoResult.payload;
      }

      // Step 2 — Fallback: lookup by qr_code in Supabase (requires online)
      if (!ticketId && online) {
        const { data: ticketByQr } = await supabase
          .from('tickets')
          .select('id, status, guest_name, ticket_type, event_id')
          .eq('qr_code', token)
          .single();
        if (ticketByQr) {
          ticketId = ticketByQr.id;
          payload  = { tId: ticketByQr.id, eId: ticketByQr.event_id || '', type: ticketByQr.ticket_type || 'Standard', usr: ticketByQr.guest_name || 'Participant', iat: Date.now() };
          setCachedStatus(ticketByQr.id, ticketByQr.status);
        }
      }

      if (!ticketId || !payload) {
        setResult('error'); setErrorReason('QR Code invalide ou inconnu dans le système.'); setScanning(false); return;
      }

      // Step 3 — Local double-scan check (always works offline)
      if (getLocalScans()[ticketId]) {
        setResult('error'); setErrorReason('Billet déjà scanné dans cette session !'); setScanning(false); return;
      }

      // Step 4a — Check local cache
      const cachedStatus = getCachedStatus(ticketId);
      if (cachedStatus === 'revoked') { setResult('error'); setErrorReason("Ce billet a été révoqué par l'organisateur."); setScanning(false); return; }
      if (cachedStatus === 'used')    { setResult('error'); setErrorReason('Billet déjà utilisé ! Accès refusé.'); setScanning(false); return; }

      // Step 4b — Check Supabase if online
      if (online) {
        const { data: ticketData, error: ticketError } = await supabase.from('tickets').select('id, status').eq('id', ticketId).maybeSingle();
        if (!ticketError && ticketData) {
          setCachedStatus(ticketId, ticketData.status);
          if (ticketData.status === 'revoked') { setResult('error'); setErrorReason("Ce billet a été révoqué par l'organisateur."); setScanning(false); return; }
          if (ticketData.status === 'used')    { setResult('error'); setErrorReason('Billet déjà utilisé ! Accès refusé.'); setScanning(false); return; }
        }
      }

      // Step 5 — Mark as used
      markLocalScan(ticketId);
      setCachedStatus(ticketId, 'used');

      if (online) {
        await supabase.from('tickets').update({ status: 'used' }).eq('id', ticketId);
      } else {
        addPendingSync(ticketId); // will sync when back online
      }

      setScannedPayload(payload);
      setResult('success');
      refreshCounters();

    } catch (err) {
      console.error('processToken error:', err);
      setResult('error');
      setErrorReason('Erreur lors de la validation.');
    }
    setScanning(false);
  };

  // Keep ref up to date every render (no dep array needed)
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
          <p className="text-slate-400 text-sm">📱 {agentName} • {scansCount} scan{scansCount !== 1 ? 's' : ''}</p>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${isOnline
          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50'
          : 'bg-red-500/20 text-red-400 border-red-500/50'}`}>
          {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
          {isOnline ? 'Connecté' : 'Hors-ligne'}
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
                <button onClick={() => setCameraActive(false)} className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 bg-slate-800 text-white px-6 py-2 rounded-full font-bold shadow-lg border border-slate-700">Fermer Caméra</button>
              </>
            )}

            {/* Idle screen */}
            {!cameraActive && result === 'idle' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-slate-900 space-y-5">
                {scanning
                  ? <div className="flex flex-col items-center gap-4"><Loader2 size={48} className="text-orange-500 animate-spin" /><p className="text-white font-bold">Validation en cours...</p></div>
                  : <>
                    <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center"><Camera size={40} className="text-slate-400" /></div>
                    <button onClick={() => setCameraActive(true)} className="bg-orange-600 hover:bg-orange-500 text-white px-8 py-3 rounded-xl font-bold w-full shadow-lg flex justify-center items-center gap-2">
                      <Camera size={20} /> Lancer la Caméra
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
