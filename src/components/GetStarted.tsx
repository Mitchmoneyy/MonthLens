import { go } from '../App';
import { FIELDS } from '../lib/fields';
import { nav, useStore } from '../store';
import { Button } from './ui';

const WAYS: { tab: string; title: string; body: string; action: string }[] = [
  { tab: 'screenshot', title: 'Screenshots', body: 'Snap your Stripe, Shopify or Ads Manager dashboard. It’s read on this device.', action: 'Add screenshots' },
  { tab: 'file', title: 'Exports', body: 'Drop CSV or PDF exports. Messy headers are fine, and you see a preview first.', action: 'Add files' },
  { tab: 'questions', title: '8 questions', body: 'No files handy? Answer a few plain questions and get a first read in two minutes.', action: 'Answer questions' },
];

/** First screen for a real month with nothing in it yet. */
export function GetStarted({ month, filled }: { month: string; filled: number }) {
  const profile = useStore((s) => s.profile);
  const loadSample = useStore((s) => s.loadSample);
  const open = (tab: string) => {
    nav.importTab = tab;
    go('import');
  };
  return (
    <div className="space-y-10" data-testid="get-started">
      <div>
        <div className="eyebrow">Your numbers · {month}</div>
        <h1 className="display mt-1 text-4xl sm:text-6xl">Let’s get {month.split(' ')[0]} on the page.</h1>
        <p className="mt-3 max-w-xl text-lg text-mute">Start with revenue. As soon as that’s in, your breakdown appears here and fills out as you add the rest.</p>
      </div>
      <div className="grid gap-px border border-ink bg-ink md:grid-cols-3">
        {WAYS.map((w, i) => (
          <div key={w.tab} className="flex flex-col justify-between gap-5 bg-surface p-5 sm:p-6">
            <div>
              <h2 className="text-2xl font-bold">{w.title}</h2>
              <p className="mt-2 text-sm text-mute">{w.body}</p>
            </div>
            <Button id={`start-${w.tab}`} variant={i === 0 ? 'primary' : 'secondary'} onClick={() => open(w.tab)} className="self-start">
              {w.action}
            </Button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-sm">
        <span className="text-mute">
          <span className="num font-semibold text-ink">
            {filled} of {FIELDS.length}
          </span>{' '}
          numbers in so far. Prefer typing?{' '}
          <button type="button" onClick={() => open('manual')} className="underline underline-offset-2 hover:text-ink">
            Enter them by hand
          </button>
          .
        </span>
        <button type="button" onClick={() => loadSample(profile.businessType)} className="text-mute underline underline-offset-2 hover:text-ink">
          Look at the sample month instead
        </button>
      </div>
    </div>
  );
}
