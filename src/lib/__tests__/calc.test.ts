import { describe, expect, it } from 'vitest';
import { applyScenario, computeReview, projectPlan, recommend, tierOf, BENCHMARKS, runOutDate } from '../calc';
import { SAMPLES, blankMonth } from '../samples';
import { BUSINESS_TYPES } from '../fields';

describe('acceptance 1: sample e-commerce month', () => {
  const r = computeReview(SAMPLES.ecommerce);
  it('profit = revenue − all expenses', () => {
    // 48,200 − (12,500 ads + 16,870 COGS + 1,640 fees + 620 software + 2,400 contractors + 1,450 refunds + 380 other)
    expect(r.m.totalExpenses.value).toBe(35860);
    expect(r.m.netProfit.value).toBe(12340);
  });
  it('margin', () => expect(r.m.margin.value).toBeCloseTo(12340 / 48200, 6));
  it('blended ROAS', () => expect(r.m.mer.value).toBeCloseTo(48200 / 12500, 6));
  it('ad-reported ROAS', () => expect(r.m.platformRoas.value).toBeCloseTo(36000 / 12500, 6));
  it('CAC', () => expect(r.m.cac.value).toBeCloseTo(12500 / 540, 6));
  it('AOV and conversion', () => {
    expect(r.m.aov.value).toBeCloseTo(48200 / 820, 6);
    expect(r.m.conversionRate.value).toBeCloseTo(820 / 41000, 6);
  });
  it('expense lines show $ and % of revenue', () => {
    const ads = r.expenses.find((e) => e.key === 'ads')!;
    expect(ads.amount).toBe(12500);
    expect(ads.pctOfRevenue).toBeCloseTo(12500 / 48200, 6);
    expect(ads.perSale).toBeCloseTo(12500 / 820, 6);
  });
  it('labels ad formats', () => {
    const by = Object.fromEntries(r.ads.formats.map((f) => [f.format, f]));
    expect(by['UGC / Creator Video'].labels).toContain('Best ROAS');
    expect(by['Story / Reel'].labels).toContain('Highest CTR but no sales');
    expect(by['Story / Reel'].labels).toContain('Money loser — pause this');
    expect(by['Carousel'].profitAfterAdCost!).toBeLessThan(0);
    expect(r.ads.scale[0]).toBe('UGC / Creator Video');
  });
  it('health is healthy and runway is not burning', () => {
    expect(r.health.verdict).toBe('Healthy');
    expect(r.m.runway.value).toBe(Infinity);
  });
});

describe('acceptance 3: what-if price +10%', () => {
  it('adds revenue minus revenue-linked fees and refunds', () => {
    const base = computeReview(SAMPLES.ecommerce).m.netProfit.value!;
    const after = computeReview(applyScenario(SAMPLES.ecommerce, { pricePct: 0.1 })).m.netProfit.value!;
    expect(after - base).toBeCloseTo(4820 - 164 - 145, 6);
  });
});

describe('missing data is never invented', () => {
  const r = computeReview(blankMonth('ecommerce', '2026-10', 5000));
  it('everything is null', () => {
    expect(r.m.netProfit.value).toBeNull();
    expect(r.m.cac.value).toBeNull();
    expect(r.m.margin.value).toBeNull();
    expect(r.health.score).toBeNull();
  });
  it('partial: revenue only gives no profit', () => {
    const i = blankMonth('ecommerce', '2026-10', null);
    i.values.grossRevenue = 1000;
    expect(computeReview(i).m.netProfit.value).toBeNull();
    i.values.cogs = 400;
    const r2 = computeReview(i);
    expect(r2.m.netProfit.value).toBe(600);
    expect(r2.m.netProfit.partial).toBe(true);
  });
});

describe('losing month', () => {
  const r = computeReview(SAMPLES.agency);
  it('runway and verdict', () => {
    expect(r.m.netProfit.value).toBe(34500 - 36360);
    expect(r.m.runway.value).toBeCloseTo(29100 / 1860, 6);
    expect(r.health.verdict).toBe('Losing money — fix this first');
    expect(r.health.score!).toBeLessThanOrEqual(44);
    expect(runOutDate('2026-10', r.m.runway.value)).toMatch(/2028/);
  });
});

describe('advisor', () => {
  for (const b of BUSINESS_TYPES) {
    it(`${b.key}: ranked recommendations with positive impact`, () => {
      const recs = recommend(SAMPLES[b.key]);
      expect(recs.length).toBeGreaterThanOrEqual(3);
      for (let i = 1; i < recs.length; i++) expect(recs[i - 1].impact).toBeGreaterThanOrEqual(recs[i].impact);
      const base = computeReview(SAMPLES[b.key]).m.netProfit.value!;
      expect(projectPlan(SAMPLES[b.key], recs.slice(0, 3))!).toBeGreaterThan(base);
    });
  }
  it('cutting a losing format raises profit by its loss', () => {
    const base = computeReview(SAMPLES.ecommerce).m.netProfit.value!;
    const after = computeReview(applyScenario(SAMPLES.ecommerce, { cutFormats: ['Story / Reel'] })).m.netProfit.value!;
    expect(after - base).toBeCloseTo(700, 6);
  });
  it('ad spend cut moves channel spend', () => {
    const x = applyScenario(SAMPLES.ecommerce, { adSpendDelta: -500 });
    expect(computeReview(x).m.adSpend.value).toBeCloseTo(12000, 6);
  });
});

describe('benchmarks', () => {
  it('tiers', () => {
    const cac = BENCHMARKS.ecommerce.find((b) => b.key === 'cac')!;
    expect(tierOf(23, cac)).toBe('Top 25%');
    expect(tierOf(80, cac)).toBe('Below Average');
  });
});

import { questionOrder } from '../fields';
describe('guided questions follow onboarding answers', () => {
  it('asks about the ad platforms that were picked, in place of the default', () => {
    const q = questionOrder('ecommerce', ['Google', 'TikTok', 'Pinterest']);
    expect(q).toContain('adSpendGoogle');
    expect(q).toContain('adSpendTiktok');
    expect(q).toContain('adSpendOther');
    expect(q).not.toContain('adSpendMeta');
    expect(q.indexOf('adSpendGoogle')).toBeLessThan(8);
  });
  it('skips ad spend entirely when they run no ads', () => {
    expect(questionOrder('ecommerce', ['None yet']).some((k) => k.startsWith('adSpend'))).toBe(false);
  });
  it('adds ad spend for business types that do not ask by default', () => {
    expect(questionOrder('saas', ['Meta'])).toContain('adSpendMeta');
  });
});
