import { useEffect, useState } from 'react';
import { installPlatform, promptInstall, useInstall } from '../install';
import { Button, useDialog, useToast } from './ui';

const DISMISS_KEY = 'monthlens.installDismissed';
const dismissed = () => {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
};

/** Apple's Share icon, drawn so the steps match what's on screen. */
const ShareIcon = () => (
  <svg width="16" height="18" viewBox="0 0 16 20" className="inline-block align-[-3px]" aria-label="Share icon">
    <path d="M8 1v12M4 5l4-4 4 4M3 8H1v11h14V8h-2" fill="none" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

function Steps({ onClose }: { onClose: () => void }) {
  const ref = useDialog(onClose);
  const p = installPlatform();
  const steps =
    p === 'ios'
      ? [
          <>
            Tap the Share button <ShareIcon /> at the bottom of Safari (top right on iPad).
          </>,
          <>Scroll down and tap “Add to Home Screen”.</>,
          <>Tap “Add”. MonthLens opens full-screen from your home screen.</>,
        ]
      : p === 'mac-safari'
        ? [<>In the menu bar, choose File → Add to Dock.</>, <>Click “Add”. MonthLens opens in its own window from the Dock.</>]
        : [<>Open this page in Chrome or Edge (computer or Android) or Safari (iPhone, iPad, Mac).</>, <>Use the browser’s Install or Add to Home Screen option.</>];
  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label="Install MonthLens">
      <div ref={ref} tabIndex={-1} className="rise w-full max-w-md border border-line bg-surface p-6 outline-none" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom, 0px))' }} onClick={(e) => e.stopPropagation()}>
        <div className="eyebrow">Install</div>
        <h3 className="mt-1 text-2xl font-bold">Put MonthLens on your {p === 'mac-safari' ? 'Dock' : p === 'ios' ? 'home screen' : 'device'}</h3>
        <ol className="mt-4 space-y-3">
          {steps.map((s, i) => (
            <li key={i} className="grid grid-cols-[1.75rem_1fr] gap-2 text-sm">
              <span className="num flex h-6 w-6 items-center justify-center bg-inv text-xs text-invink">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-mute">It works offline, and your numbers stay on the device. Sign in to sync between your computer and phone.</p>
        <div className="mt-5 flex justify-end">
          <Button onClick={onClose}>Got it</Button>
        </div>
      </div>
    </div>
  );
}

/** "Install app" for the landing page and account page. Hidden once installed or where installing isn't possible. */
export function InstallButton({ variant = 'secondary', className = '' }: { variant?: 'primary' | 'secondary' | 'ghost'; className?: string }) {
  const installed = useInstall((s) => s.installed);
  useInstall((s) => s.deferred); // re-render when the prompt becomes available
  const [steps, setSteps] = useState(false);
  const toast = useToast();
  if (installed || typeof window === 'undefined' || window.claude?.use) return null;
  const p = installPlatform();
  return (
    <>
      <Button
        id="install-app"
        variant={variant}
        className={className}
        onClick={async () => {
          if (p === 'prompt') {
            const r = await promptInstall();
            if (r === 'accepted') toast('Installed. Find MonthLens with your other apps.');
          } else setSteps(true);
        }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
          <path d="M8 1v9M4 6l4 4 4-4M2 14h12" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
        Install the app
      </Button>
      {steps && <Steps onClose={() => setSteps(false)} />}
    </>
  );
}

/** One-time nudge on Overview. */
export function InstallBanner() {
  const installed = useInstall((s) => s.installed);
  const deferred = useInstall((s) => s.deferred);
  const [hidden, setHidden] = useState(dismissed);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 1200);
    return () => clearTimeout(t);
  }, []);
  if (!ready || hidden || installed || window.claude?.use) return null;
  const p = installPlatform();
  if (p === 'other' && !deferred) return null;
  const close = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* fine */
    }
    setHidden(true);
  };
  return (
    <div className="rise mb-6 flex flex-col gap-3 border border-ink bg-surface p-4 sm:flex-row sm:items-center sm:justify-between" data-testid="install-banner">
      <div className="flex items-center gap-3">
        <img src="./icons/icon-192.png" alt="" className="h-11 w-11 shrink-0" />
        <div>
          <div className="font-semibold">Install MonthLens on this {/Mobi|iPhone|Android/.test(navigator.userAgent) ? 'phone' : 'computer'}</div>
          <div className="text-sm text-mute">Opens like an app, works offline, numbers stay on the device.</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <InstallButton variant="primary" />
        <button type="button" onClick={close} className="px-2 text-sm text-mute hover:text-ink">
          Not now
        </button>
      </div>
    </div>
  );
}

/** Shown when a new version has downloaded in the background. */
export function UpdateBanner() {
  const ready = useInstall((s) => s.updateReady);
  const apply = useInstall((s) => s.applyUpdate);
  if (!ready || !apply) return null;
  return (
    <div className="gutter border-b border-line bg-raised py-2 text-sm" role="status">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <span>A new version of MonthLens is ready.</span>
        <button type="button" onClick={apply} className="rounded-[3px] bg-inv px-3 py-1 text-xs font-semibold text-invink">
          Update now
        </button>
      </div>
    </div>
  );
}
