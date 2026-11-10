/**
 * Tabular import: CSV / TSV / JSON arrays.
 * Finds the header row even with junk lines on top, maps messy headers to
 * roles, and turns rows into candidates. The user sees a preview and can
 * change each column's role before anything is applied.
 */
import Papa from 'papaparse';
import type { AdPlatform, FieldKey, Source } from '../types';
import { type Candidate, inferFormat, inferPlatform, parseNumber, PLATFORM_SPEND_FIELD, uid } from './common';

export type Role =
  | 'ignore'
  | 'date'
  | 'description'
  | 'amount'
  | 'debit'
  | 'credit'
  | 'balance'
  | 'gross'
  | 'fee'
  | 'refund'
  | 'status'
  | 'type'
  | 'orderId'
  | 'customer'
  | 'product'
  | 'quantity'
  | 'price'
  | 'subtotal'
  | 'total'
  | 'orders'
  | 'sessions'
  | 'adName'
  | 'campaign'
  | 'platform'
  | 'format'
  | 'spend'
  | 'impressions'
  | 'clicks'
  | 'conversions'
  | 'convValue';

export const ROLE_LABELS: Record<Role, string> = {
  ignore: 'Ignore', date: 'Date', description: 'Description', amount: 'Amount (+/−)', debit: 'Money out', credit: 'Money in', balance: 'Balance',
  gross: 'Gross sales', fee: 'Fee', refund: 'Refund / return', status: 'Status', type: 'Type', orderId: 'Order ID', customer: 'Customer',
  product: 'Product', quantity: 'Quantity', price: 'Unit price', subtotal: 'Subtotal', total: 'Order total', orders: 'Orders (count)',
  sessions: 'Sessions', adName: 'Ad name', campaign: 'Campaign', platform: 'Platform', format: 'Ad format', spend: 'Ad spend',
  impressions: 'Impressions', clicks: 'Clicks', conversions: 'Conversions', convValue: 'Conversion value',
};

// normalized header → role. Checked in order; first "includes" match wins.
const SYNONYMS: [Role, string[]][] = [
  ['convValue', ['purchases conversion value', 'conversion value', 'conv value', 'purchase value', 'total conv value', 'revenue attributed']],
  ['refund', ['amount refunded', 'refunded amount', 'refunds', 'refund', 'returns', 'return']],
  ['fee', ['fee', 'fees', 'processing fee']],
  ['spend', ['amount spent', 'total spend', 'spend', 'cost']],
  ['impressions', ['impressions', 'impr']],
  ['clicks', ['link clicks', 'clicks']],
  ['conversions', ['purchases', 'conversions', 'results', 'conv']],
  ['adName', ['ad name', 'creative name', 'ad group name', 'ad group', 'creative']],
  ['campaign', ['campaign name', 'campaign']],
  ['format', ['ad format', 'format', 'ad type', 'creative type']],
  ['platform', ['platform', 'network', 'channel']],
  ['product', ['lineitem name', 'product title', 'product name', 'product', 'item name', 'item']],
  ['quantity', ['lineitem quantity', 'quantity', 'qty', 'units']],
  ['price', ['lineitem price', 'unit price', 'price']],
  ['subtotal', ['subtotal']],
  ['gross', ['gross sales', 'gross', 'gross amount', 'total sales', 'sales']],
  ['orders', ['orders', 'order count', 'number of orders']],
  ['sessions', ['online store sessions', 'sessions', 'visitors', 'visits']],
  ['orderId', ['order id', 'order number', 'order name', 'id', 'name', 'invoice']],
  ['customer', ['customer email', 'customer id', 'customer', 'email', 'buyer']],
  ['status', ['financial status', 'status', 'state']],
  ['type', ['reporting category', 'transaction type', 'type', 'category']],
  ['balance', ['running balance', 'balance']],
  ['debit', ['debit', 'withdrawal', 'withdrawals', 'money out', 'paid out']],
  ['credit', ['credit', 'deposit', 'deposits', 'money in', 'paid in']],
  ['total', ['order total', 'total', 'net sales', 'net']],
  ['amount', ['converted amount', 'amount', 'value', 'transaction amount']],
  ['date', ['created utc', 'created at', 'created', 'date', 'day', 'month', 'posted', 'transaction date', 'available on']],
  ['description', ['description', 'memo', 'payee', 'merchant', 'details', 'narrative']],
];

export const norm = (h: string) => h.toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

