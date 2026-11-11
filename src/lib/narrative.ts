/**
 * The month in plain English: what a CFO would say in four sentences.
 * Built only from computed numbers. Anything missing is left out, never guessed.
 */
import type { Recommendation, Review } from './calc';
import { monthName } from './calc';
import { money, pct, ratio } from './format';

/** Lowercase a label for mid-sentence use, keeping acronyms like COGS. */
const mid = (label: string) => label.replace(/^[A-Z][a-z]/, (c) => c.toLowerCase());

export function monthSummary(r: Review, prev: Review | null, recs: Recommendation[]): string[] {
  const m = r.m;
  const profit = m.netProfit.value;
  const revenue = m.revenue.value;
  if (profit === null || revenue === null) return [];
  const out: string[] = [];
  const month = monthName(r.input.month).split(' ')[0];

  // 1. Did I make money?
  let first = profit >= 0 ? `In ${month} you kept ${money(profit)} of the ${money(revenue)} that came in, a ${pct(m.margin.value)} margin.` : `In ${month} you spent ${money(-profit)} more than the ${money(revenue)} that came in.`;
  const pp = prev?.m.netProfit.value ?? null;
  if (pp !== null && Math.abs(profit - pp) >= 1) first += ` That’s ${money(Math.abs(profit - pp))} ${profit > pp ? 'better' : 'worse'} than the month before.`;
  out.push(first);

  // 2. Where did it go?
  const costs = r.expenses.filter((e) => (e.amount ?? 0) > 0).sort((a, b) => (b.amount as number) - (a.amount as number));
  if (costs.length >= 2) {
    const [a, b] = costs;
    out.push(`The two biggest costs were ${mid(a.label)} at ${money(a.amount)} (${pct(a.pctOfRevenue, 0)} of revenue) and ${mid(b.label)} at ${money(b.amount)} (${pct(b.pctOfRevenue, 0)}).`);
  } else if (costs.length === 1) {
    out.push(`The only cost entered so far is ${mid(costs[0].label)} at ${money(costs[0].amount)}, so the real profit is probably lower.`);
  }

  // 3. Did the ads work?
  const ads = r.ads;
  const best = ads.formats.find((f) => f.format === ads.scale[0]);
  const worst = ads.formats.find((f) => f.format === ads.cut[0]);
  if (m.adSpend.value && m.mer.value !== null) {
    let s = `Every $1 of ads came with ${ratio(m.mer.value).replace('×', '')} dollars of revenue overall.`;
    if (best && worst) s += ` ${best.format} earned its keep (${ratio(best.roas)}); ${worst.format} lost ${money(-(worst.profitAfterAdCost as number))} after product costs.`;
    else if (best) s += ` ${best.format} was the strongest format at ${ratio(best.roas)}.`;
    out.push(s);
  }

  // 4. Goal, cash, and the first thing to do
  const gap = m.goalGap.value;
  let last = '';
  if (profit < 0 && m.runway.value !== null && Number.isFinite(m.runway.value)) last = `At this rate the cash in the bank lasts about ${m.runway.value.toFixed(1)} months.`;
  else if (gap !== null) last = gap >= 0 ? `You beat your ${money(r.input.goal)} goal by ${money(gap)}.` : `You were ${money(-gap)} short of your ${money(r.input.goal)} goal.`;
  if (recs[0]) last += `${last ? ' ' : ''}The change worth the most next month: ${recs[0].title.toLowerCase()}, about ${money(recs[0].impact)} a month.`;
  if (last) out.push(last);
  return out;
}
