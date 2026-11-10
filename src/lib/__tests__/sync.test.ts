import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isPristine, mergeData, mergeSnapshots, type SyncedData } from '../sync';
import { SAMPLES } from '../samples';
import type { Snapshot } from '../types';

const snap = (month: string, savedAt: string, label = 'x', isSample = false): Snapshot => ({ id: month + savedAt, month, savedAt, label, input: { ...SAMPLES.ecommerce, month, isSample } });
const data0 = (over: Partial<SyncedData>): SyncedData => ({ profile: { onboarded: true }, input: { ...SAMPLES.ecommerce, isSample: false }, snapshots: [], planDone: {}, scenarioA: null, scenarioB: null, thumbs: {}, changedAt: 0, ...over });

const data = data0;

describe('merge rules', () => {
  it('keeps every saved month from both sides; newer save wins a clash', () => {
    const m = mergeSnapshots([snap('2026-08', '2026-09-01'), snap('2026-09', '2026-10-01', 'old')], [snap('2026-09', '2026-10-05', 'new'), snap('2026-10', '2026-11-01')]);
    expect(m.map((s) => s.month)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(m[1].label).toBe('new');
  });
  it('newest working state wins, snapshots are unioned', () => {
    const local = data({ changedAt: 100, planDone: { a: true }, snapshots: [snap('2026-08', '1')] });
    const remote = data({ changedAt: 200, planDone: { b: true }, snapshots: [snap('2026-09', '1')] });
    const { data: d, winner } = mergeData(local, remote);
    expect(d.planDone).toEqual({ b: true });
    expect(d.snapshots).toHaveLength(2);
    expect(winner).toBe('merged');
    expect(d.changedAt).toBe(200);
  });
  it('two devices edited since the last sync: the losing working month is kept as a saved month', () => {
    const mine = { ...SAMPLES.ecommerce, isSample: false, month: '2026-10', values: { grossRevenue: 111 } };
    const theirs = { ...SAMPLES.ecommerce, isSample: false, month: '2026-10', values: { grossRevenue: 999 } };
    const { data } = mergeData(data0({ changedAt: 150, input: mine }), data0({ changedAt: 200, input: theirs }), 100);
    expect((data.input as any).values.grossRevenue).toBe(999);
    const kept = data.snapshots.find((s) => s.label === 'From your other device');
    expect(kept?.input.values.grossRevenue).toBe(111);
  });
  it('a device that is only out of date creates no copy', () => {
    const stale = { ...SAMPLES.ecommerce, isSample: false, values: { grossRevenue: 111 } };
    const fresh = { ...SAMPLES.ecommerce, isSample: false, values: { grossRevenue: 999 } };
    const { data } = mergeData(data0({ changedAt: 100, input: stale }), data0({ changedAt: 200, input: fresh }), 100);
    expect(data.snapshots).toHaveLength(0);
  });
  it('no remote: local stands', () => expect(mergeData(data({ changedAt: 5 }), null).winner).toBe('local'));
  it('a fresh browser is pristine; one with real numbers is not', () => {
    expect(isPristine(data({ profile: { onboarded: false }, input: SAMPLES.ecommerce }))).toBe(true);
    expect(isPristine(data({}))).toBe(false);
  });
});

// ---- sync engine against a fake account server
const server = new Map<string, SyncedData>();
vi.mock('../cloud', () => ({
  availability: () => 'ready',
  client: async () => ({
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'a@b.co' } } } }),
    },
  }),
  loadRemote: async (id: string) => server.get(id) ?? null,
  saveRemote: async (id: string, d: SyncedData) => void server.set(id, JSON.parse(JSON.stringify(d))),
}));

describe('sync engine', () => {
  beforeEach(() => server.clear());
  it('signing in on a fresh device pulls the account; signing in with data pushes it', async () => {
    vi.stubGlobal('window', { clearTimeout, setTimeout });
    const { useStore } = await import('../../store');
    const { startCloud, useAccount, syncNow } = await import('../../account');
    server.set('u1', data({ changedAt: Date.now() + 1000, snapshots: [snap('2026-07', '2026-08-01', 'from phone')] }));
    await startCloud();
    await new Promise((r) => setTimeout(r, 10));
    expect(useAccount.getState().status).toBe('signedIn');
    expect(useStore.getState().snapshots.map((s) => s.label)).toEqual(['from phone']);

    // a local change is saved back after the debounce
    useStore.getState().saveSnapshot('from laptop');
    await syncNow();
    expect(server.get('u1')!.snapshots.map((s) => s.label).sort()).toEqual(['from laptop', 'from phone']);
    vi.unstubAllGlobals();
  });
});
