import { useEffect, useMemo, useState } from 'react';
import { useStore, previousInput, seriesInputs } from './store';
import { computeReview, computeReviewWithPrev, monthName, projectPlan, recommend } from './lib/calc';
import { money, pct } from './lib/format';
import { CountUp, FormulaProvider, ToastProvider, useToast, Button } from './components/ui';
import Landing from './pages/Landing';
import Onboarding from './pages/Onboarding';
import Overview from './pages/Overview';
import Import from './pages/Import';
import Ads from './pages/Ads';
import Advisor from './pages/Advisor';
import History from './pages/History';
import { decodeShare } from './lib/share';
import type { MonthInput } from './lib/types';
import { BUSINESS_TYPES } from './lib/fields';

export type Route = 'home' | 'start' | 'overview' | 'import' | 'ads' | 'advisor' | 'history';
const APP_TABS: { key: Route; label: string; short: string }[] = [
  { key: 'overview', label: 'Overview', short: 'Overview' },
  { key: 'import', label: 'Import', short: 'Import' },
  { key: 'ads', label: 'Ads', short: 'Ads' },
  { key: 'advisor', label: 'Next month', short: 'Plan' },
  { key: 'history', label: 'History', short: 'History' },
];

function readRoute(): { route: Route; share: string | null } {
  const h = location.hash.replace(/^#/, '');
  if (h.startsWith('share-')) return { route: 'overview', share: h.slice(6) };
  const r = (['home', 'start', 'overview', 'import', 'ads', 'advisor', 'history'] as Route[]).find((x) => x === h);
  return { route: r ?? 'home', share: null };
}

export function go(route: Route) {
  if (location.hash !== '#' + route) location.hash = route;
  window.scrollTo({ top: 0 });
}

/** Everything derived from the current month. All pages read from here. */
export function useReviewData() {
  const input = useStore((s) => s.input);
  const snapshots = useStore((s) => s.snapshots);
  return useMemo(() => {
    const prev = previousInput(input, snapshots);
    const review = computeReviewWithPrev(input, prev);
    const prevReview = prev ? computeReview(prev) : null;
    const series = seriesInputs(input, snapshots).map((i) => computeReview(i));
    const recs = recommend(input);
    const projected = projectPlan(input, recs.slice(0, 3));
    return { input, review, prev, prevReview, series, recs, projected };
  }, [input, snapshots]);
}

function useTheme() {
  const theme = useStore((s) => s.theme);
  useEffect(() => {
    const el = document.documentElement;
    if (theme === 'system') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', theme);
  }, [theme]);
}

export function ThemeToggle() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const next = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
  return (
    <button type="button" onClick={() => setTheme(next)} className="flex h-9 items-center gap-1.5 rounded-full border border-current/30 px-3 font-mono text-[11px] uppercase tracking-wider opacity-80 hover:opacity-100" aria-label={`Theme: ${theme}. Switch to ${next}.`} title={`Theme: ${theme}`}>
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
  const setMonth = useStore((s) => s.setMonth);
  const p = review.m.netProfit.value;
  return (
    <header className="sticky z-50 bg-inv text-invink" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
      <div className="gutter mx-auto flex max-w-6xl items-center gap-3 py-2.5 sm:gap-6">
        <a href="#home" className="display shrink-0 text-lg leading-none" aria-label="MonthLens home">
          Month<span className="font-normal" style={{ fontStretch: '75%' }}>Lens</span>
        </a>
        <label className="hidden items-center gap-2 md:flex">
          <span className="sr-only">Month</span>
          <input id="month-picker" type="month" value={input.month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="rounded-md border border-current/25 bg-transparent px-2 py-1 font-mono text-xs" style={{ colorScheme: 'inherit' }} />
        </label>
        <div className="ml-auto flex min-w-0 items-baseline gap-2 sm:gap-3" data-testid="sticky-profit">
          <span className="font-mono text-[10px] uppercase tracking-widest opacity-60">Profit</span>
          <span className="display text-xl sm:text-2xl">{p === null ? <span className="text-sm font-normal opacity-60">Not provided</span> : <CountUp value={p} format={(x) => money(x)} />}</span>
          <span className="hidden font-mono text-xs opacity-70 sm:inline">{pct(review.m.margin.value)}</span>
        </div>
        <div className="hidden items-center gap-2 lg:flex">
          <span className="rounded-full border border-current/40 px-2 py-0.5 font-mono text-[11px]">{review.health.score ?? '—'}</span>
          <span className="max-w-[12rem] truncate text-xs opacity-80">{review.health.verdict}</span>
        </div>
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
      <div className="grid grid-cols-5">
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

function Shell() {
  useTheme();
  const [{ route, share }, setR] = useState(readRoute);
  useEffect(() => {
    const on = () => setR(readRoute());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {
    const titles: Record<Route, string> = { home: 'MonthLens', start: 'Set up · MonthLens', overview: 'Overview · MonthLens', import: 'Import · MonthLens', ads: 'Ads · MonthLens', advisor: 'Next month · MonthLens', history: 'History · MonthLens' };
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
  if (route === 'start') return <Onboarding />;
  return (
    <div className="min-h-full pb-24 sm:pb-12">
      <SummaryBar route={route} />
      <main className="gutter mx-auto max-w-6xl pt-6 sm:pt-8" key={route}>
        {route === 'overview' && <Overview />}
        {route === 'import' && <Import />}
        {route === 'ads' && <Ads />}
        {route === 'advisor' && <Advisor />}
        {route === 'history' && <History />}
      </main>
      <BottomNav route={route} />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <FormulaProvider>
        <Shell />
      </FormulaProvider>
    </ToastProvider>
  );
}
