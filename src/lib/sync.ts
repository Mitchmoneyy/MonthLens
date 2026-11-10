/**
 * What an account syncs, and how two copies merge. Pure functions, unit-tested.
 *
 * Rules:
 * - Saved months: union of both sides. If both have the same month (same business type,
 *   sample or not), the one saved later wins. Nothing saved is ever dropped.
 * - Everything else (the month on screen, profile, plan ticks, scenarios, thumbnails):
 *   whichever side changed most recently wins as a whole.
 */
import type { Snapshot } from './types';

export interface SyncedData {
  profile: unknown;
  input: unknown;
  snapshots: Snapshot[];
  planDone: Record<string, boolean>;
  scenarioA: unknown;
  scenarioB: unknown;
  thumbs: Record<string, string>;
  creators?: unknown[];
  /** ms since epoch of the last local change */
  changedAt: number;
}

export const SYNCED_KEYS = ['profile', 'input', 'snapshots', 'planDone', 'scenarioA', 'scenarioB', 'thumbs', 'creators'] as const;

const snapKey = (s: Snapshot) => `${s.input.businessType}|${s.month}|${s.input.isSample ? 's' : 'r'}`;

export function mergeSnapshots(a: Snapshot[], b: Snapshot[]): Snapshot[] {
  const map = new Map<string, Snapshot>();
  for (const s of [...a, ...b]) {
    const k = snapKey(s);
    const cur = map.get(k);
    if (!cur || s.savedAt > cur.savedAt) map.set(k, s);
  }
  return [...map.values()].sort((x, y) => x.month.localeCompare(y.month));
}

type InputLike = { month?: string; isSample?: boolean; businessType?: string; values?: Record<string, unknown>; ads?: unknown[] };

/**
 * The working month of the side that lost "newest wins", as a saved month. Null when there is
 * nothing worth keeping: a sample, an empty month, or the same numbers the winner has.
 */
function conflictCopy(loser: SyncedData, winner: SyncedData): Snapshot | null {
  const li = loser.input as InputLike | null;
  if (!li || li.isSample || !li.month) return null;
  const hasData = Object.values(li.values ?? {}).some((v) => v != null) || (li.ads?.length ?? 0) > 0;
  if (!hasData || JSON.stringify(li) === JSON.stringify(winner.input)) return null;
  return { id: `conflict-${loser.changedAt}`, month: li.month, savedAt: new Date(loser.changedAt || 0).toISOString(), label: 'From your other device', input: li as Snapshot['input'] };
}

/**
 * Merge local and remote. Returns the merged data and which side's working state won.
 *
 * `base` is the change-time both sides agreed on at this device's last sync (undefined on its
 * first sync). A real conflict is when BOTH sides changed after that point; then the losing
 * side's working month is kept as a saved month. A device that is merely out of date loses nothing.
 */
export function mergeData(local: SyncedData, remote: SyncedData | null, base?: number): { data: SyncedData; winner: 'local' | 'remote' | 'merged' } {
  if (!remote) return { data: local, winner: 'local' };
  const newer = remote.changedAt > local.changedAt ? remote : local;
  const older = newer === remote ? local : remote;
  const bothChanged = base === undefined || (local.changedAt > base && remote.changedAt > base);
  const copy = bothChanged ? conflictCopy(older, newer) : null;
  const saved = mergeSnapshots(local.snapshots ?? [], remote.snapshots ?? []);
  const key = (s: Snapshot) => `${s.input.businessType}|${s.month}|${s.input.isSample ? 's' : 'r'}`;
  // an explicitly saved month always beats an automatic copy of the same month
  const snapshots = copy && !saved.some((s) => key(s) === key(copy)) ? mergeSnapshots(saved, [copy]) : saved;
  const sameSnaps = snapshots.length === (newer.snapshots ?? []).length;
  return {
    data: { ...newer, snapshots, changedAt: Math.max(local.changedAt, remote.changedAt) },
    winner: !sameSnaps ? 'merged' : newer === remote ? 'remote' : 'local',
  };
}

/** A blank browser (never onboarded, sample data, nothing saved) shouldn't overwrite an account. */
export function isPristine(d: SyncedData): boolean {
  const input = d.input as { isSample?: boolean } | null;
  const profile = d.profile as { onboarded?: boolean } | null;
  return !(d.snapshots?.length) && (!input || input.isSample === true) && !profile?.onboarded;
}
