import type { AdRow, BusinessType, FieldKey, MonthInput, Source } from './types';

/** Sample months. Clearly labelled as samples in the UI; never presented as the user's numbers. */

const SAMPLE_MONTH = '2026-10';

function row(id: string, platform: AdRow['platform'], format: AdRow['format'], name: string, spend: number, impressions: number, clicks: number, conversions: number, revenue: number): AdRow {
  return { id, platform, format, name, spend, impressions, clicks, conversions, revenue };
}

function make(type: BusinessType, goal: number, values: Partial<Record<FieldKey, number>>, extra: Pick<MonthInput, 'products' | 'channels' | 'ads'>): MonthInput {
  const sources: Partial<Record<FieldKey, Source>> = {};
  for (const k of Object.keys(values) as FieldKey[]) sources[k] = 'sample';
  return { month: SAMPLE_MONTH, businessType: type, goal, values, sources, isSample: true, ...extra };
}

export const SAMPLES: Record<BusinessType, MonthInput> = {
  ecommerce: make(
    'ecommerce',
    15000,
    {
      grossRevenue: 48200, refunds: 1450, cogs: 16870, paymentFees: 1640, software: 620, contractors: 2400, otherExpenses: 380, oneOffExpenses: 0,
      adSpendMeta: 7800, adSpendGoogle: 3100, adSpendTiktok: 1600, adSpendOther: 0,
      sessions: 41000, orders: 820, newCustomers: 540, newCustomerRevenue: 29800, returningCustomerRevenue: 18400, purchasesPerCustomer: 1.8,
      cashStart: 22000, cashEnd: 25900,
    },
    {
      products: [
        { name: 'Waxed canvas tote', amount: 18900 },
        { name: 'Leather card wallet', amount: 12400 },
        { name: 'Field notebook 3-pack', amount: 9800 },
        { name: 'Gift bundles', amount: 7100 },
      ],
      channels: [
        { name: 'Paid social', amount: 21700 },
        { name: 'Google search', amount: 10900 },
        { name: 'Email', amount: 8600 },
        { name: 'Organic / direct', amount: 7000 },
      ],
      ads: [
        row('e1', 'Meta', 'Video', 'Product demo 30s', 2600, 310000, 4100, 92, 8900),
        row('e2', 'Meta', 'Static Image', 'Flat-lay hero', 1500, 240000, 2300, 38, 3400),
        row('e3', 'Meta', 'Carousel', 'Colorways carousel', 1100, 150000, 1450, 16, 1300),
        row('e4', 'Meta', 'UGC / Creator Video', 'Creator unboxing', 1900, 205000, 3900, 101, 9600),
        row('e5', 'Meta', 'Story / Reel', 'Behind the stitch reel', 700, 120000, 2600, 0, 0),
        row('e6', 'Google', 'Search Text', 'Brand + category search', 3100, 52000, 2900, 118, 10900),
        row('e7', 'TikTok', 'Video', 'Spark ad — tote test', 1600, 280000, 3300, 21, 1900),
      ],
    },
  ),
  saas: make(
    'saas',
    12000,
    {
      grossRevenue: 31500, refunds: 600, cogs: 2900, paymentFees: 1020, software: 1450, contractors: 6800, otherExpenses: 300, oneOffExpenses: 2400,
      adSpendMeta: 2200, adSpendGoogle: 4100, adSpendTiktok: 0, adSpendOther: 0,
      sessions: 18500, orders: 120, newCustomers: 120, activeCustomers: 640, churnRate: 3.8, newCustomerRevenue: 5900, returningCustomerRevenue: 25600,
      cashStart: 84000, cashEnd: 88400,
    },
    {
      products: [
        { name: 'Team plan', amount: 17800 },
        { name: 'Starter plan', amount: 9200 },
        { name: 'Annual prepay (monthly share)', amount: 4500 },
      ],
      channels: [
        { name: 'Google search', amount: 9800 },
        { name: 'Organic / SEO', amount: 12600 },
        { name: 'Paid social', amount: 3400 },
        { name: 'Referrals', amount: 5700 },
      ],
      ads: [
        row('s1', 'Google', 'Search Text', 'Competitor alternative keywords', 4100, 61000, 3300, 74, 5180),
        row('s2', 'Meta', 'Video', 'Product walkthrough 45s', 1200, 180000, 1900, 22, 1540),
        row('s3', 'Meta', 'Static Image', 'Feature comparison', 1000, 150000, 1100, 6, 420),
      ],
    },
  ),
  course: make(
    'course',
    9000,
    {
      grossRevenue: 22800, refunds: 1900, cogs: 450, paymentFees: 890, software: 780, contractors: 1500, otherExpenses: 200, oneOffExpenses: 0,
      adSpendMeta: 5200, adSpendGoogle: 0, adSpendTiktok: 900, adSpendOther: 0,
      sessions: 26000, orders: 152, newCustomers: 140, purchasesPerCustomer: 1.4, newCustomerRevenue: 19600, returningCustomerRevenue: 3200,
      cashStart: 15000, cashEnd: 21400,
    },
    {
      products: [
        { name: 'Flagship course', amount: 14900 },
        { name: 'Template pack', amount: 4700 },
        { name: 'Coaching add-on', amount: 3200 },
      ],
      channels: [
        { name: 'Paid social', amount: 11200 },
        { name: 'Email list', amount: 7400 },
        { name: 'YouTube / organic', amount: 4200 },
      ],
      ads: [
        row('c1', 'Meta', 'Video', 'Free lesson clip', 2400, 220000, 2600, 61, 12200),
        row('c2', 'Meta', 'Static Image', 'Student result quote', 1300, 160000, 1200, 18, 3600),
        row('c3', 'Meta', 'Carousel', '5 lessons inside', 1500, 140000, 1700, 9, 1800),
        row('c4', 'TikTok', 'UGC / Creator Video', 'Creator review', 900, 190000, 2900, 12, 2400),
      ],
    },
  ),
  agency: make(
    'agency',
    8000,
    {
      grossRevenue: 34500, refunds: 0, cogs: 9500, paymentFees: 410, software: 1100, contractors: 22000, otherExpenses: 650, oneOffExpenses: 0,
      adSpendMeta: 900, adSpendGoogle: 1800, adSpendTiktok: 0, adSpendOther: 0,
      sessions: 4200, orders: 4, newCustomers: 4, activeCustomers: 11, churnRate: 9, newCustomerRevenue: 9800, returningCustomerRevenue: 24700,
      cashStart: 31000, cashEnd: 29100,
    },
    {
      products: [
        { name: 'Monthly retainers', amount: 24700 },
        { name: 'Website projects', amount: 7300 },
        { name: 'Audits', amount: 2500 },
      ],
      channels: [
        { name: 'Referrals', amount: 21200 },
        { name: 'Google search', amount: 9800 },
        { name: 'LinkedIn / outbound', amount: 3500 },
      ],
      ads: [
        row('a1', 'Google', 'Search Text', '"Shopify agency" keywords', 1800, 24000, 960, 3, 10500),
        row('a2', 'Meta', 'Static Image', 'Case study ad', 900, 90000, 700, 0, 0),
      ],
    },
  ),
  creator: make(
    'creator',
    7000,
    {
      grossRevenue: 14600, refunds: 120, cogs: 300, paymentFees: 410, software: 540, contractors: 2200, otherExpenses: 1800, oneOffExpenses: 0,
      adSpendMeta: 600, adSpendGoogle: 0, adSpendTiktok: 400, adSpendOther: 0,
      sessions: 52000, orders: 410, newCustomers: 160, activeCustomers: 820, churnRate: 6.5, newCustomerRevenue: 3100, returningCustomerRevenue: 11500,
      cashStart: 9800, cashEnd: 15800,
    },
    {
      products: [
        { name: 'Brand sponsorships', amount: 7200 },
        { name: 'Paid membership', amount: 5100 },
        { name: 'Affiliate income', amount: 1600 },
        { name: 'Presets', amount: 700 },
      ],
      channels: [
        { name: 'YouTube', amount: 8900 },
        { name: 'Newsletter', amount: 3600 },
        { name: 'Instagram', amount: 2100 },
      ],
      ads: [
        row('r1', 'Meta', 'Story / Reel', 'Membership reel', 600, 150000, 2100, 14, 840),
        row('r2', 'TikTok', 'Video', 'Preset before/after', 400, 210000, 3600, 4, 240),
      ],
    },
  ),
};

