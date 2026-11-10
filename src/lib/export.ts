import type { Recommendation, Review } from './calc';
import { monthName } from './calc';
import { BUSINESS_TYPES } from './fields';
import { count, fmtUnit, money, pct, ratio } from './format';

/** The rows shared by the PDF, the CSV and the on-screen P&L. One source of truth. */
export function summaryRows(r: Review): { section: string; label: string; value: string; raw: number | null; formula: string }[] {
  const m = r.m;
  const row = (section: string, k: keyof Review['m']) => ({ section, label: m[k].label, value: fmtUnit(m[k].value, m[k].unit), raw: m[k].value, formula: m[k].formula });
  return [
    row('Top line', 'revenue'),
    row('Top line', 'totalExpenses'),
    row('Top line', 'netProfit'),
    row('Top line', 'margin'),
    row('Top line', 'cashIn'),
    row('Top line', 'cashOut'),
    ...r.expenses.map((e) => ({ section: 'Expenses', label: e.label, value: money(e.amount), raw: e.amount, formula: e.pctOfRevenue === null ? '' : `${pct(e.pctOfRevenue)} of revenue` })),
    row('Unit economics', 'adSpend'),
    row('Unit economics', 'mer'),
    row('Unit economics', 'platformRoas'),
    row('Unit economics', 'cac'),
    row('Unit economics', 'aov'),
    row('Unit economics', 'conversionRate'),
    row('Unit economics', 'ltv'),
    row('Unit economics', 'ltvCac'),
    row('Cash', 'cashStart'),
    row('Cash', 'cashEnd'),
    row('Cash', 'runway'),
    { section: 'Health', label: 'Health score', value: r.health.score === null ? 'Not enough data' : `${r.health.score} / 100 — ${r.health.verdict}`, raw: r.health.score, formula: 'Weighted: margin, goal, runway, unit economics, trend' },
  ];
}

export function toCsv(r: Review, recs: Recommendation[], projected: number | null): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [['Section', 'Metric', 'Value', 'Raw', 'Formula / note']];
  for (const x of summaryRows(r)) lines.push([x.section, x.label, x.value, x.raw === null ? '' : String(Math.round(x.raw * 10000) / 10000), x.formula]);
  for (const f of r.ads.formats) lines.push(['Ad formats', f.format, `Spend ${money(f.spend)} / ROAS ${ratio(f.roas)} / Profit after ad cost ${money(f.profitAfterAdCost)}`, String(f.profitAfterAdCost ?? ''), f.labels.join('; ')]);
  recs.forEach((x, i) => lines.push(['Next month', `${i + 1}. ${x.title}`, `${money(x.impact, { sign: true })}/mo`, String(Math.round(x.impact)), `${x.difficulty}. ${x.assumption}`]));
  lines.push(['Next month', 'Projected profit with top 3 fixes', money(projected), String(projected ?? ''), 'Same calculation engine as the app']);
  return lines.map((l) => l.map(esc).join(',')).join('\n');
}

