import { ThemeToggle } from '../App';

const SUPPORT_URL = 'https://github.com/Mitchmoneyy/MonthLens/issues';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-6">
      <h2 className="text-2xl font-bold">{title}</h2>
      <div className="mt-3 space-y-3 text-[15.5px] leading-relaxed">{children}</div>
    </section>
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
          <div className="eyebrow">Last updated November 10, 2026</div>
          <h1 className="display mt-2 text-4xl sm:text-5xl">Privacy & support</h1>
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

        <Section title="Support">
          <p>Questions, problems or requests: open an issue at</p>
          <p className="select-all break-all font-mono text-sm">{SUPPORT_URL}</p>
          <a href={SUPPORT_URL} target="_blank" rel="noreferrer" className="inline-block rounded-[3px] bg-inv px-5 py-2.5 text-sm font-semibold text-invink">
            Get support
          </a>
        </Section>
      </main>
    </div>
  );
}
