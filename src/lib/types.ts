export type BusinessType = 'ecommerce' | 'saas' | 'course' | 'agency' | 'creator';

export type FieldKey =
  | 'grossRevenue'
  | 'refunds'
  | 'cogs'
  | 'paymentFees'
  | 'software'
  | 'contractors'
  | 'otherExpenses'
  | 'oneOffExpenses'
  | 'adSpendMeta'
  | 'adSpendGoogle'
  | 'adSpendTiktok'
  | 'adSpendOther'
  | 'sessions'
  | 'orders'
  | 'newCustomers'
  | 'newCustomerRevenue'
  | 'returningCustomerRevenue'
  | 'activeCustomers'
  | 'churnRate'
  | 'purchasesPerCustomer'
  | 'cashStart'
  | 'cashEnd';

export type Source = 'sample' | 'manual' | 'csv' | 'screenshot' | 'paste' | 'question' | 'pdf' | 'json' | 'share';

export const AD_FORMATS = [
  'Video',
  'Static Image',
  'Carousel',
  'UGC / Creator Video',
  'Story / Reel',
  'Collection / Instant Experience',
  'Catalog / Dynamic Product',
  'Search Text',
  'Shopping / Product Listing',
  'Performance Max',
  'Display / Banner',
  'Lead Form',
  'Influencer / Sponsorship',
  'Audio / Podcast',
  'Other',
] as const;
export type AdFormat = (typeof AD_FORMATS)[number];

export const AD_PLATFORMS = ['Meta', 'Google', 'TikTok', 'Pinterest', 'Snapchat', 'LinkedIn', 'Microsoft', 'Reddit', 'X', 'Amazon', 'Other'] as const;
export type AdPlatform = (typeof AD_PLATFORMS)[number];

export interface AdRow {
  id: string;
  name: string;
  platform: AdPlatform;
  format: AdFormat;
  spend: number;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
  revenue: number | null;
}

export interface NamedAmount {
  name: string;
  amount: number;
}

export interface MonthInput {
  /** YYYY-MM */
  month: string;
  businessType: BusinessType;
  goal: number | null;
  values: Partial<Record<FieldKey, number | null>>;
  sources: Partial<Record<FieldKey, Source>>;
  products: NamedAmount[];
  channels: NamedAmount[];
  ads: AdRow[];
  isSample: boolean;
}

export interface Snapshot {
  id: string;
  month: string;
  savedAt: string;
  label: string;
  input: MonthInput;
}

/** A what-if scenario. All fields are optional deltas against the base month. */
export interface Scenario {
  /** price change, e.g. 0.1 = +10% */
  pricePct?: number;
  /** ad spend change, e.g. -0.2 = -20% */
  adSpendPct?: number;
  /** absolute ad spend change in $, applied after adSpendPct */
  adSpendDelta?: number;
  /** conversion rate change in percentage points, e.g. 0.5 */
  convPts?: number;
  /** churn change in percentage points, e.g. -2 */
  churnPts?: number;
  /** COGS change, e.g. -0.05 */
  cogsPct?: number;
  /** fixed cost change (software, contractors, other), e.g. -0.1 */
  fixedPct?: number;
  /** software-only change */
  softwarePct?: number;
  /** refunds change */
  refundsPct?: number;
  /** ad formats to switch off */
  cutFormats?: AdFormat[];
  /** move a format's budget to another */
  shift?: { from: AdFormat; to: AdFormat };
  /** extra repeat purchases as a share of this month's new customers */
  repeatShare?: number;
}
