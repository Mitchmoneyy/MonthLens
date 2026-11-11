import { useState } from 'react';
import { go, useReviewData } from '../App';
import { Button, Delta, LensDial, MetricValue, Pill, Reveal, SectionTitle, Sparkline, useFormula, useToast } from '../components/ui';
import type { Metric, MetricKey } from '../lib/calc';
import { monthName, runOutDate } from '../lib/calc';
import { toPdf } from '../lib/export';
import { BUSINESS_TYPES } from '../lib/fields';
import { fmtUnit, money, pct } from '../lib/format';
import { saveFile } from '../lib/runtime';
import { nav, useStore } from '../store';
import { BreakEven } from '../components/tools/BreakEven';
import { RunwayExplorer } from '../components/tools/RunwayExplorer';

function Bars({ items, total }: { items: { name: string; amount: number }[]; total: number | null }) {
  if (!items.length) return <p className="text-sm text-faint">Not provided. Import a product or order export to fill this in.</p>;
  const max = Math.max(...items.map((i) => i.amount));
  return (
    <ul className="space-y-2.5">
      {items
        .slice()
        .sort((a, b) => b.amount - a.amount)
        .map((i) => (
          <li key={i.name}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{i.name}</span>
              <span className="num shrink-0">
                {money(i.amount)} <span className="text-mute">{total ? pct(i.amount / total, 0) : ''}</span>
              </span>
            </div>
            <div className="mt-1 h-2 bg-raised">
              <div className="h-full bg-ink transition-[width] duration-700" style={{ width: `${(i.amount / max) * 100}%` }} />
            </div>
          </li>
        ))}
    </ul>
  );
}

function Kpi({ m, big = false, sub }: { m: Metric; big?: boolean; sub?: React.ReactNode }) {
  return (
    <div className="flex flex-col justify-between gap-2 bg-surface p-4 sm:p-5">
      <div className="eyebrow">{m.label}</div>
      <MetricValue m={m} className={`${big ? 'display text-4xl sm:text-5xl' : 'text-2xl font-semibold sm:text-3xl'} leading-none`} />
      {sub && <div className="text-xs text-mute">{sub}</div>}
      {m.partial && m.value !== null && <div className="text-[11px] text-faint">Some lines not provided</div>}
    </div>
  );
}