export function roleFor(header: string): Role {
  const h = norm(header);
  if (!h) return 'ignore';
  for (const [role, syns] of SYNONYMS) if (syns.some((s) => h === s)) return role;
  for (const [role, syns] of SYNONYMS) if (syns.some((s) => s.length > 3 && h.includes(s))) return role;
  return 'ignore';
}

export type TableKind = 'ads' | 'shopify-orders' | 'store-sales' | 'payments' | 'bank' | 'generic';
export const KIND_LABELS: Record<TableKind, string> = {
  ads: 'Ad performance export',
  'shopify-orders': 'Shopify-style order export',
  'store-sales': 'Sales report (by day / month)',
  payments: 'Stripe-style payments export',
  bank: 'Bank statement',
  generic: 'Other table',
};

export interface Table {
  headers: string[];
  rows: string[][];
  skipped: number;
}

const knownHeaderScore = (cells: string[]) => cells.filter((c) => c && roleFor(c) !== 'ignore').length;

/** Parse CSV/TSV text, locating the real header row in messy exports. */
export function parseTable(text: string): Table {
  const res = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy', delimiter: '' });
  const data = (res.data as string[][]).map((r) => r.map((c) => (c ?? '').toString().trim()));
  let headerIdx = 0;
  let best = -1;
  for (let i = 0; i < Math.min(15, data.length); i++) {
    const score = knownHeaderScore(data[i]) * 2 + data[i].filter((c) => c && parseNumber(c) === null).length * 0.1 - (data[i].filter(Boolean).length < 2 ? 10 : 0);
    if (score > best) {
      best = score;
      headerIdx = i;
    }
  }
  const headers = data[headerIdx] ?? [];
  const rows = data.slice(headerIdx + 1).filter((r) => r.some(Boolean) && !/^(total|totals|grand total|summary)\b/i.test(r[0] ?? ''));
  return { headers, rows, skipped: headerIdx };
}

/** JSON array of objects → table. */
export function tableFromJson(json: unknown): Table | null {
  const arr = Array.isArray(json) ? json : json && typeof json === 'object' ? Object.values(json as object).find(Array.isArray) : null;
  if (!arr || !arr.length || typeof arr[0] !== 'object') return null;
  const headers = [...new Set(arr.flatMap((o: any) => Object.keys(o ?? {})))];
  return { headers, rows: arr.map((o: any) => headers.map((h) => (o?.[h] ?? '').toString())), skipped: 0 };
}

export function detectRoles(headers: string[]): Role[] {
  const roles = headers.map(roleFor);
  // only one column per role (keep first), except ignore
  const seen = new Set<Role>();
  return roles.map((r) => {
    if (r === 'ignore') return r;
    if (seen.has(r)) return 'ignore';
    seen.add(r);
    return r;
  });
}

export function detectKind(headers: string[], roles: Role[]): TableKind {
  const has = (r: Role) => roles.includes(r);
  const hn = headers.map(norm).join(' | ');
  if (has('impressions') || (has('spend') && (has('clicks') || has('adName') || has('campaign')))) return 'ads';
  if (/lineitem|financial status|fulfillment status/.test(hn)) return 'shopify-orders';
  if (has('gross') && (has('orders') || has('date'))) return 'store-sales';
  if (/amount refunded|reporting category|balance transaction|payment intent|card brand/.test(hn) || (has('fee') && (has('amount') || has('gross')))) return 'payments';
  if (has('description') && (has('amount') || has('debit') || has('credit'))) return 'bank';
  return 'generic';
}

