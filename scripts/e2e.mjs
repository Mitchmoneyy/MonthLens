// Acceptance tests in a real browser against the built app (npm run build && node scripts/e2e.mjs)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = 4179;
const BASE = `http://localhost:${PORT}/`;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const money = (s) => Number(String(s).replace(/[^0-9.\-()]/g, '').replace(/^\((.*)\)$/, '-$1'));

async function waitServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server did not start');
}

const settle = (page) => page.waitForTimeout(1100); // count-up animations

try {
  await waitServer();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // 1. sample e-commerce numbers
  await page.goto(BASE + '#overview');
  await settle(page);
  const profit1 = (await page.getByTestId('sticky-profit').innerText()).split('\n').join(' ');
  ok('1a. Sample e-com profit = $12,340', /\$12,340/.test(profit1), profit1);
  ok('1b. Margin 25.6%', /25\.6%/.test(profit1), profit1);
  await page.goto(BASE + '#ads');
  await settle(page);
  const adsKpis = await page.locator('[data-metric="mer"]').innerText();
  const cac = await page.locator('[data-metric="cac"]').innerText();
  ok('1c. Blended ROAS = 3.86×', adsKpis.includes('3.86'), adsKpis);
  ok('1d. CAC = $23', /\$23/.test(cac), cac);

  // 4. onboarding < 60 s
  await page.goto(BASE + '#home');
  const t0 = Date.now();
  await page.click('#cta-start');
  await page.click('#type-ecommerce');
  await page.waitForTimeout(300);
  await page.click('#onb-next');
  await page.click('#onb-next');
  await page.click('#onb-finish');
  await page.waitForURL(/#overview/);
  await page.getByTestId('verdict').waitFor();
  const secs = (Date.now() - t0) / 1000;
  ok('4. Onboarding to finished breakdown', secs < 60, `${secs.toFixed(1)}s, verdict "${await page.getByTestId('verdict').innerText()}"`);

  // 2. CSV + screenshot import with approval
  await page.goto(BASE + '#import');
  await page.getByRole('button', { name: 'Start a blank month' }).click();
  await page.click('#tab-file');
  await page.setInputFiles('#file-input', path.join(root, 'e2e-fixtures/stripe-payments.csv'));
  await page.click('#send-to-review');
  const csvCount = await page.getByTestId('candidate').count();
  ok('2a. CSV parsed into reviewable values', csvCount >= 3, `${csvCount} candidates`);
  // nothing applied before approval
  const before = await page.getByTestId('sticky-profit').innerText();
  { const ap = page.getByRole('button', { name: 'Approve', exact: true }); while (await ap.count()) await ap.first().click(); }
  await page.click('#apply-approved');
  await settle(page);
  const afterCsv = await page.getByTestId('sticky-profit').innerText();
  ok('2b. Not applied until approved, then dials update', /Not provided/.test(before) && /\$/.test(afterCsv), `${before.replace(/\n/g, ' ')} → ${afterCsv.replace(/\n/g, ' ')}`);

  const shotPage = await ctx.newPage();
  await shotPage.setViewportSize({ width: 840, height: 520 });
  await shotPage.goto('file://' + path.join(root, 'e2e-fixtures/meta-dashboard.html'));
  const png = path.join(root, 'e2e-fixtures/meta-dashboard.png');
  await shotPage.screenshot({ path: png });
  await shotPage.close();
  await page.click('#tab-screenshot');
  await page.setInputFiles('#shot-input', png);
  await page.getByTestId('candidate').first().waitFor({ timeout: 90000 });
  const shotCands = await page.getByTestId('candidate').allInnerTexts();
  ok('2c. Screenshot OCR found values', shotCands.some((t) => /640/.test(t)), shotCands.join(' | ').replace(/\s+/g, ' ').slice(0, 220));
  { const ap = page.getByRole('button', { name: 'Approve', exact: true }); while (await ap.count()) await ap.first().click(); }
  await page.click('#apply-approved');
  await settle(page);
  const afterShot = await page.getByTestId('sticky-profit').innerText();
  ok('2d. Profit after both imports reflects approved values', money(afterShot.match(/\$[\d,]+/)[0]) === Math.round(2450 - 80 - 71.95 - 640), afterShot.replace(/\n/g, ' '));

  // PDF import: read the report this app exports
  {
    const pdfFixture = path.join(root, 'e2e-fixtures/import-test.pdf');
    const tmp = await ctx.newPage();
    await tmp.goto(BASE + '#history');
    const [d] = await Promise.all([tmp.waitForEvent('download'), tmp.click('#export-pdf')]);
    await d.saveAs(pdfFixture);
    await tmp.close();
    await page.click('#tab-file');
    await page.setInputFiles('#file-input', pdfFixture);
    await page.locator('#send-to-review').waitFor();
    const label = await page.locator('#send-to-review').innerText();
    ok('2e. PDF export can be read back as an import', /Review [1-9]/.test(label), label);
  }

  // importing over a sample month starts a clean month instead of mixing
  {
    await page.goto(BASE + '#start');
    await page.click('#type-saas');
    await page.waitForTimeout(300);
    await page.click('#onb-next');
    await page.click('#onb-next');
    await page.click('#onb-finish');
    await page.waitForURL(/#overview/);
    await page.goto(BASE + '#import');
    await page.click('#tab-paste');
    await page.fill('#paste-box', 'Stripe\nGross volume $9,000.00\nRefunds $100.00');
    await page.click('#read-paste');
    { const ap = page.getByRole('button', { name: 'Approve', exact: true }); while (await ap.count()) await ap.first().click(); }
    await page.click('#apply-approved');
    await page.waitForTimeout(400);
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('monthlens.v1')).state.input);
    ok('2f. Import over a sample starts a clean month', st.isSample === false && st.values.grossRevenue === 9000 && st.values.software == null && st.ads.length === 0, `software=${st.values.software}, ads=${st.ads.length}`);
  }

  // back to sample for the remaining checks
  await page.goto(BASE + '#start');
  await page.click('#type-ecommerce');
  await page.waitForTimeout(300);
  await page.click('#onb-next');
  await page.click('#onb-next');
  await page.click('#onb-finish');
  await page.waitForURL(/#overview/);

  // 3. what-if price +10%
  await page.goto(BASE + '#advisor');
  await settle(page);
  const base = money(await page.getByTestId('whatif-profit').innerText());
  await page.locator('#wi-price').fill('10');
  await settle(page);
  const after = money(await page.getByTestId('whatif-profit').innerText());
  ok('3. Price +10% updates profit live', base === 12340 && after === 12340 + 4511, `${base} → ${after}`);
  await page.locator('#wi-price').fill('0');

  // 5. snapshot survives reload
  await page.goto(BASE + '#history');
  await page.click('#save-snapshot');
  await page.reload();
  await page.getByTestId('snapshots').waitFor();
  const rows = await page.getByTestId('snapshots').locator('tbody tr').count();
  ok('5. Snapshot persists after reload', rows >= 1, `${rows} saved row(s)`);

  // 6. PDF + share link contain the same numbers
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export-pdf')]);
  const pdfPath = path.join(root, 'e2e-fixtures/report.pdf');
  await dl.saveAs(pdfPath);
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(pdfPath)) }).promise;
  const text = (await (await doc.getPage(1)).getTextContent()).items.map((i) => i.str).join(' ');
  ok('6a. PDF has same profit, revenue, margin', text.includes('$12,340') && text.includes('$48,200') && text.includes('25.6%'), `pages=${doc.numPages}`);
  const [csvDl] = await Promise.all([page.waitForEvent('download'), page.click('#export-csv')]);
  const csvText = fs.readFileSync(await csvDl.path(), 'utf8');
  ok('6b. CSV has same profit', csvText.includes('$12,340'));
  await page.click('#copy-share-code');
  const code = await page.locator('#share-code').inputValue();
  const p2 = await (await browser.newContext()).newPage();
  await p2.goto(BASE + '#share-' + code);
  await p2.click('#open-shared');
  await p2.waitForTimeout(1200);
  const shared = await p2.getByTestId('sticky-profit').innerText();
  ok('6c. Share link opens the same numbers', /\$12,340/.test(shared), `code length ${code.length}`);

  // chat grounded answer
  await page.goto(BASE + '#advisor');
  await page.fill('#chat-input', 'What if I cut ad spend by $500?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await page.getByText('Sources').first().waitFor();
  const ans = await page.locator('text=Cutting ad spend by $500').first().innerText();
  ok('Extra. Chat answers with sources', /profit goes from \$12,340/.test(ans), ans.slice(0, 140));

  ok('No page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
} catch (e) {
  ok('Run', false, e.stack || String(e));
} finally {
  server.kill();
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
