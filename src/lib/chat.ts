/**
 * Advisor chat. Answers are grounded in the computed review only.
 * - Local engine: pattern-matched answers built from the numbers, always with sources.
 * - Claude (when running inside claude.ai): gets the numbers as data plus a
 *   run_scenario tool backed by the same calculation engine, and must cite sources.
 */
import { applyScenario, BENCHMARKS, computeReview, tierOf, type Recommendation, type Review } from './calc';
import { fmtUnit, money, pct, ratio } from './format';
import type { AdFormat, Scenario } from './types';
import { AD_FORMATS } from './types';
import { inferFormat } from './parse/common';

export interface Answer {
  text: string;
  sources: { label: string; value: string }[];
}

const src = (r: Review, ...keys: (keyof Review['m'])[]) => keys.map((k) => ({ label: r.m[k].label, value: fmtUnit(r.m[k].value, r.m[k].unit) }));

function scenarioAnswer(r: Review, s: Scenario, what: string): Answer {
  const base = r.m.netProfit.value;
  const after = computeReview(applyScenario(r.input, s));
  const p = after.m.netProfit.value;
  if (base === null || p === null) return { text: 'I can’t run that yet: revenue or expenses are not provided.', sources: src(r, 'revenue', 'totalExpenses') };
  const d = p - base;
  return {
    text: `${what}: profit goes from ${money(base)} to ${money(p)} (${money(d, { sign: true })}/month). Revenue moves from ${money(r.m.revenue.value)} to ${money(after.m.revenue.value)} and ad spend from ${money(r.m.adSpend.value)} to ${money(after.m.adSpend.value)}.${s.adSpendPct || s.adSpendDelta ? ' This assumes ad-reported revenue moves in line with spend.' : ''}${s.pricePct ? ' This assumes the same number of sales.' : ''}`,
    sources: [...src(r, 'netProfit', 'revenue', 'adSpend'), { label: 'Projected profit', value: money(p) }],
  };
}

