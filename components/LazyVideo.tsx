import React, { useRef, useEffect, useState } from 'react';
import { Volume2, VolumeX, Play } from 'lucide-react';

interface LazyVideoProps {
  src: string;
  poster?: string;
  className?: string;
  /** If true, shows mute/unmute button. Default: true */
  showControls?: boolean;
  /** Object-fit style. Default: 'cover' */
  objectFit?: 'cover' | 'contain';
  /** Loop. Default: true */
  loop?: boolean;
  /** If true, loads immediately (no lazy loading logic) */
  priority?: boolean;
}

/** Detects YouTube or Vimeo URLs and returns embed URL, else returns null */
export const getEmbedUrl = (url: string): { type: 'youtube' | 'vimeo'; embedUrl: string } | null => {
  if (!url) return null;
  // YouTube
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) return { type: 'youtube', embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&mute=1&loop=1&playlist=${ytMatch[1]}&controls=0&modestbranding=1&rel=0` };
  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return { type: 'vimeo', embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1&muted=1&loop=1&background=1` };
  return null;
};

/**
 * LazyVideo: Renders a video that autoplays (muted) only when it enters the viewport.
 * Supports direct MP4/WEBM uploads and YouTube/Vimeo embeds.
 */
export const LazyVideo: React.FC<LazyVideoProps> = ({
  src,
  poster,
  className = '',
  showControls = true,
  objectFit = 'cover',
  loop = true,
  priority = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVisible, setIsVisible] = useState(priority);
  const [isMuted, setIsMuted] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasAppeared, setHasAppeared] = useState(priority);

  const embed = getEmbedUrl(src);

  // IntersectionObserver: only play when visible
  useEffect(() => {
    if (!containerRef.current || priority) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
        if (!entry.isIntersecting && videoRef.current) {
          videoRef.current.pause();
        } else if (entry.isIntersecting && videoRef.current && isLoaded) {
          videoRef.current.play().catch(() => {});
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isLoaded, priority]);

  // Keep track of appearance
  useEffect(() => {
    if (isVisible && !hasAppeared) setHasAppeared(true);
  }, [isVisible, hasAppeared]);

  // Play/pause based on visibility
  useEffect(() => {
    if (!videoRef.current || !isLoaded) return;
    if (isVisible || priority) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [isVisible, isLoaded, priority]);

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  // ── YouTube / Vimeo embed ──────────────────────────────────────────────────
  if (embed) {
    return (
      <div ref={containerRef} className={`relative overflow-hidden ${className}`}>
        {hasAppeared && (
          <iframe
            src={embed.embedUrl}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            className={`absolute top-1/2 left-1/2 w-[250%] h-[250%] md:w-[150%] md:h-[150%] -translate-x-1/2 -translate-y-[55%] md:-translate-y-1/2 border-0 transition-opacity duration-700 ${isVisible || priority ? 'opacity-100' : 'opacity-0'}`}
            style={{ pointerEvents: 'none' }}
            title="video"
            onLoad={() => setIsLoaded(true)}
          />
        )}
        {(!isLoaded || !hasAppeared) && poster && (
          <img src={poster} alt="poster" className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500" />
        )}
      </div>
    );
  }

  // ── Direct MP4 / WEBM ─────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className={`relative overflow-hidden ${className}`}>
      {/* Poster shown until video is ready */}
      {!isLoaded && poster && (
        <img
          src={poster}
          alt="poster"
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500"
        />
      )}

      <video
        ref={videoRef}
        src={hasAppeared ? src : undefined}    // Keep src once it appears
        poster={poster}
        muted
        loop={loop}
        playsInline
        preload="none"
        className={`w-full h-full transition-opacity duration-700 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
        style={{ objectFit }}
        onCanPlay={() => {
          setIsLoaded(true);
          videoRef.current?.play().catch(() => {});
        }}
      />

      {/* Mute toggle button */}
      {showControls && isLoaded && (
        <button
          onClick={toggleMute}
          className="absolute bottom-3 right-3 z-10 w-8 h-8 rounded-full bg-black/50 hover:bg-black/80 backdrop-blur-md flex items-center justify-center text-white transition-all border border-white/20"
          title={isMuted ? 'Activer le son' : 'Couper le son'}
        >
          {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
      )}
    </div>
  );
};

/**
 * VideoUploadField: Reusable upload zone for videos (max 25 MB)
 * Supports drag & drop, file picker, and URL fallback.
 */
interface VideoUploadFieldProps {
  value: string;
  onChange: (url: string) => void;
  onUpload: (file: File) => Promise<void>;
  uploading: boolean;
  label?: string;
}

export const VideoUploadField: React.FC<VideoUploadFieldProps> = ({
  value, onChange, onUpload, uploading, label = 'Vidéo (optionnel)'
}) => {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onUpload(file);
  };

  const embed = value ? getEmbedUrl(value) : null;

  return (
    <div>
      <label className="block text-xs font-bold text-slate-400 mb-2 uppercase">{label}</label>

      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !value && inputRef.current?.click()}
        className={`relative rounded-xl border-2 border-dashed transition-all text-center ${
          value ? 'border-slate-600 p-2 cursor-default' :
          dragOver ? 'border-orange-400 bg-orange-500/10 p-6 cursor-pointer' :
          'border-slate-600 hover:border-orange-500/60 hover:bg-orange-500/5 p-6 cursor-pointer'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); }}
        />

        {uploading ? (
          <div className="flex flex-col items-center gap-2 py-2">
            <div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-orange-400 text-sm font-bold">Upload en cours...</p>
          </div>
        ) : value ? (
          <div className="flex items-center gap-3">
            {/* Mini preview */}
            {embed ? (
              <div className="w-20 h-12 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                <Play size={16} className="text-slate-400" />
                <span className="text-[10px] text-slate-500 ml-1">{embed.type}</span>
              </div>
            ) : (
              <video src={value} className="w-20 h-12 rounded-lg object-cover shrink-0 border border-slate-700" muted />
            )}
            <div className="flex-1 min-w-0 text-left">
              <p className="text-white text-xs font-bold truncate">{value.split('/').pop()}</p>
              <p className="text-slate-500 text-[10px]">{embed ? `Embed ${embed.type}` : 'Vidéo uploadée'}</p>
            </div>
            <button
              onClick={e => { e.stopPropagation(); onChange(''); }}
              className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-bold shrink-0"
            >✕</button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center">
              <Play size={18} className="text-slate-400" />
            </div>
            <p className="text-slate-300 text-sm font-bold">Glisser-déposer ou cliquer</p>
            <p className="text-slate-500 text-xs">MP4, WEBM — max 25 Mo</p>
          </div>
        )}
      </div>

      {/* YouTube / Vimeo URL fallback */}
      <div className="mt-2 flex items-center gap-2">
        <div className="flex-1 h-px bg-slate-700" />
        <span className="text-slate-500 text-xs">ou lien YouTube / Vimeo</span>
        <div className="flex-1 h-px bg-slate-700" />
      </div>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        className="mt-2 w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 text-sm"
        placeholder="https://youtube.com/watch?v=... ou https://vimeo.com/..."
      />
    </div>
  );
};
