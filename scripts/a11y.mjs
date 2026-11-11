// Accessibility scan (axe, WCAG 2.1 A/AA + best practices) of every screen, phone and desktop,
// light and dark. Fails on any finding. Run after a build: node scripts/a11y.mjs
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = 4195;
const BASE = `http://localhost:${PORT}/`;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
const ROUTES = ['home', 'start', 'overview', 'import', 'ads', 'creators', 'advisor', 'history', 'account', 'privacy'];
const found = {};
let scanned = 0;
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  const browser = await chromium.launch();
  for (const colorScheme of ['light', 'dark']) {
    for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
      const ctx = await browser.newContext({ viewport, colorScheme, serviceWorkers: 'block' });
      const page = await ctx.newPage();
      for (const r of ROUTES) {
        await page.goto(BASE + '#' + r);
        await page.waitForTimeout(900);
        const h = await page.evaluate(() => document.body.scrollHeight);
        for (let y = 0; y < h; y += 600) {
          await page.evaluate((y) => scrollTo(0, y), y);
          await page.waitForTimeout(25);
        }
        await page.waitForTimeout(700); // let reveals finish
        await page.evaluate(axe);
        const res = await page.evaluate(() => globalThis.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] }));
        scanned++;
        for (const v of res.violations) {
          const k = `${v.id} [${v.impact}] ${v.help}`;
          found[k] ??= { n: 0, where: new Set(), example: v.nodes[0].html.slice(0, 140) };
          found[k].n += v.nodes.length;
          found[k].where.add(`${r} (${colorScheme}, ${viewport.width}px)`);
        }
      }
      await ctx.close();
    }
  }
  await browser.close();
} finally {
  server.kill();
}
const list = Object.entries(found);
for (const [k, v] of list) console.log(`FAIL  ${k} ×${v.n}\n      ${[...v.where].slice(0, 6).join(', ')}\n      e.g. ${v.example}`);
console.log(`\n${scanned} screens scanned, ${list.length} kinds of accessibility problem`);
process.exit(list.length ? 1 : 0);
