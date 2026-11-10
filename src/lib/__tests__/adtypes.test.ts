import { describe, expect, it } from 'vitest';
import { inferFormat, inferPlatform } from '../parse/common';
import { detectKind, detectRoles, parseTable, tableCandidates } from '../parse/csv';
import { extractFromText } from '../parse/text';
import { applyScenario, computeReview } from '../calc';
import { blankMonth } from '../samples';
import type { AdRow } from '../types';

describe('ad format detection', () => {
  const cases: [string, string][] = [
    ['PMax - all products', 'Performance Max'],
    ['Google Shopping - bags', 'Shopping / Product Listing'],
    ['DPA retargeting 7d', 'Catalog / Dynamic Product'],
    ['Advantage+ catalog ads', 'Catalog / Dynamic Product'],
    ['Spring collection instant experience', 'Collection / Instant Experience'],
    ['Responsive display remarketing', 'Display / Banner'],
    ['Webinar lead form', 'Lead Form'],
    ['Creator sponsorship - @maker', 'Influencer / Sponsorship'],
    ['Podcast host read', 'Audio / Podcast'],
    ['UGC unboxing v2', 'UGC / Creator Video'],
    ['YouTube Shorts teaser', 'Story / Reel'],
    ['Brand video 30s', 'Video'],
    ['Pin - flat lay', 'Static Image'],
    ['Brand keywords', 'Search Text'],
    ['Untitled', 'Other'],
  ];
  for (const [text, want] of cases) it(`${text} → ${want}`, () => expect(inferFormat(text)).toBe(want));
});

describe('platform detection', () => {
  it('names each platform, checking own "Ads Manager" products before Meta', () => {
    expect(inferPlatform('Pinterest Ads Manager')).toBe('Pinterest');
    expect(inferPlatform('Snapchat Ads Manager')).toBe('Snapchat');
    expect(inferPlatform('LinkedIn Campaign Manager')).toBe('LinkedIn');
    expect(inferPlatform('Microsoft Advertising')).toBe('Microsoft');
    expect(inferPlatform('Reddit Ads')).toBe('Reddit');
    expect(inferPlatform('Amazon Sponsored Products')).toBe('Amazon');
    expect(inferPlatform('YouTube')).toBe('Google');
    expect(inferPlatform('Ads Manager')).toBe('Meta');
  });
  it('rolls smaller platforms into "Other ad platforms" spend', () => {
    const csv = 'Platform,Ad name,Spend,Impressions,Clicks,Conversions,Conversion value\nPinterest,Pin - flat lay,300,40000,500,8,720\nLinkedIn,Webinar lead form,450,12000,90,6,0\nGoogle,PMax all products,900,80000,1100,30,3100\n';
    const t = parseTable(csv);
    const roles = detectRoles(t.headers);
    const { candidates } = tableCandidates(t, roles, detectKind(t.headers, roles), 'csv');
    const f = Object.fromEntries(candidates.filter((c) => c.kind === 'field').map((c: any) => [c.field, c.value]));
    expect(f.adSpendOther).toBe(750);
    expect(f.adSpendGoogle).toBe(900);
    const ads = candidates.filter((c) => c.kind === 'ad').map((c: any) => [c.row.platform, c.row.format]);
    expect(ads).toEqual([
      ['Pinterest', 'Static Image'],
      ['LinkedIn', 'Lead Form'],
      ['Google', 'Performance Max'],
    ]);
  });
  it('reads LinkedIn "Total spent" from dashboard text', () => {
    const { candidates } = extractFromText('LinkedIn Campaign Manager\nTotal spent $1,240.00\nImpressions 52,000\nClicks 610', 'paste');
    expect((candidates.find((c: any) => c.field === 'adSpendOther') as any).value).toBe(1240);
  });
});

describe('ad spend what-if with several "other" platforms', () => {
  it('scales the shared other-platform line once, not once per platform', () => {
    const i = blankMonth('ecommerce', '2026-10', null);
    i.values = { grossRevenue: 10000, adSpendOther: 1000 };
    const row = (id: string, platform: AdRow['platform'], spend: number): AdRow => ({ id, name: id, platform, format: 'Static Image', spend, impressions: null, clicks: null, conversions: null, revenue: null });
    const noRows = applyScenario(i, { adSpendPct: -0.5 });
    expect(computeReview(noRows).m.adSpend.value).toBe(500);
    i.ads = [row('a', 'Pinterest', 600), row('b', 'Snapchat', 400)];
    expect(computeReview(applyScenario(i, { adSpendPct: -0.5 })).m.adSpend.value).toBe(500);
  });
});
