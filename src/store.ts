import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AdRow, BusinessType, FieldKey, MonthInput, NamedAmount, Scenario, Snapshot, Source } from './lib/types';
import type { Candidate } from './lib/parse/common';
import { SAMPLES, blankMonth, samplePriorMonths } from './lib/samples';
import { uid } from './lib/parse/common';
import { SAMPLE_CREATORS, type Creator } from './lib/creators';

export interface Profile {
  businessType: BusinessType;
  moneySources: string[];
  adPlatforms: string[];
  goal: number;
  onboarded: boolean;
}

export interface ChatMsg {
  role: 'user' | 'assistant';
  text: string;
  sources?: { label: string; value: string }[];
  via?: 'claude' | 'local';
}

interface State {
  profile: Profile;
  input: MonthInput;
  snapshots: Snapshot[];
  planDone: Record<string, boolean>;
  whatIf: Scenario;
  scenarioA: { name: string; s: Scenario } | null;
  scenarioB: { name: string; s: Scenario } | null;
  theme: 'system' | 'light' | 'dark';
  chat: ChatMsg[];
  thumbs: Partial<Record<string, string>>;
  /** last time synced data changed on this device (ms) */
  changedAt: number;
  /** change-time this device and the account agreed on at the last sync; undefined before the first */
  syncBase?: number;
  creators: Creator[];
  saveCreator: (c: Creator) => void;
  removeCreator: (id: string) => void;
  clearSampleCreators: () => void;
  setProfile: (p: Partial<Profile>) => void;
  loadSample: (t: BusinessType) => void;
  startReal: () => void;
  setValue: (k: FieldKey, v: number | null, src?: Source) => void;
  setGoal: (g: number | null) => void;
  /** Open another month: load it if saved, otherwise start it blank. The month being left is auto-saved. */
  openMonth: (m: string) => { result: 'same' | 'relabelled' | 'opened' | 'started'; autoSaved: boolean };
  restoreBackup: (d: Partial<State>) => void;
  setBusinessType: (t: BusinessType) => void;
  setAds: (ads: AdRow[]) => void;
  setProducts: (p: NamedAmount[]) => void;
  applyCandidates: (c: Candidate[]) => void;
  replaceInput: (i: MonthInput) => void;
  setChannels: (c: NamedAmount[]) => void;
  resetAll: () => void;
  saveSnapshot: (label?: string) => Snapshot;
  deleteSnapshot: (id: string) => void;
  openSnapshot: (id: string) => void;
  togglePlan: (id: string) => void;
  setWhatIf: (s: Scenario) => void;
  saveScenario: (slot: 'A' | 'B', name: string) => void;
  setTheme: (t: State['theme']) => void;
  pushChat: (m: ChatMsg) => void;
  clearChat: () => void;
  setThumb: (format: string, dataUrl: string | null) => void;
}

/**
 * localStorage that never throws (private windows, blocked storage) and doesn't write on every
 * slider tick: writes are batched a moment later and flushed when the page is hidden or closed.
 */
