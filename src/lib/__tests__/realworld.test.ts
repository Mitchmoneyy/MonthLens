import { describe, expect, it } from 'vitest';
import { detectKind, detectRoles, parseTable, tableCandidates } from '../parse/csv';

/** Exports laid out the way the platforms actually produce them (headers, junk rows, totals). */
function read(csv: string) {
  const t = parseTable(csv);
  const roles = detectRoles(t.headers);
  const kind = detectKind(t.headers, roles);
  const { candidates } = tableCandidates(t, roles, kind, 'csv');
  const fields = Object.fromEntries(candidates.filter((c) => c.kind === 'field').map((c: any) => [c.field, c.value]));
  const ads = candidates.filter((c) => c.kind === 'ad').map((c: any) => c.row);
  return { kind, fields, ads, table: t };
}

describe('PayPal activity report', () => {
  const csv = `"Date","Time","TimeZone","Name","Type","Status","Currency","Gross","Fee","Net","From Email Address","Transaction ID"
"10/02/2026","09:14:02","PDT","Ana Ruiz","Express Checkout Payment","Completed","USD","120.00","-3.98","116.02","ana@example.com","1AB"
"10/03/2026","11:02:44","PDT","Ben Cho","Express Checkout Payment","Completed","USD","80.00","-2.82","77.18","ben@example.com","2CD"
"10/05/2026","15:40:10","PDT","Ben Cho","Payment Refund","Completed","USD","-80.00","2.82","-77.18","ben@example.com","3EF"
"10/06/2026","08:00:00","PDT","","General Withdrawal","Completed","USD","-110.00","0.00","-110.00","","4GH"
`;
  const r = read(csv);
  it('is read as payments', () => expect(r.kind).toBe('payments'));
  it('revenue counts sales only, not refunds or withdrawals', () => expect(r.fields.grossRevenue).toBe(200));
  it('refunds come from refund rows', () => expect(r.fields.refunds).toBe(80));
  it('two sales', () => expect(r.fields.orders).toBe(2));
});

describe('Google Ads campaign report', () => {
  const csv = `Campaign report
October 1, 2026 - October 31, 2026
Campaign,Campaign type,Currency code,Cost,Impr.,Clicks,Conversions,Conv. value
Brand search,Search,USD,"1,200.00","24,000","1,900",61,"5,400.00"
All products,Performance Max,USD,"1,500.00","90,000","2,400",48,"4,950.00"
Catalog,Shopping,USD,400.00,"30,000",700,12,"1,150.00"
Remarketing banners,Display,USD,150.00,"110,000",260,2,140.00
Total: Account,,USD,"3,250.00","254,000","5,260",123,"11,640.00"
`;
  const r = read(csv);
  it('skips the title rows and the total row', () => {
    expect(r.table.skipped).toBe(2);
    expect(r.ads).toHaveLength(4);
  });
  it('spend is the sum of campaigns, not doubled by the total row', () => expect(r.fields.adSpendGoogle).toBe(3250));
  it('formats come from the campaign type column', () => expect(r.ads.map((a: any) => a.format)).toEqual(['Search Text', 'Performance Max', 'Shopping / Product Listing', 'Display / Banner']));
  it('numbers with thousands separators', () => expect(r.ads[1]).toMatchObject({ spend: 1500, impressions: 90000, clicks: 2400, conversions: 48, revenue: 4950 }));
});

describe('TikTok Ads export', () => {
  const csv = `Ad name,Campaign name,Cost,Impressions,Clicks,CTR,Conversions,Total purchase value
Spark ad - creator unboxing,TikTok Prospecting,900.00,190000,2900,1.53%,12,2400.00
Product video 15s,TikTok Prospecting,700.00,150000,1800,1.20%,6,980.00
`;
  const r = read(csv);
  it('is read as TikTok ads', () => {
    expect(r.kind).toBe('ads');
    expect(r.ads.every((a: any) => a.platform === 'TikTok')).toBe(true);
    expect(r.fields.adSpendTiktok).toBe(1600);
  });
  it('purchase value becomes revenue; creator ad is tagged UGC', () => {
    expect(r.ads[0]).toMatchObject({ revenue: 2400, format: 'UGC / Creator Video' });
    expect(r.ads[1].format).toBe('Video');
  });
});

describe('Shopify sales-over-time report', () => {
  const csv = `Day,Orders,Gross sales,Discounts,Returns,Net sales,Shipping,Taxes,Total sales
2026-10-01,26,1540.00,-60.00,-45.00,1435.00,120.00,98.00,1653.00
2026-10-02,31,1820.50,-80.00,0.00,1740.50,140.00,119.00,1999.50
`;
  const r = read(csv);
  it('sums gross sales, returns and orders', () => {
    expect(r.kind).toBe('store-sales');
    expect(r.fields.grossRevenue).toBe(3360.5);
    expect(r.fields.refunds).toBe(45);
    expect(r.fields.orders).toBe(57);
  });
});
