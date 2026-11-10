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
  creators: Creator[];
  saveCreator: (c: Creator) => void;
  removeCreator: (id: string) => void;
  clearSampleCreators: () => void;
  setProfile: (p: Partial<Profile>) => void;
  loadSample: (t: BusinessType) => void;
  startReal: () => void;
  setValue: (k: FieldKey, v: number | null, src?: Source) => void;
  setGoal: (g: number | null) => void;
  setMonth: (m: string) => void;
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

/** localStorage that never throws (private windows, blocked storage). */
const safeStorage = {
  getItem: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage full or blocked: keep working in memory */
    }
  },
  removeItem: (k: string) => {
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
      setMonth: (m) => set({ input: { ...get().input, month: m } }),
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
