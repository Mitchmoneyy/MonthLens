import { useEffect, useRef } from 'react';
import { reducedMotion } from './ui';

export const photo = (name: string) => `./photos/${name}.jpg`;

export interface StripItem {
  src: string;
  caption: string;
}

/** Auto-scrolling black-and-white strip. Pauses on hover, drag to scrub. */
export function PhotoStrip({ items, height = 220, speed = 28 }: { items: StripItem[]; height?: number; speed?: number }) {
  const track = useRef<HTMLDivElement>(null);
  const state = useRef({ x: 0, hover: false, drag: false, startX: 0, startOffset: 0, moved: 0 });

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const v = reducedMotion() ? 0 : speed;
    const loop = (t: number) => {
      const s = state.current;
      const el = track.current;
      const dt = Math.min(64, t - last) / 1000;
      last = t;
      if (el) {
        const half = el.scrollWidth / 2;
        if (!s.hover && !s.drag) s.x -= v * dt;
        if (half > 0) {
          if (s.x <= -half) s.x += half;
          if (s.x > 0) s.x -= half;
        }
        el.style.transform = `translate3d(${s.x}px,0,0)`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [speed]);

  const s = state.current;
  const doubled = [...items, ...items];
  return (
    <div
      className="relative cursor-grab select-none overflow-hidden active:cursor-grabbing"
      style={{ touchAction: 'pan-y' }}
      onPointerEnter={(e) => e.pointerType === 'mouse' && (s.hover = true)}
      onPointerLeave={() => {
        s.hover = false;
        s.drag = false;
      }}
      onPointerDown={(e) => {
        s.drag = true;
        s.startX = e.clientX;
        s.startOffset = s.x;
        s.moved = 0;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!s.drag) return;
        s.moved = e.clientX - s.startX;
        s.x = s.startOffset + s.moved;
      }}
      onPointerUp={() => (s.drag = false)}
      onPointerCancel={() => (s.drag = false)}
      aria-label="Photo strip. Drag to scroll."
      role="region"
    >
      <div ref={track} className="flex w-max gap-3 will-change-transform" style={{ height }}>
        {doubled.map((it, i) => (
          <figure key={i} className="relative h-full shrink-0 overflow-hidden" style={{ width: height * 1.35 }} aria-hidden={i >= items.length}>
            <img src={it.src} alt={i < items.length ? it.caption : ''} draggable={false} loading="lazy" className="photo h-full w-full object-cover" />
            <figcaption className="absolute bottom-0 left-0 bg-inv px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-invink">{it.caption}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
