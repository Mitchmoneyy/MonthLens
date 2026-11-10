/**
 * Extract candidate values from dashboard text (OCR output, pasted text, PDF text).
 * Every result is a *candidate* the user must approve. Nothing is applied here.
 */
import type { AdPlatform, FieldKey, Source } from '../types';
import { type Candidate, type Confidence, firstNumber, inferFormat, inferPlatform, PLATFORM_SPEND_FIELD, uid } from './common';

type Target = FieldKey | 'ad.spend' | 'ad.impressions' | 'ad.clicks' | 'ad.conversions' | 'ad.revenue' | 'ad.ctr';

interface Rule {
  target: Target;
  re: RegExp;
  confidence: Confidence;
  /** only used when the text looks like an ads dashboard */
  adsOnly?: boolean;
  /** never used when the text looks like an ads dashboard */
  notAds?: boolean;
  pct?: boolean;
}

// Order matters: more specific labels first.
const RULES: Rule[] = [
  // ads dashboards
  { target: 'ad.revenue', re: /(purchases? conversion value|conv(ersion)?\.? value|purchase value|website purchases value)/i, confidence: 'high', adsOnly: true },
  { target: 'ad.spend', re: /(amount spent|total spend|\bspend\b|\bcost\b(?! \/| per))/i, confidence: 'high', adsOnly: true },
  { target: 'ad.impressions', re: /(impressions|\bimpr\.?)/i, confidence: 'high', adsOnly: true },
  { target: 'ad.clicks', re: /(link clicks|\bclicks\b)/i, confidence: 'high', adsOnly: true },
  { target: 'ad.conversions', re: /(\bpurchases\b|\bconversions\b|\bresults\b)/i, confidence: 'medium', adsOnly: true },
  // revenue & payments
  { target: 'refunds', re: /(refunds?|returns|chargebacks?|disputes)/i, confidence: 'high', notAds: true },
  { target: 'paymentFees', re: /(processing fees|transaction fees|stripe fees|paypal fees|\bfees\b)/i, confidence: 'medium', notAds: true },
  { target: 'grossRevenue', re: /(gross volume|gross sales|gross revenue|total sales|total revenue|gross payments)/i, confidence: 'high', notAds: true },
  { target: 'cogs', re: /(cost of goods|\bcogs\b|product costs?)/i, confidence: 'high', notAds: true },
  { target: 'newCustomers', re: /(new customers|first[- ]time customers)/i, confidence: 'high' },
  { target: 'activeCustomers', re: /(active subscribers|active customers|paying customers|subscribers)/i, confidence: 'medium', notAds: true },
  { target: 'churnRate', re: /(churn rate|\bchurn\b)/i, confidence: 'medium', pct: true, notAds: true },
  { target: 'sessions', re: /(online store sessions|\bsessions\b|\bvisitors\b|\bvisits\b)/i, confidence: 'high', notAds: true },
  { target: 'orders', re: /(total orders|\borders\b|successful payments|\btransactions\b)/i, confidence: 'medium', notAds: true },
  { target: 'cashStart', re: /(beginning balance|opening balance|starting balance|previous balance)/i, confidence: 'high', notAds: true },
  { target: 'cashEnd', re: /(ending balance|closing balance|new balance|available balance|current balance)/i, confidence: 'high', notAds: true },
  { target: 'grossRevenue', re: /(\brevenue\b|\bsales\b|net volume)/i, confidence: 'low', notAds: true },
];

export type TextKind = 'ads' | 'payments' | 'store' | 'bank' | 'unknown';

export function detectKind(text: string): { kind: TextKind; platform: AdPlatform | null; label: string } {
  const t = text.toLowerCase();
  const platform = inferPlatform(t);
  const adsSignals = /(amount spent|impressions|\bimpr\b|link clicks|\bctr\b|\bcpc\b|\bcpm\b|roas|ads manager|conv\. value)/.test(t);
  if (adsSignals) return { kind: 'ads', platform: platform ?? 'Other', label: `${platform ?? 'Ads'} dashboard` };
  if (/(stripe|gross volume|net volume|successful payments|paypal)/.test(t)) return { kind: 'payments', platform: null, label: /paypal/.test(t) ? 'PayPal report' : 'Stripe dashboard' };
  if (/(shopify|online store sessions|gross sales|total orders|returning customer rate)/.test(t)) return { kind: 'store', platform: null, label: 'Shopify analytics' };
  if (/(statement|balance|deposits|withdrawals|account number)/.test(t)) return { kind: 'bank', platform: null, label: 'Bank statement' };
  return { kind: 'unknown', platform: null, label: 'Report text' };
}

export function extractFromText(text: string, source: Source): { candidates: Candidate[]; kind: TextKind; label: string } {
  const { kind, platform, label } = detectKind(text);
  const isAds = kind === 'ads';
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const found = new Map<Target, { value: number; raw: string; confidence: Confidence }>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const rule of RULES) {
      if (rule.adsOnly && !isAds) continue;
      if (rule.notAds && isAds) continue;
      const m = line.match(rule.re);
      if (!m) continue;
      if (found.has(rule.target)) break;
      // number after the label on the same line, else the next line
      const after = line.slice((m.index ?? 0) + m[0].length);
      let num = firstNumber(after);
      let raw = line;
      if (!num && i + 1 < lines.length) {
        const nxt = firstNumber(lines[i + 1]);
        if (nxt && lines[i + 1].length < 40) {
          num = nxt;
          raw = `${line} → ${lines[i + 1]}`;
        }
      }
      if (!num) {
        const before = firstNumber(line.slice(0, m.index ?? 0));
        if (before) {
          num = before;
        }
      }
      if (!num) continue;
      if (rule.pct && !num.pct && num.value > 1) {
        // churn written as "4.2" is fine; keep as percent
      }
      let value = Math.abs(num.value);
      if (rule.pct && num.value <= 1 && !num.pct) value = num.value * 100;
      found.set(rule.target, { value, raw, confidence: rule.confidence });
      break;
    }
  }

  const candidates: Candidate[] = [];
  if (isAds) {
    const spend = found.get('ad.spend');
    if (spend) {
      const p = platform ?? 'Other';
      candidates.push({ id: uid(), kind: 'field', field: PLATFORM_SPEND_FIELD[p], value: spend.value, raw: spend.raw, confidence: spend.confidence, source, note: `${p} total spend` });
      const g = (k: Target) => found.get(k)?.value ?? null;
      candidates.push({
        id: uid(),
        kind: 'ad',
        row: {
          id: uid('ad'),
          name: `${label} import`,
          platform: p,
          format: inferFormat(text),
          spend: spend.value,
          impressions: g('ad.impressions'),
          clicks: g('ad.clicks'),
          conversions: g('ad.conversions'),
          revenue: g('ad.revenue'),
        },
        raw: [...found.entries()].map(([k, x]) => `${k.replace('ad.', '')}: ${x.value}`).join(' · '),
        confidence: 'medium',
        source,
        note: 'Pick the ad format before approving',
      });
    }
  } else {
    for (const [target, x] of found) {
      if (target.startsWith('ad.')) continue;
      candidates.push({ id: uid(), kind: 'field', field: target as FieldKey, value: x.value, raw: x.raw, confidence: x.confidence, source });
    }
  }
  return { candidates, kind, label };
}
