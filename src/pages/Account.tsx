import { useEffect, useState } from 'react';
import { deleteCloudData, startCloud, syncNow, useAccount } from '../account';
import { Button, useToast } from '../components/ui';
import { friendly, sendMagicLink, sendReset, setPassword, signIn, signOut, signUp, WEB_APP_URL } from '../lib/cloud';
import { monthName } from '../lib/calc';
import { useStore } from '../store';

type Mode = 'create' | 'signin' | 'link' | 'reset';

function Field({ id, label, type, value, onChange, autoComplete, hint }: { id: string; label: string; type: string; value: string; onChange: (v: string) => void; autoComplete: string; hint?: string }) {
  return (
    <label htmlFor={id} className="block">
      <span className="text-sm font-medium">{label}</span>
      <input id={id} type={type} value={value} autoComplete={autoComplete} required onChange={(e) => onChange(e.target.value)} className="mt-1 block w-full rounded-[3px] border border-line bg-surface px-3 py-2.5 text-base outline-none focus:border-ink" />
      {hint && <span className="mt-1 block text-xs text-mute">{hint}</span>}
    </label>
  );
}

const ago = (t: number | null) => {
  if (!t) return 'not yet';
  const s = Math.round((Date.now() - t) / 1000);
  return s < 10 ? 'just now' : s < 60 ? `${s} seconds ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : new Date(t).toLocaleString();
};

function SignedOut() {
  const [mode, setMode] = useState<Mode>('create');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (mode === 'create') {
        if (pw.length < 8) throw new Error('Password should be at least 8 characters');
        const { needsConfirm } = await signUp(email.trim(), pw);
        setMsg(needsConfirm ? { ok: true, text: `Check ${email.trim()} for a confirmation link. Open it on this device to finish.` } : { ok: true, text: 'Account created. Your data is syncing.' });
      } else if (mode === 'signin') {
        await signIn(email.trim(), pw);
      } else if (mode === 'link') {
        await sendMagicLink(email.trim());
        setMsg({ ok: true, text: `Sign-in link sent to ${email.trim()}. Open it on this device.` });
      } else {
        await sendReset(email.trim());
        setMsg({ ok: true, text: `If there’s an account for ${email.trim()}, a reset link is on its way.` });
      }
    } catch (err) {
      setMsg({ ok: false, text: friendly(err) });
    } finally {
      setBusy(false);
    }
  };

  const titles: Record<Mode, string> = { create: 'Create your account', signin: 'Sign in', link: 'Email me a sign-in link', reset: 'Reset your password' };
  const actions: Record<Mode, string> = { create: 'Create account', signin: 'Sign in', link: 'Send link', reset: 'Send reset link' };
  const needsPw = mode === 'create' || mode === 'signin';

  return (
    <div className="grid gap-px border border-ink bg-ink md:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col justify-between gap-6 bg-inv p-6 text-invink sm:p-8">
        <div>
          <h2 className="text-3xl font-bold">Your months, on every device.</h2>
          <ul className="mt-6 space-y-3 text-sm opacity-85">
            <li>Saved months, plans and settings sync between your computer and phone.</li>
            <li>What’s in this browser now comes with you when you sign up.</li>
            <li>Only you can read your data. No one else, including other accounts, can see it.</li>
          </ul>
        </div>
        <p className="text-xs opacity-60">An account is optional. Everything works without one; your numbers just stay in this browser.</p>
      </div>
      <form onSubmit={submit} className="space-y-5 bg-surface p-6 sm:p-8" noValidate={false}>
        <div className="flex gap-4 border-b border-line" role="tablist">
          {(['create', 'signin'] as Mode[]).map((m) => (
            <button key={m} type="button" role="tab" id={`acct-tab-${m}`} aria-selected={mode === m} onClick={() => (setMode(m), setMsg(null))} className={`-mb-px border-b-2 pb-2 text-sm ${mode === m ? 'border-ink font-semibold' : 'border-transparent text-mute'}`}>
              {m === 'create' ? 'Create account' : 'Sign in'}
            </button>
          ))}
        </div>
        <h3 className="text-xl font-bold">{titles[mode]}</h3>
        <Field id="acct-email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
        {needsPw && <Field id="acct-password" label="Password" type="password" value={pw} onChange={setPw} autoComplete={mode === 'create' ? 'new-password' : 'current-password'} hint={mode === 'create' ? 'At least 8 characters.' : undefined} />}
        {msg && (
          <p role="status" className={`border-l-2 pl-3 text-sm ${msg.ok ? 'border-ink' : 'border-ink font-semibold'}`}>
            {msg.text}
          </p>
        )}
        <Button type="submit" id="acct-submit" disabled={busy || !email || (needsPw && !pw)} className="w-full">
          {busy ? 'One moment…' : actions[mode]}
        </Button>
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          {mode !== 'link' ? (
            <button type="button" onClick={() => (setMode('link'), setMsg(null))} className="text-mute underline-offset-4 hover:text-ink hover:underline">
              Email me a sign-in link instead
            </button>
          ) : (
            <button type="button" onClick={() => (setMode('signin'), setMsg(null))} className="text-mute underline-offset-4 hover:text-ink hover:underline">
              Use a password instead
            </button>
          )}
          {mode === 'signin' && (
            <button type="button" onClick={() => (setMode('reset'), setMsg(null))} className="text-mute underline-offset-4 hover:text-ink hover:underline">
              Forgot password?
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function NewPassword() {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();
  return (
    <form
      className="max-w-md space-y-4 border border-ink bg-surface p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          if (pw.length < 8) throw new Error('Password should be at least 8 characters');
          await setPassword(pw);
          useAccount.setState({ recovery: false });
          toast('Password updated');
        } catch (x) {
          setErr(friendly(x));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="text-2xl font-bold">Choose a new password</h2>
      <Field id="acct-new-password" label="New password" type="password" value={pw} onChange={setPw} autoComplete="new-password" hint="At least 8 characters." />
      {err && <p className="text-sm font-semibold">{err}</p>}
      <Button type="submit" disabled={busy || !pw}>
        {busy ? 'Saving…' : 'Save password'}
      </Button>
    </form>
  );
}

function SignedIn() {
  const a = useAccount();
  const snapshots = useStore((s) => s.snapshots);
  const input = useStore((s) => s.input);
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 15000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="space-y-8">
      <div className="grid gap-px border border-ink bg-ink md:grid-cols-3">
        <div className="bg-surface p-5">
          <div className="eyebrow">Signed in as</div>
          <div className="mt-1 break-all font-semibold" data-testid="acct-email">
            {a.email}
          </div>
        </div>
        <div className="bg-surface p-5">
          <div className="eyebrow">Sync</div>
          <div className="mt-1 font-semibold" aria-live="polite">
            {a.sync === 'syncing' ? 'Syncing…' : a.sync === 'error' ? 'Not synced' : `Synced ${ago(a.lastSynced)}`}
          </div>
          {a.sync === 'error' && a.error && <div className="mt-1 text-xs">{a.error}</div>}
        </div>
        <div className="bg-surface p-5">
          <div className="eyebrow">In your account</div>
          <div className="mt-1 font-semibold">
            {snapshots.length} saved month{snapshots.length === 1 ? '' : 's'} · {monthName(input.month)} open
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button id="acct-sync" onClick={() => syncNow().then(() => toast('Synced'))} disabled={a.sync === 'syncing'}>
          Sync now
        </Button>
        <Button
          id="acct-signout"
          variant="secondary"
          onClick={async () => {
            await signOut();
            toast('Signed out. Your numbers are still in this browser.');
          }}
        >
          Sign out
        </Button>
      </div>
      <p className="text-sm text-mute">Changes save to your account a moment after you make them. Sign in on your phone with the same email to pick up where you left off.</p>
      <div className="border-t border-line pt-4 text-sm">
        {confirm ? (
          <span className="flex flex-wrap items-center gap-2">
            <span>Delete everything stored in your account? This browser keeps its copy.</span>
            <button
              type="button"
              onClick={async () => {
                try {
                  await deleteCloudData();
                  toast('Cloud copy deleted');
                } catch (x) {
                  toast(friendly(x));
                }
                setConfirm(false);
              }}
              className="rounded-[3px] bg-inv px-3 py-1 text-invink"
            >
              Delete cloud copy
            </button>
            <button type="button" onClick={() => setConfirm(false)} className="underline">
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirm(true)} className="text-mute underline underline-offset-2 hover:text-ink">
            Delete the data stored in my account
          </button>
        )}
      </div>
    </div>
  );
}

export default function Account() {
  const a = useAccount();
  useEffect(() => {
    void startCloud();
  }, []);
  return (
    <div className="space-y-8">
      <div>
        <div className="eyebrow">Optional</div>
        <h1 className="display mt-1 text-4xl sm:text-5xl">Account</h1>
      </div>
      {a.availability === 'viewer' ? (
        <div className="max-w-xl border border-ink bg-surface p-6">
          <p className="font-semibold">Accounts work on the MonthLens web app.</p>
          <p className="mt-2 text-sm text-mute">This copy runs inside Claude, which keeps it from connecting to the account server. Open the web app to create an account or sign in:</p>
          <p className="mt-3 select-all break-all font-mono text-sm">{WEB_APP_URL}</p>
          <a href={WEB_APP_URL + '#account'} target="_blank" rel="noreferrer" className="mt-4 inline-block rounded-[3px] bg-inv px-5 py-2.5 text-sm font-semibold text-invink">
            Open the web app
          </a>
        </div>
      ) : a.availability === 'not-configured' ? (
        <div className="max-w-xl border border-dashed border-ink bg-surface p-6" data-testid="acct-not-configured">
          <p className="font-semibold">Accounts aren’t switched on for this copy yet.</p>
          <p className="mt-2 text-sm text-mute">Everything else works, and your numbers are saved in this browser. Once the account server is connected, you’ll be able to sign up here and sync between devices.</p>
        </div>
      ) : a.recovery && a.status === 'signedIn' ? (
        <NewPassword />
      ) : a.status === 'signedIn' ? (
        <SignedIn />
      ) : a.status === 'signedOut' ? (
        <SignedOut />
      ) : (
        <div className="scan h-1 max-w-md" aria-label="Checking your account" />
      )}
    </div>
  );
}
