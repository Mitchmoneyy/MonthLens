/**
 * Account state and cloud sync. Supabase loads only when someone has signed in on this
 * device before, arrives from an emailed link, or opens the Account tab.
 */
import { create } from 'zustand';
import { availability, client, deleteRemote, loadRemote, saveRemote, type CloudAvailability } from './lib/cloud';
import { isPristine, mergeData, SYNCED_KEYS, type SyncedData } from './lib/sync';
import { useStore } from './store';

export interface AccountState {
  availability: CloudAvailability;
  status: 'idle' | 'checking' | 'signedOut' | 'signedIn';
  email: string | null;
  userId: string | null;
  sync: 'idle' | 'syncing' | 'synced' | 'error';
  lastSynced: number | null;
  error: string | null;
  recovery: boolean;
}

export const useAccount = create<AccountState>(() => ({
  availability: availability(),
  status: 'idle',
  email: null,
  userId: null,
  sync: 'idle',
  lastSynced: null,
  error: null,
  recovery: false,
}));

let applying = false;
let started = false;
let pushTimer: number | undefined;

function localData(): SyncedData {
  const s = useStore.getState() as any;
  const out: any = { changedAt: s.changedAt ?? 0 };
  for (const k of SYNCED_KEYS) out[k] = s[k];
  return out;
}

function applyLocal(d: SyncedData) {
  applying = true;
  const patch: any = { changedAt: d.changedAt };
  for (const k of SYNCED_KEYS) if (k in d) patch[k] = (d as any)[k];
  useStore.setState(patch);
  applying = false;
}

async function push() {
  const { userId, status } = useAccount.getState();
  if (status !== 'signedIn' || !userId) return;
  useAccount.setState({ sync: 'syncing' });
  try {
    await saveRemote(userId, localData());
    useAccount.setState({ sync: 'synced', lastSynced: Date.now(), error: null });
  } catch (e: any) {
    useAccount.setState({ sync: 'error', error: e?.message ?? 'Could not save to your account.' });
  }
}

export async function syncNow() {
  const { userId } = useAccount.getState();
  if (!userId) return;
  useAccount.setState({ sync: 'syncing', error: null });
  try {
    const remote = await loadRemote(userId);
    const local = localData();
    if (remote && isPristine(local)) {
      applyLocal(remote);
    } else {
      const { data, winner } = mergeData(local, remote);
      if (winner !== 'local') applyLocal(data);
      if (winner !== 'remote' || !remote) await saveRemote(userId, data);
    }
    useAccount.setState({ sync: 'synced', lastSynced: Date.now() });
  } catch (e: any) {
    useAccount.setState({ sync: 'error', error: e?.message ?? 'Could not sync.' });
  }
}

export async function deleteCloudData() {
  const { userId } = useAccount.getState();
  if (!userId) return;
  await deleteRemote(userId);
  useAccount.setState({ lastSynced: null, sync: 'idle' });
}

/** Start auth + sync. Safe to call more than once. */
export async function startCloud() {
  if (started || availability() !== 'ready') return;
  started = true;
  useAccount.setState({ status: 'checking' });
  try {
    const sb = await client();
    const onSession = (session: any) => {
      const user = session?.user;
      const prev = useAccount.getState().userId;
      if (user) {
        useAccount.setState({ status: 'signedIn', email: user.email ?? null, userId: user.id });
        if (prev !== user.id) void syncNow();
      } else {
        useAccount.setState({ status: 'signedOut', email: null, userId: null, sync: 'idle', lastSynced: null });
      }
    };
    sb.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') useAccount.setState({ recovery: true });
      // defer: supabase warns against awaiting other calls inside this callback
      setTimeout(() => onSession(session), 0);
    });
    const { data } = await sb.auth.getSession();
    onSession(data.session);
  } catch (e: any) {
    started = false;
    useAccount.setState({ status: 'signedOut', error: e?.message ?? null });
  }
}

/** Boot: only load the account code if this device has a session or an emailed link brought us here. */
export function bootCloud() {
  if (availability() !== 'ready') return;
  let hasSession = false;
  try {
    hasSession = !!localStorage.getItem('monthlens.auth');
  } catch {
    /* storage blocked */
  }
  if (hasSession || /[?&]code=/.test(location.search) || location.hash === '#account') void startCloud();
}

// Mark local changes and push them shortly after, while signed in.
useStore.subscribe((s, prev) => {
  if (applying) return;
  const changed = SYNCED_KEYS.some((k) => (s as any)[k] !== (prev as any)[k]);
  if (!changed) return;
  useStore.setState({ changedAt: Date.now() } as any);
  if (useAccount.getState().status !== 'signedIn') return;
  window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(push, 1500);
});

if (typeof document !== 'undefined')
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && pushTimer) {
      window.clearTimeout(pushTimer);
      pushTimer = undefined;
      void push();
    }
  });
