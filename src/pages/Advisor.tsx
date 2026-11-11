import { useEffect, useMemo, useRef, useState } from 'react';
import { go, useReviewData } from '../App';
import { Button, CountUp, Pill, Reveal, SectionTitle, Slider, useToast } from '../components/ui';
import { applyScenario, BENCHMARKS, computeReview, monthName, nextMonth, tierOf, type Recommendation, type Review, type Tier } from '../lib/calc';
import { CLAUDE_INSTRUCTIONS, claudeContext, explainAiFailure, localAnswer, runScenarioTool, SCENARIO_TOOL_SCHEMA } from '../lib/chat';

const AI_TIMEOUT_MS = 45000;
import { fmtUnit, money, pct } from '../lib/format';
import { getSampler } from '../lib/runtime';
import type { Scenario } from '../lib/types';
import { useStore, type ChatMsg } from '../store';

const DIFF_DOTS: Record<string, number> = { Easy: 1, Medium: 2, Hard: 3 };

function Difficulty({ d }: { d: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" title={`${d} to do`}>
      <span className="flex gap-0.5" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span key={i} className={`h-2 w-2 rounded-full border border-ink ${i <= DIFF_DOTS[d] ? 'bg-ink' : ''}`} />
        ))}
      </span>
      {d}
    </span>
  );
}