/** A clean one-page PDF built with jsPDF (loaded on demand). */
export async function toPdf(r: Review, recs: Recommendation[], projected: number | null): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const L = 44;
  const R = W - 44;
  let y = 54;
  const type = BUSINESS_TYPES.find((b) => b.key === r.input.businessType)?.label ?? '';

  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(110);
  doc.text('MONTHLENS  ·  MONTHLY BUSINESS REVIEW', L, y);
  doc.text(new Date().toLocaleDateString('en-US'), R, y, { align: 'right' });
  y += 26;
  doc.setTextColor(0).setFontSize(22).text(monthName(r.input.month), L, y);
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(90);
  doc.text(`${type}${r.input.isSample ? '  ·  SAMPLE DATA' : ''}`, R, y, { align: 'right' });
  y += 14;
  doc.setDrawColor(0).setLineWidth(1.2).line(L, y, R, y);
  y += 26;

  // top line tiles
  const tiles: [string, string][] = [
    ['Revenue', money(r.m.revenue.value)],
    ['Expenses', money(r.m.totalExpenses.value)],
    ['Net profit', money(r.m.netProfit.value)],
    ['Margin', pct(r.m.margin.value)],
    ['Health', r.health.score === null ? 'n/a' : `${r.health.score}/100`],
  ];
  const tw = (R - L) / tiles.length;
  tiles.forEach(([k, v], i) => {
    const x = L + i * tw;
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(110).text(k.toUpperCase(), x, y);
    doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(0).text(v, x, y + 18);
  });
  y += 34;
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(60).text(`Verdict: ${r.health.verdict}`, L, y);
  y += 22;

  const section = (title: string) => {
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(0).text(title.toUpperCase(), L, y);
    y += 6;
    doc.setDrawColor(180).setLineWidth(0.5).line(L, y, R, y);
    y += 14;
  };
  const line = (label: string, value: string, bold = false, sub?: string) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(9.5).setTextColor(0).text(label, L, y);
    if (sub) doc.setFont('helvetica', 'normal').setTextColor(120).text(sub, L + 250, y, { align: 'right' });
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setTextColor(0).text(value, L + 330, y, { align: 'right' });
    y += 14;
  };

  // P&L left column
  const pnlTop = y;
  section('Profit & loss');
  line('Revenue', money(r.m.revenue.value), true);
  for (const e of r.expenses) line(`  ${e.label}`, e.amount === null ? 'Not provided' : `(${money(e.amount)})`, false, e.pctOfRevenue === null ? '' : pct(e.pctOfRevenue));
  line('Total expenses', `(${money(r.m.totalExpenses.value)})`, true);
  line('Net profit', money(r.m.netProfit.value), true, pct(r.m.margin.value));
  y += 8;

  // right column: key metrics
  const afterPnl = y;
  let ry = pnlTop;
  const rx = L + 360;
  const rline = (label: string, value: string) => {
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(90).text(label, rx, ry);
    doc.setTextColor(0).setFont('helvetica', 'bold').text(value, R, ry, { align: 'right' });
    ry += 14;
  };
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(0).text('KEY NUMBERS', rx, ry);
  ry += 20;
  rline('Ad spend', money(r.m.adSpend.value));
  rline('Blended ROAS', ratio(r.m.mer.value));
  rline('CAC', money(r.m.cac.value));
  rline('Avg order value', money(r.m.aov.value));
  rline('Conversion rate', pct(r.m.conversionRate.value, 2));
  rline('LTV : CAC', ratio(r.m.ltvCac.value));
  rline('Cash at end', money(r.m.cashEnd.value));
  rline('Runway', fmtUnit(r.m.runway.value, 'months'));
  rline('Vs. goal', money(r.m.goalGap.value, { sign: true }));
  y = Math.max(afterPnl, ry + 6);

  // ads
  if (r.ads.formats.length) {
    section('Ad formats');
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(110);
    const cols = [L, L + 140, L + 200, L + 250, L + 300, L + 360, L + 420];
    ['FORMAT', 'SPEND', 'CTR', 'CPA', 'ROAS', 'PROFIT', 'LABEL'].forEach((h, i) => doc.text(h, cols[i], y));
    y += 13;
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(0);
    for (const f of r.ads.formats.slice(0, 7)) {
      [f.format, money(f.spend), pct(f.ctr, 2), money(f.cpa), ratio(f.roas), money(f.profitAfterAdCost), f.labels[0] ?? ''].forEach((v, i) => doc.text(String(v).slice(0, i === 6 ? 30 : 24), cols[i], y));
      y += 13;
    }
    y += 8;
  }

  section('What to fix first');
  recs.slice(0, 5).forEach((x, i) => {
    doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(0).text(`${i + 1}. ${x.title}`, L, y);
    doc.text(`${money(x.impact, { sign: true })}/mo  ·  ${x.difficulty}`, R, y, { align: 'right' });
    y += 12;
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(80);
    const wrapped = doc.splitTextToSize(x.why, R - L - 12);
    doc.text(wrapped.slice(0, 2), L + 12, y);
    y += 11 * Math.min(2, wrapped.length) + 4;
  });
  y += 4;
  doc.setDrawColor(0).setLineWidth(1).line(L, y, R, y);
  y += 18;
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(0).text(`If you do the top 3, projected profit next month is ${money(projected)}.`, L, y);
  y += 22;
  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(120);
  doc.text(doc.splitTextToSize('All figures computed in your browser from the numbers you provided. Missing inputs are shown as "Not provided". Projections use the assumptions listed in the app. Benchmarks are rough estimates, not live data.', R - L), L, y);
  return doc.output('blob');
}

export { count };
