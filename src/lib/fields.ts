import type { BusinessType, FieldKey } from './types';

export type Unit = 'money' | 'count' | 'pct' | 'number';

export interface FieldDef {
  key: FieldKey;
  label: string;
  short?: string;
  group: 'Revenue' | 'Costs' | 'Ad spend' | 'Customers & traffic' | 'Cash';
  unit: Unit;
  /** plain-language question used by the guided flow */
  question: string;
  hint?: string;
  /** slider ceiling used by manual entry (inputs accept any value) */
  max: number;
  step: number;
}

export const FIELDS: FieldDef[] = [
  { key: 'grossRevenue', label: 'Gross revenue', group: 'Revenue', unit: 'money', question: 'What was your total revenue last month, before refunds?', hint: 'Stripe "Gross volume" or Shopify "Gross sales".', max: 250000, step: 100 },
  { key: 'refunds', label: 'Refunds', group: 'Revenue', unit: 'money', question: 'What was your refund total last month?', hint: 'Include chargebacks. Enter 0 if none.', max: 20000, step: 10 },
  { key: 'newCustomerRevenue', label: 'Revenue from new customers', group: 'Revenue', unit: 'money', question: 'How much of that revenue came from first-time customers?', max: 250000, step: 100 },
  { key: 'returningCustomerRevenue', label: 'Revenue from returning customers', group: 'Revenue', unit: 'money', question: 'How much came from returning customers?', max: 250000, step: 100 },
  { key: 'cogs', label: 'COGS / delivery cost', short: 'COGS / delivery', group: 'Costs', unit: 'money', question: 'What did it cost to make or deliver what you sold? (product cost, shipping, hosting, delivery)', max: 150000, step: 50 },
  { key: 'paymentFees', label: 'Platform & payment fees', short: 'Platform fees', group: 'Costs', unit: 'money', question: 'What did Stripe, Shopify, PayPal or other platforms charge in fees?', max: 20000, step: 10 },
  { key: 'software', label: 'Software & tools', group: 'Costs', unit: 'money', question: 'What did you spend on software and tools?', max: 10000, step: 10 },
  { key: 'contractors', label: 'Contractors & team', short: 'Contractors', group: 'Costs', unit: 'money', question: 'What did you pay contractors, freelancers or staff?', max: 60000, step: 50 },
  { key: 'otherExpenses', label: 'Other expenses', short: 'Other', group: 'Costs', unit: 'money', question: 'Any other regular expenses (rent, insurance, gear)?', max: 20000, step: 10 },
  { key: 'oneOffExpenses', label: 'One-off expenses', short: 'One-off', group: 'Costs', unit: 'money', question: 'Any big one-off expenses last month?', hint: 'A laptop, a legal bill, an annual plan. Enter 0 if none.', max: 30000, step: 50 },
  { key: 'adSpendMeta', label: 'Meta ads spend', short: 'Meta', group: 'Ad spend', unit: 'money', question: 'How much did you spend on Meta (Facebook / Instagram) ads?', max: 60000, step: 50 },
  { key: 'adSpendGoogle', label: 'Google ads spend', short: 'Google', group: 'Ad spend', unit: 'money', question: 'How much did you spend on Google Ads?', max: 60000, step: 50 },
  { key: 'adSpendTiktok', label: 'TikTok ads spend', short: 'TikTok', group: 'Ad spend', unit: 'money', question: 'How much did you spend on TikTok ads?', max: 60000, step: 50 },
  { key: 'adSpendOther', label: 'Other ad platforms', short: 'Other ads', group: 'Ad spend', unit: 'money', question: 'Any other ad spend? Pinterest, Snapchat, LinkedIn, Microsoft, Reddit, X, Amazon, podcasts or sponsorships.', hint: 'Add them together. Enter 0 if none.', max: 60000, step: 50 },
  { key: 'sessions', label: 'Website visits / sessions', short: 'Visits', group: 'Customers & traffic', unit: 'count', question: 'How many visits did your site or sales page get?', max: 500000, step: 100 },
  { key: 'orders', label: 'Orders / sales', short: 'Orders', group: 'Customers & traffic', unit: 'count', question: 'How many orders or sales did you make?', hint: 'For SaaS: new paid subscriptions. For agencies: new signed clients.', max: 20000, step: 1 },
  { key: 'newCustomers', label: 'New customers', group: 'Customers & traffic', unit: 'count', question: 'How many brand-new customers did you get?', max: 20000, step: 1 },
  { key: 'activeCustomers', label: 'Active subscribers / clients', short: 'Active customers', group: 'Customers & traffic', unit: 'count', question: 'How many paying subscribers or active clients do you have?', max: 50000, step: 1 },
  { key: 'churnRate', label: 'Monthly churn %', short: 'Churn', group: 'Customers & traffic', unit: 'pct', question: 'What % of subscribers or clients cancelled last month?', max: 30, step: 0.1 },
  { key: 'purchasesPerCustomer', label: 'Lifetime purchases per customer', short: 'Purchases / customer', group: 'Customers & traffic', unit: 'number', question: 'On average, how many times does a customer buy from you over their lifetime?', max: 20, step: 0.1 },
  { key: 'cashStart', label: 'Cash at start of month', short: 'Cash start', group: 'Cash', unit: 'money', question: 'How much cash was in the business account at the start of the month?', max: 500000, step: 100 },
  { key: 'cashEnd', label: 'Cash at end of month', short: 'Cash end', group: 'Cash', unit: 'money', question: 'And at the end of the month?', max: 500000, step: 100 },
];

export const FIELD: Record<FieldKey, FieldDef> = Object.fromEntries(FIELDS.map((f) => [f.key, f])) as Record<FieldKey, FieldDef>;

/** Fields the guided questions ask for, in priority order, per business type. Max 8 are asked. */
export const PRIORITY: Record<BusinessType, FieldKey[]> = {
  ecommerce: ['grossRevenue', 'cogs', 'refunds', 'paymentFees', 'adSpendMeta', 'orders', 'newCustomers', 'sessions', 'oneOffExpenses', 'software', 'cashEnd'],
  saas: ['grossRevenue', 'activeCustomers', 'churnRate', 'newCustomers', 'cogs', 'software', 'contractors', 'refunds', 'oneOffExpenses', 'cashEnd'],
  course: ['grossRevenue', 'refunds', 'adSpendMeta', 'orders', 'newCustomers', 'sessions', 'paymentFees', 'oneOffExpenses', 'cashEnd'],
  agency: ['grossRevenue', 'contractors', 'cogs', 'activeCustomers', 'newCustomers', 'churnRate', 'software', 'oneOffExpenses', 'cashEnd'],
  creator: ['grossRevenue', 'contractors', 'otherExpenses', 'software', 'newCustomers', 'refunds', 'oneOffExpenses', 'cashEnd'],
};

export const BUSINESS_TYPES: { key: BusinessType; label: string; blurb: string; photo: string }[] = [
  { key: 'ecommerce', label: 'E-commerce', blurb: 'Physical products, Shopify or similar', photo: 'flatlay' },
  { key: 'saas', label: 'SaaS / Subscription', blurb: 'Recurring software or memberships', photo: 'code' },
  { key: 'course', label: 'Course / Digital product', blurb: 'Courses, templates, ebooks', photo: 'desk' },
  { key: 'agency', label: 'Agency / Services', blurb: 'Client work, retainers, freelancing', photo: 'studio' },
  { key: 'creator', label: 'Creator', blurb: 'Sponsors, memberships, affiliates', photo: 'cameras' },
];
