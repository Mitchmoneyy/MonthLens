import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Metric, MetricUnit } from '../lib/calc';
import { fmtUnit } from '../lib/format';

export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Number that counts from its previous value to the new one. */
export function CountUp({ value, format, className = '' }: { value: number | null; format: (x: number | null) => string; className?: string }) {
  const [shown, setShown] = useState<number | null>(value);
  const from = useRef<number | null>(null);
  useEffect(() => {
    if (value === null || !Number.isFinite(value) || reducedMotion()) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = from.current ?? 0;
    const t0 = performance.now();
    const dur = from.current === null ? 900 : 450;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setShown(start + (value - start) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value]);
  return <span className={`num ${className}`}>{format(shown)}</span>;
}

/** Reveal-on-scroll. Elements already in view stay visible; only those below the fold animate in. */
export function Reveal({ children, className = '', as: Tag = 'div', delay = 0 }: { children: ReactNode; className?: string; as?: any; delay?: number }) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion() || !('IntersectionObserver' in window)) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.95) return;
    el.classList.add('rv-pending');
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.classList.add('rv-in');
          el.style.transitionDelay = `${delay}ms`;
          el.classList.remove('rv-pending');
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [delay]);
  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}

export function Sparkline({ values, height = 44, goal, highlightLast = true, label }: { values: (number | null)[]; height?: number; goal?: number | null; highlightLast?: boolean; label: string }) {
  const id = useId();
  const pts = values.map((v, i) => ({ v, i })).filter((p) => p.v !== null) as { v: number; i: number }[];
  const W = 160;
  if (pts.length < 2) return <div className="text-xs text-faint" style={{ height }}>Needs 2+ months</div>;
  const vals = pts.map((p) => p.v).concat(goal != null ? [goal] : []);
  const min = Math.min(...vals, 0 < Math.min(...vals) ? Math.min(...vals) * 0.9 : Math.min(...vals));
  const max = Math.max(...vals);
  const pad = 4;
  const x = (i: number) => pad + (i / (values.length - 1)) * (W - pad * 2);
  const y = (v: number) => (max === min ? height / 2 : pad + (1 - (v - min) / (max - min)) * (height - pad * 2));
  const d = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const area = `${d} L${x(pts[pts.length - 1].i)},${height} L${x(pts[0].i)},${height} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full overflow-visible" style={{ height }} role="img" aria-label={label}>
      <defs>
        <pattern id={`p${id}`} width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="1" height="1" fill="var(--ink)" opacity="0.35" />
        </pattern>
      </defs>
      <line x1="0" x2={W} y1={height - 0.5} y2={height - 0.5} stroke="var(--line)" />
      <path d={area} fill={`url(#p${id})`} />
      {goal != null && <line x1="0" x2={W} y1={y(goal)} y2={y(goal)} stroke="var(--ink)" strokeDasharray="2 3" strokeWidth="1" />}
      <path d={d} fill="none" stroke="var(--ink)" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      {highlightLast && <circle cx={x(last.i)} cy={y(last.v)} r="3.5" fill="var(--ink)" stroke="var(--surface)" strokeWidth="1.5" />}
    </svg>
  );
}

/** Health score drawn as a lens focus ring: 60 ticks, filled up to the score. */
export function LensDial({ score, size = 180 }: { score: number | null; size?: number }) {
  const [shown, setShown] = useState(reducedMotion() ? score ?? 0 : 0);
  useEffect(() => {
    if (score === null) return;
    if (reducedMotion()) return setShown(score);
    let raf = 0;
    const t0 = performance.now();
    const start = shown;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 900);
      setShown(start + (score - start) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score]);
  const ticks = 60;
  const c = size / 2;
  const on = Math.round((shown / 100) * ticks);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={score === null ? 'Health score not available' : `Health score ${score} out of 100`} className="max-w-full">
      <circle cx={c} cy={c} r={c - 2} fill="none" stroke="var(--line)" />
      <circle cx={c} cy={c} r={c * 0.62} fill="none" stroke="var(--line)" />
      {Array.from({ length: ticks }, (_, i) => {
        const a = (i / ticks) * Math.PI * 2 - Math.PI / 2;
        const major = i % 5 === 0;
        const r1 = c - 8;
        const r2 = c - (major ? 22 : 16);
        return <line key={i} x1={c + r1 * Math.cos(a)} y1={c + r1 * Math.sin(a)} x2={c + r2 * Math.cos(a)} y2={c + r2 * Math.sin(a)} stroke={i < on ? 'var(--ink)' : 'var(--line)'} strokeWidth={major ? 2.5 : 1.5} strokeLinecap="round" />;
      })}
      <text x={c} y={c + 4} textAnchor="middle" fontFamily="Bodoni Moda, Didot, serif" fontWeight="700" fontSize={size * 0.27} fill="var(--ink)">
        {score === null ? '—' : Math.round(shown)}
      </text>
      <text x={c} y={c + size * 0.15} textAnchor="middle" fontFamily="Martian Mono, monospace" fontSize={size * 0.06} fill="var(--mute)" letterSpacing="1.5">
        / 100
      </text>
    </svg>
  );
}

