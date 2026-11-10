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

/** Merge local and remote. Returns the merged data and which side's working state won. */
export function mergeData(local: SyncedData, remote: SyncedData | null): { data: SyncedData; winner: 'local' | 'remote' | 'merged' } {
  if (!remote) return { data: local, winner: 'local' };
  const newer = remote.changedAt > local.changedAt ? remote : local;
  const snapshots = mergeSnapshots(local.snapshots ?? [], remote.snapshots ?? []);
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