export function localAnswer(q: string, r: Review, recs: Recommendation[]): Answer {
  const t = q.toLowerCase();
  const m = r.m;
  const num = (re: RegExp) => {
    const x = t.match(re);
    return x ? parseFloat(x[1].replace(/,/g, '')) : null;
  };

  // what-ifs
  if (/(cut|reduce|lower|drop|decrease|less).*(ad|ads|spend|budget)|(ad|ads) spend.*(cut|down|less)/.test(t)) {
    const d = num(/\$\s?([\d,]+(?:\.\d+)?)/);
    const p = num(/([\d.]+)\s?%/);
    if (d) return scenarioAnswer(r, { adSpendDelta: -d }, `Cutting ad spend by ${money(d)}`);
    if (p) return scenarioAnswer(r, { adSpendPct: -p / 100 }, `Cutting ad spend by ${p}%`);
  }
  if (/(increase|raise|add|boost|more).*(ad|ads|spend|budget)/.test(t)) {
    const d = num(/\$\s?([\d,]+(?:\.\d+)?)/);
    const p = num(/([\d.]+)\s?%/);
    if (d) return scenarioAnswer(r, { adSpendDelta: d }, `Adding ${money(d)} of ad spend`);
    if (p) return scenarioAnswer(r, { adSpendPct: p / 100 }, `Raising ad spend ${p}%`);
  }
  if (/(price|prices|pricing)/.test(t)) {
    const p = num(/([\d.]+)\s?%/) ?? 10;
    const down = /(lower|cut|drop|discount|reduce)/.test(t);
    return scenarioAnswer(r, { pricePct: (down ? -p : p) / 100 }, `${down ? 'Lowering' : 'Raising'} prices ${p}%`);
  }
  if (/(pause|cut|stop|kill|turn off)/.test(t)) {
    const f = inferFormat(t);
    if ((f !== 'Other' || /\bother\b/.test(t)) && r.ads.formats.some((x) => x.format === f)) return scenarioAnswer(r, { cutFormats: [f as AdFormat] }, `Pausing ${f} ads`);
  }
  if (/churn/.test(t) && r.input.values.churnRate != null) {
    const p = num(/([\d.]+)\s?(?:%|points|pts)/) ?? 2;
    return scenarioAnswer(r, { churnPts: -p }, `Cutting churn by ${p} points`);
  }
  if (/conversion/.test(t) && /(improve|raise|increase|lift|if)/.test(t)) {
    const p = num(/([\d.]+)\s?(?:%|points|pts)/) ?? 0.5;
    return scenarioAnswer(r, { convPts: p }, `Lifting conversion by ${p} points`);
  }

  // explanations
  if (/\bcac\b|cost (to|per) (acquire|customer)|acquisition/.test(t)) {
    if (m.cac.value === null) return { text: `CAC needs ad spend and new customers. Not provided: ${m.cac.missing.join(', ')}.`, sources: src(r, 'adSpend') };
    const b = BENCHMARKS[r.input.businessType].find((x) => x.key === 'cac')!;
    const worst = [...r.ads.formats].filter((f) => f.cpa !== null).sort((a, z) => (z.cpa as number) - (a.cpa as number))[0];
    const zero = r.ads.formats.filter((f) => f.conversions === 0);
    return {
      text: `Your CAC is ${money(m.cac.value, { cents: true })}: ${money(m.adSpend.value)} of ad spend ÷ ${r.input.values.newCustomers} new customers. For a ${r.input.businessType} business that’s roughly “${tierOf(m.cac.value, b)}” (rough estimate). ${worst ? `The most expensive format per sale is ${worst.format} at ${money(worst.cpa, { cents: true })} per conversion.` : ''} ${zero.length ? `${zero.map((z) => z.format).join(', ')} spent ${money(zero.reduce((s, z) => s + z.spend, 0))} with zero sales, which pushes CAC up.` : ''} The fastest way down is moving budget from the worst format to the best one.`,
      sources: [...src(r, 'cac', 'adSpend'), { label: 'New customers', value: String(r.input.values.newCustomers) }, ...(worst ? [{ label: `${worst.format} CPA`, value: money(worst.cpa, { cents: true }) }] : [])],
    };
  }
  if (/roas|which ad|best ad|worst ad|format|creative/.test(t)) {
    if (!r.ads.formats.length) return { text: 'No ad data yet. Import an ads export or add rows on the Ads page.', sources: [] };
    const lines = r.ads.formats.map((f) => `${f.format}: ${ratio(f.roas)} ROAS, ${money(f.profitAfterAdCost)} after costs${f.labels.length ? ` (${f.labels.join(', ')})` : ''}`);
    return { text: `Blended ROAS is ${ratio(m.mer.value)} (all revenue ÷ ad spend). By format:\n• ${lines.join('\n• ')}`, sources: [...src(r, 'mer', 'platformRoas'), { label: 'Contribution rate', value: pct(r.ads.contributionRate) }] };
  }
  if (/runway|cash|run out|bank/.test(t)) {
    return {
      text: m.netProfit.value !== null && m.netProfit.value < 0 ? `You lost ${money(-m.netProfit.value)} this month. With ${money(m.cashEnd.value)} in the bank that’s ${fmtUnit(m.runway.value, 'months')} of runway.` : `You made ${money(m.netProfit.value)}, so cash isn’t running down. Cash went from ${money(m.cashStart.value)} to ${money(m.cashEnd.value)}.`,
      sources: src(r, 'netProfit', 'cashStart', 'cashEnd', 'runway'),
    };
  }
  if (/margin|expens|cost|where.*money|spend most/.test(t)) {
    const top = [...r.expenses].filter((e) => e.amount).sort((a, b) => (b.amount as number) - (a.amount as number)).slice(0, 3);
    return {
      text: `Margin is ${pct(m.margin.value)}: ${money(m.netProfit.value)} profit on ${money(m.revenue.value)} revenue. Your three biggest costs are ${top.map((e) => `${e.label} ${money(e.amount)} (${pct(e.pctOfRevenue)} of revenue)`).join(', ')}.`,
      sources: [...src(r, 'margin', 'netProfit', 'revenue'), ...top.map((e) => ({ label: e.label, value: money(e.amount) }))],
    };
  }
  if (/fix|first|priority|what should|next month|improve|plan/.test(t)) {
    if (!recs.length) return { text: 'I need revenue and expenses before I can rank changes.', sources: src(r, 'revenue', 'totalExpenses') };
    return { text: `Ranked by monthly profit impact:\n${recs.map((x, i) => `${i + 1}. ${x.title}: ${money(x.impact, { sign: true })}/mo (${x.difficulty}). ${x.why}`).join('\n')}`, sources: recs.flatMap((x) => x.sources.slice(0, 1).map((s) => ({ label: s.label, value: fmtUnit(s.value, s.unit) }))) };
  }
  if (/profit|make money|earn|did i/.test(t)) {
    const profit = m.netProfit.value;
    if (profit === null) return { text: `I can’t say yet. Not provided: ${m.netProfit.missing.join(', ') || 'some expenses'}.`, sources: src(r, 'revenue') };
    return { text: `${profit >= 0 ? 'Yes' : 'No'}: revenue ${money(m.revenue.value)}, expenses ${money(m.totalExpenses.value)}, net profit ${money(profit)} (${pct(m.margin.value)} margin).${m.goalGap.value !== null ? ` That’s ${money(Math.abs(m.goalGap.value))} ${m.goalGap.value >= 0 ? 'above' : 'below'} your goal.` : ''}`, sources: src(r, 'revenue', 'totalExpenses', 'netProfit', 'margin') };
  }
  return {
    text: `Here’s the month in one line: ${money(m.revenue.value)} in, ${money(m.totalExpenses.value)} out, ${money(m.netProfit.value)} profit. Try asking “Why is my CAC so high?”, “What if I cut ad spend by $500?”, “What if I raise prices 15%?” or “Which ad format should I pause?”`,
    sources: src(r, 'revenue', 'totalExpenses', 'netProfit'),
  };
}

