import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Volume2, VolumeX } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { getEmbedUrl } from './LazyVideo';

interface AdBanner {
  id: string;
  title: string;
  subtitle?: string;
  image_url: string;
  video_url?: string;
  cta_label?: string;
  cta_url?: string;
  badge_label?: string;
  badge_color?: string;
  display_order: number;
}

const BADGE_COLORS: Record<string, string> = {
  orange: 'bg-orange-500/90 text-white border-orange-400/50',
  blue: 'bg-blue-500/90 text-white border-blue-400/50',
  green: 'bg-emerald-500/90 text-white border-emerald-400/50',
  purple: 'bg-purple-500/90 text-white border-purple-400/50',
  red: 'bg-rose-500/90 text-white border-rose-400/50',
};

/** Background media component — handles image, MP4 upload, or YouTube/Vimeo embed */
const BannerBackground: React.FC<{
  banner: AdBanner;
  isAnimating: boolean;
  direction: 'left' | 'right';
  isMuted: boolean;
  onToggleMute: () => void;
}> = ({ banner, isAnimating, direction, isMuted, onToggleMute }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync mute state with video element
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = isMuted;
  }, [isMuted]);

  // IntersectionObserver: autoplay only when visible
  useEffect(() => {
    if (!videoRef.current || !banner.video_url) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) videoRef.current?.play().catch(() => {});
        else videoRef.current?.pause();
      },
      { threshold: 0.2 }
    );
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [banner.video_url, banner.id]);

  const animCls = isAnimating
    ? (direction === 'right' ? '-translate-x-8 opacity-0' : 'translate-x-8 opacity-0')
    : 'translate-x-0 opacity-100';

  const embed = banner.video_url ? getEmbedUrl(banner.video_url) : null;

  return (
    <div ref={containerRef} className={`absolute inset-0 transition-all duration-700 ease-out ${animCls}`}>
      {/* ── YouTube / Vimeo embed ── */}
      {embed && (
        <>
          <iframe
            key={banner.id + '-embed'}
            src={embed.embedUrl}
            allow="autoplay; fullscreen"
            className="absolute inset-0 w-full h-full border-0 scale-110"
            style={{ pointerEvents: 'none' }}
            title={banner.title}
          />
          {/* No mute toggle for embeds (controlled by URL params) */}
        </>
      )}

      {/* ── Direct MP4 upload ── */}
      {banner.video_url && !embed && (
        <>
          <video
            ref={videoRef}
            key={banner.id + '-video'}
            src={banner.video_url}
            poster={banner.image_url}
            muted
            loop
            playsInline
            autoPlay
            preload="none"
            className="absolute inset-0 w-full h-full object-cover"
            onCanPlay={() => videoRef.current?.play().catch(() => {})}
          />
          {/* Mute toggle button */}
          <button
            onClick={e => { e.stopPropagation(); onToggleMute(); }}
            className="absolute bottom-10 right-3 z-30 w-8 h-8 rounded-full bg-black/50 hover:bg-black/80 backdrop-blur-md flex items-center justify-center text-white transition-all border border-white/20"
          >
            {isMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
          </button>
        </>
      )}

      {/* ── Static image fallback (or if no video) ── */}
      {!banner.video_url && (
        <img
          key={banner.id + '-img'}
          src={banner.image_url}
          alt={banner.title}
          className="w-full h-full object-cover scale-105 group-hover:scale-100 transition-transform duration-[8s]"
        />
      )}

      {/* Gradient overlay (always) */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#0f172a]/95 via-[#0f172a]/60 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a]/80 via-transparent to-transparent" />
    </div>
  );
};

export const AdCarousel: React.FC = () => {
  const [banners, setBanners] = useState<AdBanner[]>([]);
  const [current, setCurrent] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [direction, setDirection] = useState<'left' | 'right'>('right');
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const fetchBanners = async () => {
      const { data } = await supabase
        .from('ad_banners')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (data && data.length > 0) setBanners(data);
    };
    fetchBanners();
  }, []);

  const goTo = useCallback((index: number, dir: 'left' | 'right' = 'right') => {
    if (isAnimating || banners.length <= 1) return;
    setDirection(dir);
    setIsAnimating(true);
    setTimeout(() => { setCurrent(index); setIsAnimating(false); }, 400);
  }, [isAnimating, banners.length]);

  const next = useCallback(() => goTo((current + 1) % banners.length, 'right'), [current, banners.length, goTo]);
  const prev = useCallback(() => goTo((current - 1 + banners.length) % banners.length, 'left'), [current, banners.length, goTo]);

  // Auto-play: pause when current banner has a direct video (video is the entertainment)
  const currentBanner = banners[current];
  const currentHasDirectVideo = currentBanner?.video_url && !getEmbedUrl(currentBanner.video_url);

  useEffect(() => {
    if (isPaused || banners.length <= 1 || currentHasDirectVideo) return;
    intervalRef.current = setInterval(next, 5000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [next, isPaused, banners.length, currentHasDirectVideo]);

  if (banners.length === 0) return null;

  const banner = banners[current];
  const badgeClass = BADGE_COLORS[banner.badge_color || 'orange'] || BADGE_COLORS.orange;

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl md:rounded-3xl border border-white/10 shadow-2xl group"
      style={{ minHeight: '180px' }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <BannerBackground
        banner={banner}
        isAnimating={isAnimating}
        direction={direction}
        isMuted={isMuted}
        onToggleMute={() => setIsMuted(m => !m)}
      />

      {/* Text Content */}
      <div className={`relative z-10 flex flex-col justify-center h-full p-6 md:p-10 min-h-[180px] md:min-h-[220px] lg:min-h-[260px] transition-all duration-400 ease-out ${isAnimating ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}`}>
        <div className="max-w-xl space-y-3">
          {banner.badge_label && (
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest border backdrop-blur-md ${badgeClass}`}>
              {banner.badge_label}
            </span>
          )}
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-black text-white leading-tight drop-shadow-lg">{banner.title}</h2>
          {banner.subtitle && (
            <p className="text-sm md:text-base text-slate-300 leading-relaxed max-w-md line-clamp-2">{banner.subtitle}</p>
          )}
          {banner.cta_url && banner.cta_label && (
            <a
              href={banner.cta_url}
              target={banner.cta_url.startsWith('http') ? '_blank' : '_self'}
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 mt-2 px-5 py-2.5 bg-white text-slate-900 rounded-xl font-bold text-sm hover:bg-orange-400 hover:text-white transition-all shadow-lg hover:shadow-orange-500/30 hover:scale-105 active:scale-95"
            >
              {banner.cta_label} <ExternalLink size={14} />
            </a>
          )}
        </div>
      </div>

      {/* Navigation Arrows */}
      {banners.length > 1 && (
        <>
          <button onClick={prev} className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/40 hover:bg-black/70 border border-white/20 flex items-center justify-center text-white backdrop-blur-md transition-all opacity-0 group-hover:opacity-100 hover:scale-110 active:scale-95">
            <ChevronLeft size={18} />
          </button>
          <button onClick={next} className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/40 hover:bg-black/70 border border-white/20 flex items-center justify-center text-white backdrop-blur-md transition-all opacity-0 group-hover:opacity-100 hover:scale-110 active:scale-95">
            <ChevronRight size={18} />
          </button>
        </>
      )}

      {/* Dot Navigation */}
      {banners.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
          {banners.map((_, i) => (
            <button key={i} onClick={() => goTo(i, i > current ? 'right' : 'left')}
              className={`transition-all duration-300 rounded-full ${i === current ? 'w-6 h-2 bg-white' : 'w-2 h-2 bg-white/40 hover:bg-white/70'}`}
            />
          ))}
        </div>
      )}

      {/* Progress bar (only for image slides) */}
      {!isPaused && banners.length > 1 && !currentHasDirectVideo && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10 z-20 overflow-hidden">
          <div key={current} className="h-full bg-orange-500 animate-progress-bar"
            style={{ animationDuration: '5s', animationTimingFunction: 'linear', animationFillMode: 'forwards' }}
          />
        </div>
      )}

      {/* Pub label */}
      <div className="absolute top-3 right-3 z-20 text-[9px] text-white/30 uppercase tracking-widest font-bold">Pub</div>
    </div>
  );
};
