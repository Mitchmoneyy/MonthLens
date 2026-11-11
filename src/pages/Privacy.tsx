import { useState } from 'react';
import { ThemeToggle } from '../App';
import { Button } from '../components/ui';
import { availability, sendFeedback } from '../lib/cloud';
import { ISSUES_URL, SUPPORT_EMAIL } from '../lib/site';

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section className="border-t border-line pt-6" id={id}>
      <h2 className="text-2xl font-bold">{title}</h2>
      <div className="mt-3 space-y-3 text-[15.5px] leading-relaxed">{children}</div>
    </section>
  );
}

/** A note to the people who run MonthLens. Stored where only they can read it. */
function Feedback() {
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const canSend = availability() === 'ready';

  const fallback = (
    <p>
      {SUPPORT_EMAIL ? (
        <>
          Email <span className="select-all font-mono text-sm">{SUPPORT_EMAIL}</span>, or open
        </>
      ) : (
        'Open'
      )}{' '}
      an issue at{' '}
      <a href={ISSUES_URL} target="_blank" rel="noreferrer" className="break-all underline">
        {ISSUES_URL.replace('https://', '')}
      </a>
      .
    </p>
  );
  if (!canSend) return fallback;
  if (state === 'sent')
    return (
      <p role="status" className="border-l-2 border-ink pl-3 font-semibold" data-testid="feedback-sent">
        Sent. Thank you, every note gets read.
      </p>
    );
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (message.trim().length < 5) return;
        setState('sending');
        try {
          await sendFeedback(message, contact, location.hash.replace('#', '') || 'home');
          setState('sent');
        } catch {
          setState('failed');
        }
      }}
    >
      <label htmlFor="fb-message" className="block">
        <span className="text-sm font-medium">What’s working, what’s broken, what’s missing?</span>
        <textarea id="fb-message" required minLength={5} maxLength={4000} rows={4} value={message} onChange={(e) => setMessage(e.target.value)} className="mt-1 block w-full rounded-[3px] border border-line bg-surface p-3 text-base outline-none focus:border-ink" />
      </label>
      <label htmlFor="fb-contact" className="block">
        <span className="text-sm font-medium">Email, if you’d like a reply (optional)</span>
        <input id="fb-contact" type="email" maxLength={200} autoComplete="email" value={contact} onChange={(e) => setContact(e.target.value)} className="mt-1 block w-full rounded-[3px] border border-line bg-surface px-3 py-2.5 text-base outline-none focus:border-ink" />
      </label>
      <Button type="submit" id="fb-send" disabled={state === 'sending' || message.trim().length < 5}>
        {state === 'sending' ? 'Sending…' : 'Send feedback'}
      </Button>
      {state === 'failed' && (
        <div role="status" className="border-l-2 border-ink pl-3 text-sm">
          <p className="font-semibold">That didn’t send. Your note is still in the box above.</p>
          {fallback}
        </div>
      )}
      <p className="text-xs text-mute">Only your note, the optional email, and which page you were on are sent. None of your business numbers.</p>
    </form>
  );
}

export default function Privacy() {
  return (
    <div className="min-h-full">
      <header className="gutter mx-auto flex max-w-3xl items-center justify-between py-5">
        <a href="#home" className="display text-xl">
          Month<span className="font-normal italic">Lens</span>
        </a>
        <ThemeToggle />
      </header>
      <main className="gutter mx-auto max-w-3xl space-y-8 pb-20 pt-6">
        <div>
          <div className="eyebrow">Last updated November 11, 2026</div>
          <h1 className="display mt-2 text-4xl sm:text-5xl">Privacy, terms & support</h1>
          <p className="mt-4 text-lg text-mute">MonthLens is built so your business numbers stay with you. Short version: no ads, no tracking, no selling data, and the account is optional.</p>
        </div>

        <Section title="Without an account">
          <p>Everything you enter or import is stored only on your device (in the browser’s storage, or inside the app). It is not sent to us or anyone else.</p>
          <p>Screenshots, PDFs and files you import are read on your device. They are not uploaded.</p>
          <p>Share codes and share links contain the month’s numbers. They are only sent where you choose to send them.</p>
        </Section>

        <Section title="With an account">
          <p>If you create an account, we store your email address and a copy of what you’ve saved in MonthLens (your months, plans, scenarios and creators) so it can sync between your devices.</p>
          <p>This is stored with our database provider, Supabase. Each account can only read its own data.</p>
          <p>We use your email only to sign you in and to send account emails you ask for, such as confirmation and password reset links.</p>
        </Section>

        <Section title="What we don’t do">
          <ul className="list-disc space-y-1 pl-5">
            <li>No analytics, advertising or tracking tools.</li>
            <li>No selling or sharing your data.</li>
            <li>No reading your Stripe, Shopify, ad or social accounts. MonthLens only sees what you type, paste or import.</li>
          </ul>
        </Section>

        <Section title="The AI advisor">
          <p>On the website and in the app, advisor answers are worked out on your device from your numbers. When MonthLens runs inside Claude (claude.ai), questions you type in the advisor and that month’s numbers are sent to Claude to answer them.</p>
        </Section>

        <Section title="Deleting your data">
          <p>On this device: History → “Delete all my data from this browser”.</p>
          <p>Your account: Account → “Delete my account”. This removes your login and everything stored with it, immediately.</p>
        </Section>

        <Section title="Terms of use" id="terms">
          <p>
            <span className="font-semibold">MonthLens is a calculator, not an adviser.</span> Its figures, projections, rankings and benchmarks are estimates based on the numbers you give it. They are not financial, tax, accounting or legal advice. Check important decisions with a qualified professional.
          </p>
          <p>Results are only as accurate as what you enter or approve. Projections state their assumptions next to the number; real results will differ. Benchmarks are rough estimates, not industry data.</p>
          <p>MonthLens is provided as it is, without warranties. To the extent the law allows, we aren’t liable for losses that come from relying on it.</p>
          <p>Use it for your own business or your clients’, lawfully. Don’t try to break it, overload it, or access anyone else’s data.</p>
          <p>If these terms or the privacy details change, the date at the top of this page changes with them.</p>
        </Section>

        <Section title="Support & feedback" id="support">
          <Feedback />
        </Section>
      </main>
    </div>
  );
}