// bank statement categorisation by merchant keywords
const BANK_RULES: [FieldKey, RegExp][] = [
  ['adSpendMeta', /facebook|\bfb\b|meta ?ads|facebk|instagram/i],
  ['adSpendGoogle', /google ?ads|adwords|google\*ads/i],
  ['adSpendTiktok', /tiktok/i],
  ['paymentFees', /stripe fee|paypal fee|shopify payments fee|processing fee|merchant fee|transaction fee/i],
  ['software', /shopify(?! payments)|notion|slack|adobe|canva|figma|zoom|google workspace|gsuite|klaviyo|mailchimp|convertkit|kajabi|teachable|webflow|github|vercel|aws|amazon web|heroku|openai|anthropic|dropbox|zapier|hubspot|calendly|loom|airtable|1password/i],
  ['contractors', /upwork|fiverr|contractor|freelanc|deel|gusto|payroll|wise transfer|invoice #/i],
  ['cogs', /alibaba|supplier|printful|printify|shipstation|usps|\bups\b|fedex|dhl|pirate ship|inventory|wholesale|manufactur/i],
];

const sumOf = (xs: (number | null)[]) => xs.reduce<number>((s, x) => s + (x ?? 0), 0);

/** Turn a mapped table into candidates. */
export function tableCandidates(table: Table, roles: Role[], kind: TableKind, source: Source): { candidates: Candidate[]; summary: string } {
  const col = (r: Role) => roles.indexOf(r);
  const cell = (row: string[], r: Role) => (col(r) >= 0 ? row[col(r)] ?? '' : '');
  const num = (row: string[], r: Role) => parseNumber(cell(row, r));
  const rows = table.rows;
  const out: Candidate[] = [];
  const field = (f: FieldKey, value: number, raw: string, confidence: Candidate['confidence'] = 'high', note?: string) => out.push({ id: uid(), kind: 'field', field: f, value: Math.round(value * 100) / 100, raw, confidence, source, note });

  if (kind === 'ads') {
    const headerPlatform = inferPlatform(table.headers.join(' '));
    const byPlatform = new Map<AdPlatform, number>();
    for (const r of rows) {
      const spend = num(r, 'spend');
      if (spend === null) continue;
      const name = cell(r, 'adName') || cell(r, 'campaign') || 'Ad';
      const platform: AdPlatform = (inferPlatform(cell(r, 'platform')) as AdPlatform) || headerPlatform || 'Other';
      const format = cell(r, 'format') ? inferFormat(cell(r, 'format')) : inferFormat(`${name} ${cell(r, 'campaign')} ${platform === 'Google' ? 'search' : ''}`);
      byPlatform.set(platform, (byPlatform.get(platform) ?? 0) + spend);
      out.push({
        id: uid(),
        kind: 'ad',
        row: { id: uid('ad'), name, platform, format, spend, impressions: num(r, 'impressions'), clicks: num(r, 'clicks'), conversions: num(r, 'conversions'), revenue: num(r, 'convValue') },
        raw: r.filter(Boolean).slice(0, 6).join(' · '),
        confidence: format === 'Other' ? 'low' : 'medium',
        source,
        note: format === 'Other' ? 'Format not detected — choose one' : undefined,
      });
    }
    for (const [p, s] of byPlatform) field(PLATFORM_SPEND_FIELD[p], s, `Sum of ${p} spend column`, 'high', `${p} total spend`);
    return { candidates: out, summary: `${out.filter((c) => c.kind === 'ad').length} ads across ${byPlatform.size} platform(s)` };
  }

  if (kind === 'shopify-orders') {
    const orders = new Map<string, string[]>();
    const products = new Map<string, number>();
    for (const r of rows) {
      const id = cell(r, 'orderId') || String(orders.size);
      if (!orders.has(id)) orders.set(id, r);
      const p = cell(r, 'product');
      if (p) {
        const price = num(r, 'price') ?? 0;
        const qty = num(r, 'quantity') ?? 1;
        products.set(p, (products.get(p) ?? 0) + price * qty);
      }
    }
    const first = [...orders.values()];
    const paid = first.filter((r) => !/voided|pending|cancel/i.test(cell(r, 'status')));
    const gross = sumOf(paid.map((r) => num(r, 'subtotal') ?? num(r, 'total')));
    const refunds = sumOf(paid.map((r) => num(r, 'refund')));
    const customers = new Set(paid.map((r) => cell(r, 'customer')).filter(Boolean));
    if (gross) field('grossRevenue', gross, `Sum of ${col('subtotal') >= 0 ? 'Subtotal' : 'Total'} across ${paid.length} paid orders`);
    if (col('refund') >= 0) field('refunds', Math.abs(refunds), 'Sum of refunded amount');
    field('orders', paid.length, `${paid.length} unique order IDs`);
    if (customers.size) field('newCustomers', customers.size, `${customers.size} unique customers (check how many were new)`, 'low', 'Unique buyers, not necessarily new');
    for (const [name, v] of [...products.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) out.push({ id: uid(), kind: 'product', name, value: Math.round(v), raw: 'Line items price × quantity', confidence: 'medium', source });
    return { candidates: out, summary: `${paid.length} orders, ${products.size} products` };
  }

  if (kind === 'store-sales') {
    const gross = sumOf(rows.map((r) => num(r, 'gross')));
    field('grossRevenue', gross, `Sum of gross sales over ${rows.length} rows`);
    if (col('refund') >= 0) field('refunds', Math.abs(sumOf(rows.map((r) => num(r, 'refund')))), 'Sum of returns');
    if (col('orders') >= 0) field('orders', sumOf(rows.map((r) => num(r, 'orders'))), 'Sum of orders');
    if (col('sessions') >= 0) field('sessions', sumOf(rows.map((r) => num(r, 'sessions'))), 'Sum of sessions');
    if (col('fee') >= 0) field('paymentFees', Math.abs(sumOf(rows.map((r) => num(r, 'fee')))), 'Sum of fees');
    return { candidates: out, summary: `${rows.length} rows summed` };
  }

  if (kind === 'payments') {
    const amountRole: Role = col('amount') >= 0 ? 'amount' : 'gross';
    const isRefundRow = (r: string[]) => /refund|chargeback|dispute/i.test(cell(r, 'type'));
    const okRow = (r: string[]) => !cell(r, 'status') || /paid|succeeded|success|complete|available|settled/i.test(cell(r, 'status'));
    const charges = rows.filter((r) => okRow(r) && !isRefundRow(r) && !/payout|transfer|adjustment/i.test(cell(r, 'type')) && (num(r, amountRole) ?? 0) > 0);
    const gross = sumOf(charges.map((r) => num(r, amountRole)));
    const refunds = col('refund') >= 0 ? sumOf(rows.map((r) => num(r, 'refund'))) : Math.abs(sumOf(rows.filter(isRefundRow).map((r) => num(r, amountRole))));
    const fees = Math.abs(sumOf(rows.filter(okRow).map((r) => num(r, 'fee'))));
    const customers = new Set(charges.map((r) => cell(r, 'customer')).filter(Boolean));
    field('grossRevenue', gross, `Sum of ${charges.length} successful payments`);
    if (refunds) field('refunds', Math.abs(refunds), 'Refunded amounts');
    if (col('fee') >= 0) field('paymentFees', fees, 'Sum of fee column');
    field('orders', charges.length, `${charges.length} successful payments`, 'medium');
    if (customers.size) field('newCustomers', customers.size, `${customers.size} unique paying customers`, 'low', 'Unique payers, not necessarily new');
    return { candidates: out, summary: `${charges.length} payments read` };
  }

  if (kind === 'bank') {
    const totals = new Map<FieldKey, number>();
    let deposits = 0;
    const balances: number[] = [];
    for (const r of rows) {
      const desc = cell(r, 'description');
      let amt = num(r, 'amount');
      if (amt === null) {
        const d = num(r, 'debit');
        const c = num(r, 'credit');
        amt = c ? Math.abs(c) : d ? -Math.abs(d) : null;
      }
      const bal = num(r, 'balance');
      if (bal !== null) balances.push(bal);
      if (amt === null) continue;
      if (amt > 0) {
        deposits += amt;
        continue;
      }
      const rule = BANK_RULES.find(([, re]) => re.test(desc));
      const key = rule ? rule[0] : 'otherExpenses';
      totals.set(key, (totals.get(key) ?? 0) + Math.abs(amt));
    }
    for (const [k, v] of totals) field(k, v, `Money out matched to this category`, k === 'otherExpenses' ? 'low' : 'medium', k === 'otherExpenses' ? 'Uncategorised — check before approving' : undefined);
    if (deposits) field('grossRevenue', deposits, 'Sum of money in (deposits)', 'low', 'Deposits may include transfers or loans');
    if (balances.length >= 2) {
      // assume statement order; if dates descend, flip
      const dCol = col('date');
      const d0 = dCol >= 0 ? Date.parse(rows[0][dCol]) : NaN;
      const d1 = dCol >= 0 ? Date.parse(rows[rows.length - 1][dCol]) : NaN;
      const desc = !Number.isNaN(d0) && !Number.isNaN(d1) && d0 > d1;
      const startBal = desc ? balances[balances.length - 1] : balances[0];
      const endBal = desc ? balances[0] : balances[balances.length - 1];
      field('cashStart', startBal, 'First balance on statement', 'medium', 'Balance after first transaction');
      field('cashEnd', endBal, 'Last balance on statement', 'high');
    }
    return { candidates: out, summary: `${rows.length} transactions categorised` };
  }

  // generic: two-column label/value or numeric columns
  if (table.headers.length >= 2) {
    return { candidates: [], summary: 'No known layout. Map the columns above, or paste it as text.' };
  }
  return { candidates: [], summary: 'Nothing recognised' };
}

/** Two-column "label,value" tables read best as text. */
export function tableAsText(table: Table): string {
  return [table.headers, ...table.rows].map((r) => r.join(' ')).join('\n');
}
