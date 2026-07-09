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
  const [devicesList, setDevicesList]         = useState<any[]>([]);
  const [currentDeviceIndex, setCurrentDeviceIndex] = useState<number>(0);
  const [cameraError, setCameraError]         = useState<string>('');
  const cameraStoppingRef = useRef<Promise<void> | null>(null);
  const [fileDecoding, setFileDecoding]       = useState(false);

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
      
      const { data } = await query.limit(40000);
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
            
            // 1. Récupérer la liste des caméras physiques
            const allDevices = await Html5Qrcode.getCameras().catch(() => [] as any[]);
            
            // FILTRAGE STRICT : Exclure à 100% les caméras frontales/selfie
            const devices = allDevices.filter(d => {
              const label = (d.label || '').toLowerCase();
              return !label.includes('front') && 
                     !label.includes('selfie') && 
                     !label.includes('avant') && 
                     !label.includes('user');
            });

            if (mounted) {
              setDevicesList(devices);
            }
            
            // 2. Classer les objectifs en mettant les caméras arrière explicites en premier
            const rearCameras = devices.filter(d => {
              const label = (d.label || '').toLowerCase();
              return label.includes('back') || 
                     label.includes('rear') || 
                     label.includes('arrière') || 
                     label.includes('arriere') || 
                     label.includes('environment') || 
                     label.includes('environnement');
            });
            
            const orderedDevices = [
              ...rearCameras,
              ...devices.filter(d => !rearCameras.includes(d))
            ];
            
            if (orderedDevices.length === 0) {
              // Si aucun objectif n'est trouvé après filtrage strict, essayer en facingMode natif arrière
              try {
                const promiseFallback = html5QrCode.start(
                  { facingMode: 'environment' },
                  { fps: 15 },
                  (decoded) => { if (processTokenRef.current) processTokenRef.current(decoded); },
                  () => {}
                );
                initPromise = promiseFallback;
                await promiseFallback;
                return;
              } catch (fallbackErr) {
                throw new Error("Aucun objectif arrière compatible détecté.");
              }
            }
            
            // Déterminer l'index cible dans la liste ordonnée ou la liste brute
            let activeIndex = currentDeviceIndex;
            if (currentDeviceIndex < 0 || currentDeviceIndex >= devices.length) {
              // Par défaut, prendre la première caméra arrière ordonnée
              const bestDefaultDevice = orderedDevices[0];
              activeIndex = devices.findIndex(d => d.id === bestDefaultDevice.id);
              if (mounted) {
                setCurrentDeviceIndex(activeIndex);
              }
            }
            
            // 3. Boucle d'Auto-Healing :
            // Si l'objectif choisi refuse de s'ouvrir, on tente automatiquement les autres de la liste
            let success = false;
            let targetIndex = activeIndex;
            let attempts = 0;
            
            while (!success && attempts < devices.length && mounted) {
              const deviceId = devices[targetIndex].id;
              try {
                // Tentative 1 : HD
                try {
                  const promise = html5QrCode.start(
                    deviceId,
                    { 
                      fps: 15,
                      videoConstraints: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                      }
                    },
                    (decoded) => { if (processTokenRef.current) processTokenRef.current(decoded); },
                    () => {}
                  );
                  initPromise = promise;
                  await promise;
                  success = true;
                  if (mounted) setCurrentDeviceIndex(targetIndex);
                  break;
                } catch (hdErr) {
                  // Tentative 2 : Résolution Standard (sur le même objectif)
                  const promiseStd = html5QrCode.start(
                    deviceId,
                    { fps: 15 },
                    (decoded) => { if (processTokenRef.current) processTokenRef.current(decoded); },
                    () => {}
                  );
                  initPromise = promiseStd;
                  await promiseStd;
                  success = true;
                  if (mounted) setCurrentDeviceIndex(targetIndex);
                  break;
                }
              } catch (err) {
                console.warn(`L'objectif arrière à l'index ${targetIndex} a échoué. Tentative sur l'objectif suivant...`, err);
                targetIndex = (targetIndex + 1) % devices.length;
                attempts++;
              }
            }
            
            // 4. Si toutes les tentatives matérielles ont échoué, ultime secours facingMode natif
            if (!success && mounted) {
              try {
                const promiseFallback = html5QrCode.start(
                  { facingMode: 'environment' },
                  { fps: 15 },
                  (decoded) => { if (processTokenRef.current) processTokenRef.current(decoded); },
                  () => {}
                );
                initPromise = promiseFallback;
                await promiseFallback;
                success = true;
              } catch (fallbackErr) {
                console.error("Ultimate fallback facingMode failed:", fallbackErr);
              }
            }
            
            if (!success && mounted) {
              setCameraError("Impossible d'activer la caméra arrière. Veuillez autoriser l'accès ou utiliser l'option 'Prendre une Photo' de secours.");
            }
          } catch (err: any) {
            if (!mounted) return;
            console.error('Camera error:', err);
            setCameraError("Impossible d'accéder à la caméra arrière. Veuillez utiliser l'importation de photo.");
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
  }, [cameraActive, currentDeviceIndex]);

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

      // Step 0 — NFC bare ticket ID (new format: NFC chip only stores ticket ID, not JWS)
      // IDs look like "PHY-xxxxxxxx-xxxx" or "TIX-..." or a UUID — they never start with "eyJ"
      const isBareTicketId = token.trim().length < 80 && !token.startsWith('eyJ');
      if (isBareTicketId && online) {
        const { data: ticketById } = await supabase
          .from('tickets')
          .select('id, status, guest_name, ticket_type, event_id')
          .eq('id', token.trim())
          .single();
        if (ticketById) {
          ticketId = ticketById.id;
          payload  = { tId: ticketById.id, eId: ticketById.event_id || '', type: ticketById.ticket_type || 'Standard', usr: ticketById.guest_name || 'Billet Physique', iat: Date.now() };
          setCachedStatus(ticketById.id, ticketById.status);
        }
      } else if (isBareTicketId && !online) {
        // Offline: check local cache by ID directly
        const cachedStatusForId = getCachedStatus(token.trim());
        if (cachedStatusForId) {
          ticketId = token.trim();
          payload  = { tId: token.trim(), eId: '', type: 'Billet Physique', usr: 'Billet Physique', iat: Date.now() };
        }
      }

      // Step 1 — Cryptographic verification (works offline, for QR JWS tokens)
      if (!ticketId) {
        const cryptoResult = await verifyTicket(token);
        if (cryptoResult.valid && cryptoResult.payload) {
          ticketId = cryptoResult.payload.tId;
          payload  = cryptoResult.payload;
        }
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

      // Step 2b — Season Pass validation (multi-match pass)
      if (online && ticketId) {
        const { data: seasonTicket } = await supabase
          .from('tickets')
          .select('id, tournament_id, pass_id, status')
          .eq('id', ticketId)
          .maybeSingle();

        if (seasonTicket?.tournament_id) {
          // This is a season pass ticket — check the current event's tournament
          const currentEvent = (window as any).__currentScanEventId;
          if (currentEvent) {
            const { data: currentEvt } = await supabase
              .from('events')
              .select('tournament_id, title')
              .eq('id', currentEvent)
              .single();

            if (!currentEvt || currentEvt.tournament_id !== seasonTicket.tournament_id) {
              setResult('error');
              setErrorReason('❌ Pass Saison invalide pour ce match. Ce pass est lié à un autre tournoi.');
              setScanning(false); return;
            }
          }

          // Check if already checked-in for this specific event
          if (currentEvent) {
            const { data: existingCheckin } = await supabase
              .from('season_pass_checkins')
              .select('id')
              .eq('ticket_id', ticketId)
              .eq('event_id', currentEvent)
              .maybeSingle();

            if (existingCheckin) {
              setResult('error');
              setErrorReason('✅ Pass Saison déjà utilisé pour ce match.');
              setScanning(false); return;
            }

            // Log the check-in (don't mark ticket as 'used')
            await supabase.from('season_pass_checkins').insert([{
              ticket_id: ticketId,
              event_id: currentEvent,
              pass_id: seasonTicket.pass_id,
            }]);
          }

          // Season pass: mark local scan but DON'T mark ticket as 'used'
          markLocalScan(ticketId);
          setScannedPayload({ ...payload, type: '🎟️ Pass Saison' });
          setResult('success');
          refreshCounters();
          setScanning(false);
          return; // Skip Step 3–5 for season passes
        }
      }

      // Step 3 — Local double-scan check (always works offline)
      if (getLocalScans()[ticketId]) {
        setResult('error'); setErrorReason('Billet déjà scanné dans cette session !'); setScanning(false); return;
      }

      // Step 4a — Check local cache
      const cachedStatus = getCachedStatus(ticketId);
      if (cachedStatus === 'revoked') { setResult('error'); setErrorReason("Ce billet a été révoqué par l'organisateur."); setScanning(false); return; }
      if (cachedStatus === 'used')    { setResult('error'); setErrorReason('Billet déjà utilisé ! Accès refusé.'); setScanning(false); return; }

      // Step 4b — Atomic verification and update if online
      let updateSuccess = false;

      if (online) {
        // Atomic conditional update: only mark as used if it is currently 'valid'
        // This is safe against parallel/concurrent scans (Postgres write lock)
        const { data: updatedData, error: updateError } = await supabase
          .from('tickets')
          .update({ status: 'used' })
          .eq('id', ticketId)
          .eq('status', 'valid')
          .select('id, status');

        if (updateError) {
          console.error("Atomic update failed:", updateError);
          setResult('error'); setErrorReason('Erreur de connexion avec le serveur.'); setScanning(false); return;
        }

        if (updatedData && updatedData.length > 0) {
          // Success: Ticket status updated from 'valid' to 'used'
          updateSuccess = true;
          setCachedStatus(ticketId, 'used');
        } else {
          // Non-matching query: ticket could be used, revoked, or non-existent
          // Query the exact status to give the correct reason to the agent
          const { data: ticketData } = await supabase
            .from('tickets')
            .select('status')
            .eq('id', ticketId)
            .maybeSingle();

          const actualStatus = ticketData?.status || 'unknown';
          setCachedStatus(ticketId, actualStatus as any);

          if (actualStatus === 'revoked') {
            setResult('error'); setErrorReason("Ce billet a été révoqué par l'organisateur."); setScanning(false); return;
          } else if (actualStatus === 'used') {
            setResult('error'); setErrorReason('Billet déjà utilisé ! Accès refusé.'); setScanning(false); return;
          } else {
            setResult('error'); setErrorReason('Billet non trouvé ou invalide.'); setScanning(false); return;
          }
        }
      } else {
        // Offline mode: mark locally and add to pending sync queue
        addPendingSync(ticketId);
        setCachedStatus(ticketId, 'used');
        updateSuccess = true;
      }

      if (updateSuccess) {
        markLocalScan(ticketId);
        setScannedPayload(payload);
        setResult('success');
        refreshCounters();
      }

    } catch (err) {
      console.error('processToken error:', err);
      setResult('error');
      setErrorReason('Erreur lors de la validation.');
    }
    setScanning(false);
  };

  useEffect(() => { processTokenRef.current = processToken; });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setFileDecoding(true);
    setCameraActive(false);
    
    let fileDecoder: Html5Qrcode | null = null;
    try {
      let tempEl = document.getElementById('qr-reader-temp');
      if (!tempEl) {
        tempEl = document.createElement('div');
        tempEl.id = 'qr-reader-temp';
        tempEl.style.display = 'none';
        document.body.appendChild(tempEl);
      }
      
      fileDecoder = new Html5Qrcode('qr-reader-temp');
      const decodedText = await fileDecoder.scanFile(file, true);
      
      if (processTokenRef.current) {
        await processTokenRef.current(decodedText);
      }
    } catch (err) {
      console.error("Erreur de décodage de l'image:", err);
      setResult('error');
      setErrorReason("Impossible de lire le QR code sur l'image. Assurez-vous que l'image est bien nette et centrée sur le QR Code.");
    } finally {
      setFileDecoding(false);
      if (fileDecoder) {
        try { fileDecoder.clear(); } catch (_) {}
      }
    }
  };

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
                {cameraError && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-slate-950/95 text-center space-y-4">
                    <XCircle className="text-red-500 animate-pulse" size={48} />
                    <p className="text-white font-semibold text-base px-4">{cameraError}</p>
                    <p className="text-slate-400 text-xs max-w-xs mb-2">Cet objectif est peut-être désactivé, non supporté ou déjà utilisé par une autre application en arrière-plan.</p>
                    <button 
                      type="button"
                      onClick={() => document.getElementById('qr-file-input')?.click()}
                      className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-2.5 rounded-full font-bold shadow-lg border border-orange-500 flex items-center gap-2 text-sm transition-colors"
                    >
                      <Camera size={16} /> Prendre une Photo de Secours
                    </button>
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
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3">
                  {devicesList.length > 1 && (
                    <button 
                      type="button"
                      onClick={() => {
                        setCurrentDeviceIndex(prev => (prev + 1) % devicesList.length);
                      }} 
                      className="bg-orange-600 hover:bg-orange-500 text-white px-5 py-2.5 rounded-full font-bold shadow-lg border border-orange-500 flex items-center gap-2 text-sm whitespace-nowrap transition-colors"
                    >
                      <RefreshCw size={16} /> Changer Caméra
                    </button>
                  )}
                  <button type="button" onClick={() => setCameraActive(false)} className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-2.5 rounded-full font-bold shadow-lg border border-slate-700 text-sm whitespace-nowrap transition-colors">Fermer Caméra</button>
                </div>
              </>
            )}

            {/* Idle screen */}
            {!cameraActive && result === 'idle' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-slate-900 space-y-5">
                {scanning || fileDecoding
                  ? <div className="flex flex-col items-center gap-4">
                      <Loader2 size={48} className="text-orange-500 animate-spin" />
                      <p className="text-white font-bold">{fileDecoding ? "Décodage de la photo..." : "Validation en cours..."}</p>
                    </div>
                  : <>
                    <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center"><Camera size={40} className="text-slate-400" /></div>
                    <div className="w-full space-y-3">
                      <button onClick={() => setCameraActive(true)} className="bg-orange-600 hover:bg-orange-500 text-white px-8 py-3 rounded-xl font-bold w-full shadow-lg flex justify-center items-center gap-2 transition-all">
                        <Camera size={20} /> Lancer le Scan Vidéo
                      </button>
                      <button onClick={() => document.getElementById('qr-file-input')?.click()} className="bg-slate-850 hover:bg-slate-750 text-white px-8 py-3 rounded-xl font-bold w-full shadow-lg border border-slate-700/60 flex justify-center items-center gap-2 transition-all">
                        <Camera size={20} /> Prendre une Photo / Importer
                      </button>
                    </div>
                    <input type="file" id="qr-file-input" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
                    
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
