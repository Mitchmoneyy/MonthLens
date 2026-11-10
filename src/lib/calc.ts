/**
 * MonthLens calculation engine.
 *
 * Every number the app shows comes from `computeReview(input)`.
 * Nothing here invents data: a metric whose inputs are missing is `null`
 * and is shown as "Not provided". Assumptions used by projections are
 * listed in ASSUMPTIONS and shown next to each projection.
 */
import type { AdFormat, AdRow, BusinessType, FieldKey, MonthInput, Scenario } from './types';
import { FIELD } from './fields';
import { PLATFORM_SPEND_FIELD } from './parse/common';

export type MetricUnit = 'money' | 'pct' | 'ratio' | 'count' | 'months' | 'score';

export interface Metric {
  key: string;
  label: string;
  value: number | null;
  unit: MetricUnit;
  /** formula in words, e.g. "Net profit ÷ Revenue" */
  formula: string;
  /** source numbers used */
  inputs: { label: string; value: number | null; unit: MetricUnit }[];
  /** which required inputs were missing */
  missing: string[];
  /** true when the value excludes some optional lines that were not provided */
  partial?: boolean;
}

export const ASSUMPTIONS = {
  /** extra budget moved into a format earns this share of its current ROAS (diminishing returns) */
  shiftEfficiency: 0.75,
  /** ad-attributed revenue moves in line with spend when spend changes */
  linearAdResponse: true,
};

const n = (v: number | null | undefined): number | null => (v === undefined || v === null || Number.isNaN(v) ? null : v);
const div = (a: number | null, b: number | null): number | null => (a === null || b === null || b === 0 ? null : a / b);
const sum = (xs: (number | null)[]): number => xs.reduce<number>((s, x) => s + (x ?? 0), 0);

export const EXPENSE_LINES: { key: string; label: string; fields: FieldKey[] | 'ads' }[] = [
  { key: 'ads', label: 'Ad spend', fields: 'ads' },
  { key: 'cogs', label: 'COGS / delivery', fields: ['cogs'] },
  { key: 'fees', label: 'Platform fees', fields: ['paymentFees'] },
  { key: 'software', label: 'Software & tools', fields: ['software'] },
  { key: 'contractors', label: 'Contractors & team', fields: ['contractors'] },
  { key: 'refunds', label: 'Refunds', fields: ['refunds'] },
  { key: 'other', label: 'Other', fields: ['otherExpenses', 'oneOffExpenses'] },
];

export interface ExpenseLine {
  key: string;
  label: string;
  amount: number | null;
  pctOfRevenue: number | null;
  perSale: number | null;
}

export interface FormatStats {
  format: AdFormat;
  platforms: string[];
  rows: AdRow[];
  spend: number;
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  cpc: number | null;
  conversions: number | null;
  cpa: number | null;
  revenue: number | null;
  roas: number | null;
  profitAfterAdCost: number | null;
  labels: string[];
  verdict: 'scale' | 'cut' | 'fix' | 'hold';
}

export interface AdAnalysis {
  formats: FormatStats[];
  totalSpend: number;
  totalRevenue: number | null;
  /** share of revenue that is left after COGS, fees and refunds */
  contributionRate: number | null;
  scale: AdFormat[];
  cut: AdFormat[];
  spendMismatch: number | null;
}

export interface Health {
  score: number | null;
  verdict: 'Healthy' | 'Tight' | 'Losing money — fix this first' | 'Not enough data';
  parts: { label: string; score: number; weight: number; note: string }[];
}

export interface Review {
  input: MonthInput;
  m: Record<MetricKey, Metric>;
  expenses: ExpenseLine[];
  ads: AdAnalysis;
  health: Health;
  missingCore: FieldKey[];
}

export type MetricKey =
  | 'revenue'
  | 'refunds'
  | 'netRevenue'
  | 'adSpend'
  | 'totalExpenses'
  | 'netProfit'
  | 'margin'
  | 'contributionRate'
  | 'cashIn'
  | 'cashOut'
  | 'cashChange'
  | 'cashStart'
  | 'cashEnd'
  | 'runway'
  | 'mer'
  | 'platformRoas'
  | 'cac'
  | 'conversionRate'
  | 'aov'
  | 'arpc'
  | 'ltv'
  | 'ltvCac'
  | 'profitPerOrder'
  | 'goalGap';

/** Total ad spend: channel spend if any channel was entered, otherwise the sum of the ad rows. */
export function adSpendOf(input: MonthInput): number | null {
  const v = input.values;
  const ch = [v.adSpendMeta, v.adSpendGoogle, v.adSpendTiktok, v.adSpendOther].map(n);
  if (ch.some((x) => x !== null)) return sum(ch);
  if (input.ads.length) return sum(input.ads.map((a) => a.spend));
  return null;
}

function metric(key: MetricKey, label: string, value: number | null, unit: MetricUnit, formula: string, inputs: Metric['inputs'], missing: string[] = [], partial = false): Metric {
  return { key, label, value: missing.length ? null : value, unit, formula, inputs, missing, partial };
}

