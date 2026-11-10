/**
 * Full backup: everything MonthLens keeps, in one file the owner controls.
 * Pure functions; the store does the reading and writing.
 */
import { SYNCED_KEYS, type SyncedData } from './sync';

export const BACKUP_VERSION = 1;

export function makeBackup(data: SyncedData, now = new Date()): string {
  const out: Record<string, unknown> = {};
  for (const k of SYNCED_KEYS) out[k] = (data as any)[k];
  return JSON.stringify({ app: 'MonthLens', version: BACKUP_VERSION, exportedAt: now.toISOString(), data: out }, null, 1);
}

/** Read a backup file. Throws a plain-language error if it isn't one. */
export function parseBackup(text: string): Partial<SyncedData> & { exportedAt: string } {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error('That file isn’t a MonthLens backup. Choose the .json file you downloaded from History.');
  }
  if (j?.app !== 'MonthLens' || !j.data) throw new Error('That file isn’t a MonthLens backup. Choose the .json file you downloaded from History.');
  if (j.version > BACKUP_VERSION) throw new Error('This backup was made by a newer version of MonthLens. Update the app, then try again.');
  const d = j.data;
  if (!d.input || typeof d.input.values !== 'object' || !Array.isArray(d.snapshots)) throw new Error('This backup is incomplete or damaged, so nothing was changed.');
  const out: any = { exportedAt: String(j.exportedAt ?? '') };
  for (const k of SYNCED_KEYS) if (d[k] !== undefined) out[k] = d[k];
  return out;
}

/** Browser storage is roughly 5 MB per site. Report how full MonthLens's share is. */
export function storageUse(json: string | null): { bytes: number; share: number; nearlyFull: boolean } {
  const bytes = json ? json.length * 2 : 0; // stored as UTF-16
  const share = bytes / (5 * 1024 * 1024);
  return { bytes, share, nearlyFull: share >= 0.7 };
}
