import { useEffect, useRef } from 'react';
import { photo, photoSet } from './PhotoStrip';
import { reducedMotion } from './ui';

/** Photo header for an app tab: slow parallax on scroll, slight zoom on hover. */
export function PageBanner({ name, caption }: { name: string; caption: string }) {
  const img = useRef<HTMLImageElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (reducedMotion()) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const b = box.current?.getBoundingClientRect();
      if (b && img.current) img.current.style.transform = `translate3d(0, ${(-b.top * 0.25).toFixed(1)}px, 0) scale(var(--z, 1.15))`;
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', on, { passive: true });
    return () => {
      window.removeEventListener('scroll', on);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div ref={box} className="group relative -mx-4 mb-8 h-28 overflow-hidden sm:mx-0 sm:h-40" style={{ ['--z' as any]: 1.15 }} onMouseEnter={(e) => e.currentTarget.style.setProperty('--z', '1.2')} onMouseLeave={(e) => e.currentTarget.style.setProperty('--z', '1.15')}>
      <img ref={img} src={photo(name)} srcSet={photoSet(name)} sizes="(min-width: 1200px) 1152px, 100vw" decoding="async" alt="" className="photo absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out" style={{ transform: 'scale(1.15)' }} />
      <span className="absolute bottom-0 left-0 bg-inv px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-invink">{caption}</span>
    </div>
  );
}
