import type { AdFormat, AdPlatform, AdRow, FieldKey, Source } from '../types';

export type Confidence = 'high' | 'medium' | 'low';

export type Candidate =
  | { id: string; kind: 'field'; field: FieldKey; value: number; raw: string; confidence: Confidence; source: Source; note?: string }
  | { id: string; kind: 'ad'; row: AdRow; raw: string; confidence: Confidence; source: Source; note?: string }
  | { id: string; kind: 'product'; name: string; value: number; raw: string; confidence: Confidence; source: Source; note?: string };

let seq = 0;
export const uid = (p = 'c') => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Parse "$12,345.67", "(1,200)", "1.2k", "-$40", "3.4%" etc. Returns null when no number. */
export function parseNumber(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  let s = String(raw).trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (/^[-−–]/.test(s) || /-$/.test(s)) neg = true;
  s = s.replace(/[-−–]/g, '').replace(/\b(usd|eur|gbp|cad|aud)\b/gi, '').replace(/[$€£\s]/g, '');
  const m = s.match(/^(\d[\d,]*(?:\.\d+)?|\.\d+)([kKmM])?%?$/);
  if (!m) return null;
  let x = parseFloat(m[1].replace(/,/g, ''));
  if (m[2]) x *= m[2].toLowerCase() === 'k' ? 1e3 : 1e6;
  return neg ? -x : x;
}

/** Find the first number-looking token in a string. */
export function firstNumber(s: string): { value: number; text: string; pct: boolean } | null {
  const re = /\(?[-−]?\s?[$€£]?\s?\d[\d,]*(?:\.\d+)?\s?[kKmM]?\)?%?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const t = m[0].trim();
    // skip things that look like dates or years alone
    if (/^\d{4}$/.test(t) && +t > 1900 && +t < 2100) continue;
    const v = parseNumber(t.replace(/\s/g, ''));
    if (v !== null) return { value: v, text: t, pct: t.endsWith('%') };
  }
  return null;
}

export function inferFormat(text: string): AdFormat {
  const t = text.toLowerCase();
  if (/\bugc\b|creator|testimonial video|unbox/.test(t)) return 'UGC / Creator Video';
  if (/\breel|\bstory|stories/.test(t)) return 'Story / Reel';
  if (/carousel|collection/.test(t)) return 'Carousel';
  if (/search|\brsa\b|responsive search|keyword/.test(t)) return 'Search Text';
  if (/video|\bvid\b|spark|\d+s\b/.test(t)) return 'Video';
  if (/static|image|\bimg\b|photo|banner|display/.test(t)) return 'Static Image';
  return 'Other';
}

export function inferPlatform(text: string): AdPlatform | null {
  const t = text.toLowerCase();
  if (/tiktok/.test(t)) return 'TikTok';
  if (/\bmeta\b|facebook|instagram|ads manager|amount spent|link clicks/.test(t)) return 'Meta';
  if (/google|adwords|\bimpr\b|conv\. value|cost \/ conv/.test(t)) return 'Google';
  return null;
}

export const PLATFORM_SPEND_FIELD: Record<AdPlatform, FieldKey> = { Meta: 'adSpendMeta', Google: 'adSpendGoogle', TikTok: 'adSpendTiktok', Other: 'adSpendOther' };
