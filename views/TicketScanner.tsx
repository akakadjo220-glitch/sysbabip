import React, { useState, useEffect, useRef } from 'react';
import { Camera, CheckCircle, XCircle, RefreshCw, Wifi, WifiOff, Radio, Loader2, KeyRound } from 'lucide-react';
import { verifyTicket, TicketPayload } from '../utils/crypto';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '../supabaseClient';

// ─── Types ───────────────────────────────────────────────────────────────────

type ScanResult = 'idle' | 'success' | 'error';
type ScanMode = 'qr' | 'nfc';

// ─── Main Scanner Component ───────────────────────────────────────────────────

export const TicketScanner: React.FC = () => {
  const [result, setResult] = useState<ScanResult>('idle');
  const [cameraActive, setCameraActive] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [scanMode, setScanMode] = useState<ScanMode>('qr');
  const [manualToken, setManualToken] = useState('');
  const [scannedPayload, setScannedPayload] = useState<TicketPayload | null>(null);
  const [errorReason, setErrorReason] = useState('');
  const [agentName, setAgentName] = useState('Agent');
  const [scansCount, setScansCount] = useState(0);
  const [nfcSupported, setNfcSupported] = useState(false);
  const [nfcStatus, setNfcStatus] = useState('');

  const processTokenRef = useRef<((token: string) => Promise<void>) | null>(null);

  // ─── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    // Agent name from localStorage
    const stored = localStorage.getItem('afritix_current_agent');
    if (stored) {
      try { setAgentName(JSON.parse(stored).name || 'Agent'); } catch (_) {}
    }

    // Count local scans
    const local = JSON.parse(localStorage.getItem('afriTix_local_scans') || '{}');
    setScansCount(Object.keys(local).length);

    // Online/offline tracking
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    // Check Web NFC support
    setNfcSupported('NDEFReader' in window);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // ─── Camera (QR) ──────────────────────────────────────────────────────────

  useEffect(() => {
    let html5QrCode: Html5Qrcode | null = null;
    let mounted = true;

    if (cameraActive) {
      setTimeout(() => {
        if (!mounted) return;
        const el = document.getElementById('qr-reader');
        if (!el) return;

        html5QrCode = new Html5Qrcode('qr-reader');
        html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decoded) => {
            if (processTokenRef.current) processTokenRef.current(decoded);
          },
          () => {}
        ).catch((err) => {
          console.error('Camera error:', err);
          alert("Erreur d'accès à la caméra. Vérifiez les permissions et utilisez HTTPS.");
          setCameraActive(false);
        });
      }, 300);
    }

    return () => {
      mounted = false;
      if (html5QrCode?.isScanning) {
        html5QrCode.stop().then(() => html5QrCode?.clear()).catch(console.error);
      }
    };
  }, [cameraActive]);

  // ─── NFC (Web NFC API) ────────────────────────────────────────────────────

  useEffect(() => {
    if (scanMode !== 'nfc' || !nfcSupported) return;

    let reader: any;
    let active = true;

    (async () => {
      try {
        reader = new (window as any).NDEFReader();
        await reader.scan();
        setNfcStatus('En attente d\'un badge NFC...');

        reader.addEventListener('reading', ({ message }: any) => {
          if (!active) return;
          for (const record of message.records) {
            if (record.recordType === 'text') {
              const decoder = new TextDecoder(record.encoding || 'utf-8');
              const token = decoder.decode(record.data);
              if (processTokenRef.current) processTokenRef.current(token);
              return;
            }
          }
          setResult('error');
          setErrorReason('Badge NFC sans données de billet reconnues.');
        });

        reader.addEventListener('readingerror', () => {
          setNfcStatus('Erreur lecture NFC.');
        });
      } catch (err: any) {
        console.error('NFC error:', err);
        setNfcStatus(`NFC non accessible: ${err.message}`);
      }
    })();

    return () => {
      active = false;
      // NDEFReader doesn't have an explicit stop, but we flag as inactive
    };
  }, [scanMode, nfcSupported]);

  // ─── Core Token Processing ────────────────────────────────────────────────

  const processToken = async (token: string) => {
    if (scanning) return;
    setScanning(true);
    setCameraActive(false);

    await new Promise(r => setTimeout(r, 400));

    try {
      let ticketId: string | null = null;
      let payload: TicketPayload | null = null;

      // 1. Try cryptographic verification first (works for HTTPS-generated tickets)
      const cryptoResult = await verifyTicket(token);

      if (cryptoResult.valid && cryptoResult.payload) {
        // Crypto signature is valid
        ticketId = cryptoResult.payload.tId;
        payload = cryptoResult.payload;
      } else {
        // 2. Fallback: try to find ticket in Supabase by qr_code (handles HTTP-generated fallback tickets)
        const { data: ticketByQr } = await supabase
          .from('tickets')
          .select('id, status, guest_name, ticket_type, event_id')
          .eq('qr_code', token)
          .single();

        if (ticketByQr) {
          ticketId = ticketByQr.id;
          // Reconstruct a minimal payload for the success screen
          payload = {
            tId: ticketByQr.id,
            eId: ticketByQr.event_id || '',
            type: ticketByQr.ticket_type || 'Standard',
            usr: ticketByQr.guest_name || 'Participant',
            iat: Date.now(),
          };
        }
      }

      if (!ticketId || !payload) {
        setResult('error');
        setErrorReason('QR Code invalide ou inconnu dans le système.');
        setScanning(false);
        return;
      }

      // 3. Check Supabase for revocation and validity
      const { data: ticketData, error: ticketError } = await supabase
        .from('tickets')
        .select('id, status')
        .eq('id', ticketId)
        .maybeSingle();

      if (!ticketError && ticketData) {
        if (ticketData.status === 'revoked') {
          setResult('error');
          setErrorReason("Ce billet a été révoqué ou annulé par l'organisateur.");
          setScanning(false);
          return;
        }
        if (ticketData.status === 'used') {
          setResult('error');
          setErrorReason('Billet déjà utilisé ! Accès refusé.');
          setScanning(false);
          return;
        }
      }

      // 4. Local double-scan protection
      const localScans: Record<string, string> = JSON.parse(localStorage.getItem('afriTix_local_scans') || '{}');
      if (localScans[ticketId]) {
        setResult('error');
        setErrorReason('Billet déjà scanné dans cette session !');
        setScanning(false);
        return;
      }

      // 5. Mark as used in Supabase (best-effort)
      await supabase.from('tickets').update({ status: 'used' }).eq('id', ticketId);

      // 6. Mark locally
      localScans[ticketId] = new Date().toISOString();
      localStorage.setItem('afriTix_local_scans', JSON.stringify(localScans));
      setScansCount(Object.keys(localScans).length);

      setScannedPayload(payload);
      setResult('success');
    } catch (err) {
      console.error('processToken error:', err);
      setResult('error');
      setErrorReason('Erreur lors de la validation. Vérifiez la connexion.');
    }

    setScanning(false);
  };

  useEffect(() => {
    processTokenRef.current = processToken;
  });

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const reset = () => {
    setResult('idle');
    setManualToken('');
    setScannedPayload(null);
    setErrorReason('');
    if (scanMode === 'qr') setCameraActive(true);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualToken.trim()) processToken(manualToken.trim());
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-md mx-auto h-[calc(100vh-140px)] flex flex-col">

      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Contrôle d'accès</h2>
          <p className="text-slate-400 text-sm">📱 {agentName} • {scansCount} scan{scansCount !== 1 ? 's' : ''}</p>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${isOnline
          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50'
          : 'bg-red-500/20 text-red-400 border-red-500/50'
        }`}>
          {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
          {isOnline ? 'Connecté' : 'Hors-ligne'}
        </div>
      </div>

      {/* Mode Toggle */}
      <div className="flex bg-slate-800 p-1 rounded-xl mb-4 border border-slate-700 w-max mx-auto">
        <button
          onClick={() => { setScanMode('qr'); reset(); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${scanMode === 'qr' ? 'bg-orange-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
        >
          <Camera size={16} /> QR Code
        </button>
        <button
          onClick={() => { setScanMode('nfc'); setResult('idle'); setCameraActive(false); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${scanMode === 'nfc' ? 'bg-orange-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
        >
          <Radio size={16} /> NFC
        </button>
      </div>

      {/* Scanner area */}
      <div className="flex-1 relative rounded-3xl overflow-hidden bg-black shadow-2xl border-4 border-slate-800">

        {/* ── NFC Mode ── */}
        {scanMode === 'nfc' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-slate-900">
            {!nfcSupported ? (
              <div className="text-center space-y-4">
                <div className="w-24 h-24 bg-red-500/20 rounded-full flex items-center justify-center mx-auto border-2 border-red-500/50">
                  <Radio size={40} className="text-red-400" />
                </div>
                <h3 className="text-xl font-bold text-white">NFC non supporté</h3>
                <p className="text-slate-400 text-sm max-w-xs mx-auto">
                  Ce navigateur ne supporte pas la Web NFC API. Utilisez Chrome sur Android ou un lecteur NFC externe.
                </p>
              </div>
            ) : result === 'idle' ? (
              <div className="text-center space-y-6 w-full">
                <div className="w-32 h-32 bg-slate-800 rounded-full flex items-center justify-center mx-auto relative">
                  <div className="absolute inset-0 border-4 border-orange-500/30 rounded-full animate-ping" />
                  <Radio size={48} className="text-orange-500" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Approchez le badge NFC</h3>
                  <p className="text-slate-400 text-sm mt-2">{nfcStatus || 'Initialisation NFC...'}</p>
                </div>
              </div>
            ) : result === 'success' ? (
              <SuccessScreen payload={scannedPayload} onReset={reset} />
            ) : (
              <ErrorScreen reason={errorReason} onReset={reset} />
            )}
          </div>
        )}

        {/* ── QR Mode ── */}
        {scanMode === 'qr' && (
          <>
            {/* Camera active */}
            {cameraActive && result === 'idle' && (
              <>
                <div id="qr-reader" className="absolute inset-0 w-full h-full [&>video]:object-cover opacity-80 z-0" />

                {/* Overlay */}
                <div className="absolute inset-0 z-10 flex flex-col">
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
                      Placez le QR Code dans le cadre
                    </p>
                  </div>
                </div>

                {/* Manual input overlay */}
                <div className="absolute top-4 left-4 right-4 z-20">
                  <form onSubmit={handleManualSubmit} className="flex gap-2">
                    <input
                      type="text"
                      value={manualToken}
                      onChange={e => setManualToken(e.target.value)}
                      placeholder="Coller le token JWS ici..."
                      className="flex-1 bg-black/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-400 text-sm backdrop-blur-md focus:outline-none focus:border-emerald-500 font-mono"
                    />
                    <button
                      type="submit"
                      disabled={!manualToken.trim() || scanning}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white p-3 rounded-xl disabled:opacity-50 transition-colors"
                    >
                      <KeyRound size={20} />
                    </button>
                  </form>
                </div>

                <button
                  onClick={() => setCameraActive(false)}
                  className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 bg-slate-800 text-white px-6 py-2 rounded-full font-bold shadow-lg border border-slate-700"
                >
                  Fermer Caméra
                </button>
              </>
            )}

            {/* Idle screen */}
            {!cameraActive && result === 'idle' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-slate-900 space-y-5">
                {scanning ? (
                  <div className="flex flex-col items-center gap-4">
                    <Loader2 size={48} className="text-orange-500 animate-spin" />
                    <p className="text-white font-bold">Validation en cours...</p>
                  </div>
                ) : (
                  <>
                    <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center">
                      <Camera size={40} className="text-slate-400" />
                    </div>
                    <button
                      onClick={() => setCameraActive(true)}
                      className="bg-orange-600 hover:bg-orange-500 text-white px-8 py-3 rounded-xl font-bold w-full shadow-lg flex justify-center items-center gap-2"
                    >
                      <Camera size={20} /> Lancer la Caméra
                    </button>

                    {/* Manual entry */}
                    <div className="w-full bg-slate-800/50 border border-slate-700 p-4 rounded-xl text-left">
                      <p className="text-xs text-slate-400 mb-2 uppercase font-bold tracking-wider flex items-center gap-1">
                        <KeyRound size={12} /> Saisie manuelle du token
                      </p>
                      <form onSubmit={handleManualSubmit} className="flex gap-2">
                        <input
                          type="text"
                          value={manualToken}
                          onChange={e => setManualToken(e.target.value)}
                          placeholder="Token JWS du billet..."
                          className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-orange-500 font-mono"
                        />
                        <button
                          type="submit"
                          disabled={!manualToken.trim() || scanning}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white p-2 rounded-lg disabled:opacity-50"
                        >
                          <CheckCircle size={18} />
                        </button>
                      </form>
                    </div>

                    {!isOnline && (
                      <div className="w-full p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-center">
                        <p className="text-red-400 text-xs font-semibold">
                          ⚠️ Hors-ligne — La vérification Supabase est désactivée. Seule la signature cryptographique sera validée.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Result screens */}
            {result === 'success' && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900 p-6">
                <SuccessScreen payload={scannedPayload} onReset={reset} />
              </div>
            )}
            {result === 'error' && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900 p-6">
                <ErrorScreen reason={errorReason} onReset={reset} />
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes scan {
          0%, 100% { top: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          99% { top: 100%; opacity: 0; }
        }
        #qr-reader video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
        }
      `}</style>
    </div>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const SuccessScreen: React.FC<{ payload: TicketPayload | null; onReset: () => void }> = ({ payload, onReset }) => (
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
    </div>
    <button
      onClick={onReset}
      className="flex items-center justify-center w-full bg-slate-800 hover:bg-slate-700 text-white py-4 rounded-xl font-bold transition-colors"
    >
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
    <button
      onClick={onReset}
      className="flex items-center justify-center w-full bg-slate-800 hover:bg-slate-700 text-white py-4 rounded-xl font-bold transition-colors"
    >
      <RefreshCw size={20} className="mr-2" /> Réessayer
    </button>
  </div>
);
