import { useMemo, useState } from 'react';
import type { Review } from '../../lib/calc';
import { money, ratio } from '../../lib/format';
import { Slider } from '../ui';

/** How fast returns fall as a format's spend grows: revenue ∝ spend^ELASTICITY. */
const ELASTICITY = 0.6;
const CAP = 2; // the model isn't trusted beyond 2× current spend

/**
 * Drag each format's budget and see projected ad profit, or let it find the best mix for the same total.
 * Projected revenue = current revenue × (new spend ÷ current spend)^0.6.
 */
export function BudgetMixer({ review }: { review: Review }) {
  const cr = review.ads.contributionRate;
  const fmts = review.ads.formats.filter((f) => f.spend > 0 && f.revenue !== null);
  const base = useMemo(() => Object.fromEntries(fmts.map((f) => [f.format, f.spend])) as Record<string, number>, [fmts]);
  const [alloc, setAlloc] = useState<Record<string, number>>(base);
  if (cr === null || fmts.length < 2) return <p className="text-sm text-mute">Needs at least two ad formats with spend and revenue, plus revenue and costs for the month.</p>;

  const revAt = (f: (typeof fmts)[number], s: number) => (s <= 0 ? 0 : (f.revenue as number) * Math.pow(s / f.spend, ELASTICITY));
  const profitOf = (a: Record<string, number>) => fmts.reduce((sum, f) => sum + revAt(f, a[f.format] ?? 0) * cr - (a[f.format] ?? 0), 0);
  const totalOf = (a: Record<string, number>) => fmts.reduce((s, f) => s + (a[f.format] ?? 0), 0);
  const now = profitOf(base);
  const next = profitOf(alloc);
  const total0 = totalOf(base);
  const total = totalOf(alloc);

  const optimise = () => {
    // greedy: hand out the same total budget in small steps to whichever format earns most from the next step
    const step = total0 / 200;
    const a: Record<string, number> = Object.fromEntries(fmts.map((f) => [f.format, 0]));
    for (let k = 0; k < 200; k++) {
      let best: (typeof fmts)[number] | null = null;
      let gain = -Infinity;
      for (const f of fmts) {
        const s = a[f.format];
        if (s + step > f.spend * CAP) continue;
        const g = (revAt(f, s + step) - revAt(f, s)) * cr - step;
        if (g > gain) {
          gain = g;
          best = f;
        }
      }
      if (!best || gain < 0) break; // the next dollar would lose money: keep it
      a[best.format] += step;
    }
    setAlloc(Object.fromEntries(Object.entries(a).map(([k, s]) => [k, Math.floor(s / 10) * 10])));
  };

  return (
    <div className="grid gap-px border border-ink bg-ink lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-5 bg-surface p-5 sm:p-6">
        {fmts.map((f) => {
          const s = alloc[f.format] ?? 0;
          const roas = s > 0 ? revAt(f, s) / s : null;
          return (
            <div key={f.format}>
              <Slider id={`mix-${f.format.replace(/\W+/g, '')}`} label={f.format} value={s} min={0} max={Math.ceil((f.spend * CAP) / 50) * 50} step={50} onChange={(x) => setAlloc({ ...alloc, [f.format]: x })} display={`${money(s)} · ${roas === null ? '—' : ratio(roas)}`} />
            </div>
          );
        })}
      </div>
      <div className="flex flex-col justify-between gap-5 bg-inv p-5 text-invink sm:p-6">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-widest opacity-60">Profit after ad cost</div>
          <div className="display mt-2 text-4xl sm:text-5xl" data-testid="mix-profit">
            {money(next)}
          </div>
          <div className="num mt-1 text-sm opacity-80">
            {money(next - now, { sign: true })} vs. this month ({money(now)})
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-3 border-t border-current/20 pt-4 text-sm">
          <div>
            <dt className="opacity-60">Total ad spend</dt>
            <dd className="num">{money(total)}</dd>
          </div>
          <div>
            <dt className="opacity-60">Change</dt>
            <dd className="num">{money(total - total0, { sign: true })}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2">
          <button type="button" id="mix-optimise" onClick={optimise} className="rounded-[3px] bg-invink px-4 py-2 text-xs font-semibold text-inv">
            Find best mix (up to this budget)
          </button>
          <button type="button" onClick={() => setAlloc(base)} className="rounded-[3px] border border-current/40 px-4 py-2 text-xs">
            Reset
          </button>
        </div>
        <p className="text-[11px] opacity-60">Assumes each format’s returns shrink as spend grows (revenue rises with spend^0.6) and caps any format at 2× this month’s spend, where the estimate stops being reliable. Uses your {Math.round(cr * 100)}% contribution rate.</p>
      </div>
    </div>
  );
}
