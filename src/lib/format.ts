import type { MetricUnit } from './calc';

/** Accounting style: negatives in parentheses for money. */
export function money(x: number | null | undefined, opts: { cents?: boolean; sign?: boolean; compact?: boolean } = {}): string {
  if (x === null || x === undefined || Number.isNaN(x)) return 'Not provided';
  if (!Number.isFinite(x)) return '∞';
  const abs = Math.abs(x);
  let s: string;
  if (opts.compact && abs >= 10000) s = '$' + (abs / 1000).toFixed(abs >= 100000 ? 0 : 1) + 'k';
  else s = '$' + abs.toLocaleString('en-US', { minimumFractionDigits: opts.cents ? 2 : 0, maximumFractionDigits: opts.cents ? 2 : 0 });
  if (x < 0 && Math.round(abs * (opts.cents ? 100 : 1)) !== 0) return opts.sign ? '−' + s : '(' + s + ')';
  if (opts.sign && x > 0) return '+' + s;
  return s;
}
export const pct = (x: number | null | undefined, d = 1, sign = false) => (x === null || x === undefined || Number.isNaN(x) ? 'Not provided' : !Number.isFinite(x) ? '∞' : (sign && x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x * 100).toFixed(d) + '%');
export const ratio = (x: number | null | undefined, d = 2) => (x === null || x === undefined ? 'Not provided' : !Number.isFinite(x) ? '∞' : x.toFixed(d) + '×');
export const count = (x: number | null | undefined) => (x === null || x === undefined ? 'Not provided' : Math.round(x).toLocaleString('en-US'));
export const months = (x: number | null | undefined) => (x === null || x === undefined ? 'Not provided' : !Number.isFinite(x) ? 'Not burning cash' : x.toFixed(1) + ' months');

export function fmtUnit(x: number | null | undefined, unit: MetricUnit, cents = false): string {
  switch (unit) {
    case 'money':
      return money(x, { cents });
    case 'pct':
      return pct(x);
    case 'ratio':
      return ratio(x);
    case 'count':
      return x !== null && x !== undefined && !Number.isInteger(x) ? x.toFixed(1) : count(x);
    case 'months':
      return months(x);
    default:
      return x === null || x === undefined ? 'Not provided' : String(Math.round(x));
  }
}