/**
 * Five earlier sample months for trend lines. Each is the sample month with
 * revenue-linked numbers and spend scaled by fixed factors. Sample only.
 */
const TREND: [number, number][] = [
  [0.78, 0.86],
  [0.84, 0.9],
  [0.9, 0.95],
  [0.87, 0.97],
  [0.94, 0.98],
];

export function samplePriorMonths(type: BusinessType): MonthInput[] {
  const base = SAMPLES[type];
  let month = base.month;
  const months: string[] = [];
  for (let i = 0; i < TREND.length; i++) {
    const [y, m] = month.split('-').map(Number);
    month = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    months.unshift(month);
  }
  return TREND.map(([rf, cf], i) => {
    const v = { ...base.values };
    for (const k of ['grossRevenue', 'refunds', 'cogs', 'paymentFees', 'orders', 'newCustomerRevenue', 'returningCustomerRevenue', 'sessions'] as FieldKey[]) if (v[k] != null) v[k] = Math.round((v[k] as number) * rf);
    for (const k of ['adSpendMeta', 'adSpendGoogle', 'adSpendTiktok', 'adSpendOther', 'software', 'contractors', 'otherExpenses'] as FieldKey[]) if (v[k] != null) v[k] = Math.round((v[k] as number) * cf);
    if (v.newCustomers != null) v.newCustomers = Math.round(v.newCustomers * (rf * 0.98));
    v.oneOffExpenses = 0;
    return { ...base, month: months[i], values: v, ads: base.ads.map((a) => ({ ...a, spend: Math.round(a.spend * cf), revenue: a.revenue === null ? null : Math.round(a.revenue * rf) })) };
  });
}

export function blankMonth(type: BusinessType, month: string, goal: number | null): MonthInput {
  return { month, businessType: type, goal, values: {}, sources: {}, products: [], channels: [], ads: [], isSample: false };
}
