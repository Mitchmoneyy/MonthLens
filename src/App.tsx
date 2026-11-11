import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { useStore, previousInput, seriesInputs } from './store';
import { computeReview, computeReviewWithPrev, monthName, projectPlan, recommend } from './lib/calc';
import { money, pct } from './lib/format';
import { CountUp, FormulaProvider, ToastProvider, useToast, Button } from './components/ui';
import Landing from './pages/Landing';
import { PageBanner } from './components/PageBanner';

const BANNERS: Partial<Record<string, [string, string]>> = {
  overview: ['desk', 'The month on one page'],
  import: ['travel', 'Bring the receipts'],
  ads: ['cameras', 'Every format, side by side'],
  advisor: ['pencils', 'Plan the next 30 days'],
  history: ['print', 'Month after month'],
  account: ['phone', 'Your months on every device'],
  creators: ['device', 'The people behind your ads'],
};
// Each tab is its own chunk: the landing page loads only what it shows.
const pages = {
  start: () => import('./pages/Onboarding'),
  overview: () => import('./pages/Overview'),
  import: () => import('./pages/Import'),
  ads: () => import('./pages/Ads'),
  advisor: () => import('./pages/Advisor'),
  history: () => import('./pages/History'),
  account: () => import('./pages/Account'),
  creators: () => import('./pages/Creators'),
  privacy: () => import('./pages/Privacy'),
};
const Onboarding = lazy(pages.start);
const Overview = lazy(pages.overview);
const Import = lazy(pages.import);
const Ads = lazy(pages.ads);
const Advisor = lazy(pages.advisor);
const History = lazy(pages.history);
const Account = lazy(pages.account);
const Creators = lazy(pages.creators);
const Privacy = lazy(pages.privacy);

/** Fetch the other tabs while the browser is idle, so switching is instant. */
function preloadPages() {
  const run = () => Object.values(pages).forEach((load) => void load().catch(() => {}));
  if ('requestIdleCallback' in window) (window as any).requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 1500);
}
import { useAccount } from './account';
import { isStandalone, useInstall } from './install';
import { syncStatusBar } from './native';
import { InstallBanner, UpdateBanner } from './components/InstallApp';
import { decodeShare } from './lib/share';
import type { MonthInput, Snapshot } from './lib/types';
import { BUSINESS_TYPES } from './lib/fields';

export type Route = 'home' | 'start' | 'overview' | 'import' | 'ads' | 'advisor' | 'history' | 'account' | 'creators' | 'privacy';
const APP_TABS: { key: Route; label: string; short: string }[] = [
  { key: 'overview', label: 'Overview', short: 'Overview' },
  { key: 'import', label: 'Import', short: 'Import' },
  { key: 'ads', label: 'Ads', short: 'Ads' },
  { key: 'creators', label: 'Creators', short: 'Creators' },
  { key: 'advisor', label: 'Next month', short: 'Plan' },
  { key: 'history', label: 'History', short: 'History' },
];

