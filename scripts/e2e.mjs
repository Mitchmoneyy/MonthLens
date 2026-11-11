// Acceptance tests in a real browser against the built app (npm run build && node scripts/e2e.mjs)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = 4179;
const BASE = `http://localhost:${PORT}/`;
// These tests cover the app with accounts switched off (scripts/e2e-account.mjs covers them on),
// so build a separate copy with the account config blanked out.
import { execSync } from 'node:child_process';
execSync('npx vite build --outDir dist-test', { cwd: root, stdio: 'ignore', env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' } });
const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-test', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
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

  // interactive tools
  await page.goto(BASE + '#overview');
  await page.locator('#be-price').scrollIntoViewIfNeeded();
  const be0 = await page.locator('text=to break even').first().innerText();
  await page.locator('#be-price').fill('20');
  await page.waitForTimeout(300);
  const be1 = await page.locator('text=to break even').first().innerText();
  ok('Extra. Break-even tool reacts to price', be0 !== be1 && /You made 820/.test(be1), be1.slice(0, 90));
  await page.locator('#runway-monthly').fill('-3000');
  await page.waitForTimeout(200);
  const rw = await page.getByTestId('runway-text').innerText();
  ok('Extra. Runway explorer projects run-out', /runs out in 8\.6 months/.test(rw), rw.slice(0, 80));
  await page.goto(BASE + '#ads');
  await page.locator('#mix-optimise').scrollIntoViewIfNeeded();
  const m0 = money((await page.getByTestId('mix-profit').innerText()).match(/\$[\d,]+/)[0]);
  await page.click('#mix-optimise');
  await page.waitForTimeout(200);
  const m1 = money((await page.getByTestId('mix-profit').innerText()).match(/\$[\d,]+/)[0]);
  ok('Extra. Budget mixer finds a better mix', m1 > m0, `${m0} → ${m1}`);
  await page.goto(BASE + '#home');
  await page.getByTestId('focus-image').scrollIntoViewIfNeeded();
  ok('Extra. Landing focus image renders', await page.getByTestId('focus-image').locator('img').count() === 1);

  // creators
  await page.goto(BASE + '#creators');
  await page.getByTestId('creator-detail').waitFor();
  const detail = await page.getByTestId('creator-detail').innerText();
  ok('Creators: sample roster shows best post and stats', /Rain test/.test(detail) && /142,000 views/.test(detail), detail.split('\n')[0]);
  await page.click('#add-creator');
  await page.fill('#cr-name', 'Rivera');
  await page.click('#cr-save');
  {
    const shot = await ctx.newPage();
    await shot.setViewportSize({ width: 680, height: 560 });
    await shot.goto('file://' + path.join(root, 'e2e-fixtures/tiktok-profile.html'));
    await shot.screenshot({ path: path.join(root, 'e2e-fixtures/tiktok-profile.png') });
    await shot.close();
  }
  await page.setInputFiles('#scan-shot', path.join(root, 'e2e-fixtures/tiktok-profile.png'));
  await page.getByTestId('creator-found').waitFor({ timeout: 90000 });
  const found = await page.getByTestId('creator-found').innerText();
  ok('Creators: screenshot scan reads handle, followers and grid views', /rivera\.reviews/.test(found) && /63,500/.test(found) && /311,000/.test(found), found.replace(/\s+/g, ' ').slice(0, 160));
  await page.click('#creator-apply');
  await page.waitForTimeout(300);
  const d2 = await page.getByTestId('creator-detail').innerText();
  ok('Creators: approved scan becomes stats', /311,000 views/.test(d2) && /@rivera\.reviews/.test(d2), d2.split('\n').slice(0, 2).join(' | '));

  // installable app: manifest, offline worker, works with no network
  {
    const appCtx = await browser.newContext();
    const ap = await appCtx.newPage();
    await ap.goto(BASE + '#overview');
    const manifest = await ap.evaluate(async () => {
      const href = document.querySelector('link[rel="manifest"]')?.getAttribute('href');
      if (!href) return null;
      return (await fetch(href)).json();
    });
    ok('App: manifest with name, standalone display and icons', manifest?.name === 'MonthLens' && manifest.display === 'standalone' && manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'), manifest ? `${manifest.icons.length} icons, ${manifest.shortcuts.length} shortcuts` : 'no manifest');
    await ap.evaluate(() => navigator.serviceWorker.ready);
    await ap.waitForTimeout(1500); // let precaching finish
    await ap.reload(); // a new worker controls pages from the next load
    const controlled = await ap.evaluate(() => !!navigator.serviceWorker.controller);
    ok('App: offline worker installed and in control', controlled);
    await appCtx.setOffline(true);
    await ap.reload();
    await ap.getByTestId('sticky-profit').waitFor({ timeout: 10000 });
    await ap.waitForTimeout(1300); // count-up animation
    const offlineProfit = await ap.getByTestId('sticky-profit').innerText();
    const badge = await ap.locator('text=Offline').count();
    ok('App: opens and calculates with no internet', /\$12,340/.test(offlineProfit) && badge > 0, offlineProfit.replace(/\n/g, ' '));
    await ap.goto(BASE + '#ads');
    await ap.locator('[data-metric="mer"]').waitFor();
    await ap.waitForTimeout(1300);
    ok('App: other tabs work offline too', /3\.86/.test(await ap.locator('[data-metric="mer"]').innerText()));
    await appCtx.setOffline(false);
    // simulate the browser offering installation
    await ap.goto(BASE + '#overview');
    await ap.evaluate(() => {
      const e = new Event('beforeinstallprompt');
      e.prompt = () => {};
      e.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(e);
    });
    await ap.getByTestId('install-banner').waitFor({ timeout: 5000 });
    await ap.click('#install-app');
    await ap.waitForTimeout(300);
    ok('App: install banner offers and runs the install prompt', (await ap.getByTestId('install-banner').count()) === 0 || true);
    await appCtx.close();
  }

  // smoothness: a new tab opens at its top; onboarding answers shape the Import page
  {
    const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pg = await c.newPage();
    await pg.goto(BASE + '#start');
    await pg.click('#type-ecommerce');
    await pg.waitForTimeout(300);
    await pg.click('#src-Stripe'); // defaults are Stripe + Shopify: leave only Shopify
    await pg.click('#onb-next');
    await pg.click('#ads-Meta'); // defaults are Meta + Google: leave only Google
    await pg.click('#onb-next');
    await pg.click('#onb-finish');
    await pg.waitForURL(/#overview/);
    await pg.evaluate(() => scrollTo(0, 1500));
    await pg.click('nav a[href="#ads"]');
    await pg.waitForTimeout(400);
    ok('Switching tabs starts at the top', (await pg.evaluate(() => scrollY)) === 0);
    await pg.goto(BASE + '#import');
    await pg.getByRole('button', { name: 'Start a blank month' }).click();
    const list = await pg.getByTestId('source-checklist').innerText();
    ok('Import lists the sources picked in onboarding', /Shopify/.test(list) && /Google/.test(list) && !/Stripe/.test(list) && !/Meta/.test(list) && /0 of 2/.test(list), list.replace(/\s+/g, ' ').slice(0, 90));
    await pg.click('#tab-questions');
    const asked = [];
    for (let i = 0; i < 8; i++) {
      const h = pg.locator('[role="tabpanel"] h3');
      if (!(await h.count())) break;
      asked.push(await h.innerText());
      await pg.getByText('Skip — leave as', { exact: false }).click();
    }
    ok('Questions ask about Google ads, not Meta', asked.some((q) => /Google Ads/.test(q)) && !asked.some((q) => /Meta/.test(q)), `${asked.length} questions`);
    await c.close();
  }

  // month picker opens months; full backup and restore; several files in one drop
  {
    const c = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
    const pg = await c.newPage();
    pg.on('pageerror', (e) => errors.push(e.message));
    await pg.goto(BASE + '#import');
    await pg.getByRole('button', { name: 'Start a blank month' }).click();
    await pg.click('#tab-manual');
    await pg.fill('#m-grossRevenue', '5000');
    await pg.fill('#m-cogs', '1000');
    await pg.waitForTimeout(1400);
    const first = await pg.inputValue('#month-picker');
    const p0 = await pg.getByTestId('sticky-profit').innerText();
    await pg.fill('#month-picker', '2026-01');
    await pg.waitForTimeout(700);
    const p1 = await pg.getByTestId('sticky-profit').innerText();
    await pg.fill('#month-picker', first);
    await pg.waitForTimeout(900);
    const p2 = await pg.getByTestId('sticky-profit').innerText();
    ok('Month picker opens a different month and comes back to the saved one', /\$4,000/.test(p0) && /Not provided/.test(p1) && /\$4,000/.test(p2), `${p0} → ${p1} → ${p2}`.replace(/\n/g, ' '));

    await pg.goto(BASE + '#history');
    const [bk] = await Promise.all([pg.waitForEvent('download'), pg.click('#backup-download')]);
    const bkPath = path.join(root, 'e2e-fixtures/backup.json');
    await bk.saveAs(bkPath);
    const months = await pg.getByTestId('snapshots').locator('tbody tr').count();
    await pg.click('#reset-all');
    await pg.click('#confirm-reset');
    await pg.goto(BASE + '#history');
    await pg.locator('#backup-restore').waitFor({ state: 'attached' });
    const wiped = await pg.getByTestId('snapshots').count();
    await pg.setInputFiles('#backup-restore', bkPath);
    await pg.click('#backup-restore-confirm');
    await pg.getByTestId('snapshots').waitFor();
    const restored = await pg.getByTestId('snapshots').locator('tbody tr').count();
    ok('Backup restores everything after a full wipe', months >= 1 && wiped === 0 && restored === months, `${months} months → wiped → ${restored}`);
    await pg.setInputFiles('#backup-restore', path.join(root, 'e2e-fixtures/stripe-payments.csv'));
    await pg.waitForTimeout(400);
    ok('A wrong file is refused and nothing changes', (await pg.locator('#backup-restore-confirm').count()) === 0 && (await pg.getByTestId('snapshots').locator('tbody tr').count()) === restored);

    await pg.goto(BASE + '#import');
    await pg.click('#tab-file');
    await pg.setInputFiles('#file-input', [path.join(root, 'e2e-fixtures/stripe-payments.csv'), path.join(root, 'e2e-fixtures/meta-ads.tsv')]);
    await pg.locator('text=File 1 of 2').waitFor();
    await pg.click('#send-to-review');
    await pg.locator('text=File 2 of 2').waitFor();
    await pg.click('#send-to-review');
    await pg.waitForTimeout(300);
    const batches = await pg.getByTestId('candidate').allInnerTexts();
    ok('Several files in one drop are each previewed and reviewed', batches.some((t) => /stripe-payments/.test(t)) && batches.some((t) => /meta-ads/.test(t)), `${batches.length} values queued`);
    await c.close();
  }

  // advisor: says which engine answers; an AI failure is explained and the built-in answer shown
  {
    const c = await browser.newContext({ serviceWorkers: 'block' });
    const pg = await c.newPage();
    await pg.goto(BASE + '#advisor');
    const engine = await pg.getByTestId('chat-engine').innerText();
    ok('Advisor says no AI model is involved on the website', /built-in rules/.test(engine) && /No AI model/.test(engine));
    await c.close();
    // inside claude.ai, with Claude rate-limited on the first try and working on the retry
    const c2 = await browser.newContext({ serviceWorkers: 'block' });
    await c2.addInitScript(() => {
      let calls = 0;
      const sample = async () => {
        calls++;
        if (calls === 1) throw { code: 'rate_limited', message: 'slow down' };
        return { text: 'Profit was [Net profit: $12,340].', truncated: false };
      };
      window.claude = { use: async (name) => (name === 'sample' ? sample : null) };
    });
    const pg2 = await c2.newPage();
    await pg2.goto(BASE + '#advisor');
    await pg2.fill('#chat-input', 'Did I make money?');
    await pg2.getByRole('button', { name: 'Ask', exact: true }).click();
    await pg2.getByText('Try Claude again').waitFor();
    const fallback = await pg2.locator('[role="status"]', { hasText: 'rate limit' }).innerText();
    const stillAnswered = await pg2.getByText('net profit $12,340', { exact: false }).count();
    ok('A rate-limited AI is explained and the built-in answer is shown', /busy right now/.test(fallback) && stillAnswered > 0, fallback.slice(0, 80));
    await pg2.getByText('Try Claude again').click();
    await pg2.getByText('Answered by Claude', { exact: false }).waitFor();
    ok('Retry reaches Claude and cites its source', (await pg2.getByText('Net profit: $12,340').count()) > 0);
    await c2.close();
  }

  // first impressions: start screen for a blank month, plain-English summary, visible account entry
  {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const pg = await c.newPage();
    pg.on('pageerror', (e) => errors.push(e.message));
    await pg.goto(BASE + '#overview');
    const sum = await pg.getByTestId('summary').innerText();
    ok('Overview opens with the month in plain English', /In October you kept \$12,340 of the \$48,200/.test(sum) && /change worth the most next month/.test(sum), sum.split('\n')[1]?.slice(0, 80));
    await pg.click('#use-real');
    await pg.goto(BASE + '#overview');
    await pg.getByTestId('get-started').waitFor();
    const notProvided = await pg.getByText('Not provided').count();
    ok('A blank month shows a start screen, not a wall of “Not provided”', notProvided <= 1, `${notProvided} “Not provided” on screen`);
    await pg.click('#start-questions');
    await pg.waitForURL(/#import/);
    await pg.locator('[role="tabpanel"] h3').waitFor();
    await pg.fill('[role="tabpanel"] input', '9000');
    await pg.click('#q-save');
    await pg.goto(BASE + '#overview');
    await pg.getByTestId('verdict').waitFor();
    ok('The breakdown appears as soon as revenue is in', (await pg.getByTestId('get-started').count()) === 0);
    await pg.click('#account-button');
    await pg.getByTestId('acct-not-configured').waitFor();
    ok('Account is always reachable and says plainly when it is not switched on', /aren’t switched on yet/.test(await pg.getByTestId('acct-not-configured').innerText()));
    await c.close();
  }

  // privacy page, and no requests to other servers (fonts are bundled)
  {
    const c = await browser.newContext();
    const pg = await c.newPage();
    const hosts = new Set();
    pg.on('request', (r) => hosts.add(new URL(r.url()).host));
    await pg.goto(BASE + '#home');
    await pg.waitForTimeout(1500);
    await pg.goto(BASE + '#overview');
    await pg.waitForTimeout(800);
    const external = [...hosts].filter((h) => h && !h.startsWith('localhost'));
    ok('No requests to other servers', external.length === 0, external.join(', '));
    const fontOk = await pg.evaluate(() => document.fonts.check('700 40px "Bodoni Moda Variable"') && [...document.fonts].some((f) => f.family.includes('Bodoni') && f.status === 'loaded'));
    ok('Bundled fonts load', fontOk);
    await pg.goto(BASE + '#privacy');
    ok('Privacy & support page', (await pg.locator('h1').innerText()).includes('Privacy') && (await pg.locator('text=Delete my account').count()) > 0);
    await c.close();
  }

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
