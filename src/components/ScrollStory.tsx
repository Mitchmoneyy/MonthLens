import { useEffect, useRef, useState } from 'react';
import type { Review } from '../lib/calc';
import { money, pct } from '../lib/format';
import { reducedMotion } from './ui';

const SHORT: Record<string, string> = { ads: 'Ads', cogs: 'COGS', fees: 'Fees', software: 'Tools', contractors: 'Team', refunds: 'Refunds', other: 'Other' };
/** Phone-width labels: a column is only ~35px wide there. */
const TINY: Record<string, string> = { rev: 'Rev', refunds: 'Ref', software: 'Tool', contractors: 'Team', other: 'Oth', profit: 'Net' };

/**
 * Scroll-driven waterfall: revenue at the top, each cost takes its bite as you scroll,
 * profit is what's left. The section pins while its steps play.
 */
export function ScrollStory({ review, title }: { review: Review; title: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(() => (reducedMotion() ? 1 : 0));
  const still = reducedMotion();
  useEffect(() => {
    if (still) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = outer.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const span = el.offsetHeight - window.innerHeight;
      setP(Math.max(0, Math.min(1, span > 0 ? -r.top / span : 1)));
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

  const revenue = review.m.revenue.value ?? 0;
  const costs = review.expenses.filter((e) => (e.amount ?? 0) > 0).sort((a, b) => (b.amount as number) - (a.amount as number));
  const steps = costs.length + 2; // revenue, each cost, profit
  // hold briefly on the first and last frame so each can be read
  const at = Math.max(0, Math.min(1, (p - 0.08) / 0.84)) * (steps - 1);
  const shown = (k: number) => Math.max(0, Math.min(1, at - (k - 1))); // k = 1..costs.length
  let running = revenue;
  const bars = costs.map((c, i) => {
    const top = running;
    const v = (c.amount as number) * shown(i + 1);
    running -= v;
    return { key: c.key, label: SHORT[c.key] ?? c.label, top, height: v, full: c.amount as number, pct: c.pctOfRevenue };
  });
  const profitShown = shown(costs.length + 1);
  const step = Math.min(steps - 1, Math.round(at));
  const caption =
    step === 0
      ? { lead: `${money(revenue)} came in.`, sub: 'Now watch where it goes.' }
      : step <= costs.length
        ? { lead: `${costs[step - 1].label} took ${money(costs[step - 1].amount)}.`, sub: `${pct(costs[step - 1].pctOfRevenue)} of revenue · ${money(costs[step - 1].perSale, { cents: true })} per sale` }
        : { lead: `${money(review.m.netProfit.value)} left.`, sub: `A ${pct(review.m.margin.value)} margin. That’s the number MonthLens starts from.` };
  const y = (v: number) => (revenue ? (v / revenue) * 100 : 0);

  return (
    <div ref={outer} style={{ height: still ? 'auto' : `${steps * 55 + 45}vh` }} data-testid="scroll-story">
      <div className={still ? '' : 'sticky flex min-h-[100svh] items-center'} style={still ? undefined : { top: 'env(safe-area-inset-top, 0px)' }}>
        <div className="gutter mx-auto grid w-full max-w-6xl items-center gap-8 py-10 md:grid-cols-[1fr_1.2fr] md:gap-14">
          <div>
            <div className="eyebrow">{title}</div>
            <div className="display mt-3 text-5xl tabular-nums sm:text-7xl" aria-live="off">
              {money(Math.round(running))}
            </div>
            <div className="mt-6 min-h-[5.5rem]" aria-live="polite">
              <p key={step} className="rise text-xl font-semibold sm:text-2xl">
                {caption.lead}
              </p>
              <p className="mt-1 font-mono text-sm text-mute">{caption.sub}</p>
            </div>
            {!still && (
              <div className="mt-6 flex gap-1" aria-hidden>
                {Array.from({ length: steps }, (_, i) => (
                  <span key={i} className={`h-1 flex-1 transition-colors ${i <= step ? 'bg-ink' : 'bg-line'}`} />
                ))}
              </div>
            )}
          </div>
          <div className="relative h-[46svh] min-h-[260px] max-h-[440px]" role="img" aria-label={`Waterfall: ${money(revenue)} revenue minus ${costs.map((c) => `${c.label} ${money(c.amount)}`).join(', ')} leaves ${money(review.m.netProfit.value)} profit`}>
            <div className="absolute inset-x-0 bottom-6 top-0 flex gap-1.5 sm:gap-3">
              {[{ key: 'rev', label: 'Revenue' }, ...bars, { key: 'profit', label: 'Profit' }].map((b, i) => {
                const isRev = i === 0;
                const isProfit = b.key === 'profit';
                const bar = !isRev && !isProfit ? (b as (typeof bars)[number]) : null;
                const style = isRev
                  ? { bottom: '0%', height: '100%' }
                  : isProfit
                    ? { bottom: '0%', height: `${y(Math.max(0, review.m.netProfit.value ?? 0)) * profitShown}%` }
                    : { top: `${100 - y(bar!.top)}%`, height: `${y(bar!.height)}%` };
                return (
                  <div key={b.key} className="relative h-full min-w-0 flex-1">
                    <div className={`absolute inset-x-0 ${isRev || isProfit ? 'bg-ink' : 'hatch border border-ink'}`} style={style} />
                    {bar && shown(i) > 0.98 && <div className="num absolute inset-x-0 hidden text-center text-[10px] sm:block" style={{ top: `calc(${100 - y(bar.top - bar.full)}% + 4px)` }}>{pct(bar.pct, 0)}</div>}
                    <div className="absolute inset-x-0 -bottom-6 text-center font-mono text-[10px] uppercase text-mute sm:tracking-wider">
                      <span className="sm:hidden">{TINY[b.key] ?? b.label}</span>
                      <span className="hidden truncate sm:block">{b.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="absolute inset-x-0 bottom-6 border-b border-ink" />
          </div>
        </div>
      </div>
    </div>
  );
}