function readRoute(): { route: Route; share: string | null } {
  const h = location.hash.replace(/^#/, '');
  if (h.startsWith('share-')) return { route: 'overview', share: h.slice(6) };
  const r = (['home', 'start', 'overview', 'import', 'ads', 'advisor', 'history', 'account', 'creators', 'privacy'] as Route[]).find((x) => x === h);
  // opened as an installed app with no page chosen: skip the marketing page
  if (!r && isStandalone()) return { route: useStore.getState().profile.onboarded ? 'overview' : 'start', share: null };
  return { route: r ?? 'home', share: null };
}

export function go(route: Route) {
  if (location.hash !== '#' + route) location.hash = route;
  window.scrollTo({ top: 0 });
}

/** What to tell someone after they pick a month. */
export function monthMessage(m: string, r: { result: string; autoSaved: boolean }): string {
  const name = monthName(m);
  if (r.result === 'opened') return `Opened ${name}${r.autoSaved ? '. The month you were on was saved.' : ''}`;
  if (r.result === 'started') return `Started ${name}${r.autoSaved ? '. The month you were on was saved to History.' : ''}`;
  if (r.result === 'relabelled') return `Showing the sample as ${name}`;
  return name;
}

/** Everything derived from the current month. All pages read from here. */
function deriveReview(input: MonthInput, snapshots: Snapshot[]) {
  const prev = previousInput(input, snapshots);
  const review = computeReviewWithPrev(input, prev);
  const prevReview = prev ? computeReview(prev) : null;
  const series = seriesInputs(input, snapshots).map((i) => computeReview(i));
  const recs = recommend(input);
  const projected = projectPlan(input, recs.slice(0, 3));
  return { input, review, prev, prevReview, series, recs, projected };
}
// The top bar and the open page ask for the same thing; work it out once per change.
let lastDerived: { input: MonthInput; snapshots: Snapshot[]; value: ReturnType<typeof deriveReview> } | null = null;

export function useReviewData() {
  const input = useStore((s) => s.input);
  const snapshots = useStore((s) => s.snapshots);
  if (!lastDerived || lastDerived.input !== input || lastDerived.snapshots !== snapshots) lastDerived = { input, snapshots, value: deriveReview(input, snapshots) };
  return lastDerived.value;
}

function useTheme() {
  const theme = useStore((s) => s.theme);
  useEffect(() => {
    const el = document.documentElement;
    if (theme === 'system') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', theme);
    // the phone's status bar / window title bar matches the top bar
    const metas = document.querySelectorAll('meta[name="theme-color"]');
    const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    void syncStatusBar(dark);
    metas.forEach((m, i) => m.setAttribute('content', theme === 'system' ? (i === 0 ? '#0b0b0b' : '#ededeb') : theme === 'dark' ? '#ededeb' : '#0b0b0b'));
  }, [theme]);
}

function OfflineBadge() {
  const online = useInstall((s) => s.online);
  if (online) return null;
  return (
    <span className="rounded-[3px] border border-current/40 px-2 py-1 font-mono text-[10px] uppercase tracking-wider" title="You're offline. Everything still works and saves on this device.">
      Offline
    </span>
  );
}

/** Top-bar account entry: "Sign in", or the account's initial with sync state. */
export function AccountButton({ light = false }: { light?: boolean }) {
  const a = useAccount();
  if (a.availability !== 'ready') return null;
  const signedIn = a.status === 'signedIn';
  return (
    <a
      href="#account"
      id="account-button"
      className={`flex h-9 items-center gap-2 rounded-[3px] border px-3 text-xs font-semibold ${light ? 'border-ink/30 hover:border-ink' : 'border-current/30 opacity-90 hover:opacity-100'}`}
      aria-label={signedIn ? `Account: ${a.email}. ${a.sync === 'error' ? 'Not synced.' : 'Synced.'}` : 'Sign in or create an account'}
    >
      {signedIn ? (
        <>
          <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${light ? 'bg-inv text-invink' : 'bg-invink text-inv'}`}>{(a.email ?? '?')[0].toUpperCase()}</span>
          <span className="hidden sm:inline">{a.sync === 'syncing' ? 'Syncing…' : a.sync === 'error' ? 'Not synced' : 'Synced'}</span>
        </>
      ) : (
        'Sign in'
      )}
    </a>
  );
}

export function ThemeToggle() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const next = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
  return (
    <button type="button" onClick={() => setTheme(next)} className="flex h-9 items-center gap-1.5 rounded-[3px] border border-current/30 px-3 font-mono text-[11px] uppercase tracking-wider opacity-80 hover:opacity-100" aria-label={`Theme: ${theme}. Switch to ${next}.`} title={`Theme: ${theme}`}>
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 1.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" />
      </svg>
      <span className="hidden sm:inline">{theme}</span>
    </button>
  );
}

function SummaryBar({ route }: { route: Route }) {
  const { review, input } = useReviewData();
  const openMonth = useStore((s) => s.openMonth);
  const toast = useToast();
  const p = review.m.netProfit.value;
  return (
    <header className="sticky z-50 bg-inv text-invink" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
      <div className="gutter mx-auto flex max-w-6xl items-center gap-3 py-2.5 sm:gap-6">
        <a href="#home" className="display shrink-0 text-lg leading-none" aria-label="MonthLens home">
          Month<span className="font-normal italic">Lens</span>
        </a>
        <label className="hidden items-center gap-2 md:flex">
          <span className="sr-only">Month</span>
          <input id="month-picker" type="month" value={input.month} onChange={(e) => e.target.value && toast(monthMessage(e.target.value, openMonth(e.target.value)))} className="rounded-md border border-current/25 bg-transparent px-2 py-1 font-mono text-xs" style={{ colorScheme: 'inherit' }} />
        </label>
        <div className="ml-auto flex min-w-0 items-baseline gap-2 sm:gap-3" data-testid="sticky-profit">
          <span className="font-mono text-[10px] uppercase tracking-widest opacity-60">Profit</span>
          <span className="display text-xl sm:text-2xl">{p === null ? <span className="text-sm font-normal opacity-60">Not provided</span> : <CountUp value={p} format={(x) => money(x)} />}</span>
          <span className="hidden font-mono text-xs opacity-70 sm:inline">{pct(review.m.margin.value)}</span>
        </div>
        <div className="hidden items-center gap-2 lg:flex">
          <span className="rounded-[3px] border border-current/40 px-2 py-0.5 font-mono text-[11px]">{review.health.score ?? '—'}</span>
          <span className="max-w-[12rem] truncate text-xs opacity-80">{review.health.verdict}</span>
        </div>
        <OfflineBadge />
        <AccountButton />
        <ThemeToggle />
      </div>
      <nav className="hidden border-t border-current/15 sm:block" aria-label="Sections">
        <div className="gutter mx-auto flex max-w-6xl gap-1">
          {APP_TABS.map((t) => (
            <a key={t.key} href={'#' + t.key} aria-current={route === t.key ? 'page' : undefined} className={`relative px-3 py-2.5 text-sm transition ${route === t.key ? 'font-semibold opacity-100' : 'opacity-60 hover:opacity-100'}`}>
              {t.label}
              {route === t.key && <span className="absolute inset-x-3 bottom-0 h-[3px] bg-invink" />}
            </a>
          ))}
          <span className="ml-auto self-center font-mono text-[11px] uppercase tracking-widest opacity-60">
            {monthName(input.month)} · {BUSINESS_TYPES.find((b) => b.key === input.businessType)?.label}
            {input.isSample ? ' · sample' : ''}
          </span>
        </div>
      </nav>
    </header>
  );
}

function BottomNav({ route }: { route: Route }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface sm:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)', paddingLeft: 'env(safe-area-inset-left, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)' }} aria-label="Sections">
      <div className="grid grid-cols-6">
        {APP_TABS.map((t) => (
          <a key={t.key} href={'#' + t.key} aria-current={route === t.key ? 'page' : undefined} className={`flex flex-col items-center gap-1 py-2.5 text-[11px] ${route === t.key ? 'font-semibold text-ink' : 'text-mute'}`}>
            <span className={`h-1 w-6 rounded-full ${route === t.key ? 'bg-ink' : 'bg-transparent'}`} />
            {t.short}
          </a>
        ))}
      </div>
    </nav>
  );
}

function SharedOpen({ code, onDone }: { code: string; onDone: () => void }) {
  const [data, setData] = useState<MonthInput | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const replace = useStore((s) => s.replaceInput);
  const toast = useToast();
  useEffect(() => {
    decodeShare(code).then(setData, (e) => setErr(e.message || 'This share code could not be read.'));
  }, [code]);
  const r = data ? computeReview(data) : null;
  return (
    <div className="gutter mx-auto max-w-lg py-16">
      <div className="eyebrow">Shared review</div>
      {err && <p className="mt-3">{err}</p>}
      {r && data && (
        <>
          <h1 className="display mt-2 text-3xl">{monthName(data.month)}</h1>
          <p className="mt-2 text-mute">Someone shared their numbers with you. Opening them replaces the month on screen. Save your own month in History first if you want to keep it.</p>
          <dl className="mt-6 grid grid-cols-3 gap-4 border-y border-line py-4">
            <div>
              <dt className="eyebrow">Revenue</dt>
              <dd className="num text-lg">{money(r.m.revenue.value)}</dd>
            </div>
            <div>
              <dt className="eyebrow">Profit</dt>
              <dd className="num text-lg">{money(r.m.netProfit.value)}</dd>
            </div>
            <div>
              <dt className="eyebrow">Margin</dt>
              <dd className="num text-lg">{pct(r.m.margin.value)}</dd>
            </div>
          </dl>
          <div className="mt-6 flex gap-2">
            <Button
              id="open-shared"
              onClick={() => {
                replace({ ...data, sources: Object.fromEntries(Object.keys(data.values).map((k) => [k, 'share'])) as any });
                toast('Shared numbers opened');
                onDone();
              }}
            >
              Open these numbers
            </Button>
            <Button variant="secondary" onClick={onDone}>
              Cancel
            </Button>
          </div>
        </>
      )}
      {!r && !err && <p className="mt-3 text-mute">Reading share code…</p>}
    </div>
  );
}

function PageLoading() {
  return (
    <div className="gutter mx-auto max-w-6xl py-10" aria-busy="true" aria-label="Loading">
      <div className="scan h-1 max-w-xs" />
    </div>
  );
}

function Shell() {
  useTheme();
  const [{ route, share }, setR] = useState(readRoute);
  useEffect(() => {
    const on = () =>
      setR((cur) => {
        const next = readRoute();
        // a new tab starts at its top, not wherever the last one was scrolled to
        if (next.route !== cur.route) window.scrollTo(0, 0);
        return next;
      });
    window.addEventListener('hashchange', on);
    preloadPages();
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {
    const titles: Record<Route, string> = { home: 'MonthLens', start: 'Set up · MonthLens', overview: 'Overview · MonthLens', import: 'Import · MonthLens', ads: 'Ads · MonthLens', advisor: 'Next month · MonthLens', history: 'History · MonthLens', account: 'Account · MonthLens', creators: 'Creators · MonthLens', privacy: 'Privacy & support · MonthLens' };
    document.title = titles[route];
  }, [route]);

  if (share) {
    return (
      <SharedOpen
        code={share}
        onDone={() => {
          history.replaceState(null, '', location.pathname + location.search + '#overview');
          setR({ route: 'overview', share: null });
        }}
      />
    );
  }
  if (route === 'home') return <Landing />;
  if (route === 'start' || route === 'privacy')
    return <Suspense fallback={<PageLoading />}>{route === 'start' ? <Onboarding /> : <Privacy />}</Suspense>;
  return (
    <div className="min-h-full pb-24 sm:pb-12">
      <a href="#main" className="skip-link" onClick={(e) => (e.preventDefault(), document.getElementById('main')?.focus())}>
        Skip to content
      </a>
      <SummaryBar route={route} />
      <UpdateBanner />
      <main id="main" tabIndex={-1} className="gutter mx-auto max-w-6xl pt-6 outline-none sm:pt-8" key={route}>
        {route === 'overview' && <InstallBanner />}
        <PageBanner name={BANNERS[route]?.[0] ?? 'desk'} caption={BANNERS[route]?.[1] ?? ''} />
        <Suspense fallback={<PageLoading />}>
          <div className="rise">
            {route === 'overview' && <Overview />}
            {route === 'import' && <Import />}
            {route === 'ads' && <Ads />}
            {route === 'advisor' && <Advisor />}
            {route === 'history' && <History />}
            {route === 'account' && <Account />}
            {route === 'creators' && <Creators />}
          </div>
        </Suspense>
      </main>
      <BottomNav route={route} />
    </div>
  );
}

/** If a page crashes, show a way out instead of a blank screen. Saved data is untouched. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidMount() {
    window.addEventListener('hashchange', this.clear);
  }
  componentWillUnmount() {
    window.removeEventListener('hashchange', this.clear);
  }
  clear = () => this.state.error && this.setState({ error: null });
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="gutter mx-auto max-w-lg py-20">
        <div className="eyebrow">Something broke</div>
        <h1 className="display mt-2 text-3xl">This page hit an error.</h1>
        <p className="mt-3 text-mute">Your saved numbers are safe. Go back to the overview, or reload the page.</p>
        <p className="mt-3 font-mono text-xs text-faint">{this.state.error.message}</p>
        <div className="mt-6 flex gap-2">
          <Button
            onClick={() => {
              this.setState({ error: null });
              location.hash = 'overview';
            }}
          >
            Back to overview
          </Button>
          <Button variant="secondary" onClick={() => location.reload()}>
            Reload
          </Button>
        </div>
      </div>
    );
  }
}

export default function App() {
  return (
    <ToastProvider>
      <FormulaProvider>
        <ErrorBoundary>
          <Shell />
        </ErrorBoundary>
      </FormulaProvider>
    </ToastProvider>
  );
}
