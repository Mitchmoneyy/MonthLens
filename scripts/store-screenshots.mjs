// App Store screenshots at Apple's required sizes, taken from the built app.
// Run after `npm run build`: node scripts/store-screenshots.mjs
import { createRequire } from 'node:module';
import { execSync, spawn } from 'node:child_process';
import path from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
// a copy with accounts off, so screenshots never depend on the account server
execSync('npx vite build --outDir dist-test', { cwd: root, stdio: 'ignore', env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' } });
const PORT = 4199;
const BASE = `http://localhost:${PORT}/`;
const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-test', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
const TARGETS = [
  { dir: 'iphone-6.9', viewport: { width: 440, height: 956 }, scale: 3, mobile: true }, // 1320 × 2868
  { dir: 'ipad-13', viewport: { width: 1032, height: 1376 }, scale: 2, mobile: false }, // 2064 × 2752
];
const SHOTS = [
  { name: '1-overview', hash: 'overview', sel: '[data-testid=summary]' },
  { name: '2-breakdown', hash: 'overview', sel: '[data-testid=verdict]', up: 330 },
  { name: '3-next-month', hash: 'advisor', text: 'Fix these first' },
  { name: '4-what-if', hash: 'advisor', text: 'What if…' },
  { name: '5-ads', hash: 'ads', text: 'What worked, what didn’t' },
  { name: '6-creators', hash: 'creators', sel: '[data-testid=creator-detail]' },
];
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  const browser = await chromium.launch();
  for (const t of TARGETS) {
    const ctx = await browser.newContext({ viewport: t.viewport, deviceScaleFactor: t.scale, isMobile: t.mobile, hasTouch: true, serviceWorkers: 'block' });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('monthlens.installDismissed', '1');
      } catch {}
    });
    const page = await ctx.newPage();
    for (const s of SHOTS) {
      await page.goto(BASE + '#' + s.hash);
      await page.waitForTimeout(900);
      const h = await page.evaluate(() => document.body.scrollHeight);
      for (let y = 0; y < h; y += 500) {
        await page.evaluate((y) => scrollTo(0, y), y);
        await page.waitForTimeout(30);
      }
      const el = s.sel ? page.locator(s.sel).first() : page.getByText(s.text, { exact: false }).first();
      const top = await el.evaluate((n) => n.getBoundingClientRect().top + scrollY);
      await page.evaluate((y) => scrollTo(0, Math.max(0, y)), top - (s.up ?? 150));
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(root, 'store/screenshots', t.dir, s.name + '.png') });
    }
    await ctx.close();
    console.log(`${t.dir}: ${SHOTS.length} screenshots`);
  }
  await browser.close();
} finally {
  server.kill();
}
