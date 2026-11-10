import { useState } from 'react';
import type { Review } from '../../lib/calc';
import { money } from '../../lib/format';
import { Slider } from '../ui';

/** Drag a monthly profit or loss and see 24 months of cash. Straight-line projection. */
export function RunwayExplorer({ review }: { review: Review }) {
  const cash = review.m.cashEnd.value;
  const actual = review.m.netProfit.value;
  const span = Math.max(5000, Math.ceil((Math.abs(actual ?? 0) * 2.5) / 500) * 500);
  const [monthly, setMonthly] = useState(Math.round(actual ?? 0));
  if (cash === null || actual === null) return <p className="text-sm text-mute">Needs cash at end of month and net profit.</p>;

  const N = 24;
  const pts = Array.from({ length: N + 1 }, (_, i) => cash + monthly * i);
  const runOut = monthly < 0 ? cash / -monthly : null;
  const lo = Math.min(0, ...pts);
  const hi = Math.max(cash, ...pts) || 1;
  const W = 600;
  const H = 220;
  const pad = { l: 8, r: 8, t: 14, b: 22 };
  const x = (i: number) => pad.l + (i / N) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (H - pad.t - pad.b);
  const line = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const [yy, mm] = review.input.month.split('-').map(Number);
  const dateAt = (months: number) => new Date(Date.UTC(yy, mm - 1 + Math.floor(months) + 1, 1)).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

  return (
    <div className="border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="font-semibold">Runway explorer</h3>
        <button type="button" onClick={() => setMonthly(Math.round(actual))} className="font-mono text-[11px] text-mute underline-offset-2 hover:underline">
          Reset to this month ({money(actual)})
        </button>
      </div>
      <div className="mt-4">
        <Slider id="runway-monthly" label="If every month made" value={monthly} min={-span} max={span} step={100} onChange={setMonthly} display={money(monthly, { sign: true })} />
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full" role="img" aria-label={`Cash over 24 months starting at ${money(cash)}`}>
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="var(--ink)" strokeWidth="1" />
        <text x={W - pad.r} y={y(0) - 4} textAnchor="end" fontSize="10" fontFamily="Martian Mono, monospace" fill="var(--mute)">
          $0
        </text>
        {[6, 12, 18, 24].map((i) => (
          <g key={i}>
            <line x1={x(i)} x2={x(i)} y1={pad.t} y2={H - pad.b} stroke="var(--line)" />
            <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fontFamily="Martian Mono, monospace" fill="var(--mute)">
              {i}mo
            </text>
          </g>
        ))}
        <path d={line} fill="none" stroke="var(--ink)" strokeWidth="2.25" strokeLinejoin="round" />
        {runOut !== null && runOut <= N && (
          <g>
            <circle cx={x(runOut)} cy={y(0)} r="5" fill="var(--surface)" stroke="var(--ink)" strokeWidth="2" />
            <text x={Math.min(x(runOut) + 8, W - 120)} y={y(0) + 16} fontSize="11" fontFamily="Martian Mono, monospace" fill="var(--ink)">
              $0 in {dateAt(runOut)}
            </text>
          </g>
        )}
        <circle cx={x(0)} cy={y(cash)} r="3.5" fill="var(--ink)" />
      </svg>
      <p className="mt-2 text-sm" data-testid="runway-text">
        {monthly >= 0 ? (
          <>
            Cash grows to <span className="num font-semibold">{money(pts[N])}</span> by {dateAt(N - 1)}.
          </>
        ) : (
          <>
            Cash runs out in <span className="num font-semibold">{(runOut as number).toFixed(1)} months</span>, around {dateAt(runOut as number)}.
          </>
        )}{' '}
        <span className="text-mute">Straight-line projection from {money(cash)} in the bank.</span>
      </p>
    </div>
  );
}