export default function Overview() {
  const { review: r, prevReview: pr, series, input, projected, recs } = useReviewData();
  const startReal = useStore((s) => s.startReal);
  const setTab = (t: string) => (nav.importTab = t);
  const toast = useToast();
  const openFormula = useFormula();
  const [busy, setBusy] = useState(false);
  const typeLabel = BUSINESS_TYPES.find((b) => b.key === input.businessType)?.label ?? '';
  const m = r.m;
  const gross = m.revenue.value;
  const s = (k: MetricKey) => series.map((x) => x.m[k].value);

  const downloadPdf = async () => {
    setBusy(true);
    try {
      const blob = await toPdf(r, recs, projected);
      const res = await saveFile(`monthlens-${input.month}.pdf`, blob, 'application/pdf');
      toast(res === 'saved' ? 'Report PDF ready' : res === 'declined' ? 'Download cancelled' : 'Could not save the PDF here');
    } finally {
      setBusy(false);
    }
  };

  // one sale, split
  const orders = input.values.orders ?? null;
  const split =
    orders && gross
      ? [
          ...r.expenses.filter((e) => e.amount).map((e) => ({ label: e.label, v: (e.amount as number) / orders })),
          { label: 'Profit', v: (m.netProfit.value ?? 0) / orders },
        ]
      : null;
  const aov = m.aov.value;

  const newRev = input.values.newCustomerRevenue ?? null;
  const retRev = input.values.returningCustomerRevenue ?? null;

  return (
    <div className="space-y-12 sm:space-y-16">
      {input.isSample ? (
        <div className="rise flex flex-col gap-4 border border-ink bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Pill solid>Sample data</Pill>
            <p className="mt-2 max-w-xl">These are sample numbers for {/^[aeiou]/i.test(typeLabel) ? 'an' : 'a'} {typeLabel.toLowerCase()} business, so you can see how the review reads. None of it is yours yet.</p>
          </div>
          <Button
            id="use-real"
            onClick={() => {
              startReal();
              setTab('screenshot');
              go('import');
            }}
          >
            Use my real numbers
          </Button>
        </div>
      ) : r.missingCore.length > 0 ? (
        <div className="rise flex flex-col gap-4 border border-ink bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
          <p>
            <span className="font-semibold">{r.missingCore.length} numbers not provided yet.</span> <span className="text-mute">Anything that depends on them shows “Not provided”.</span>
          </p>
          <Button
            onClick={() => {
              setTab('questions');
              go('import');
            }}
          >
            Answer {Math.min(8, r.missingCore.length)} quick questions
          </Button>
        </div>
      ) : null}

      {/* Top line */}
      <section>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow">{typeLabel} · Monthly review</div>
            <h1 className="display mt-1 text-4xl sm:text-6xl">{monthName(input.month)}</h1>
          </div>
          {!input.isSample && (
            <Button variant="primary" onClick={() => go('advisor')}>
              See what to fix →
            </Button>
          )}
        </div>
        <div className="grid gap-px border border-ink bg-ink lg:grid-cols-[minmax(0,300px)_1fr]">
          <div className="flex flex-col items-center justify-center gap-3 bg-surface p-6 text-center">
            <LensDial score={r.health.score} size={176} />
            <div>
              <div className="eyebrow">Health</div>
              <div className="mt-1 text-lg font-bold" data-testid="verdict">
                {r.health.verdict}
              </div>
            </div>
            <details className="w-full text-left text-xs text-mute">
              <summary className="cursor-pointer text-center">How it’s scored</summary>
              <ul className="mt-2 space-y-1">
                {r.health.parts.map((p) => (
                  <li key={p.label} className="flex justify-between gap-2">
                    <span>
                      {p.label} <span className="text-faint">({p.weight})</span>
                    </span>
                    <span className="num">{Math.round(p.score * 100)}%</span>
                  </li>
                ))}
              </ul>
            </details>
          </div>
          <div className="grid grid-cols-2 gap-px bg-ink md:grid-cols-3">
            <div className="col-span-2 grid bg-surface md:col-span-1 md:row-span-2">
              <Kpi
                m={m.netProfit}
                big
                sub={
                  <span className="flex flex-col gap-1">
                    <Delta now={m.netProfit.value} prev={pr?.m.netProfit.value ?? null} unit="money" />
                    {m.goalGap.value !== null && (
                      <span>
                        {m.goalGap.value >= 0 ? 'Goal hit by ' : 'Short of goal by '}
                        <span className="num font-semibold text-ink">{money(Math.abs(m.goalGap.value))}</span>
                      </span>
                    )}
                  </span>
                }
              />
            </div>
            <Kpi m={m.revenue} sub={<Delta now={m.revenue.value} prev={pr?.m.revenue.value ?? null} unit="money" />} />
            <Kpi m={m.totalExpenses} sub={<Delta now={m.totalExpenses.value} prev={pr?.m.totalExpenses.value ?? null} unit="money" invert />} />
            <Kpi m={m.margin} sub={<Delta now={m.margin.value} prev={pr?.m.margin.value ?? null} unit="pct" />} />
            <div className="bg-surface p-4 sm:p-5">
              <div className="eyebrow">Cash in vs out</div>
              {m.cashIn.value !== null && m.cashOut.value !== null ? (
                <div className="mt-3 space-y-2">
                  {[
                    ['In', m.cashIn],
                    ['Out', m.cashOut],
                  ].map(([l, mm]) => {
                    const mx = Math.max(m.cashIn.value as number, m.cashOut.value as number);
                    const met = mm as Metric;
                    return (
                      <button key={l as string} type="button" onClick={() => openFormula(met)} className="block w-full text-left">
                        <div className="flex justify-between text-xs">
                          <span className="text-mute">{l as string}</span>
                          <span className="num">{money(met.value)}</span>
                        </div>
                        <div className="mt-1 h-2.5 bg-raised">
                          <div className={`h-full ${l === 'In' ? 'bg-ink' : 'hatch border border-ink'}`} style={{ width: `${((met.value as number) / mx) * 100}%` }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-2 text-sm text-faint">Not provided</div>
              )}
            </div>
          </div>
        </div>
        <p className="mt-2 text-xs text-mute">Tap any number to see how it’s calculated and which inputs it uses.</p>
      </section>

      {/* Trends */}
      <Reveal as="section">
        <SectionTitle eyebrow={series.length > 1 ? `Last ${series.length} months${input.isSample ? ' · sample history' : ''}` : 'Trends'} title="Trends" />
        <div className="grid grid-cols-2 gap-px border border-line bg-line lg:grid-cols-4">
          {(
            [
              ['revenue', 'money', false],
              ['netProfit', 'money', false],
              ['margin', 'pct', false],
              ['cac', 'money', true],
            ] as [MetricKey, 'money' | 'pct', boolean][]
          ).map(([k, unit, invert]) => (
            <div key={k} className="bg-surface p-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="eyebrow">{m[k].label}</span>
                <span className="num text-sm font-semibold">{fmtUnit(m[k].value, m[k].unit)}</span>
              </div>
              <div className="mt-3">
                <Sparkline values={s(k)} goal={k === 'netProfit' ? input.goal : null} label={`${m[k].label} trend`} />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <Delta now={m[k].value} prev={pr?.m[k].value ?? null} unit={unit} invert={invert} />
                {k === 'netProfit' && input.goal ? <span className="font-mono text-[10px] text-mute">- - goal</span> : null}
              </div>
            </div>
          ))}
        </div>
        {series.length < 2 && <p className="mt-2 text-sm text-mute">Save this month in History. Next month you’ll see trend lines here.</p>}
      </Reveal>

      {/* Revenue */}
      <Reveal as="section">
        <SectionTitle eyebrow="Where it came from" title="Revenue" right={<MetricValue m={m.revenue} className="num text-lg font-semibold" />} />
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <h3 className="mb-3 text-sm font-semibold">By product</h3>
            <Bars items={input.products.map((p) => ({ name: p.name, amount: p.amount }))} total={gross} />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold">By channel</h3>
            <Bars items={input.channels.map((p) => ({ name: p.name, amount: p.amount }))} total={gross} />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold">New vs returning customers</h3>
            {newRev !== null && retRev !== null && newRev + retRev > 0 ? (
              <>
                <div className="flex h-10 overflow-hidden border border-ink">
                  <div className="flex items-center bg-ink px-2 font-mono text-xs text-bg" style={{ width: `${(newRev / (newRev + retRev)) * 100}%` }}>
                    {pct(newRev / (newRev + retRev), 0)}
                  </div>
                  <div className="dots flex flex-1 items-center justify-end px-2 font-mono text-xs">
                    <span className="bg-surface px-1">{pct(retRev / (newRev + retRev), 0)}</span>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-mute">New</dt>
                    <dd className="num">{money(newRev)}</dd>
                  </div>
                  <div>
                    <dt className="text-mute">Returning</dt>
                    <dd className="num">{money(retRev)}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <p className="text-sm text-faint">Not provided. Add revenue from new and returning customers on the Import page.</p>
            )}
          </div>
        </div>
      </Reveal>

      {/* Expenses */}
      <Reveal as="section">
        <SectionTitle eyebrow="Where it went" title="Expenses" right={<MetricValue m={m.totalExpenses} className="num text-lg font-semibold" />} />
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
          <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Table. Scrolls sideways.">
            <table className="w-full min-w-[460px] text-sm">
              <thead>
                <tr className="eyebrow text-left">
                  <th className="pb-2 font-normal">Line</th>
                  <th className="pb-2 font-normal">Share of revenue</th>
                  <th className="pb-2 text-right font-normal">$</th>
                  <th className="pb-2 text-right font-normal">%</th>
                  <th className="pb-2 text-right font-normal">Per sale</th>
                </tr>
              </thead>
              <tbody>
                {r.expenses.map((e) => (
                  <tr key={e.key} className="border-t border-line">
                    <td className="py-2.5 pr-3">{e.label}</td>
                    <td className="w-[30%] py-2.5 pr-3">
                      <div className="h-2 bg-raised">
                        <div className="h-full bg-ink" style={{ width: `${Math.min(100, (e.pctOfRevenue ?? 0) * 100 * 2)}%` }} />
                      </div>
                    </td>
                    <td className={`num py-2.5 text-right ${e.amount === null ? 'text-faint' : ''}`}>{e.amount === null ? 'Not provided' : money(e.amount)}</td>
                    <td className="num py-2.5 text-right text-mute">{e.pctOfRevenue === null ? '—' : pct(e.pctOfRevenue)}</td>
                    <td className="num py-2.5 text-right text-mute">{e.perSale === null ? '—' : money(e.perSale, { cents: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-mute">Bar scale: full width = 50% of revenue.</p>
          </div>
          <div>
            <h3 className="text-sm font-semibold">One average sale, split</h3>
            {split && aov ? (
              <>
                <p className="mt-1 text-sm text-mute">
                  Of each <span className="num font-semibold text-ink">{money(aov, { cents: true })}</span> sale:
                </p>
                <div className="mt-4 flex h-12 overflow-hidden border border-ink">
                  {split.map((p, i) => (
                    <div key={p.label} title={`${p.label}: ${money(p.v, { cents: true })}`} className={`h-full border-r border-bg last:border-0 ${p.label === 'Profit' ? (p.v >= 0 ? 'bg-ink' : 'hatch') : i % 3 === 0 ? 'bg-faint' : i % 3 === 1 ? 'dots' : 'bg-line'}`} style={{ width: `${(Math.abs(p.v) / aov) * 100}%` }} />
                  ))}
                </div>
                <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  {split.map((p) => (
                    <li key={p.label} className="flex justify-between gap-2">
                      <span className={p.label === 'Profit' ? 'font-semibold' : 'text-mute'}>{p.label}</span>
                      <span className={`num ${p.label === 'Profit' ? 'font-semibold' : ''}`}>{money(p.v, { cents: true })}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-2 text-sm text-faint">Needs revenue and number of orders.</p>
            )}
          </div>
        </div>
      </Reveal>

      {/* P&L */}
      <Reveal as="section">
        <SectionTitle
          eyebrow="Statement"
          title="Profit & loss"
          right={
            <Button id="download-pdf" variant="secondary" onClick={downloadPdf} disabled={busy}>
              {busy ? 'Building PDF…' : 'Download PDF'}
            </Button>
          }
        />
        <div className="max-w-2xl">
          <table className="w-full text-sm" data-testid="pnl">
            <tbody>
              <tr className="border-b border-ink">
                <td className="py-2 font-semibold">Revenue</td>
                <td className="num py-2 text-right font-semibold">{money(m.revenue.value)}</td>
                <td className="num w-20 py-2 text-right text-mute">100%</td>
              </tr>
              {r.expenses.map((e) => (
                <tr key={e.key} className="border-b border-line">
                  <td className="py-2 pl-4 text-mute">{e.label}</td>
                  <td className={`num py-2 text-right ${e.amount === null ? 'text-faint' : ''}`}>{e.amount === null ? 'Not provided' : `(${money(e.amount)})`}</td>
                  <td className="num py-2 text-right text-mute">{e.pctOfRevenue === null ? '' : pct(e.pctOfRevenue)}</td>
                </tr>
              ))}
              <tr className="border-b border-ink">
                <td className="py-2 font-semibold">Total expenses</td>
                <td className="num py-2 text-right font-semibold">{m.totalExpenses.value === null ? 'Not provided' : `(${money(m.totalExpenses.value)})`}</td>
                <td className="num py-2 text-right text-mute">{m.totalExpenses.value !== null && gross ? pct(m.totalExpenses.value / gross) : ''}</td>
              </tr>
              <tr className="border-b-4 border-double border-ink">
                <td className="py-3 text-base font-bold">Net profit</td>
                <td className="num py-3 text-right text-base font-bold" data-testid="pnl-profit">
                  {money(m.netProfit.value)}
                </td>
                <td className="num py-3 text-right font-semibold">{pct(m.margin.value)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Reveal>

      {/* Break-even */}
      <Reveal as="section">
        <SectionTitle eyebrow="Drag to explore" title="Break-even & goal" />
        <BreakEven review={r} />
      </Reveal>

      {/* Cash */}
      <Reveal as="section">
        <SectionTitle eyebrow="Bank account" title="Cash" />
        <div className="grid grid-cols-2 gap-px border border-line bg-line md:grid-cols-4">
          {([m.cashStart, m.cashEnd, m.cashChange, m.runway] as Metric[]).map((x) => (
            <div key={x.key} className="bg-surface p-4">
              <div className="eyebrow">{x.label}</div>
              <MetricValue m={x} className="mt-2 text-xl font-semibold" count={x.key !== 'runway'} />
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm">
          {m.netProfit.value === null ? (
            <span className="text-mute">Add revenue and expenses to see runway.</span>
          ) : m.netProfit.value >= 0 ? (
            <span>You earned more than you spent, so cash isn’t running down.</span>
          ) : m.runway.value !== null ? (
            <span>
              At this month’s loss of <span className="num font-semibold">{money(-m.netProfit.value)}</span>, cash runs out around <span className="num font-semibold">{runOutDate(input.month, m.runway.value)}</span>.
            </span>
          ) : (
            <span className="text-mute">You lost money this month. Add your end-of-month cash to see when it runs out.</span>
          )}
        </p>
      </Reveal>

      <Reveal as="section">
        <RunwayExplorer review={r} />
      </Reveal>

      {/* Formulas */}
      <Reveal as="section">
        <details className="border-t border-ink pt-4">
          <summary className="cursor-pointer text-lg font-extrabold" style={{ fontFamily: 'var(--font-display)' }}>
            All formulas
          </summary>
          <div className="mt-4 overflow-x-auto" tabIndex={0} role="group" aria-label="Table. Scrolls sideways.">
            <table className="w-full min-w-[560px] text-sm">
              <tbody>
                {Object.values(m).map((x) => (
                  <tr key={x.key} className="border-b border-line">
                    <td className="py-2 pr-3 font-medium">{x.label}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-mute">{x.formula}</td>
                    <td className={`num py-2 text-right ${x.value === null ? 'text-faint' : ''}`}>{fmtUnit(x.value, x.unit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Reveal>

      <div className="flex justify-center border-t border-line pt-10">
        <Button onClick={() => go('advisor')}>See what to change next month →</Button>
      </div>
    </div>
  );
}
