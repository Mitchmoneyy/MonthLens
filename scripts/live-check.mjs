// Checks the LIVE site the way a visitor would: it loads, calculates, and accounts reach the
// account server. Creates nothing and sends no email. Run: node scripts/live-check.mjs [url]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const SITE = (process.argv[2] || process.env.SITE_URL || 'https://mitchmoneyy.github.io/MonthLens/').replace(/\/?$/, '/');
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const results = [];
const ok = (name, pass, detail = '') => (results.push(pass), console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`));
const browser = await chromium.launch(proxy ? { proxy: { server: proxy } } : {});
try {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: !!proxy, serviceWorkers: 'block', viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  const errors = [];
  const failed = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => r.status() >= 400 && !r.url().includes('/auth/v1/token') && failed.push(`${r.status()} ${r.url().split('/').slice(-2).join('/')}`));

  await page.goto(SITE + '#home', { waitUntil: 'networkidle' });
  ok('Landing page loads', (await page.locator('h1').innerText()).includes('make money'));
  const heroOk = await page.locator('main img').first().evaluate((img) => img.complete && img.naturalWidth > 0);
  ok('Hero photo loads', heroOk);

  await page.goto(SITE + '#overview');
  await page.getByTestId('summary').waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);
  const profit = (await page.getByTestId('sticky-profit').innerText()).replace(/\n/g, ' ');
  ok('Sample month calculates', /\$12,340/.test(profit), profit);

  await page.goto(SITE + '#account');
  const form = page.locator('#acct-submit');
  const off = page.getByTestId('acct-not-configured');
  await Promise.race([form.waitFor({ timeout: 20000 }), off.waitFor({ timeout: 20000 })]).catch(() => {});
  if (await off.count()) ok('Accounts are switched on', false, 'the Account page says accounts are not switched on');
  else {
    ok('Create-account form is shown', (await form.count()) === 1);
    await page.click('#acct-tab-signin');
    await page.fill('#acct-email', 'live-check-nobody@example.com');
    await page.fill('#acct-password', 'not-a-real-password');
    await form.click();
    const msg = await page.getByRole('status').innerText({ timeout: 20000 }).catch(() => '');
    ok('Account server answers', /don’t match an account/.test(msg), msg || 'no answer from the account server');
  }

  await page.goto(SITE + '#privacy');
  ok('Privacy, terms & support page loads', (await page.locator('h1').innerText()).includes('Privacy'));
  ok('No page errors', errors.length === 0, errors.join(' | '));
  ok('No failed requests', failed.length === 0, failed.slice(0, 5).join(', '));
} catch (e) {
  ok('Live check ran', false, String(e.message).split('\n')[0]);
} finally {
  await browser.close();
}
const bad = results.filter((x) => !x).length;
console.log(`\n${SITE}: ${results.length - bad}/${results.length} passed`);
process.exit(bad ? 1 : 0);
