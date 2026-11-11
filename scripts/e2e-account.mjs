// Account flow in a real browser against a fake Supabase (requests are answered by the test).
// Builds a separate copy with fake config: node scripts/e2e-account.mjs
import { createRequire } from 'node:module';
import { execSync, spawn } from 'node:child_process';
import path from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FAKE = 'https://fake-project.supabase.co';
execSync('npx vite build --outDir dist-acct', { cwd: root, stdio: 'ignore', env: { ...process.env, VITE_SUPABASE_URL: FAKE, VITE_SUPABASE_ANON_KEY: 'public-anon-key' } });
const PORT = 4190;
const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-acct', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
const BASE = `http://localhost:${PORT}/`;
const results = [];
const ok = (n, p, d = '') => (results.push(p), console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`));

// --- fake backend state
const users = new Map(); // email -> {id, password}
const rows = new Map(); // user_id -> data
const feedback = [];
const session = (u) => ({ access_token: 'tok-' + u.id, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r-' + u.id, user: { id: u.id, email: u.email, aud: 'authenticated', role: 'authenticated', identities: [{ id: u.id }], app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } });
const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
async function fake(route) {
  const req = route.request();
  const url = new URL(req.url());
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  const body = req.postData() ? JSON.parse(req.postData()) : null;
  const uidFromAuth = () => (req.headers()['authorization'] || '').replace('Bearer tok-', '');
  if (url.pathname === '/auth/v1/signup') {
    if (users.has(body.email)) return json(route, 200, { ...session(users.get(body.email)).user, identities: [] });
    const u = { id: 'u' + (users.size + 1), email: body.email, password: body.password };
    users.set(body.email, u);
    return json(route, 200, session(u));
  }
  if (url.pathname === '/auth/v1/token') {
    const u = users.get(body.email);
    if (!u || u.password !== body.password) return json(route, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials', msg: 'Invalid login credentials' });
    return json(route, 200, session(u));
  }
  if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
  if (url.pathname === '/auth/v1/user') return json(route, 200, session([...users.values()].find((u) => u.id === uidFromAuth())).user);
  if (url.pathname === '/rest/v1/rpc/delete_my_account') {
    const uid = uidFromAuth();
    for (const [email, u] of users) if (u.id === uid) users.delete(email);
    rows.delete(uid);
    return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
  }
  if (url.pathname === '/rest/v1/feedback' && req.method() === 'POST') {
    const r = Array.isArray(body) ? body[0] : body;
    if (!r.message || r.message.length < 5) return json(route, 400, { message: 'check constraint' });
    feedback.push(r);
    return json(route, 201, []);
  }
  if (url.pathname === '/rest/v1/workspaces') {
    const uid = uidFromAuth();
    if (req.method() === 'GET') return json(route, 200, rows.has(uid) ? [{ data: rows.get(uid) }] : []);
    if (req.method() === 'POST') {
      const r = Array.isArray(body) ? body[0] : body;
      if (r.user_id !== uid) return json(route, 403, { message: 'row-level security' });
      rows.set(uid, r.data);
      return json(route, 201, []);
    }
    if (req.method() === 'DELETE') return rows.delete(uid), json(route, 204, null);
  }
  return json(route, 404, { message: 'not faked: ' + url.pathname });
}

try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  const browser = await chromium.launch();
  const errors = [];

  // Device 1: laptop. Has real numbers, creates an account.
  const laptop = await browser.newContext();
  await laptop.route(FAKE + '/**', fake);
  const p1 = await laptop.newPage();
  p1.on('pageerror', (e) => errors.push(e.message));
  // real numbers + signed out → a prompt to create an account
  await p1.goto(BASE + '#import');
  await p1.getByRole('button', { name: 'Start a blank month' }).click();
  await p1.click('#tab-manual');
  await p1.fill('#m-grossRevenue', '5000');
  await p1.goto(BASE + '#overview');
  await p1.getByTestId('account-nudge').waitFor({ timeout: 8000 });
  ok('With real numbers and no account, Overview offers to create one', true);
  await p1.goto(BASE + '#history');
  await p1.click('#save-snapshot');
  await p1.click('#account-button');
  await p1.waitForURL(/#account/);
  await p1.fill('#acct-email', 'owner@example.com');
  await p1.fill('#acct-password', 'short');
  await p1.click('#acct-submit');
  const shortMsg = await p1.getByRole('status').innerText();
  ok('Short password is refused in plain English', /at least 8 characters/.test(shortMsg), shortMsg);
  await p1.fill('#acct-password', 'correct horse 42');
  await p1.click('#acct-submit');
  await p1.getByTestId('acct-email').waitFor();
  await p1.waitForTimeout(500);
  ok('Create account signs you in', (await p1.getByTestId('acct-email').innerText()) === 'owner@example.com');
  ok('Laptop data is uploaded on sign-up', rows.get('u1')?.snapshots?.length === 1, `${rows.get('u1')?.snapshots?.length} saved month(s) in cloud`);

  // change something; it should auto-save
  await p1.goto(BASE + '#advisor');
  await p1.locator('#wi-price').fill('10');
  await p1.click('text=Save as A');
  await p1.waitForTimeout(2200);
  ok('Changes auto-save to the account', rows.get('u1')?.scenarioA?.name === 'Price +10%', rows.get('u1')?.scenarioA?.name);

  // Device 2: phone. Fresh browser, signs in, gets the laptop's data.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await phone.route(FAKE + '/**', fake);
  const p2 = await phone.newPage();
  p2.on('pageerror', (e) => errors.push(e.message));
  await p2.goto(BASE + '#account');
  await p2.click('#acct-tab-signin');
  await p2.fill('#acct-email', 'owner@example.com');
  await p2.fill('#acct-password', 'wrong password');
  await p2.click('#acct-submit');
  const bad = await p2.getByRole('status').innerText();
  ok('Wrong password is explained', /don’t match/.test(bad), bad);
  await p2.fill('#acct-password', 'correct horse 42');
  await p2.click('#acct-submit');
  await p2.getByTestId('acct-email').waitFor();
  await p2.waitForTimeout(600);
  await p2.goto(BASE + '#history');
  await p2.getByTestId('snapshots').waitFor({ timeout: 8000 }).catch(() => {}); // tabs load on demand
  const phoneSnaps = await p2.getByTestId('snapshots').locator('tbody tr').count();
  const phoneScenario = await p2.locator('text=A · Price +10%').count();
  ok('Phone gets the laptop’s months and scenarios', phoneSnaps === 1 && phoneScenario > 0, `${phoneSnaps} month(s), scenario A ${phoneScenario ? 'present' : 'missing'}`);

  // reload keeps the session
  await p2.reload();
  await p2.goto(BASE + '#account');
  await p2.getByTestId('acct-email').waitFor({ timeout: 8000 });
  ok('Session survives a reload', true);

  await p2.click('#acct-signout');
  await p2.locator('#acct-submit').waitFor();
  ok('Sign out returns to the sign-in form, data stays in the browser', (await p2.evaluate(() => JSON.parse(localStorage.getItem('monthlens.v1')).state.snapshots.length)) === 1);
  // feedback form: signed in on the laptop, signed out on a fresh browser
  await p1.goto(BASE + '#overview');
  await p1.click('#send-feedback');
  await p1.fill('#fb-message', 'The import read my Shopify export perfectly.');
  await p1.click('#fb-send');
  await p1.getByTestId('feedback-sent').waitFor();
  ok('Feedback form sends a note, tagged with the account', feedback.length === 1 && feedback[0].user_id === 'u1' && /Shopify/.test(feedback[0].message), JSON.stringify(Object.keys(feedback[0] ?? {})));
  const leaked = JSON.stringify(feedback[0]);
  ok('Feedback carries no business numbers', !/grossRevenue|snapshots|48200/.test(leaked));

  // delete the account from the laptop (App Store requirement)
  await p1.goto(BASE + '#account');
  await p1.getByTestId('acct-email').waitFor();
  await p1.click('#acct-delete');
  await p1.click('#acct-delete-confirm');
  await p1.locator('#acct-submit').waitFor();
  ok('Delete my account removes the login and its data', !users.has('owner@example.com') && !rows.has('u1'), `${users.size} users, ${rows.size} rows left`);
  await p1.click('#acct-tab-signin');
  await p1.fill('#acct-email', 'owner@example.com');
  await p1.fill('#acct-password', 'correct horse 42');
  await p1.click('#acct-submit');
  ok('A deleted account can’t sign in', /don’t match/.test(await p1.getByRole('status').innerText()));
  ok('No page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
} catch (e) {
  ok('Run', false, e.stack || String(e));
} finally {
  server.kill();
}
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
