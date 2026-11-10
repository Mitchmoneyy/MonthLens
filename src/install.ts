/**
 * Installable app: install prompt (Chrome/Edge/Android), manual steps (iPhone/iPad, Mac Safari),
 * offline service worker, update notice, and online/offline state.
 */
import { create } from 'zustand';
import { isNative } from './native';

type Platform = 'prompt' | 'ios' | 'mac-safari' | 'other';

interface InstallState {
  deferred: any | null;
  installed: boolean;
  online: boolean;
  updateReady: boolean;
  applyUpdate: (() => void) | null;
}

export const useInstall = create<InstallState>(() => ({
  deferred: null,
  installed: isStandalone(),
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  updateReady: false,
  applyUpdate: null,
}));

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (isNative()) return true;
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
}

export function installPlatform(): Platform {
  if (useInstall.getState().deferred) return 'prompt';
  const ua = navigator.userAgent;
  const iOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (iOS) return 'ios';
  if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua)) return 'mac-safari';
  return 'other';
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const d = useInstall.getState().deferred;
  if (!d) return 'unavailable';
  d.prompt();
  const choice = await d.userChoice.catch(() => ({ outcome: 'dismissed' }));
  useInstall.setState({ deferred: null });
  return choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
}

/** Call once, as early as possible: the install prompt event fires soon after load. */
export function bootInstall() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    useInstall.setState({ deferred: e });
  });
  window.addEventListener('appinstalled', () => useInstall.setState({ installed: true, deferred: null }));
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', () => useInstall.setState({ installed: isStandalone() }));
  window.addEventListener('online', () => useInstall.setState({ online: true }));
  window.addEventListener('offline', () => useInstall.setState({ online: false }));

  // Offline support. Not inside the claude.ai viewer (service workers aren't allowed there) or on file://.
  // (and not in the iPhone app, which ships its files inside the app)
  const allowed = !isNative() && 'serviceWorker' in navigator && !window.claude?.use && (location.protocol === 'https:' || location.hostname === 'localhost');
  if (!allowed) return;
  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      const update = registerSW({
        immediate: true,
        onNeedRefresh: () => useInstall.setState({ updateReady: true, applyUpdate: () => void update(true) }),
      });
    })
    .catch(() => {
      /* offline support is optional */
    });
}