function FixList({ recs, onTry }: { recs: Recommendation[]; onTry: (s: Scenario) => void }) {
  const [open, setOpen] = useState<string | null>(recs[0]?.id ?? null);
  if (!recs.length) return <p className="text-mute">Add revenue and expenses on the Import page to get ranked changes.</p>;
  const max = Math.max(...recs.map((r) => r.impact));
  return (
    <ol className="border-t border-ink">
      {recs.map((x, i) => (
        <li key={x.id} className="border-b border-line" data-testid="fix">
          <button type="button" onClick={() => setOpen(open === x.id ? null : x.id)} aria-expanded={open === x.id} className="grid w-full grid-cols-[2rem_1fr_auto] items-center gap-3 py-4 text-left sm:grid-cols-[2.5rem_1fr_10rem_auto]">
            <span className="display text-2xl">{i + 1}</span>
            <span className="min-w-0">
              <span className="block font-semibold sm:text-lg">{x.title}</span>
              <span className="mt-1 block sm:hidden">
                <Difficulty d={x.difficulty} />
              </span>
            </span>
            <span className="hidden h-2 bg-raised sm:block">
              <span className="block h-full bg-ink" style={{ width: `${(x.impact / max) * 100}%` }} />
            </span>
            <span className="text-right">
              <span className="num block font-semibold">+{money(x.impact)}</span>
              <span className="block text-[11px] text-mute">per month</span>
            </span>
          </button>
          {open === x.id && (
            <div className="rise grid gap-4 pb-5 pl-11 sm:grid-cols-[1fr_auto] sm:pl-[3.25rem]">
              <div className="space-y-2 text-sm">
                <p>
                  <span className="eyebrow mr-2">Do</span>
                  {x.what}
                </p>
                <p>
                  <span className="eyebrow mr-2">Why</span>
                  {x.why}
                </p>
                <p className="text-mute">
                  <span className="eyebrow mr-2">Assumes</span>
                  {x.assumption}
                </p>
                <div className="flex flex-wrap gap-1 pt-1">
                  {x.sources.map((s) => (
                    <span key={s.label} className="rounded border border-line px-1.5 py-0.5 font-mono text-[11px] text-mute">
                      {s.label}: {fmtUnit(s.value, s.unit)}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-start gap-3 sm:flex-col sm:items-end">
                <span className="hidden sm:block">
                  <Difficulty d={x.difficulty} />
                </span>
                <Button variant="secondary" onClick={() => onTry(x.scenario)}>
                  Try in what-if
                </Button>
              </div>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

function WhatIf({ r, panelRef }: { r: Review; panelRef: React.RefObject<HTMLDivElement> }) {
  const s = useStore((x) => x.whatIf);
  const setS = useStore((x) => x.setWhatIf);
  const saveScenario = useStore((x) => x.saveScenario);
  const toast = useToast();
  const after = useMemo(() => computeReview(applyScenario(r.input, s)), [r.input, s]);
  const base = r.m.netProfit.value;
  const p = after.m.netProfit.value;
  const v = r.input.values;
  const set = (k: keyof Scenario, val: number) => setS({ ...s, [k]: val || undefined });
  const extra = [s.cutFormats?.length ? `Paused: ${s.cutFormats.join(', ')}` : '', s.shift ? `Moved ${s.shift.from} → ${s.shift.to}` : '', s.softwarePct ? `Tools ${pct(s.softwarePct, 0, true)}` : '', s.refundsPct ? `Refunds ${pct(s.refundsPct, 0, true)}` : '', s.repeatShare ? `Repeat offer ${pct(s.repeatShare, 0)}` : ''].filter(Boolean);
  return (
    <div ref={panelRef} className="scroll-mt-32 grid gap-px border border-ink bg-ink lg:grid-cols-[1.2fr_1fr]">
      <div className="space-y-6 bg-surface p-5 sm:p-6">
        <Slider id="wi-price" label="Prices" value={(s.pricePct ?? 0) * 100} min={-20} max={30} step={1} onChange={(x) => set('pricePct', x / 100)} display={pct(s.pricePct ?? 0, 0, true)} />
        <Slider id="wi-ads" label="Ad spend" value={(s.adSpendPct ?? 0) * 100} min={-100} max={100} step={5} onChange={(x) => set('adSpendPct', x / 100)} display={`${pct(s.adSpendPct ?? 0, 0, true)} · ${money(after.m.adSpend.value)}`} />
        {v.orders && v.sessions ? <Slider id="wi-conv" label="Conversion rate" value={s.convPts ?? 0} min={-1} max={2} step={0.1} onChange={(x) => set('convPts', Math.round(x * 10) / 10)} display={`${(s.convPts ?? 0) >= 0 ? '+' : ''}${(s.convPts ?? 0).toFixed(1)} pts · ${pct(after.m.conversionRate.value, 2)}`} /> : null}
        {v.churnRate != null && v.activeCustomers ? <Slider id="wi-churn" label="Churn" value={s.churnPts ?? 0} min={-Math.min(5, v.churnRate)} max={5} step={0.5} onChange={(x) => set('churnPts', x)} display={`${(s.churnPts ?? 0) >= 0 ? '+' : ''}${(s.churnPts ?? 0).toFixed(1)} pts`} /> : null}
        {v.cogs ? <Slider id="wi-cogs" label="COGS / delivery cost" value={(s.cogsPct ?? 0) * 100} min={-30} max={30} step={1} onChange={(x) => set('cogsPct', x / 100)} display={pct(s.cogsPct ?? 0, 0, true)} /> : null}
        <Slider id="wi-fixed" label="Fixed costs (tools, team, other)" value={(s.fixedPct ?? 0) * 100} min={-50} max={50} step={5} onChange={(x) => set('fixedPct', x / 100)} display={pct(s.fixedPct ?? 0, 0, true)} />
        {extra.length > 0 && <p className="font-mono text-xs text-mute">{extra.join(' · ')}</p>}
      </div>
      <div className="flex flex-col justify-between gap-6 bg-inv p-5 text-invink sm:p-6">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-widest opacity-60">Monthly profit with these changes</div>
          <div className="display mt-2 text-5xl sm:text-6xl" data-testid="whatif-profit">
            {p === null ? <span className="text-2xl">Not provided</span> : <CountUp value={p} format={(x) => money(x)} />}
          </div>
          {base !== null && p !== null && (
            <div className="num mt-2 text-sm opacity-80">
              {money(p - base, { sign: true })} vs. now ({money(base)})
            </div>
          )}
        </div>
        <dl className="grid grid-cols-3 gap-3 border-t border-current/20 pt-4 text-sm">
          <div>
            <dt className="opacity-60">Revenue</dt>
            <dd className="num">{money(after.m.revenue.value, { compact: true })}</dd>
          </div>
          <div>
            <dt className="opacity-60">Margin</dt>
            <dd className="num">{pct(after.m.margin.value)}</dd>
          </div>
          <div>
            <dt className="opacity-60">CAC</dt>
            <dd className="num">{money(after.m.cac.value)}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setS({})} className="rounded-[3px] border border-current/40 px-3 py-1.5 text-xs">
            Reset
          </button>
          <button
            type="button"
            onClick={() => {
              saveScenario('A', describe(s));
              toast('Saved as Scenario A');
            }}
            className="rounded-[3px] border border-current/40 px-3 py-1.5 text-xs"
          >
            Save as A
          </button>
          <button
            type="button"
            onClick={() => {
              saveScenario('B', describe(s));
              toast('Saved as Scenario B · compare in History');
            }}
            className="rounded-[3px] border border-current/40 px-3 py-1.5 text-xs"
          >
            Save as B
          </button>
        </div>
        <p className="text-[11px] opacity-60">Assumes ad-reported revenue moves with ad spend, price changes keep the same number of sales, and conversion and churn changes scale revenue and variable costs.</p>
      </div>
    </div>
  );
}

export function describe(s: Scenario): string {
  const parts: string[] = [];
  if (s.pricePct) parts.push(`Price ${pct(s.pricePct, 0, true)}`);
  if (s.adSpendPct) parts.push(`Ads ${pct(s.adSpendPct, 0, true)}`);
  if (s.convPts) parts.push(`Conv ${s.convPts > 0 ? '+' : ''}${s.convPts} pts`);
  if (s.churnPts) parts.push(`Churn ${s.churnPts > 0 ? '+' : ''}${s.churnPts} pts`);
  if (s.cogsPct) parts.push(`COGS ${pct(s.cogsPct, 0, true)}`);
  if (s.fixedPct) parts.push(`Fixed ${pct(s.fixedPct, 0, true)}`);
  if (s.cutFormats?.length) parts.push(`Pause ${s.cutFormats.join(', ')}`);
  if (s.shift) parts.push(`${s.shift.from} → ${s.shift.to}`);
  if (s.softwarePct) parts.push(`Tools ${pct(s.softwarePct, 0, true)}`);
  if (s.refundsPct) parts.push(`Refunds ${pct(s.refundsPct, 0, true)}`);
  if (s.repeatShare) parts.push(`Repeat offer`);
  return parts.join(' · ') || 'No changes';
}

function Plan({ recs, month, projected, base }: { recs: Recommendation[]; month: string; projected: number | null; base: number | null }) {
  const done = useStore((s) => s.planDone);
  const toggle = useStore((s) => s.togglePlan);
  const nm = nextMonth(month);
  const [y, m] = nm.split('-').map(Number);
  const items = recs.slice(0, 3).flatMap((x, i) => x.steps.map((st, j) => ({ id: `${month}:${x.id}:${j}`, rec: x, text: st, day: Math.min(7, 1 + i * 2 + j) })));
  items.sort((a, b) => a.day - b.day);
  const n = items.filter((i) => done[i.id]).length;
  if (!recs.length) return null;
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <ul className="divide-y divide-line border-y border-line">
        {items.map((it) => {
          const date = new Date(Date.UTC(y, m - 1, it.day)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
          return (
            <li key={it.id}>
              <label className="flex cursor-pointer items-start gap-4 py-3">
                <input type="checkbox" checked={!!done[it.id]} onChange={() => toggle(it.id)} className="mt-0.5 h-5 w-5 shrink-0 accent-current" />
                <span className="min-w-0 flex-1">
                  <span className={`block ${done[it.id] ? 'text-mute line-through' : ''}`}>{it.text}</span>
                  <span className="text-xs text-mute">{it.rec.title}</span>
                </span>
                <span className="num shrink-0 text-xs text-mute">{date}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="self-start border border-ink bg-surface p-5">
        <div className="eyebrow">Week one</div>
        <div className="mt-3 flex items-end gap-2">
          <span className="display text-5xl">{n}</span>
          <span className="pb-1 text-mute">of {items.length} done</span>
        </div>
        <div className="mt-3 flex gap-1" aria-hidden>
          {items.map((it) => (
            <span key={it.id} className={`h-2 flex-1 ${done[it.id] ? 'bg-ink' : 'bg-raised'}`} />
          ))}
        </div>
        <p className="mt-5 text-sm">
          If you do these 3 things, projected profit for {monthName(nm)} is{' '}
          <span className="num font-semibold" data-testid="projected">
            {money(projected)}
          </span>
          {base !== null && projected !== null && <span className="text-mute"> ({money(projected - base, { sign: true })} vs. this month)</span>}.
        </p>
      </div>
    </div>
  );
}

const SUGGESTIONS = ['Why is my CAC so high?', 'What if I cut ad spend by $500?', 'What if I raise prices 15%?', 'Which ad format should I pause?', 'Where is my money going?'];

function Chat({ r, recs }: { r: Review; recs: Recommendation[] }) {
  const chat = useStore((s) => s.chat);
  const push = useStore((s) => s.pushChat);
  const clear = useStore((s) => s.clearChat);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [chat.length, streaming]);

  // which engine answers here: Claude inside claude.ai, built-in rules everywhere else
  const [engine, setEngine] = useState<'checking' | 'claude' | 'rules'>('checking');
  const aiOff = useRef(false);
  useEffect(() => {
    let live = true;
    getSampler().then((s) => live && setEngine(s ? 'claude' : 'rules'));
    return () => {
      live = false;
    };
  }, []);

  const ask = async (text: string, isRetry = false) => {
    if (!text.trim() || busy) return;
    setQ('');
    if (!isRetry) push({ role: 'user', text });
    setBusy(true);
    let failure: ReturnType<typeof explainAiFailure> | null = null;
    try {
      const sampler = aiOff.current ? null : await getSampler();
      if (sampler) {
        const abort = new AbortController();
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          abort.abort();
        }, AI_TIMEOUT_MS);
        try {
          const toolSources: { label: string; value: string }[] = [];
          const history = useStore.getState().chat.slice(-7, -1).map((m) => ({ role: m.role, content: m.text }));
          const first = `${CLAUDE_INSTRUCTIONS}\n\nDATA (this month's computed numbers):\n${claudeContext(r, recs)}`;
          const messages = [{ role: 'user', content: first }, { role: 'assistant', content: 'Understood. I will only use these numbers and run_scenario results, and cite each one.' }, ...history, { role: 'user', content: text }];
          const res = await sampler(messages, {
            cache: false,
            signal: abort.signal,
            onText: ({ text: t }: { text: string }) => setStreaming(t),
            tools: [
              {
                name: 'run_scenario',
                description: "Recalculate this month's numbers with a change applied. Returns before/after profit, revenue, ad spend, margin and CAC from the app's calculation engine.",
                inputSchema: SCENARIO_TOOL_SCHEMA,
                execute: async (inp: Scenario) => {
                  const out = runScenarioTool(r, inp);
                  toolSources.push({ label: 'Scenario profit', value: `${out.before.netProfit} → ${out.after.netProfit}` });
                  return out;
                },
              },
            ],
          });
          if (!res?.text?.trim()) throw { code: 'empty_completion' };
          const cited: { label: string; value: string }[] = [];
          const clean = res.text.replace(/\[([^\]:]{2,40}):\s*([^\]]{1,30})\]/g, (_: string, l: string, v: string) => {
            if (!cited.some((c) => c.label === l.trim())) cited.push({ label: l.trim(), value: v.trim() });
            return v.trim();
          });
          push({ role: 'assistant', text: clean, sources: [...cited, ...toolSources], via: 'claude' });
          return;
        } catch (e: any) {
          failure = explainAiFailure(timedOut ? 'timeout' : e?.code);
          if (failure.disable) {
            aiOff.current = true;
            setEngine('rules');
          }
        } finally {
          clearTimeout(timer);
        }
      }
      const a = localAnswer(text, r, recs);
      push({ role: 'assistant', text: a.text, sources: a.sources, via: 'local', notice: failure?.message, retry: failure?.retryable ? text : undefined });
    } finally {
      setStreaming(null);
      setBusy(false);
    }
  };

  return (
    <div className="border border-ink bg-surface">
      <div className="max-h-[28rem] min-h-[10rem] space-y-4 overflow-y-auto p-4 sm:p-5" aria-live="polite">
        {chat.length === 0 && <p className="text-sm text-mute">Ask about this month. Answers use only the numbers on your screen, and every answer lists the figures it used.</p>}
        {chat.length === 0 && engine !== 'checking' && (
          <p className="font-mono text-[11px] text-mute" data-testid="chat-engine">
            {engine === 'claude' ? 'Answers here come from Claude. It only sees this month’s numbers and your question.' : 'Answers here come from MonthLens’s built-in rules on this device. No AI model is involved, and nothing is sent anywhere.'}
          </p>
        )}
        {chat.map((m: ChatMsg, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
            <div className={`max-w-[85%] whitespace-pre-line text-sm ${m.role === 'user' ? 'rounded-[3px] bg-inv px-4 py-2 text-invink' : ''}`}>
              {m.text}
              {m.sources && m.sources.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-mute">Sources</span>
                  {m.sources.map((s, j) => (
                    <span key={j} className="rounded border border-line px-1.5 py-0.5 font-mono text-[11px] text-mute">
                      {s.label}: {s.value}
                    </span>
                  ))}
                </div>
              )}
              {m.notice && (
                <div className="mt-2 border-l-2 border-ink pl-3 text-xs" role="status">
                  {m.notice}{' '}
                  {m.retry && i === chat.length - 1 && !busy && (
                    <button type="button" onClick={() => ask(m.retry as string, true)} className="font-semibold underline">
                      Try Claude again
                    </button>
                  )}
                </div>
              )}
              {m.via && <div className="mt-1 font-mono text-[10px] text-mute">{m.via === 'claude' ? 'Answered by Claude, using only your numbers' : 'Answered by MonthLens’s built-in rules, from your numbers'}</div>}
            </div>
          </div>
        ))}
        {busy && <div className="whitespace-pre-line text-sm text-mute">{streaming || 'Working it out…'}</div>}
        <div ref={endRef} />
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto border-t border-line px-4 py-3">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" onClick={() => ask(s)} className="shrink-0 rounded-[3px] border border-line px-3 py-1.5 text-xs hover:border-ink">
            {s}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <label htmlFor="chat-input" className="sr-only">
          Ask a question
        </label>
        <input id="chat-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="What if I cut ad spend by $500?" className="min-w-0 flex-1 rounded-[3px] border border-line bg-bg px-4 py-2.5 text-sm outline-none focus:border-ink" />
        <Button type="submit" disabled={busy || !q.trim()}>
          Ask
        </Button>
        {chat.length > 0 && (
          <button type="button" onClick={clear} className="px-2 text-xs text-mute">
            Clear
          </button>
        )}
      </form>
    </div>
  );
}

const TIER_ORDER: Tier[] = ['Below Average', 'Average', 'Top 25%', 'Top 10%'];

function Benchmarks({ r }: { r: Review }) {
  const list = BENCHMARKS[r.input.businessType];
  return (
    <div>
      <ul className="divide-y divide-line border-y border-line">
        {list.map((b) => {
          const v = r.m[b.key].value;
          const t = tierOf(v, b);
          const at = t ? TIER_ORDER.indexOf(t) : -1;
          return (
            <li key={b.key} className="grid grid-cols-2 items-center gap-3 py-3 sm:grid-cols-[10rem_7rem_1fr]">
              <span className="font-medium">{b.label}</span>
              <span className={`num text-right sm:text-left ${v === null ? 'text-faint' : ''}`}>{fmtUnit(v, b.unit)}</span>
              <span className="col-span-2 grid grid-cols-4 gap-1 sm:col-span-1">
                {TIER_ORDER.map((tier, i) => (
                  <span key={tier} className={`border px-1 py-1 text-center text-[10px] uppercase tracking-wider ${i === at ? 'border-inv bg-inv font-semibold text-invink' : 'border-line text-faint'}`}>
                    {tier}
                  </span>
                ))}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-mute">Benchmarks are rough estimates for a typical {r.input.businessType === 'saas' ? 'SaaS' : r.input.businessType} business, set by hand for orientation. They are not live industry data.</p>
    </div>
  );
}

export default function Advisor() {
  const { review: r, recs, projected, input } = useReviewData();
  const setWhatIf = useStore((s) => s.setWhatIf);
  const panel = useRef<HTMLDivElement>(null);
  const base = r.m.netProfit.value;
  return (
    <div className="space-y-12 sm:space-y-16">
      <section>
        <div className="eyebrow">AI advisor · based on {monthName(input.month)}</div>
        <h1 className="display mt-1 text-4xl sm:text-5xl">What to change next month</h1>
        {base === null && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border border-ink p-4">
            <span>Add revenue and expenses first. The advisor never guesses missing numbers.</span>
            <Button onClick={() => go('import')}>Add numbers</Button>
          </div>
        )}
      </section>

      <section>
        <SectionTitle eyebrow="Ranked by projected monthly profit" title="Fix these first" />
        <FixList
          recs={recs}
          onTry={(s) => {
            setWhatIf(s);
            panel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        />
      </section>

      <Reveal as="section">
        <SectionTitle eyebrow="Drag a slider" title="What if…" />
        <WhatIf r={r} panelRef={panel} />
      </Reveal>

      <Reveal as="section">
        <SectionTitle eyebrow={`First week of ${monthName(nextMonth(input.month))}`} title="Next month plan" />
        <Plan recs={recs} month={input.month} projected={projected} base={base} />
      </Reveal>

      <Reveal as="section">
        <SectionTitle eyebrow="Grounded in your numbers" title="Ask a follow-up" />
        <Chat r={r} recs={recs} />
      </Reveal>

      <Reveal as="section">
        <SectionTitle eyebrow="Rough estimates" title="How you compare" right={<Pill hatch>Estimates</Pill>} />
        <Benchmarks r={r} />
      </Reveal>
    </div>
  );
}
