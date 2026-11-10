import { useEffect, useRef, useState } from 'react';
import { reducedMotion } from './ui';

/**
 * Scroll-driven "focus pull": a photo opens from a small blurred aperture to full width
 * while a lens ring turns around it. Pinned while it plays.
 */
export function FocusImage({ src, alt, before, after }: { src: string; alt: string; before: string; after: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const still = reducedMotion();
  const [p, setP] = useState(still ? 1 : 0);
  const [size, setSize] = useState({ w: 1280, h: 800 });
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      setSize({ w: window.innerWidth, h: window.innerHeight });
      if (still) return;
      const el = outer.current;
      if (!el) return;
      const span = el.offsetHeight - window.innerHeight;
      setP(Math.max(0, Math.min(1, span > 0 ? -el.getBoundingClientRect().top / span : 1)));
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => {
      window.removeEventListener('scroll', on);
      window.removeEventListener('resize', on);
      cancelAnimationFrame(raf);
    };
  }, [still]);

  // ease, with a short hold at both ends
  const t = Math.max(0, Math.min(1, (p - 0.1) / 0.75));
  const e = t * t * (3 - 2 * t);
  const minR = Math.min(size.w, size.h) * 0.2;
  const maxR = Math.hypot(size.w, size.h) / 2 + 4;
  const r = minR + (maxR - minR) * e;
  const blur = 9 * (1 - e);
  const ringD = 2 * r + 36;
  const sharp = e > 0.55;

  return (
    <div ref={outer} style={{ height: still ? 'auto' : '240vh' }} data-testid="focus-image">
      <div className={`${still ? 'relative h-[70svh]' : 'sticky h-[100svh]'} overflow-hidden`} style={still ? undefined : { top: 'env(safe-area-inset-top, 0px)' }}>
        <div className="absolute inset-0" style={{ clipPath: `circle(${r}px at 50% 50%)` }}>
          <img src={src} alt={alt} className="photo h-full w-full object-cover" style={{ filter: `grayscale(1) contrast(1.05) blur(${blur.toFixed(2)}px)`, transform: `scale(${1.12 - 0.12 * e})` }} />
        </div>
        {e < 0.98 && (
          <svg className="pointer-events-none absolute left-1/2 top-1/2" width={ringD} height={ringD} viewBox="-50 -50 100 100" style={{ transform: `translate(-50%,-50%) rotate(${e * 140}deg)`, opacity: 1 - e }} aria-hidden>
            <circle r="49" fill="none" stroke="var(--ink)" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
            {Array.from({ length: 72 }, (_, i) => {
              const a = (i / 72) * Math.PI * 2;
              const long = i % 6 === 0;
              return <line key={i} x1={Math.cos(a) * 49} y1={Math.sin(a) * 49} x2={Math.cos(a) * (long ? 46 : 47.5)} y2={Math.sin(a) * (long ? 46 : 47.5)} stroke="var(--ink)" strokeWidth={long ? 1.5 : 0.8} vectorEffect="non-scaling-stroke" />;
            })}
          </svg>
        )}
        <div className="gutter absolute inset-x-0 bottom-0 mx-auto max-w-6xl pb-10">
          <p className="display inline-block max-w-xl bg-inv px-3 py-2 text-2xl text-invink sm:px-4 sm:text-4xl">{sharp ? after : before}</p>
          {!still && (
            <div className="mt-2">
              <span className="bg-inv px-2 py-1 font-mono text-[11px] uppercase tracking-widest text-invink">Focus {Math.round(e * 100)}%</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
