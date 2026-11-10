import { describe, expect, it } from 'vitest';
import { makeBackup, parseBackup, storageUse } from '../backup';
import { SAMPLES } from '../samples';
import { SAMPLE_CREATORS } from '../creators';

const data: any = { profile: { onboarded: true }, input: SAMPLES.saas, snapshots: [{ id: 's1', month: '2026-09', savedAt: 'x', label: 'x', input: SAMPLES.saas }], planDone: { a: true }, scenarioA: null, scenarioB: null, thumbs: {}, creators: SAMPLE_CREATORS, changedAt: 5 };

describe('backup', () => {
  it('round-trips everything that syncs', () => {
    const back = parseBackup(makeBackup(data, new Date('2026-11-10T00:00:00Z')));
    expect(back.exportedAt).toBe('2026-11-10T00:00:00.000Z');
    expect(back.input).toEqual(SAMPLES.saas);
    expect(back.snapshots).toHaveLength(1);
    expect(back.creators).toHaveLength(3);
    expect(back.planDone).toEqual({ a: true });
  });
  it('refuses other files with a clear message, changing nothing', () => {
    expect(() => parseBackup('not json')).toThrow(/isn’t a MonthLens backup/);
    expect(() => parseBackup('{"hello":1}')).toThrow(/isn’t a MonthLens backup/);
    expect(() => parseBackup(JSON.stringify({ app: 'MonthLens', version: 1, data: { input: {} } }))).toThrow(/incomplete or damaged/);
    expect(() => parseBackup(JSON.stringify({ app: 'MonthLens', version: 99, data: data }))).toThrow(/newer version/);
  });
  it('reports storage use', () => {
    expect(storageUse(null).bytes).toBe(0);
    expect(storageUse('x'.repeat(2 * 1024 * 1024)).nearlyFull).toBe(true);
  });
});