const pending = new Map<string, string>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;
function flushStorage() {
  clearTimeout(flushTimer);
  flushTimer = undefined;
  for (const [k, v] of pending) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage full or blocked: keep working in memory */
    }
  }
  pending.clear();
}
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('pagehide', flushStorage);
  window.addEventListener('beforeunload', flushStorage);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushStorage());
}
const safeStorage = {
  getItem: (k: string) => {
    if (pending.has(k)) return pending.get(k) as string;
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k: string, v: string) => {
    pending.set(k, v);
    if (!flushTimer) flushTimer = setTimeout(flushStorage, 250);
  },
  removeItem: (k: string) => {
    pending.delete(k);
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

function lastMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      profile: { businessType: 'ecommerce', moneySources: ['Stripe', 'Shopify'], adPlatforms: ['Meta', 'Google'], goal: 15000, onboarded: false },
      input: SAMPLES.ecommerce,
      snapshots: [],
      planDone: {},
      whatIf: {},
      scenarioA: null,
      scenarioB: null,
      theme: 'system',
      chat: [],
      thumbs: {},
      changedAt: 0,
      creators: SAMPLE_CREATORS,
      saveCreator: (c) => {
        const list = get().creators;
        set({ creators: list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? c : x)) : [...list, c] });
      },
      removeCreator: (id) => set({ creators: get().creators.filter((x) => x.id !== id) }),
      clearSampleCreators: () => set({ creators: get().creators.filter((x) => !x.isSample) }),
      setProfile: (p) => set({ profile: { ...get().profile, ...p } }),
      loadSample: (t) => set({ input: { ...SAMPLES[t], goal: get().profile.goal ?? SAMPLES[t].goal }, whatIf: {}, chat: [] }),
      startReal: () => {
        const p = get().profile;
        set({ input: blankMonth(p.businessType, lastMonth(), p.goal), whatIf: {}, chat: [], planDone: {} });
      },
      setValue: (k, v, src = 'manual') => {
        const i = get().input;
        set({ input: { ...i, isSample: false, values: { ...i.values, [k]: v }, sources: { ...i.sources, [k]: src } } });
      },
      setGoal: (g) => {
        set({ input: { ...get().input, goal: g } });
        if (g !== null) set({ profile: { ...get().profile, goal: g } });
      },
      openMonth: (m) => {
        const cur = get().input;
        if (m === cur.month) return { result: 'same', autoSaved: false };
        // the sample is a demo, not a record: just show it under the chosen month
        if (cur.isSample) {
          set({ input: { ...cur, month: m } });
          return { result: 'relabelled', autoSaved: false };
        }
        const hasData = Object.values(cur.values).some((v) => v != null) || cur.ads.length > 0 || cur.products.length > 0 || cur.channels.length > 0;
        if (hasData) get().saveSnapshot('Auto-saved');
        const saved = get().snapshots.find((s) => s.month === m && !s.input.isSample && s.input.businessType === cur.businessType);
        set({ input: saved ? JSON.parse(JSON.stringify(saved.input)) : blankMonth(cur.businessType, m, cur.goal), whatIf: {}, chat: [] });
        return { result: saved ? 'opened' : 'started', autoSaved: hasData };
      },
      restoreBackup: (d) => {
        const keep: any = {};
        for (const k of ['profile', 'input', 'snapshots', 'planDone', 'scenarioA', 'scenarioB', 'thumbs', 'creators'] as const) if (d[k] !== undefined) keep[k] = d[k];
        set({ ...keep, whatIf: {}, chat: [] });
      },
      setBusinessType: (t) => set({ profile: { ...get().profile, businessType: t }, input: { ...get().input, businessType: t } }),
      setAds: (ads) => set({ input: { ...get().input, ads } }),
      setProducts: (products) => set({ input: { ...get().input, products } }),
      applyCandidates: (cands) => {
        const cur = get().input;
        const p = get().profile;
        // never mix imported numbers into sample numbers
        const i = cur.isSample ? blankMonth(cur.businessType, lastMonth(), cur.goal ?? p.goal) : cur;
        const values = { ...i.values };
        const sources = { ...i.sources };
        let ads = [...i.ads];
        const products = [...i.products];
        for (const c of cands) {
          if (c.kind === 'field') {
            values[c.field] = c.value;
            sources[c.field] = c.source;
          } else if (c.kind === 'ad') {
            ads = ads.filter((a) => a.id !== c.row.id);
            ads.push({ ...c.row });
          } else if (c.kind === 'product') {
            const at = products.findIndex((p) => p.name === c.name);
            if (at >= 0) products[at] = { name: c.name, amount: c.value };
            else products.push({ name: c.name, amount: c.value });
          }
        }
        set({ input: { ...i, values, sources, ads, products, isSample: false } });
      },
      replaceInput: (input) => set({ input, whatIf: {}, chat: [] }),
      setChannels: (channels) => set({ input: { ...get().input, channels } }),
      resetAll: () => {
        safeStorage.removeItem('monthlens.v1');
        set({
          profile: { businessType: 'ecommerce', moneySources: ['Stripe', 'Shopify'], adPlatforms: ['Meta', 'Google'], goal: 15000, onboarded: false },
          input: SAMPLES.ecommerce,
          snapshots: [],
          planDone: {},
          whatIf: {},
          scenarioA: null,
          scenarioB: null,
          chat: [],
          thumbs: {},
          creators: SAMPLE_CREATORS,
        });
      },
      saveSnapshot: (label) => {
        const i = get().input;
        const snap: Snapshot = { id: uid('s'), month: i.month, savedAt: new Date().toISOString(), label: label ?? (i.isSample ? 'Sample month' : 'My numbers'), input: JSON.parse(JSON.stringify(i)) };
        set({ snapshots: [...get().snapshots.filter((s) => !(s.month === i.month && s.input.isSample === i.isSample && s.input.businessType === i.businessType)), snap].sort((a, b) => a.month.localeCompare(b.month)) });
        return snap;
      },
      deleteSnapshot: (id) => set({ snapshots: get().snapshots.filter((s) => s.id !== id) }),
      openSnapshot: (id) => {
        const s = get().snapshots.find((x) => x.id === id);
        if (s) set({ input: JSON.parse(JSON.stringify(s.input)), whatIf: {}, chat: [] });
      },
      togglePlan: (id) => set({ planDone: { ...get().planDone, [id]: !get().planDone[id] } }),
      setWhatIf: (whatIf) => set({ whatIf }),
      saveScenario: (slot, name) => set(slot === 'A' ? { scenarioA: { name, s: get().whatIf } } : { scenarioB: { name, s: get().whatIf } }),
      setTheme: (theme) => set({ theme }),
      pushChat: (m) => set({ chat: [...get().chat, m].slice(-40) }),
      clearChat: () => set({ chat: [] }),
      setThumb: (format, dataUrl) => {
        const t = { ...get().thumbs };
        if (dataUrl) t[format] = dataUrl;
        else delete t[format];
        set({ thumbs: t });
      },
    }),
    { name: 'monthlens.v1', storage: createJSONStorage(() => safeStorage), version: 1 },
  ),
);

/** Last month's input for trends: the latest saved snapshot before this month, or the sample's built-in history. */
export function previousInput(input: MonthInput, snapshots: Snapshot[]): MonthInput | null {
  const earlier = snapshots.filter((s) => s.month < input.month && s.input.businessType === input.businessType && s.input.isSample === input.isSample);
  if (earlier.length) return earlier[earlier.length - 1].input;
  if (input.isSample) return samplePriorMonths(input.businessType).slice(-1)[0];
  return null;
}

/** Series for sparklines: prior months + this month. */
export function seriesInputs(input: MonthInput, snapshots: Snapshot[]): MonthInput[] {
  const earlier = snapshots.filter((s) => s.month < input.month && s.input.businessType === input.businessType && s.input.isSample === input.isSample).map((s) => s.input);
  if (earlier.length) return [...earlier.slice(-5), input];
  if (input.isSample) return [...samplePriorMonths(input.businessType), input];
  return [input];
}

/** One-shot hand-off between pages (which Import tab to open). */
export const nav: { importTab: string | null } = { importTab: null };