export function Pill({ children, solid = false, hatch = false, className = '' }: { children: ReactNode; solid?: boolean; hatch?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-[3px] border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider ${solid ? 'border-inv bg-inv text-invink' : 'border-ink/60 text-ink'} ${hatch ? 'border-dashed' : ''} ${className}`}>
      {children}
    </span>
  );
}

export function Button({ children, onClick, variant = 'primary', className = '', disabled, type = 'button', id }: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost'; className?: string; disabled?: boolean; type?: 'button' | 'submit'; id?: string }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-[3px] px-5 py-2.5 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none';
  const v = variant === 'primary' ? 'bg-inv text-invink hover:opacity-85' : variant === 'secondary' ? 'border border-ink text-ink hover:bg-ink hover:text-bg' : 'text-ink underline-offset-4 hover:underline px-2';
  return (
    <button id={id} type={type} disabled={disabled} onClick={onClick} className={`${base} ${v} ${className}`}>
      {children}
    </button>
  );
}

export function Slider({ id, value, min, max, step, onChange, label, display, big = false }: { id: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; label?: string; display?: string; big?: boolean }) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div className={big ? 'big-range' : ''}>
      {label && (
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={id} className="text-sm text-mute">
            {label}
          </label>
          <span className="num text-sm font-semibold">{display}</span>
        </div>
      )}
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} style={{ ['--fill' as any]: `${Math.max(0, Math.min(100, fill))}%` }} aria-valuetext={display} />
    </div>
  );
}

export function NumberField({ id, value, onChange, prefix, suffix, placeholder = 'Not provided', className = '' }: { id: string; value: number | null | undefined; onChange: (v: number | null) => void; prefix?: string; suffix?: string; placeholder?: string; className?: string }) {
  const [text, setText] = useState(value === null || value === undefined ? '' : String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value === null || value === undefined ? '' : String(Math.round(value * 100) / 100));
  }, [value]);
  return (
    <div className={`flex items-center rounded-[3px] border border-line bg-surface focus-within:border-ink ${className}`}>
      {prefix && <span className="pl-3 text-sm text-mute">{prefix}</span>}
      <input
        id={id}
        inputMode="decimal"
        className="num w-full min-w-0 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-faint"
        value={text}
        placeholder={placeholder}
        onFocus={() => (focused.current = true)}
        onBlur={() => (focused.current = false)}
        onChange={(e) => {
          setText(e.target.value);
          const raw = e.target.value.replace(/[,$\s]/g, '');
          if (raw === '') onChange(null);
          else if (!Number.isNaN(Number(raw))) onChange(Number(raw));
        }}
      />
      {suffix && <span className="pr-3 text-sm text-mute">{suffix}</span>}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-ink pb-2">
      <div>
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">
          {title}
        </h2>
      </div>
      {right}
    </div>
  );
}

// ---------------------------------------------------------------- formula sheet

const FormulaCtx = createContext<(m: Metric) => void>(() => {});
export const useFormula = () => useContext(FormulaCtx);

export function FormulaProvider({ children }: { children: ReactNode }) {
  const [m, setM] = useState<Metric | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setM(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <FormulaCtx.Provider value={setM}>
      {children}
      {m && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setM(null)} role="dialog" aria-modal="true" aria-label={`${m.label} formula`}>
          <div className="rise w-full max-w-md rounded-t-2xl border border-line bg-surface p-6 sm:rounded-[3px]" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom, 0px))' }} onClick={(e) => e.stopPropagation()}>
            <div className="eyebrow">How this is calculated</div>
            <h3 className="mt-1 text-2xl font-extrabold">{m.label}</h3>
            <div className="num mt-3 text-3xl font-semibold">{fmtUnit(m.value, m.unit)}</div>
            <div className="mt-4 rounded-[3px] bg-raised px-3 py-2 font-mono text-sm">{m.formula}</div>
            <table className="mt-4 w-full text-sm">
              <tbody>
                {m.inputs.map((i) => (
                  <tr key={i.label} className="border-b border-line last:border-0">
                    <td className="py-1.5 text-mute">{i.label}</td>
                    <td className={`num py-1.5 text-right ${i.value === null ? 'text-faint' : ''}`}>{fmtUnit(i.value, i.unit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {m.missing.length > 0 && <p className="mt-3 text-sm">Missing: {m.missing.join(', ')}. Add it on the Import page.</p>}
            {m.partial && !m.missing.length && <p className="mt-3 text-sm text-mute">Some optional lines were not provided and are counted as $0.</p>}
            <div className="mt-5 flex justify-end gap-2">
              {m.missing.length > 0 && (
                <a href="#import" onClick={() => setM(null)} className="rounded-[3px] border border-ink px-4 py-2 text-sm font-semibold">
                  Add missing numbers
                </a>
              )}
              <Button onClick={() => setM(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </FormulaCtx.Provider>
  );
}

/** A metric value you can tap to see its formula and source numbers. */
export function MetricValue({ m, className = '', count = true, format }: { m: Metric; className?: string; count?: boolean; format?: (x: number | null) => string }) {
  const open = useFormula();
  const f = format ?? ((x: number | null) => fmtUnit(x, m.unit));
  return (
    <button type="button" onClick={() => open(m)} className={`group text-left underline decoration-dotted decoration-1 underline-offset-[6px] decoration-transparent hover:decoration-current ${m.value === null ? 'text-faint' : ''} ${className}`} title="Show formula" data-metric={m.key}>
      {m.value === null ? <span className="text-[0.6em] font-normal">Not provided</span> : count ? <CountUp value={m.value} format={f} /> : <span className="num">{f(m.value)}</span>}
    </button>
  );
}

// ---------------------------------------------------------------- toast

const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const t = useRef<number>();
  const show = useMemo(
    () => (m: string) => {
      setMsg(m);
      window.clearTimeout(t.current);
      t.current = window.setTimeout(() => setMsg(null), 2600);
    },
    [],
  );
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 z-[80] flex justify-center px-4" style={{ bottom: 'calc(84px + env(safe-area-inset-bottom, 0px))' }}>
        {msg && <div className="rise rounded-[3px] bg-inv px-5 py-2.5 text-sm font-medium text-invink shadow-lg">{msg}</div>}
      </div>
    </ToastCtx.Provider>
  );
}

export function Delta({ now, prev, unit, invert = false }: { now: number | null; prev: number | null; unit: MetricUnit; invert?: boolean }) {
  if (now === null || prev === null || !Number.isFinite(now) || !Number.isFinite(prev)) return <span className="text-xs text-faint">no prior month</span>;
  const d = now - prev;
  const good = invert ? d < 0 : d > 0;
  const text = unit === 'pct' ? `${d >= 0 ? '+' : '−'}${Math.abs(d * 100).toFixed(1)} pts` : unit === 'money' ? `${d >= 0 ? '+' : '−'}$${Math.abs(Math.round(d)).toLocaleString()}` : `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(2)}`;
  return (
    <span className={`num inline-flex items-center gap-1 text-xs ${good ? 'font-semibold' : 'text-mute'}`}>
      <span aria-hidden>{d === 0 ? '■' : d > 0 ? '▲' : '▼'}</span>
      {text}
      <span className="sr-only">{good ? 'better' : 'worse'} than last month</span>
    </span>
  );
}
