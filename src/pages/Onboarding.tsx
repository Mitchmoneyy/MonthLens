import { useEffect, useRef, useState } from 'react';
import { go } from '../App';
import { photo } from '../components/PhotoStrip';
import { Button, NumberField, Slider } from '../components/ui';
import { BUSINESS_TYPES } from '../lib/fields';
import { money } from '../lib/format';
import { SAMPLES } from '../lib/samples';
import type { BusinessType } from '../lib/types';
import { useStore } from '../store';

const MONEY = ['Stripe', 'Shopify', 'PayPal', 'Bank', 'Other'];
const ADS = ['Meta', 'Google', 'TikTok', 'Pinterest', 'Snapchat', 'LinkedIn', 'Microsoft', 'Other', 'None yet'];

function Chip({ on, label, onClick, id }: { on: boolean; label: string; onClick: () => void; id: string }) {
  return (
    <button id={id} type="button" aria-pressed={on} onClick={onClick} className={`flex items-center justify-between gap-4 rounded-xl border px-5 py-4 text-left text-lg font-semibold transition ${on ? 'border-inv bg-inv text-invink' : 'border-line bg-surface hover:border-ink'}`}>
      {label}
      <span className={`flex h-6 w-6 items-center justify-center rounded-full border ${on ? 'border-invink' : 'border-line'}`} aria-hidden>
        {on && <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 6.5l2.5 2.5L10 3" fill="none" stroke="currentColor" strokeWidth="2" /></svg>}
      </span>
    </button>
  );
}

export default function Onboarding() {
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const loadSample = useStore((s) => s.loadSample);
  const [step, setStep] = useState(0);
  const [type, setType] = useState<BusinessType | null>(null);
  const [money_, setMoney] = useState<string[]>(profile.moneySources);
  const [ads, setAds] = useState<string[]>(profile.adPlatforms);
  const [goal, setGoal] = useState<number>(profile.goal);
  const [building, setBuilding] = useState(false);
  const t0 = useRef(Date.now());
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs(Math.floor((Date.now() - t0.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const toggle = (list: string[], v: string, set: (x: string[]) => void, exclusive?: string) => {
    if (v === exclusive) return set(list.includes(v) ? [] : [v]);
    const base = list.filter((x) => x !== exclusive);
    set(base.includes(v) ? base.filter((x) => x !== v) : [...base, v]);
  };

  const finish = () => {
    if (!type) return;
    setBuilding(true);
    setProfile({ businessType: type, moneySources: money_, adPlatforms: ads, goal, onboarded: true });
    loadSample(type);
    useStore.getState().setGoal(goal);
    setTimeout(() => go('overview'), 700);
  };

  const steps = ['Business', 'Money in', 'Ads', 'Goal'];
  const sample = type ? SAMPLES[type] : null;

  return (
    <div className="flex min-h-full flex-col">
      <header className="gutter mx-auto flex w-full max-w-5xl items-center justify-between gap-4 py-5">
        <a href="#home" className="display text-xl">
          Month<span className="font-normal" style={{ fontStretch: '75%' }}>Lens</span>
        </a>
        <div className="flex items-center gap-4">
          <span className="num text-xs text-mute" aria-label={`${secs} seconds so far`}>
            0:{String(Math.min(secs, 59)).padStart(2, '0')}
            {secs >= 60 ? '+' : ''} / 1:00
          </span>
          <a href="#overview" className="text-sm text-mute underline-offset-4 hover:underline">
            Skip
          </a>
        </div>
      </header>
      <div className="gutter mx-auto w-full max-w-5xl">
        <ol className="grid grid-cols-4 gap-2" aria-label="Progress">
          {steps.map((s, i) => (
            <li key={s}>
              <div className={`h-1 ${i <= step ? 'bg-ink' : 'bg-line'} transition-colors`} />
              <span className={`mt-2 block font-mono text-[11px] uppercase tracking-widest ${i === step ? 'text-ink' : 'text-faint'}`}>
                {i + 1}. {s}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <main className="gutter mx-auto w-full max-w-5xl flex-1 py-8 sm:py-12" key={step}>
        {building ? (
          <div className="rise py-20 text-center">
            <div className="scan mx-auto h-1 w-48" />
            <p className="display mt-6 text-3xl">Building your review…</p>
          </div>
        ) : step === 0 ? (
          <section className="rise">
            <h1 className="display text-3xl sm:text-5xl">What kind of business is it?</h1>
            <p className="mt-2 text-mute">We’ll tune the questions, benchmarks and sample month to it.</p>
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {BUSINESS_TYPES.map((b) => (
                <button
                  id={`type-${b.key}`}
                  key={b.key}
                  type="button"
                  aria-pressed={type === b.key}
                  onClick={() => {
                    setType(b.key);
                    setTimeout(() => setStep(1), 220);
                  }}
                  className={`group overflow-hidden rounded-xl border-2 bg-surface text-left transition ${type === b.key ? 'border-ink' : 'border-transparent hover:border-line'}`}
                >
                  <div className="aspect-[4/5] overflow-hidden">
                    <img src={photo(b.photo)} alt="" className="photo h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                  </div>
                  <div className="p-3">
                    <div className="font-semibold leading-tight">{b.label}</div>
                    <div className="mt-1 text-xs text-mute">{b.blurb}</div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : step === 1 ? (
          <section className="rise max-w-2xl">
            <h1 className="display text-3xl sm:text-5xl">Where does the money come in?</h1>
            <p className="mt-2 text-mute">Pick all that apply. You can import from any of them later.</p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {MONEY.map((m) => (
                <Chip id={`src-${m}`} key={m} label={m} on={money_.includes(m)} onClick={() => toggle(money_, m, setMoney)} />
              ))}
            </div>
          </section>
        ) : step === 2 ? (
          <section className="rise max-w-2xl">
            <h1 className="display text-3xl sm:text-5xl">Where do you run ads?</h1>
            <p className="mt-2 text-mute">We’ll compare ad formats across these.</p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {ADS.map((m) => (
                <Chip id={`ads-${m.replace(/\s/g, '')}`} key={m} label={m} on={ads.includes(m)} onClick={() => toggle(ads, m, setAds, 'None yet')} />
              ))}
            </div>
          </section>
        ) : (
          <section className="rise max-w-2xl">
            <h1 className="display text-3xl sm:text-5xl">What profit do you want each month?</h1>
            <p className="mt-2 text-mute">Profit after every cost, ads included. We track you against it.</p>
            <div className="display mt-10 text-6xl sm:text-7xl num">{money(goal)}</div>
            <div className="mt-6">
              <Slider id="goal-slider" big value={goal} min={0} max={100000} step={500} onChange={setGoal} />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {[3000, 5000, 10000, 15000, 25000, 50000].map((g) => (
                <button key={g} type="button" onClick={() => setGoal(g)} className={`rounded-full border px-3 py-1.5 font-mono text-xs ${goal === g ? 'border-inv bg-inv text-invink' : 'border-line hover:border-ink'}`}>
                  {money(g, { compact: true })}
                </button>
              ))}
              <NumberField id="goal-exact" value={goal} onChange={(v) => setGoal(v ?? 0)} prefix="$" className="w-36" />
            </div>
            {sample && <p className="mt-6 text-sm text-mute">Next you’ll see a sample {BUSINESS_TYPES.find((b) => b.key === type)?.label.toLowerCase()} month so you can see how the review reads. Swap in your numbers after.</p>}
          </section>
        )}
      </main>

      {!building && (
        <footer className="sticky bottom-0 border-t border-line bg-bg" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <div className="gutter mx-auto flex w-full max-w-5xl items-center justify-between py-4">
            <Button variant="ghost" onClick={() => (step === 0 ? go('home') : setStep(step - 1))}>
              ← Back
            </Button>
            {step < 3 ? (
              <Button id="onb-next" onClick={() => setStep(step + 1)} disabled={step === 0 && !type}>
                Continue
              </Button>
            ) : (
              <Button id="onb-finish" onClick={finish} disabled={!type}>
                Show my breakdown
              </Button>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}
