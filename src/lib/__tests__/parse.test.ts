import { describe, expect, it } from 'vitest';
import { parseNumber } from '../parse/common';
import { detectKind, detectRoles, parseTable, tableCandidates } from '../parse/csv';
import { extractFromText } from '../parse/text';
import { decodeShare, encodeShare } from '../share';
import { SAMPLES } from '../samples';

describe('numbers', () => {
  it('parses money formats', () => {
    expect(parseNumber('$12,345.67')).toBe(12345.67);
    expect(parseNumber('(1,200)')).toBe(-1200);
    expect(parseNumber('-$40')).toBe(-40);
    expect(parseNumber('1.2k')).toBe(1200);
    expect(parseNumber('USD 900')).toBe(900);
    expect(parseNumber('abc')).toBeNull();
  });
});

describe('csv', () => {
  it('stripe-style export with junk header lines', () => {
    const csv = `Payments export\nGenerated 2026-11-01\n\nid,Created date (UTC),Amount,Amount Refunded,Currency,Fee,Status,Customer Email\nch_1,2026-10-02,120.00,0,usd,3.78,Paid,a@x.com\nch_2,2026-10-03,80.00,80.00,usd,2.62,Paid,b@x.com\nch_3,2026-10-04,50.00,0,usd,1.75,Failed,c@x.com\n`;
    const t = parseTable(csv);
    expect(t.headers[0]).toBe('id');
    const roles = detectRoles(t.headers);
    const kind = detectKind(t.headers, roles);
    expect(kind).toBe('payments');
    const { candidates } = tableCandidates(t, roles, kind, 'csv');
    const f = Object.fromEntries(candidates.filter((c) => c.kind === 'field').map((c: any) => [c.field, c.value]));
    expect(f.grossRevenue).toBe(200);
    expect(f.refunds).toBe(80);
    expect(f.paymentFees).toBeCloseTo(6.4, 2); // failed charge has no fee
    expect(f.orders).toBe(2);
  });
  it('shopify-style orders with line items', () => {
    const csv = `Name,Email,Financial Status,Subtotal,Total,Refunded Amount,Lineitem quantity,Lineitem name,Lineitem price\n#1001,a@x.com,paid,100,108,0,1,Tote,60\n#1001,,,,,,1,Wallet,40\n#1002,b@x.com,refunded,50,54,50,1,Notebook,50\n`;
    const t = parseTable(csv);
    const roles = detectRoles(t.headers);
    expect(detectKind(t.headers, roles)).toBe('shopify-orders');
    const { candidates } = tableCandidates(t, roles, 'shopify-orders', 'csv');
    const f = Object.fromEntries(candidates.filter((c) => c.kind === 'field').map((c: any) => [c.field, c.value]));
    expect(f.grossRevenue).toBe(150);
    expect(f.refunds).toBe(50);
    expect(f.orders).toBe(2);
    expect(candidates.filter((c) => c.kind === 'product').length).toBe(3);
  });
  it('meta ads export maps formats', () => {
    const tsv = `Ad name\tAmount spent (USD)\tImpressions\tLink clicks\tPurchases\tPurchases conversion value\nUGC unboxing v2\t1,900.00\t205000\t3900\t101\t9600\nCarousel colors\t1100\t150000\t1450\t16\t1300\n`;
    const t = parseTable(tsv);
    const roles = detectRoles(t.headers);
    const kind = detectKind(t.headers, roles);
    expect(kind).toBe('ads');
    const { candidates } = tableCandidates(t, roles, kind, 'csv');
    const ads = candidates.filter((c) => c.kind === 'ad') as any[];
    expect(ads[0].row.format).toBe('UGC / Creator Video');
    expect(ads[0].row.platform).toBe('Meta');
    expect(ads[1].row.format).toBe('Carousel');
    const spend = candidates.find((c: any) => c.field === 'adSpendMeta') as any;
    expect(spend.value).toBe(3000);
  });
  it('bank statement categorises spend and balances', () => {
    const csv = `Date,Description,Amount,Balance\n2026-10-01,Stripe payout,5000,25000\n2026-10-03,NOTION LABS,-20,24980\n2026-10-05,FACEBK ADS,-700,24280\n2026-10-09,Upwork contractor,-1200,23080\n`;
    const t = parseTable(csv);
    const roles = detectRoles(t.headers);
    expect(detectKind(t.headers, roles)).toBe('bank');
    const { candidates } = tableCandidates(t, roles, 'bank', 'csv');
    const f = Object.fromEntries(candidates.filter((c) => c.kind === 'field').map((c: any) => [c.field, c.value]));
    expect(f.software).toBe(20);
    expect(f.adSpendMeta).toBe(700);
    expect(f.contractors).toBe(1200);
    expect(f.cashEnd).toBe(23080);
  });
});

describe('text / OCR extraction', () => {
  it('stripe dashboard text', () => {
    const { candidates, label } = extractFromText('Stripe\nGross volume\n$48,200.00\nNet volume $45,110.00\nRefunds -$1,450.00\nSuccessful payments 820', 'paste');
    expect(label).toBe('Stripe dashboard');
    const f = Object.fromEntries(candidates.map((c: any) => [c.field, c.value]));
    expect(f.grossRevenue).toBe(48200);
    expect(f.refunds).toBe(1450);
    expect(f.orders).toBe(820);
  });
  it('meta ads manager text becomes an ad row', () => {
    const { candidates } = extractFromText('Ads Manager\nAmount spent $1,900.00\nImpressions 205,000\nLink clicks 3,900\nPurchases 101\nPurchases conversion value $9,600.00', 'screenshot');
    const ad = candidates.find((c) => c.kind === 'ad') as any;
    expect(ad.row.spend).toBe(1900);
    expect(ad.row.revenue).toBe(9600);
    expect(ad.row.clicks).toBe(3900);
    expect((candidates.find((c: any) => c.field === 'adSpendMeta') as any).value).toBe(1900);
  });
});

describe('share codes', () => {
  it('round-trips', async () => {
    const code = await encodeShare(SAMPLES.saas);
    expect(code).toMatch(/^ML1-[A-Za-z0-9-]+$/);
    const back = await decodeShare(code);
    expect(back).toEqual(SAMPLES.saas);
  });
});