/** The one calculation function. Pure, client-side, unit-tested. */
export function computeReview(input: MonthInput): Review {
  const v = input.values;
  const get = (k: FieldKey) => n(v[k]);
  const label = (k: FieldKey) => FIELD[k].label;
  const miss = (...ks: FieldKey[]) => ks.filter((k) => get(k) === null).map(label);

  const gross = get('grossRevenue');
  const refunds = get('refunds');
  const cogs = get('cogs');
  const fees = get('paymentFees');
  const software = get('software');
  const contractors = get('contractors');
  const other = get('otherExpenses');
  const oneOff = get('oneOffExpenses');
  const adSpend = adSpendOf(input);
  const orders = get('orders');
  const sessions = get('sessions');
  const newCustomers = get('newCustomers');
  const active = get('activeCustomers');
  const churn = get('churnRate');
  const ppc = get('purchasesPerCustomer');
  const cashStart = get('cashStart');
  const cashEnd = get('cashEnd');

  const costParts: [string, number | null][] = [
    ['Ad spend', adSpend],
    [label('cogs'), cogs],
    [label('paymentFees'), fees],
    [label('software'), software],
    [label('contractors'), contractors],
    [label('refunds'), refunds],
    [label('otherExpenses'), other],
    [label('oneOffExpenses'), oneOff],
  ];
  const costMissing = costParts.filter(([, x]) => x === null).map(([l]) => l);
  const totalExpenses = sum(costParts.map(([, x]) => x));
  const anyCost = costParts.some(([, x]) => x !== null);

  const netProfit = gross === null || !anyCost ? null : gross - totalExpenses;
  const netRevenue = gross === null ? null : gross - (refunds ?? 0);
  // contribution = what's left of revenue after the variable costs (COGS, fees, refunds)
  const contribution = gross === null ? null : gross - (refunds ?? 0) - (cogs ?? 0) - (fees ?? 0);
  const contributionRate = div(contribution, gross);
  const adRowsRevenue = input.ads.some((a) => a.revenue !== null) ? sum(input.ads.map((a) => a.revenue)) : null;
  const adRowsSpend = sum(input.ads.map((a) => a.spend));

  const burn = netProfit !== null && netProfit < 0 ? -netProfit : null;
  const runway = netProfit === null ? null : netProfit >= 0 ? Infinity : cashEnd === null ? null : cashEnd / (burn as number);

  const aov = div(gross, orders);
  const cac = div(adSpend, newCustomers);
  const arpc = div(netRevenue, active);
  let ltv: number | null = null;
  let ltvFormula = 'Needs churn + active customers, or lifetime purchases per customer';
  let ltvInputs: Metric['inputs'] = [];
  if (arpc !== null && churn && contributionRate !== null) {
    ltv = (arpc * contributionRate) / (churn / 100);
    ltvFormula = 'Revenue per customer × Contribution rate ÷ Monthly churn';
    ltvInputs = [
      { label: 'Revenue per customer', value: arpc, unit: 'money' },
      { label: 'Contribution rate', value: contributionRate, unit: 'pct' },
      { label: 'Monthly churn', value: churn / 100, unit: 'pct' },
    ];
  } else if (aov !== null && ppc !== null && contributionRate !== null) {
    ltv = aov * contributionRate * ppc;
    ltvFormula = 'Average order value × Contribution rate × Lifetime purchases per customer';
    ltvInputs = [
      { label: 'Average order value', value: aov, unit: 'money' },
      { label: 'Contribution rate', value: contributionRate, unit: 'pct' },
      { label: 'Lifetime purchases', value: ppc, unit: 'count' },
    ];
  }
  const ltvMissing = ltv === null ? ['Churn % and active customers, or lifetime purchases per customer'] : [];

  const m: Record<MetricKey, Metric> = {
    revenue: metric('revenue', 'Total revenue', gross, 'money', 'Gross revenue before refunds', [{ label: label('grossRevenue'), value: gross, unit: 'money' }], miss('grossRevenue')),
    refunds: metric('refunds', 'Refunds', refunds, 'money', 'Refunds and chargebacks', [{ label: 'Refunds', value: refunds, unit: 'money' }], miss('refunds')),
    netRevenue: metric('netRevenue', 'Net revenue', netRevenue, 'money', 'Gross revenue − Refunds', [
      { label: 'Gross revenue', value: gross, unit: 'money' },
      { label: 'Refunds', value: refunds, unit: 'money' },
    ], miss('grossRevenue'), refunds === null),
    adSpend: metric('adSpend', 'Ad spend', adSpend, 'money', 'Meta + Google + TikTok + Other (or sum of ad rows)', [
      { label: 'Meta', value: get('adSpendMeta'), unit: 'money' },
      { label: 'Google', value: get('adSpendGoogle'), unit: 'money' },
      { label: 'TikTok', value: get('adSpendTiktok'), unit: 'money' },
      { label: 'Other', value: get('adSpendOther'), unit: 'money' },
    ], adSpend === null ? ['Ad spend'] : []),
    totalExpenses: metric('totalExpenses', 'Total expenses', anyCost ? totalExpenses : null, 'money', 'Ad spend + COGS + Fees + Software + Contractors + Refunds + Other + One-off', costParts.map(([l, x]) => ({ label: l, value: x, unit: 'money' as MetricUnit })), anyCost ? [] : ['All expenses'], costMissing.length > 0),
    netProfit: metric('netProfit', 'Net profit', netProfit, 'money', 'Total revenue − Total expenses', [
      { label: 'Total revenue', value: gross, unit: 'money' },
      { label: 'Total expenses', value: anyCost ? totalExpenses : null, unit: 'money' },
    ], [...miss('grossRevenue'), ...(anyCost ? [] : ['Expenses'])], costMissing.length > 0),
    margin: metric('margin', 'Profit margin', div(netProfit, gross), 'pct', 'Net profit ÷ Total revenue', [
      { label: 'Net profit', value: netProfit, unit: 'money' },
      { label: 'Total revenue', value: gross, unit: 'money' },
    ], netProfit === null ? ['Net profit'] : [], costMissing.length > 0),
    contributionRate: metric('contributionRate', 'Contribution rate', contributionRate, 'pct', '(Revenue − Refunds − COGS − Fees) ÷ Revenue', [
      { label: 'Revenue', value: gross, unit: 'money' },
      { label: 'Refunds', value: refunds, unit: 'money' },
      { label: 'COGS', value: cogs, unit: 'money' },
      { label: 'Fees', value: fees, unit: 'money' },
    ], miss('grossRevenue'), refunds === null || cogs === null || fees === null),
    cashIn: metric('cashIn', 'Cash in', gross, 'money', 'Money received from sales (gross revenue)', [{ label: 'Gross revenue', value: gross, unit: 'money' }], miss('grossRevenue')),
    cashOut: metric('cashOut', 'Cash out', anyCost ? totalExpenses : null, 'money', 'All money spent (total expenses)', [{ label: 'Total expenses', value: anyCost ? totalExpenses : null, unit: 'money' }], anyCost ? [] : ['Expenses'], costMissing.length > 0),
    cashChange: metric('cashChange', 'Change in cash', cashEnd !== null && cashStart !== null ? cashEnd - cashStart : null, 'money', 'Cash at end − Cash at start', [
      { label: 'Cash start', value: cashStart, unit: 'money' },
      { label: 'Cash end', value: cashEnd, unit: 'money' },
    ], miss('cashStart', 'cashEnd')),
    cashStart: metric('cashStart', 'Cash at start', cashStart, 'money', 'Bank balance at start of month', [{ label: 'Cash start', value: cashStart, unit: 'money' }], miss('cashStart')),
    cashEnd: metric('cashEnd', 'Cash at end', cashEnd, 'money', 'Bank balance at end of month', [{ label: 'Cash end', value: cashEnd, unit: 'money' }], miss('cashEnd')),
    runway: metric('runway', 'Runway', runway, 'months', 'Cash at end ÷ Monthly loss (only when losing money)', [
      { label: 'Cash end', value: cashEnd, unit: 'money' },
      { label: 'Monthly loss', value: burn, unit: 'money' },
    ], netProfit === null ? ['Net profit'] : netProfit < 0 ? miss('cashEnd') : []),
    mer: metric('mer', 'Blended ROAS', div(gross, adSpend), 'ratio', 'Total revenue ÷ Total ad spend', [
      { label: 'Total revenue', value: gross, unit: 'money' },
      { label: 'Ad spend', value: adSpend, unit: 'money' },
    ], [...miss('grossRevenue'), ...(adSpend === null ? ['Ad spend'] : [])]),
    platformRoas: metric('platformRoas', 'Ad-reported ROAS', div(adRowsRevenue, adRowsSpend || null), 'ratio', 'Revenue reported by ad rows ÷ Spend in ad rows', [
      { label: 'Ad-reported revenue', value: adRowsRevenue, unit: 'money' },
      { label: 'Ad row spend', value: adRowsSpend || null, unit: 'money' },
    ], adRowsRevenue === null ? ['Ad revenue by format'] : []),
    cac: metric('cac', 'CAC', cac, 'money', 'Total ad spend ÷ New customers', [
      { label: 'Ad spend', value: adSpend, unit: 'money' },
      { label: 'New customers', value: newCustomers, unit: 'count' },
    ], [...(adSpend === null ? ['Ad spend'] : []), ...miss('newCustomers')]),
    conversionRate: metric('conversionRate', 'Conversion rate', div(orders, sessions), 'pct', 'Orders ÷ Visits', [
      { label: 'Orders', value: orders, unit: 'count' },
      { label: 'Visits', value: sessions, unit: 'count' },
    ], miss('orders', 'sessions')),
    aov: metric('aov', 'Average order value', aov, 'money', 'Total revenue ÷ Orders', [
      { label: 'Total revenue', value: gross, unit: 'money' },
      { label: 'Orders', value: orders, unit: 'count' },
    ], miss('grossRevenue', 'orders')),
    arpc: metric('arpc', 'Revenue per customer', arpc, 'money', 'Net revenue ÷ Active customers', [
      { label: 'Net revenue', value: netRevenue, unit: 'money' },
      { label: 'Active customers', value: active, unit: 'count' },
    ], miss('grossRevenue', 'activeCustomers')),
    ltv: metric('ltv', 'Customer lifetime value', ltv, 'money', ltvFormula, ltvInputs, ltvMissing),
    ltvCac: metric('ltvCac', 'LTV : CAC', div(ltv, cac), 'ratio', 'Lifetime value ÷ CAC', [
      { label: 'LTV', value: ltv, unit: 'money' },
      { label: 'CAC', value: cac, unit: 'money' },
    ], [...(ltv === null ? ['LTV'] : []), ...(cac === null ? ['CAC'] : [])]),
    profitPerOrder: metric('profitPerOrder', 'Profit per sale', div(netProfit, orders), 'money', 'Net profit ÷ Orders', [
      { label: 'Net profit', value: netProfit, unit: 'money' },
      { label: 'Orders', value: orders, unit: 'count' },
    ], [...(netProfit === null ? ['Net profit'] : []), ...miss('orders')]),
    goalGap: metric('goalGap', 'Vs. profit goal', netProfit !== null && input.goal !== null ? netProfit - input.goal : null, 'money', 'Net profit − Profit goal', [
      { label: 'Net profit', value: netProfit, unit: 'money' },
      { label: 'Profit goal', value: input.goal, unit: 'money' },
    ], [...(netProfit === null ? ['Net profit'] : []), ...(input.goal === null ? ['Profit goal'] : [])]),
  };

  const expenses: ExpenseLine[] = EXPENSE_LINES.map((line) => {
    const amount = line.fields === 'ads' ? adSpend : line.fields.every((f) => get(f) === null) ? null : sum(line.fields.map(get));
    return { key: line.key, label: line.label, amount, pctOfRevenue: div(amount, gross), perSale: div(amount, orders) };
  });

  const ads = analyzeAds(input, contributionRate, adSpend);
  const health = computeHealth(m, null);
  const missingCore = (['grossRevenue', 'cogs', 'refunds', 'paymentFees', 'orders', 'newCustomers', 'cashEnd'] as FieldKey[]).filter((k) => get(k) === null);
  if (adSpend === null) missingCore.push('adSpendMeta');

  return { input, m, expenses, ads, health, missingCore };
}

