import { describe, expect, it } from 'vitest';
import { computeReview, recommend } from '../calc';
import { monthSummary } from '../narrative';
import { blankMonth, samplePriorMonths, SAMPLES } from '../samples';

describe('plain-English month summary', () => {
  it('sample e-commerce month: profit, costs, ads, goal, next step', () => {
    const r = computeReview(SAMPLES.ecommerce);
    const prev = computeReview(samplePriorMonths('ecommerce').slice(-1)[0]);
    const s = monthSummary(r, prev, recommend(SAMPLES.ecommerce));
    expect(s).toHaveLength(4);
    expect(s[0]).toMatch(/In October you kept \$12,340 of the \$48,200 that came in, a 25\.6% margin\./);
    expect(s[0]).toMatch(/better than the month before/);
    expect(s[1]).toMatch(/COGS \/ delivery at \$16,870 \(35% of revenue\) and ad spend at \$12,500 \(26%\)/);
    expect(s[2]).toMatch(/3\.86 dollars of revenue/);
    expect(s[2]).toMatch(/Story \/ Reel lost \$700/);
    expect(s[3]).toMatch(/\$2,660 short of your \$15,000 goal/);
    expect(s[3]).toMatch(/change worth the most next month/);
  });
  it('a losing month leads with the loss and the runway', () => {
    const s = monthSummary(computeReview(SAMPLES.agency), null, recommend(SAMPLES.agency));
    expect(s[0]).toMatch(/you spent \$1,860 more than the \$34,500 that came in/);
    expect(s.join(' ')).toMatch(/lasts about 15\.6 months/);
  });
  it('says nothing when there is nothing to say', () => {
    expect(monthSummary(computeReview(blankMonth('saas', '2026-10', 5000)), null, [])).toEqual([]);
  });
  it('one cost only: warns that profit is probably lower, invents nothing', () => {
    const i = blankMonth('ecommerce', '2026-10', null);
    i.values = { grossRevenue: 1000, cogs: 400 };
    const s = monthSummary(computeReview(i), null, []);
    expect(s[1]).toMatch(/only cost entered so far/);
    expect(s.join(' ')).not.toMatch(/ads|goal/i);
  });
});