/** Context Claude receives: only computed numbers, never guesses. */
export function claudeContext(r: Review, recs: Recommendation[]): string {
  const metrics = Object.values(r.m).map((x) => ({ metric: x.label, value: x.value === null ? 'Not provided' : fmtUnit(x.value, x.unit), formula: x.formula }));
  const expenses = r.expenses.map((e) => ({ line: e.label, amount: money(e.amount), pctOfRevenue: pct(e.pctOfRevenue) }));
  const ads = r.ads.formats.map((f) => ({ format: f.format, spend: money(f.spend), conversions: f.conversions, cpa: money(f.cpa), revenue: money(f.revenue), roas: ratio(f.roas), ctr: pct(f.ctr, 2), profitAfterAdCost: money(f.profitAfterAdCost), labels: f.labels }));
  const fixes = recs.map((x) => ({ title: x.title, impactPerMonth: money(x.impact), difficulty: x.difficulty, why: x.why, assumption: x.assumption }));
  const bench = BENCHMARKS[r.input.businessType].map((b) => ({ metric: b.label, tier: tierOf(r.m[b.key].value, b) ?? 'Not provided', note: 'rough estimate, not live data' }));
  return JSON.stringify({ businessType: r.input.businessType, month: r.input.month, isSampleData: r.input.isSample, profitGoal: r.input.goal, metrics, expenses, adFormats: ads, rankedFixes: fixes, benchmarks: bench });
}

export const CLAUDE_INSTRUCTIONS = `You are MonthLens, a plain-spoken CFO and ad analyst for a small online business.
Rules:
- Use ONLY numbers from the DATA block or from run_scenario results. Never estimate, invent or round-trip new figures yourself.
- If a number is "Not provided", say so and tell them which input to add. Do not guess it.
- For any what-if, call run_scenario and quote its before/after numbers.
- Cite each number you use inline like [Net profit: $12,340].
- Benchmarks are rough estimates; say so if you mention them.
- Be brief: 2-5 short sentences or a short list. Plain English, no jargon.`;

export const SCENARIO_TOOL_SCHEMA = {
  type: 'object' as const,
  properties: {
    pricePct: { type: 'number', description: 'Price change as a fraction, e.g. 0.1 for +10%' },
    adSpendPct: { type: 'number', description: 'Ad spend change as a fraction, e.g. -0.2' },
    adSpendDelta: { type: 'number', description: 'Ad spend change in dollars, e.g. -500' },
    convPts: { type: 'number', description: 'Conversion rate change in percentage points, e.g. 0.5' },
    churnPts: { type: 'number', description: 'Churn change in percentage points, e.g. -2' },
    cogsPct: { type: 'number', description: 'COGS change as a fraction' },
    fixedPct: { type: 'number', description: 'Software + contractors + other change as a fraction' },
    cutFormats: { type: 'array', items: { type: 'string', enum: [...AD_FORMATS] }, description: 'Ad formats to pause' },
  },
};

export function runScenarioTool(r: Review, s: Scenario) {
  const after = computeReview(applyScenario(r.input, s));
  const pick = (x: Review) => ({ netProfit: money(x.m.netProfit.value), revenue: money(x.m.revenue.value), adSpend: money(x.m.adSpend.value), margin: pct(x.m.margin.value), cac: money(x.m.cac.value) });
  return { before: pick(r), after: pick(after), assumptions: 'Ad-reported revenue moves in line with spend; price changes keep the same number of sales; conversion and churn changes scale revenue and variable costs.' };
}