/** Group ad rows by format and score them. */
export function analyzeAds(input: MonthInput, contributionRate: number | null, adSpendTotal: number | null): AdAnalysis {
  const byFormat = new Map<AdFormat, AdRow[]>();
  for (const r of input.ads) {
    if (!byFormat.has(r.format)) byFormat.set(r.format, []);
    byFormat.get(r.format)!.push(r);
  }
  const sumOrNull = (rows: AdRow[], k: 'impressions' | 'clicks' | 'conversions' | 'revenue') => (rows.some((r) => r[k] !== null) ? sum(rows.map((r) => r[k])) : null);

  const formats: FormatStats[] = [...byFormat.entries()].map(([format, rows]) => {
    const spend = sum(rows.map((r) => r.spend));
    const impressions = sumOrNull(rows, 'impressions');
    const clicks = sumOrNull(rows, 'clicks');
    const conversions = sumOrNull(rows, 'conversions');
    const revenue = sumOrNull(rows, 'revenue');
    return {
      format,
      platforms: [...new Set(rows.map((r) => r.platform))],
      rows,
      spend,
      impressions,
      clicks,
      ctr: div(clicks, impressions),
      cpc: div(spend, clicks),
      conversions,
      cpa: conversions ? spend / conversions : null,
      revenue,
      roas: div(revenue, spend || null),
      profitAfterAdCost: revenue !== null && contributionRate !== null ? revenue * contributionRate - spend : null,
      labels: [],
      verdict: 'hold' as const,
    };
  });

  const withSales = formats.filter((f) => (f.conversions ?? 0) > 0 && f.roas !== null);
  if (withSales.length) {
    const best = withSales.reduce((a, b) => ((b.roas as number) > (a.roas as number) ? b : a));
    best.labels.push('Best ROAS');
    const cheapest = withSales.filter((f) => f.cpa !== null).reduce((a, b) => ((b.cpa as number) < (a.cpa as number) ? b : a));
    cheapest.labels.push('Cheapest CAC');
  }
  const noSales = formats.filter((f) => f.ctr !== null && (f.conversions === 0 || (f.conversions === null && f.revenue === 0)));
  if (noSales.length) {
    const top = noSales.reduce((a, b) => ((b.ctr as number) > (a.ctr as number) ? b : a));
    top.labels.push('Highest CTR but no sales');
  }
  const losers = formats.filter((f) => f.profitAfterAdCost !== null && f.profitAfterAdCost < 0).sort((a, b) => (a.profitAfterAdCost as number) - (b.profitAfterAdCost as number));
  losers.forEach((f, i) => f.labels.push(i === 0 ? 'Money loser — pause this' : 'Losing money'));

  const ranked = formats.filter((f) => f.profitAfterAdCost !== null && f.spend > 0).sort((a, b) => (b.profitAfterAdCost as number) / b.spend - (a.profitAfterAdCost as number) / a.spend);
  const scale = ranked.filter((f) => (f.profitAfterAdCost as number) > 0).slice(0, 2).map((f) => f.format);
  const cut = [...ranked].reverse().filter((f) => (f.profitAfterAdCost as number) < 0).slice(0, 2).map((f) => f.format);
  for (const f of formats) {
    if (scale.includes(f.format)) f.verdict = 'scale';
    else if (cut.includes(f.format)) f.verdict = 'cut';
    else if (f.labels.includes('Highest CTR but no sales')) f.verdict = 'fix';
  }

  const totalSpend = sum(formats.map((f) => f.spend));
  const totalRevenue = formats.some((f) => f.revenue !== null) ? sum(formats.map((f) => f.revenue)) : null;
  const spendMismatch = adSpendTotal !== null && formats.length ? adSpendTotal - totalSpend : null;
  return { formats: formats.sort((a, b) => b.spend - a.spend), totalSpend, totalRevenue, contributionRate, scale, cut, spendMismatch };
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Health score 0-100. Parts with missing data are left out and the rest re-weighted. */
export function computeHealth(m: Record<MetricKey, Metric>, prevProfit: number | null): Health {
  const parts: Health['parts'] = [];
  const margin = m.margin.value;
  const profit = m.netProfit.value;
  if (margin !== null) parts.push({ label: 'Profit margin', weight: 35, score: clamp01((margin + 0.1) / 0.35), note: '−10% scores 0, 25%+ scores full' });
  if (profit !== null && m.goalGap.value !== null) {
    const goal = profit - m.goalGap.value;
    if (goal > 0) parts.push({ label: 'Profit vs goal', weight: 20, score: clamp01(profit / goal), note: 'Full marks at 100% of goal' });
  }
  if (profit !== null) {
    if (profit >= 0) parts.push({ label: 'Runway', weight: 15, score: 1, note: 'Not burning cash' });
    else if (m.runway.value !== null) parts.push({ label: 'Runway', weight: 15, score: clamp01(m.runway.value / 12), note: '12+ months scores full' });
  }
  if (m.ltvCac.value !== null) parts.push({ label: 'LTV : CAC', weight: 20, score: clamp01((m.ltvCac.value - 1) / 2), note: '1× scores 0, 3×+ scores full' });
  else if (m.mer.value !== null) parts.push({ label: 'Blended ROAS', weight: 20, score: clamp01((m.mer.value - 1) / 3), note: '1× scores 0, 4×+ scores full' });
  if (profit !== null && prevProfit !== null && prevProfit !== 0) parts.push({ label: 'Trend vs last month', weight: 10, score: clamp01(0.5 + (profit - prevProfit) / Math.abs(prevProfit)), note: 'Flat scores half' });

  if (!parts.length || margin === null) return { score: null, verdict: 'Not enough data', parts };
  const w = parts.reduce((s, p) => s + p.weight, 0);
  let score = Math.round((100 * parts.reduce((s, p) => s + p.weight * p.score, 0)) / w);
  let verdict: Health['verdict'] = score >= 65 ? 'Healthy' : 'Tight';
  if (profit !== null && profit < 0) {
    verdict = 'Losing money — fix this first';
    score = Math.min(score, 44);
  }
  return { score, verdict, parts };
}

/** Review with trend-aware health (needs last month's profit). */
export function computeReviewWithPrev(input: MonthInput, prev: MonthInput | null): Review {
  const r = computeReview(input);
  const prevProfit = prev ? computeReview(prev).m.netProfit.value : null;
  r.health = computeHealth(r.m, prevProfit);
  return r;
}

// ---------------------------------------------------------------- scenarios

function clone(input: MonthInput): MonthInput {
  return { ...input, values: { ...input.values }, ads: input.ads.map((a) => ({ ...a })), products: input.products.map((p) => ({ ...p })), channels: input.channels.map((c) => ({ ...c })) };
}

const PLATFORM_FIELD: Record<string, FieldKey> = PLATFORM_SPEND_FIELD;
const SPEND_FIELDS: FieldKey[] = ['adSpendMeta', 'adSpendGoogle', 'adSpendTiktok', 'adSpendOther'];

/** Scale sales volume: revenue and the costs that move with it. */
function scaleVolume(x: MonthInput, f: number) {
  const v = x.values;
  for (const k of ['grossRevenue', 'refunds', 'paymentFees', 'cogs', 'orders', 'newCustomers', 'newCustomerRevenue', 'returningCustomerRevenue'] as FieldKey[]) {
    if (v[k] != null) v[k] = (v[k] as number) * f;
  }
  x.products.forEach((p) => (p.amount *= f));
  x.channels.forEach((c) => (c.amount *= f));
}

/** Add revenue that comes from extra sales: scales volume-linked costs too. */
function addSalesRevenue(x: MonthInput, delta: number) {
  const g = x.values.grossRevenue;
  if (g == null || g === 0) return;
  scaleVolume(x, (g + delta) / g);
}

function changeAdSpend(x: MonthInput, rows: AdRow[], factor: number) {
  // move channel spend in line with the rows that changed
  for (const r of rows) {
    const k = PLATFORM_FIELD[r.platform];
    const delta = r.spend * (factor - 1);
    if (x.values[k] != null) x.values[k] = Math.max(0, (x.values[k] as number) + delta);
    r.spend *= factor;
  }
}

/** Apply a what-if scenario and return a new month input. Pure. */
export function applyScenario(base: MonthInput, s: Scenario): MonthInput {
  const x = clone(base);
  const v = x.values;
  const contribRate = computeReview(base).m.contributionRate.value;

  if (s.cutFormats?.length) {
    for (const fmt of s.cutFormats) {
      const rows = x.ads.filter((a) => a.format === fmt);
      const lost = sum(rows.map((r) => r.revenue));
      changeAdSpend(x, rows, 0);
      x.ads = x.ads.filter((a) => a.format !== fmt);
      addSalesRevenue(x, -lost);
    }
  }

  if (s.shift) {
    const from = x.ads.filter((a) => a.format === s.shift!.from);
    const to = x.ads.filter((a) => a.format === s.shift!.to);
    const moved = sum(from.map((r) => r.spend));
    const toSpend = sum(to.map((r) => r.spend));
    const toRev = sum(to.map((r) => r.revenue));
    if (moved > 0 && toSpend > 0) {
      const lost = sum(from.map((r) => r.revenue));
      changeAdSpend(x, from, 0);
      x.ads = x.ads.filter((a) => a.format !== s.shift!.from);
      const gained = moved * (toRev / toSpend) * ASSUMPTIONS.shiftEfficiency;
      // spread the new spend across the destination rows
      for (const r of to) {
        const share = r.spend / toSpend;
        const live = r;
        const convPerDollar = live.conversions !== null && live.revenue ? live.conversions / live.revenue : null;
        const k = PLATFORM_FIELD[live.platform];
        if (v[k] != null) v[k] = (v[k] as number) + moved * share;
        live.spend += moved * share;
        if (live.revenue !== null) live.revenue += gained * share;
        if (live.conversions !== null && convPerDollar !== null) live.conversions += convPerDollar * gained * share;
      }
      addSalesRevenue(x, gained - lost);
    }
  }

  if (s.adSpendPct || s.adSpendDelta) {
    const before = adSpendOf(x) ?? 0;
    let factor = 1 + (s.adSpendPct ?? 0);
    if (s.adSpendDelta && before > 0) factor = (before * factor + s.adSpendDelta) / before;
    factor = Math.max(0, factor);
    if (x.ads.length) {
      const adRev = sum(x.ads.map((a) => a.revenue));
      changeAdSpend(x, x.ads, factor);
      x.ads.forEach((a) => {
        if (a.revenue !== null) a.revenue *= factor;
        if (a.conversions !== null) a.conversions *= factor;
      });
      addSalesRevenue(x, adRev * (factor - 1));
    } else {
      for (const k of SPEND_FIELDS) if (v[k] != null) v[k] = (v[k] as number) * factor;
    }
  }

  if (s.convPts && v.orders && v.sessions) {
    const cr = v.orders / v.sessions;
    const f = Math.max(0, (cr + s.convPts / 100) / cr);
    scaleVolume(x, f);
    x.ads.forEach((a) => {
      if (a.revenue !== null) a.revenue *= f;
      if (a.conversions !== null) a.conversions *= f;
    });
  }

  if (s.churnPts && v.activeCustomers && v.churnRate != null && v.grossRevenue) {
    const net = v.grossRevenue - (v.refunds ?? 0);
    const arpc = net / v.activeCustomers;
    const kept = v.activeCustomers * (-s.churnPts / 100);
    v.churnRate = Math.max(0, v.churnRate + s.churnPts);
    v.activeCustomers += kept;
    addSalesRevenue(x, kept * arpc);
  }

  if (s.repeatShare && v.newCustomers && v.grossRevenue && v.orders) {
    const aov = v.grossRevenue / v.orders;
    addSalesRevenue(x, v.newCustomers * s.repeatShare * aov);
  }

  if (s.pricePct) {
    const f = 1 + s.pricePct;
    for (const k of ['grossRevenue', 'refunds', 'paymentFees', 'newCustomerRevenue', 'returningCustomerRevenue'] as FieldKey[]) if (v[k] != null) v[k] = (v[k] as number) * f;
    x.ads.forEach((a) => a.revenue !== null && (a.revenue *= f));
    x.products.forEach((p) => (p.amount *= f));
    x.channels.forEach((c) => (c.amount *= f));
  }

  if (s.cogsPct && v.cogs != null) v.cogs *= 1 + s.cogsPct;
  if (s.refundsPct && v.refunds != null) v.refunds *= 1 + s.refundsPct;
  if (s.softwarePct && v.software != null) v.software *= 1 + s.softwarePct;
  if (s.fixedPct) for (const k of ['software', 'contractors', 'otherExpenses'] as FieldKey[]) if (v[k] != null) v[k] = (v[k] as number) * (1 + s.fixedPct);

  void contribRate;
  x.isSample = base.isSample;
  return x;
}

export function mergeScenarios(list: Scenario[]): Scenario {
  const out: Scenario = {};
  for (const s of list) {
    for (const [k, val] of Object.entries(s) as [keyof Scenario, any][]) {
      if (k === 'cutFormats') out.cutFormats = [...(out.cutFormats ?? []), ...val];
      else if (k === 'shift') out.shift = val;
      else (out as any)[k] = ((out as any)[k] ?? 0) + val;
    }
  }
  return out;
}

export function profitOf(input: MonthInput): number | null {
  return computeReview(input).m.netProfit.value;
}

// ---------------------------------------------------------------- advisor

export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export interface Recommendation {
  id: string;
  title: string;
  what: string;
  why: string;
  impact: number;
  difficulty: Difficulty;
  scenario: Scenario;
  assumption: string;
  steps: string[];
  sources: { label: string; value: number | null; unit: MetricUnit }[];
}

export function recommend(input: MonthInput): Recommendation[] {
  const r = computeReview(input);
  const base = r.m.netProfit.value;
  if (base === null) return [];
  const v = input.values;
  const out: Recommendation[] = [];
  const impactOf = (s: Scenario) => (profitOf(applyScenario(input, s)) ?? base) - base;
  const fmt$ = (x: number | null) => (x === null ? 'n/a' : '$' + Math.round(x).toLocaleString('en-US'));
  const pct = (x: number | null, d = 1) => (x === null ? 'n/a' : (x * 100).toFixed(d) + '%');

  // 1. price
  if (v.grossRevenue) {
    const s: Scenario = { pricePct: 0.1 };
    const impact = impactOf(s);
    const orders = v.orders ?? null;
    const after = computeReview(applyScenario(input, s));
    const contribPerOrder = orders && after.m.netRevenue.value !== null ? (after.m.netRevenue.value - (after.input.values.cogs ?? 0) - (after.input.values.paymentFees ?? 0)) / orders : null;
    const breakEven = contribPerOrder && orders ? impact / (contribPerOrder * orders) : null;
    out.push({
      id: 'price',
      title: 'Raise prices 10%',
      what: 'Raise prices 10% on your best sellers or your next billing cycle.',
      why: `Revenue was ${fmt$(v.grossRevenue)}${r.m.aov.value !== null ? ` at an average sale of ${fmt$(r.m.aov.value)}` : ''}. 10% more per sale adds ${fmt$(impact)} after fees and refunds.${breakEven !== null ? ` It still pays off unless sales drop more than ${pct(breakEven, 0)}.` : ''}`,
      impact,
      difficulty: 'Easy',
      scenario: s,
      assumption: 'Assumes the same number of sales at the new price.',
      steps: ['Pick the 3 products or plans that sell most', 'Update prices (grandfather existing subscribers if needed)', 'Watch conversion rate daily for 7 days'],
      sources: [
        { label: 'Gross revenue', value: v.grossRevenue, unit: 'money' },
        { label: 'Orders', value: v.orders ?? null, unit: 'count' },
        { label: 'Platform fees', value: v.paymentFees ?? null, unit: 'money' },
      ],
    });
  }

  // 2. cut worst ad format / 3. shift budget
  const worst = r.ads.formats.filter((f) => f.profitAfterAdCost !== null && f.profitAfterAdCost < 0).sort((a, b) => (a.profitAfterAdCost as number) - (b.profitAfterAdCost as number))[0];
  const best = r.ads.formats.filter((f) => r.ads.scale.includes(f.format))[0];
  if (worst) {
    const s: Scenario = { cutFormats: [worst.format] };
    out.push({
      id: 'cut-' + worst.format,
      title: `Pause ${worst.format} ads`,
      what: `Pause ${worst.format} ads (${worst.platforms.join(', ')}).`,
      why: `${worst.format} cost ${fmt$(worst.spend)} and brought in ${fmt$(worst.revenue)} (ROAS ${worst.roas?.toFixed(2) ?? 'n/a'}). After product costs it lost ${fmt$(-(worst.profitAfterAdCost as number))}.`,
      impact: impactOf(s),
      difficulty: 'Easy',
      scenario: s,
      assumption: 'Assumes the revenue these ads reported goes away with them.',
      steps: [`Pause every ${worst.format} ad set`, 'Keep one test ad live at minimum budget', 'Re-check in 14 days'],
      sources: [
        { label: `${worst.format} spend`, value: worst.spend, unit: 'money' },
        { label: `${worst.format} revenue`, value: worst.revenue, unit: 'money' },
        { label: 'Contribution rate', value: r.m.contributionRate.value, unit: 'pct' },
      ],
    });
    if (best && best.format !== worst.format) {
      const s2: Scenario = { shift: { from: worst.format, to: best.format } };
      out.push({
        id: 'shift',
        title: `Move ${worst.format} budget to ${best.format}`,
        what: `Move the ${fmt$(worst.spend)} from ${worst.format} into ${best.format}.`,
        why: `${best.format} returned ${best.roas?.toFixed(2)}× on ${fmt$(best.spend)}; ${worst.format} returned ${worst.roas?.toFixed(2) ?? 'n/a'}×.`,
        impact: impactOf(s2),
        difficulty: 'Medium',
        scenario: s2,
        assumption: `Assumes extra ${best.format} spend earns ${Math.round(ASSUMPTIONS.shiftEfficiency * 100)}% of its current ROAS (returns fall as you scale).`,
        steps: [`Duplicate your top 2 ${best.format} ads`, `Raise ${best.format} budget by ${fmt$(worst.spend)} in 3 steps over 7 days`, 'Stop if CPA rises 30% above this month'],
        sources: [
          { label: `${best.format} ROAS`, value: best.roas, unit: 'ratio' },
          { label: `${best.format} spend`, value: best.spend, unit: 'money' },
          { label: `${worst.format} spend`, value: worst.spend, unit: 'money' },
        ],
      });
    }
  }

  // 4. churn
  if (v.churnRate && v.activeCustomers && v.churnRate >= 2.5) {
    const s: Scenario = { churnPts: -2 };
    out.push({
      id: 'churn',
      title: 'Cut churn by 2 points',
      what: `Bring monthly churn from ${v.churnRate.toFixed(1)}% to ${(v.churnRate - 2).toFixed(1)}% with a cancel-flow offer and onboarding check-ins.`,
      why: `${v.activeCustomers} active customers at ${fmt$(r.m.arpc.value)} each. Keeping 2% more of them keeps ${Math.round(v.activeCustomers * 0.02)} customers paying.`,
      impact: impactOf(s),
      difficulty: 'Medium',
      scenario: s,
      assumption: 'Counts one month of kept revenue. The real gain compounds.',
      steps: ['Add a pause / downgrade option to the cancel flow', 'Email every customer inactive for 14+ days', 'Call or message last month’s cancellations and log reasons'],
      sources: [
        { label: 'Churn %', value: v.churnRate / 100, unit: 'pct' },
        { label: 'Active customers', value: v.activeCustomers, unit: 'count' },
        { label: 'Revenue per customer', value: r.m.arpc.value, unit: 'money' },
      ],
    });
  }

  // 5. conversion
  if (v.orders && v.sessions) {
    const s: Scenario = { convPts: 0.5 };
    const cr = v.orders / v.sessions;
    out.push({
      id: 'conversion',
      title: 'Lift conversion by 0.5 points',
      what: `Lift conversion from ${pct(cr, 2)} to ${pct(cr + 0.005, 2)}: tighten the checkout or sales page, add proof and guarantees.`,
      why: `${v.sessions.toLocaleString()} visits produced ${v.orders.toLocaleString()} sales. 0.5 points more means ${Math.round(v.sessions * 0.005)} extra sales at the same traffic.`,
      impact: impactOf(s),
      difficulty: cr < 0.01 ? 'Medium' : 'Hard',
      scenario: s,
      assumption: 'Assumes the same traffic and average order value.',
      steps: ['Watch 10 session recordings of people who left at checkout', 'Fix the top 2 friction points', 'Add a guarantee and real reviews above the buy button'],
      sources: [
        { label: 'Visits', value: v.sessions, unit: 'count' },
        { label: 'Orders', value: v.orders, unit: 'count' },
        { label: 'Average order value', value: r.m.aov.value, unit: 'money' },
      ],
    });
  }

  // 6. tools
  if (v.software && v.software > 0) {
    const s: Scenario = { softwarePct: -0.2 };
    out.push({
      id: 'tools',
      title: 'Cut 20% of tool spend',
      what: 'Cancel or downgrade unused tools and switch monthly plans to annual.',
      why: `Software cost ${fmt$(v.software)} (${pct(div(v.software, v.grossRevenue ?? null))} of revenue).`,
      impact: impactOf(s),
      difficulty: 'Easy',
      scenario: s,
      assumption: 'Assumes 20% of tool spend can go. Check your list before acting.',
      steps: ['List every subscription from your card statement', 'Cancel anything unused in 30 days', 'Downgrade seats you don’t need'],
      sources: [{ label: 'Software & tools', value: v.software, unit: 'money' }],
    });
  }

  // 7. COGS
  if (v.cogs && v.cogs > 0 && v.grossRevenue && v.cogs / v.grossRevenue > 0.08) {
    const s: Scenario = { cogsPct: -0.05 };
    out.push({
      id: 'cogs',
      title: 'Renegotiate COGS by 5%',
      what: 'Ask suppliers or delivery partners for a 5% cut, or quote two alternatives.',
      why: `COGS / delivery was ${fmt$(v.cogs)}, ${pct(v.cogs / v.grossRevenue)} of revenue.`,
      impact: impactOf(s),
      difficulty: 'Hard',
      scenario: s,
      assumption: 'Assumes a 5% lower unit cost at the same volume.',
      steps: ['Get 2 competing quotes', 'Ask your current supplier to match', 'Offer a volume commitment in exchange'],
      sources: [{ label: 'COGS / delivery', value: v.cogs, unit: 'money' }],
    });
  }

  // 8. repeat purchase
  if ((input.businessType === 'ecommerce' || input.businessType === 'course' || input.businessType === 'creator') && v.newCustomers && v.orders && v.grossRevenue) {
    const s: Scenario = { repeatShare: 0.05 };
    out.push({
      id: 'repeat',
      title: 'Add a repeat-purchase offer',
      what: 'Email last month’s new customers a time-limited offer for a second purchase.',
      why: `You gained ${v.newCustomers.toLocaleString()} new customers. If 5% buy again at your ${fmt$(r.m.aov.value)} average order, that adds revenue with no ad cost.`,
      impact: impactOf(s),
      difficulty: 'Medium',
      scenario: s,
      assumption: 'Assumes 5% of new customers buy once more this month.',
      steps: ['Write a 3-email follow-up sequence', 'Offer a bundle or next-step product', 'Send day 7, 14 and 21 after purchase'],
      sources: [
        { label: 'New customers', value: v.newCustomers, unit: 'count' },
        { label: 'Average order value', value: r.m.aov.value, unit: 'money' },
      ],
    });
  }

  // 9. refunds
  if (v.refunds && v.grossRevenue && v.refunds / v.grossRevenue > 0.03) {
    const s: Scenario = { refundsPct: -0.25 };
    out.push({
      id: 'refunds',
      title: 'Cut refunds by a quarter',
      what: 'Find the top refund reason and fix it at the source: sizing, expectations or onboarding.',
      why: `Refunds were ${fmt$(v.refunds)}, ${pct(v.refunds / v.grossRevenue)} of revenue.`,
      impact: impactOf(s),
      difficulty: 'Medium',
      scenario: s,
      assumption: 'Assumes refunds fall 25%.',
      steps: ['Tag every refund from last month by reason', 'Fix the most common reason', 'Add a pre-purchase FAQ for it'],
      sources: [{ label: 'Refunds', value: v.refunds, unit: 'money' }],
    });
  }

  return out.filter((x) => x.impact > 0.5).sort((a, b) => b.impact - a.impact).slice(0, 5);
}

/** Projected profit if the given recommendations are all done. */
export function projectPlan(input: MonthInput, recs: Recommendation[]): number | null {
  if (!recs.length) return profitOf(input);
  return profitOf(applyScenario(input, mergeScenarios(recs.map((r) => r.scenario))));
}

// ---------------------------------------------------------------- benchmarks

export type Tier = 'Below Average' | 'Average' | 'Top 25%' | 'Top 10%';
export interface Benchmark {
  key: 'conversionRate' | 'margin' | 'cac' | 'ltvCac' | 'mer';
  label: string;
  higherIsBetter: boolean;
  /** thresholds for Average, Top 25%, Top 10% */
  t: [number, number, number];
  unit: MetricUnit;
}

/** Rough, hand-set estimates for orientation. Not live data. */
export const BENCHMARKS: Record<BusinessType, Benchmark[]> = {
  ecommerce: [
    { key: 'conversionRate', label: 'Conversion rate', higherIsBetter: true, t: [0.015, 0.025, 0.035], unit: 'pct' },
    { key: 'margin', label: 'Net margin', higherIsBetter: true, t: [0.05, 0.12, 0.2], unit: 'pct' },
    { key: 'cac', label: 'CAC', higherIsBetter: false, t: [60, 35, 20], unit: 'money' },
    { key: 'ltvCac', label: 'LTV : CAC', higherIsBetter: true, t: [2, 3, 4], unit: 'ratio' },
    { key: 'mer', label: 'Blended ROAS', higherIsBetter: true, t: [2.5, 4, 6], unit: 'ratio' },
  ],
  saas: [
    { key: 'conversionRate', label: 'Visit → paid', higherIsBetter: true, t: [0.005, 0.01, 0.02], unit: 'pct' },
    { key: 'margin', label: 'Net margin', higherIsBetter: true, t: [0.0, 0.15, 0.25], unit: 'pct' },
    { key: 'cac', label: 'CAC', higherIsBetter: false, t: [400, 200, 100], unit: 'money' },
    { key: 'ltvCac', label: 'LTV : CAC', higherIsBetter: true, t: [2, 3, 5], unit: 'ratio' },
    { key: 'mer', label: 'Blended ROAS', higherIsBetter: true, t: [2, 4, 6], unit: 'ratio' },
  ],
  course: [
    { key: 'conversionRate', label: 'Conversion rate', higherIsBetter: true, t: [0.01, 0.02, 0.04], unit: 'pct' },
    { key: 'margin', label: 'Net margin', higherIsBetter: true, t: [0.15, 0.3, 0.45], unit: 'pct' },
    { key: 'cac', label: 'CAC', higherIsBetter: false, t: [80, 40, 20], unit: 'money' },
    { key: 'ltvCac', label: 'LTV : CAC', higherIsBetter: true, t: [2, 3, 5], unit: 'ratio' },
    { key: 'mer', label: 'Blended ROAS', higherIsBetter: true, t: [2, 3.5, 5], unit: 'ratio' },
  ],
  agency: [
    { key: 'conversionRate', label: 'Visit → client', higherIsBetter: true, t: [0.0005, 0.001, 0.002], unit: 'pct' },
    { key: 'margin', label: 'Net margin', higherIsBetter: true, t: [0.1, 0.2, 0.3], unit: 'pct' },
    { key: 'cac', label: 'CAC', higherIsBetter: false, t: [1500, 800, 400], unit: 'money' },
    { key: 'ltvCac', label: 'LTV : CAC', higherIsBetter: true, t: [3, 5, 8], unit: 'ratio' },
    { key: 'mer', label: 'Blended ROAS', higherIsBetter: true, t: [3, 6, 10], unit: 'ratio' },
  ],
  creator: [
    { key: 'conversionRate', label: 'Visit → buyer', higherIsBetter: true, t: [0.005, 0.01, 0.02], unit: 'pct' },
    { key: 'margin', label: 'Net margin', higherIsBetter: true, t: [0.2, 0.4, 0.6], unit: 'pct' },
    { key: 'cac', label: 'CAC', higherIsBetter: false, t: [30, 15, 8], unit: 'money' },
    { key: 'ltvCac', label: 'LTV : CAC', higherIsBetter: true, t: [2, 3, 5], unit: 'ratio' },
    { key: 'mer', label: 'Blended ROAS', higherIsBetter: true, t: [2, 4, 7], unit: 'ratio' },
  ],
};

export function tierOf(value: number | null, b: Benchmark): Tier | null {
  if (value === null) return null;
  const [avg, t25, t10] = b.t;
  const ok = (x: number) => (b.higherIsBetter ? value >= x : value <= x);
  if (ok(t10)) return 'Top 10%';
  if (ok(t25)) return 'Top 25%';
  if (ok(avg)) return 'Average';
  return 'Below Average';
}

// ---------------------------------------------------------------- dates

export function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}
export function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}
export function monthName(month: string, short = false): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: short ? 'short' : 'long', year: 'numeric', timeZone: 'UTC' });
}
/** Run-out date: end of the given month plus runway months. */
export function runOutDate(month: string, runway: number | null): string | null {
  if (runway === null || !Number.isFinite(runway)) return null;
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 1)); // first day of next month
  d.setUTCDate(d.getUTCDate() + Math.round(runway * 30.44));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
