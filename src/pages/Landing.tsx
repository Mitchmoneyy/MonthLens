import { useMemo, useState } from 'react';
import { PhotoStrip, photo } from '../components/PhotoStrip';
import { ScrollStory } from '../components/ScrollStory';
import { Button, CountUp, LensDial, Reveal, Slider } from '../components/ui';
import { ThemeToggle, go } from '../App';
import { applyScenario, computeReview, recommend } from '../lib/calc';
import { money, pct, ratio } from '../lib/format';
import { SAMPLES } from '../lib/samples';
import { useStore } from '../store';

const STRIP = [
  { src: photo('flatlay'), caption: 'E-commerce' },
  { src: photo('code'), caption: 'SaaS' },
  { src: photo('desk'), caption: 'Courses' },
  { src: photo('studio'), caption: 'Agencies' },
  { src: photo('cameras'), caption: 'Creators' },
  { src: photo('brand'), caption: 'Brand studios' },
  { src: photo('phone'), caption: 'Services' },
  { src: photo('print'), caption: 'Print shops' },
  { src: photo('tools'), caption: 'Makers' },
  { src: photo('device'), caption: 'Apps' },
  { src: photo('travel'), caption: 'Guides' },
  { src: photo('pencils'), caption: 'Stationery' },
];

function TryIt() {
  const [price, setPrice] = useState(0);
  const [pause, setPause] = useState(false);
  const base = SAMPLES.ecommerce;
  const r0 = useMemo(() => computeReview(base), [base]);
  const r = useMemo(() => computeReview(applyScenario(base, { pricePct: price / 100, cutFormats: pause ? ['Story / Reel'] : [] })), [base, price, pause]);
  const delta = (r.m.netProfit.value ?? 0) - (r0.m.netProfit.value ?? 0);
  return (
    <div className="grid gap-px overflow-hidden rounded-2xl border border-ink bg-ink md:grid-cols-[1.1fr_1fr]">
      <div className="bg-surface p-6 sm:p-8">
        <div className="eyebrow">Try it · sample e-commerce month</div>
        <h3 className="mt-2 text-2xl font-extrabold">Move a lever. Watch profit move.</h3>
        <div className="mt-6 space-y-6">
          <Slider id="try-price" big label="Change prices" value={price} min={-10} max={20} step={1} onChange={setPrice} display={`${price > 0 ? '+' : ''}${price}%`} />
          <label className="flex cursor-pointer items-start gap-3">
            <input id="try-pause" type="checkbox" checked={pause} onChange={(e) => setPause(e.target.checked)} className="mt-1 h-5 w-5 accent-current" />
            <span>
              <span className="font-medium">Pause Story / Reel ads</span>
              <span className="block text-sm text-mute">$700 spent, 2,600 clicks, 0 sales last month</span>
            </span>
          </label>
        </div>
      </div>
      <div className="flex flex-col justify-between gap-6 bg-inv p-6 text-invink sm:p-8">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-widest opacity-60">Monthly profit</div>
          <div className="display mt-1 text-5xl sm:text-6xl" data-testid="try-profit">
            <CountUp value={r.m.netProfit.value} format={(x) => money(x)} />
          </div>
          <div className="num mt-2 text-sm opacity-80">
            {delta === 0 ? 'Same as the sample month' : `${delta > 0 ? '+' : '−'}$${Math.abs(Math.round(delta)).toLocaleString()} vs. the sample month`}
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-3 border-t border-current/20 pt-4 text-sm">
          <div>
            <dt className="opacity-60">Margin</dt>
            <dd className="num">{pct(r.m.margin.value)}</dd>
          </div>
          <div>
            <dt className="opacity-60">ROAS</dt>
            <dd className="num">{ratio(r.m.mer.value)}</dd>
          </div>
          <div>
            <dt className="opacity-60">Ad spend</dt>
            <dd className="num">{money(r.m.adSpend.value)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function MiniFormats() {
  const r = computeReview(SAMPLES.ecommerce);
  const max = Math.max(...r.ads.formats.map((f) => Math.abs(f.profitAfterAdCost ?? 0)));
  return (
    <ul className="space-y-2">
      {r.ads.formats.slice(0, 5).map((f) => {
        const v = f.profitAfterAdCost ?? 0;
        return (
          <li key={f.format} className="grid grid-cols-[7.5rem_1fr] items-center gap-2 text-xs">
            <span className="truncate text-mute">{f.format}</span>
            <span className="relative h-3">
              <span className="absolute left-1/2 top-0 h-full w-px bg-line" />
              <span className={`absolute top-0 h-full ${v >= 0 ? 'left-1/2 bg-ink' : 'right-1/2 hatch border border-ink'}`} style={{ width: `${(Math.abs(v) / max) * 50}%` }} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default function Landing() {
  const onboarded = useStore((s) => s.profile.onboarded);
  const r = computeReview(SAMPLES.ecommerce);
  const recs = recommend(SAMPLES.ecommerce);
  return (
    <div className="min-h-full">
      <header className="gutter mx-auto flex max-w-6xl items-center justify-between py-5">
        <span className="display text-xl">
          Month<span className="font-normal" style={{ fontStretch: '75%' }}>Lens</span>
        </span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {onboarded && (
            <Button variant="secondary" onClick={() => go('overview')}>
              Open my review
            </Button>
          )}
        </div>
      </header>

      <section className="gutter mx-auto grid max-w-6xl items-center gap-10 pb-12 pt-4 md:grid-cols-[1.15fr_1fr] md:pt-10">
        <div className="rise">
          <div className="eyebrow">Monthly business review · for one-person businesses</div>
          <h1 className="display mt-4 text-[2.6rem] leading-[0.95] sm:text-6xl lg:text-7xl">
            Did you actually make money last month?
          </h1>
          <p className="mt-6 max-w-xl text-lg text-mute">
            Bring your Stripe, Shopify, PayPal and ad numbers. MonthLens shows where the money went, which ads paid for themselves, and the three changes worth making next month.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button id="cta-start" onClick={() => go('start')} className="px-7 py-3.5 text-base">
              Start in 60 seconds
            </Button>
            <Button variant="ghost" onClick={() => go('overview')}>
              See a sample review →
            </Button>
          </div>
          <p className="mt-6 font-mono text-xs text-mute">No account · Numbers stay in your browser · Works with screenshots</p>
        </div>
        <div className="relative">
          <img src={photo('typing')} alt="Hands typing on a laptop at a clean desk" className="photo aspect-[4/5] w-full max-w-full object-cover md:aspect-[4/5]" />
          <div className="absolute -bottom-6 left-4 right-4 border border-ink bg-surface p-4 sm:left-auto sm:right-[-12px] sm:w-72">
            <div className="flex items-center justify-between">
              <span className="eyebrow">Sample · October</span>
              <span className="font-mono text-[11px]">{r.health.verdict}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <div className="text-xs text-mute">Net profit</div>
                <div className="num text-xl font-semibold">
                  <CountUp value={r.m.netProfit.value} format={(x) => money(x)} />
                </div>
              </div>
              <div>
                <div className="text-xs text-mute">Margin</div>
                <div className="num text-xl font-semibold">{pct(r.m.margin.value)}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-12 border-y border-ink py-3" aria-label="Businesses MonthLens is built for">
        <PhotoStrip items={STRIP} height={200} />
      </section>

      <section aria-label="Where a month's revenue goes">
        <ScrollStory review={r} title={`Sample month · where ${money(r.m.revenue.value)} went`} />
      </section>

      <section className="gutter mx-auto max-w-6xl py-16 sm:py-24">
        <Reveal>
          <TryIt />
        </Reveal>
      </section>

      <section className="gutter mx-auto max-w-6xl pb-16 sm:pb-24">
        <Reveal>
          <h2 className="display max-w-3xl text-3xl sm:text-5xl">A CFO and an ad analyst, in one page a month.</h2>
        </Reveal>
        <div className="mt-10 grid gap-px border border-ink bg-ink md:grid-cols-3">
          <Reveal className="flex flex-col gap-4 bg-surface p-6">
            <div className="eyebrow">The breakdown</div>
            <div className="flex items-center gap-4">
              <LensDial score={r.health.score} size={110} />
              <p className="text-sm text-mute">Revenue, every cost as $ and % of revenue, profit per sale, cash runway and a 0–100 health score.</p>
            </div>
          </Reveal>
          <Reveal className="flex flex-col gap-4 bg-surface p-6" delay={80}>
            <div className="eyebrow">Ad formats</div>
            <MiniFormats />
            <p className="text-sm text-mute">Video, static, carousel, UGC, reels and search, ranked by profit after ad cost. Winners to scale, losers to pause.</p>
          </Reveal>
          <Reveal className="flex flex-col gap-4 bg-surface p-6" delay={160}>
            <div className="eyebrow">Next month</div>
            <ol className="space-y-2 text-sm">
              {recs.slice(0, 3).map((x, i) => (
                <li key={x.id} className="flex items-baseline justify-between gap-3 border-b border-line pb-2 last:border-0">
                  <span>
                    <span className="num mr-2 text-mute">{i + 1}</span>
                    {x.title}
                  </span>
                  <span className="num shrink-0 font-semibold">+{money(x.impact)}</span>
                </li>
              ))}
            </ol>
            <p className="text-sm text-mute">Ranked by dollars per month, with the math and the source numbers shown.</p>
          </Reveal>
        </div>
      </section>

      <section className="gutter mx-auto grid max-w-6xl items-center gap-10 pb-16 sm:pb-24 md:grid-cols-2">
        <Reveal>
          <img src={photo('desk')} alt="Open notebook, phone and laptop on a desk" className="photo aspect-[4/3] w-full max-w-full object-cover" />
        </Reveal>
        <Reveal>
          <h2 className="display text-3xl sm:text-4xl">Bring the numbers the way you have them.</h2>
          <ul className="mt-6 divide-y divide-line border-y border-line">
            {[
              ['Screenshots', 'Stripe, Shopify, Ads Manager, bank. Read in your browser. You approve every number.'],
              ['Exports', 'CSV, TSV, JSON, PDF. Messy headers are fine.'],
              ['Paste', 'Copy the dashboard, paste the text.'],
              ['8 questions', 'Plain-language prompts for whatever is still missing.'],
              ['Manual', 'Sliders and number fields for everything.'],
            ].map(([a, b]) => (
              <li key={a} className="grid grid-cols-[7rem_1fr] gap-4 py-3">
                <span className="font-semibold">{a}</span>
                <span className="text-mute">{b}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-mute">Missing numbers show as “Not provided”. MonthLens never fills them in for you.</p>
        </Reveal>
      </section>

      <section className="bg-inv text-invink">
        <div className="gutter mx-auto flex max-w-6xl flex-col items-start gap-6 py-16 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="display max-w-2xl text-3xl sm:text-5xl">Five clicks to last month, in plain English.</h2>
          <button id="cta-start-bottom" type="button" onClick={() => go('start')} className="rounded-full bg-invink px-7 py-3.5 text-base font-semibold text-inv transition hover:opacity-85">
            Start in 60 seconds
          </button>
        </div>
      </section>

      <footer className="gutter mx-auto flex max-w-6xl flex-wrap justify-between gap-3 py-8 text-xs text-mute">
        <span>Your data stays in this browser unless you share it.</span>
        <span>Photography: Start Bootstrap theme library (MIT), originally via Unsplash.</span>
      </footer>
    </div>
  );
}
