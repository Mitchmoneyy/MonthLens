import { useMemo, useState } from 'react';
import { applyScenario, computeReview, type Review } from '../../lib/calc';
import { count, money, pct } from '../../lib/format';
import { Slider } from '../ui';

/**
 * Break-even and goal calculator.
 * Contribution per sale = (revenue − refunds − COGS − fees) ÷ orders.
 * Monthly fixed costs = ad spend + software + contractors + other + one-off.
 * Sales needed = (fixed costs + target profit) ÷ contribution per sale.
 */
export function BreakEven({ review }: { review: Review }) {
  const [price, setPrice] = useState(0);
  const [fixedPct, setFixedPct] = useState(0);
  const input = review.input;
  const v = input.values;
  const calc = useMemo(() => {
    const r = price ? computeReview(applyScenario(input, { pricePct: price / 100 })) : review;
    const x = r.input.values;
    if (!x.orders || !x.grossRevenue) return null;
    const contribution = x.grossRevenue - (x.refunds ?? 0) - (x.cogs ?? 0) - (x.paymentFees ?? 0);
    const perSale = contribution / x.orders;
    const fixed = ((r.m.adSpend.value ?? 0) + (x.software ?? 0) + (x.contractors ?? 0) + (x.otherExpenses ?? 0) + (x.oneOffExpenses ?? 0)) * (1 + fixedPct / 100);
    if (perSale <= 0) return { perSale, fixed, breakEven: null, goalSales: null };
    return { perSale, fixed, breakEven: fixed / perSale, goalSales: input.goal ? (fixed + input.goal) / perSale : null };
  }, [input, review, price, fixedPct]);

  if (!v.orders || !v.grossRevenue || !calc)
    return <p className="text-sm text-mute">Needs revenue and number of orders. Add them on the Import page.</p>;
  const sales = v.orders;
  const max = Math.max(sales, calc.breakEven ?? 0, calc.goalSales ?? 0) * 1.15 || 1;
  const pos = (x: number) => `${Math.min(100, (x / max) * 100)}%`;
  const [y, m] = input.month.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();

  return (
    <div className="grid gap-px border border-ink bg-ink lg:grid-cols-[1fr_1.3fr]">
      <div className="space-y-6 bg-surface p-5 sm:p-6">
        <Slider id="be-price" label="Price change" value={price} min={-20} max={30} step={1} onChange={setPrice} display={`${price > 0 ? '+' : ''}${price}%`} />
        <Slider id="be-fixed" label="Fixed costs (ads, tools, team, other)" value={fixedPct} min={-50} max={50} step={5} onChange={setFixedPct} display={`${fixedPct > 0 ? '+' : ''}${fixedPct}% · ${money(calc.fixed)}`} />
        <dl className="grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
          <div>
            <dt className="text-mute">Kept per sale</dt>
            <dd className="num font-semibold">{money(calc.perSale, { cents: true })}</dd>
          </div>
          <div>
            <dt className="text-mute">Fixed costs / month</dt>
            <dd className="num font-semibold">{money(calc.fixed)}</dd>
          </div>
        </dl>
        <p className="text-xs text-mute">“Kept per sale” is what’s left of a sale after refunds, COGS and fees. Ad spend is treated as a fixed monthly cost here.</p>
      </div>
      <div className="flex flex-col justify-center gap-6 bg-surface p-5 sm:p-6">
        {calc.breakEven === null ? (
          <p className="text-lg font-semibold">Each sale loses money before fixed costs. Raise the price or cut product costs first.</p>
        ) : (
          <>
            <p className="text-lg leading-snug sm:text-xl">
              You need <span className="num font-bold">{count(Math.ceil(calc.breakEven))}</span> sales to break even
              {calc.goalSales !== null && (
                <>
                  {' '}and <span className="num font-bold">{count(Math.ceil(calc.goalSales))}</span> to hit your {money(input.goal)} goal
                </>
              )}
              . You made <span className="num font-bold">{count(sales)}</span>.
            </p>
            <div className="relative pb-10 pt-8" aria-hidden>
              <div className="h-3 bg-raised">
                <div className="h-full bg-ink transition-[width] duration-500" style={{ width: pos(sales) }} />
              </div>
              {[
                { x: calc.breakEven, label: 'Break-even' },
                ...(calc.goalSales !== null ? [{ x: calc.goalSales, label: 'Goal' }] : []),
              ].map((mk) => (
                <div key={mk.label} className="absolute top-5 h-9 border-l-2 border-dashed border-ink transition-[left] duration-500" style={{ left: pos(mk.x) }}>
                  <span className="absolute -top-5 left-1 whitespace-nowrap font-mono text-[10px] uppercase tracking-wider">{mk.label}</span>
                  <span className="num absolute top-10 -translate-x-1/2 whitespace-nowrap text-[11px]">{count(Math.ceil(mk.x))}</span>
                </div>
              ))}
            </div>
            <p className="text-sm text-mute">
              {calc.goalSales !== null
                ? sales >= calc.goalSales
                  ? `You cleared the goal by ${count(Math.floor(sales - calc.goalSales))} sales.`
                  : `That’s ${count(Math.ceil(calc.goalSales - sales))} more sales, about ${(Math.ceil(calc.goalSales - sales) / days).toFixed(1)} a day, or ${pct((calc.goalSales - sales) / sales, 0)} more than this month.`
                : sales >= calc.breakEven
                  ? `You’re ${count(Math.floor(sales - calc.breakEven))} sales above break-even.`
                  : `That’s ${count(Math.ceil(calc.breakEven - sales))} more sales than this month.`}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
