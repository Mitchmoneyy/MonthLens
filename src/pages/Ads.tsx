import { useState } from 'react';
import { go, useReviewData } from '../App';
import { Button, MetricValue, NumberField, Pill, Reveal, SectionTitle } from '../components/ui';
import type { FormatStats } from '../lib/calc';
import { count, money, pct, ratio } from '../lib/format';
import { uid } from '../lib/parse/common';
import { AD_FORMATS, type AdFormat, type AdPlatform, type AdRow } from '../lib/types';
import { useStore } from '../store';

type ChartKey = 'profit' | 'roas' | 'cpa' | 'ctr';
const CHARTS: { key: ChartKey; label: string; get: (f: FormatStats) => number | null; fmt: (x: number | null) => string; lowerBetter?: boolean }[] = [
  { key: 'profit', label: 'Profit after ad cost', get: (f) => f.profitAfterAdCost, fmt: (x) => money(x) },
  { key: 'roas', label: 'ROAS', get: (f) => f.roas, fmt: (x) => ratio(x) },
  { key: 'cpa', label: 'CPA', get: (f) => f.cpa, fmt: (x) => money(x), lowerBetter: true },
  { key: 'ctr', label: 'CTR', get: (f) => f.ctr, fmt: (x) => pct(x, 2) },
];

async function shrink(file: File): Promise<string> {
  const img = new Image();
  img.src = URL.createObjectURL(file);
  await img.decode();
  const s = 160 / Math.max(img.width, img.height);
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s);
  c.height = Math.round(img.height * s);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.72);
}

function Thumb({ format }: { format: AdFormat }) {
  const thumb = useStore((s) => s.thumbs[format]);
  const setThumb = useStore((s) => s.setThumb);
  const id = `thumb-${format.replace(/\W+/g, '')}`;
  return (
    <label htmlFor={id} className="group relative flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden border border-line bg-raised text-center text-[10px] leading-tight text-mute hover:border-ink" title="Add creative thumbnail">
      {thumb ? <img src={thumb} alt={`${format} creative`} className="h-full w-full object-cover" /> : <span>+ creative</span>}
      <input
        id={id}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) setThumb(format, await shrink(f));
        }}
      />
    </label>
  );
}

function Chart({ formats }: { formats: FormatStats[] }) {
  const [k, setK] = useState<ChartKey>('profit');
  const c = CHARTS.find((x) => x.key === k)!;
  const vals = formats.map((f) => ({ f, v: c.get(f) }));
  const max = Math.max(1e-9, ...vals.map((x) => Math.abs(x.v ?? 0)));
  const hasNeg = vals.some((x) => (x.v ?? 0) < 0);
  const sorted = [...vals].sort((a, b) => (c.lowerBetter ? (a.v ?? Infinity) - (b.v ?? Infinity) : (b.v ?? -Infinity) - (a.v ?? -Infinity)));
  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-1" role="tablist" aria-label="Compare by">
        {CHARTS.map((x) => (
          <button key={x.key} role="tab" aria-selected={k === x.key} onClick={() => setK(x.key)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${k === x.key ? 'border-inv bg-inv text-invink' : 'border-line hover:border-ink'}`}>
            {x.label}
          </button>
        ))}
      </div>
      <ul className="space-y-3">
        {sorted.map(({ f, v }) => {
          const w = v === null ? 0 : (Math.abs(v) / max) * (hasNeg ? 50 : 100);
          return (
            <li key={f.format} className="grid grid-cols-[minmax(0,8.5rem)_1fr_5.5rem] items-center gap-3 text-sm sm:grid-cols-[11rem_1fr_6rem]">
              <span className="truncate">{f.format}</span>
              <span className="relative h-6 bg-raised">
                {hasNeg && <span className="absolute left-1/2 top-[-4px] h-[calc(100%+8px)] w-px bg-ink" />}
                {v !== null && <span className={`absolute top-0 h-full transition-all duration-500 ${v >= 0 ? 'bg-ink' : 'hatch border border-ink'}`} style={hasNeg ? (v >= 0 ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }) : { left: 0, width: `${w}%` }} />}
              </span>
              <span className={`num text-right ${v === null ? 'text-faint' : v < 0 ? 'font-semibold' : ''}`}>{v === null ? 'n/a' : c.fmt(v)}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-mute">{k === 'profit' ? 'Solid = made money after product costs and ad spend. Hatched = lost money.' : c.lowerBetter ? 'Lower is better.' : 'Higher is better.'}</p>
    </div>
  );
}

function RowsEditor() {
  const ads = useStore((s) => s.input.ads);
  const setAds = useStore((s) => s.setAds);
  const upd = (id: string, patch: Partial<AdRow>) => setAds(ads.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="eyebrow text-left">
              {['Ad', 'Platform', 'Format', 'Spend', 'Impr.', 'Clicks', 'Conv.', 'Revenue', ''].map((h) => (
                <th key={h} className="pb-2 pr-2 font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ads.map((a) => (
              <tr key={a.id} className="border-t border-line">
                <td className="py-1.5 pr-2">
                  <input aria-label="Ad name" value={a.name} onChange={(e) => upd(a.id, { name: e.target.value })} className="w-full rounded border border-line bg-surface px-2 py-1.5" />
                </td>
                <td className="py-1.5 pr-2">
                  <select aria-label="Platform" value={a.platform} onChange={(e) => upd(a.id, { platform: e.target.value as AdPlatform })} className="rounded border border-line bg-surface px-1 py-1.5">
                    {['Meta', 'Google', 'TikTok', 'Other'].map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </td>
                <td className="py-1.5 pr-2">
                  <select aria-label="Format" value={a.format} onChange={(e) => upd(a.id, { format: e.target.value as AdFormat })} className="rounded border border-line bg-surface px-1 py-1.5">
                    {AD_FORMATS.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                </td>
                {(['spend', 'impressions', 'clicks', 'conversions', 'revenue'] as const).map((k) => (
                  <td key={k} className="w-24 py-1.5 pr-2">
                    <NumberField id={`ad-${a.id}-${k}`} value={a[k]} onChange={(v) => upd(a.id, { [k]: k === 'spend' ? v ?? 0 : v } as any)} placeholder="—" />
                  </td>
                ))}
                <td className="py-1.5">
                  <button type="button" onClick={() => setAds(ads.filter((x) => x.id !== a.id))} className="px-2 text-mute hover:text-ink" aria-label={`Remove ${a.name}`}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-mute">Editing ad rows doesn’t change your channel totals on the Import page. If they differ, ad spend uses the channel totals.</p>
    </div>
  );
}

export default function Ads() {
  const { review: r, input } = useReviewData();
  const setAds = useStore((s) => s.setAds);
  const [editing, setEditing] = useState(false);
  const thumbs = useStore((s) => s.thumbs);
  const a = r.ads;
  const addRow = () => {
    setAds([...input.ads, { id: uid('ad'), name: 'New ad', platform: 'Meta', format: 'Video', spend: 0, impressions: null, clicks: null, conversions: null, revenue: null }]);
    setEditing(true);
  };

  if (!a.formats.length)
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <div className="eyebrow">Ad formats</div>
        <h1 className="display mt-2 text-4xl">No ad data yet</h1>
        <p className="mt-3 text-mute">Upload an Ads Manager or Google Ads export or screenshot, or add rows by hand. Tag each ad as video, static, carousel, UGC, reel or search.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={addRow}>Add an ad row</Button>
          <Button variant="secondary" onClick={() => go('import')}>
            Import ad data
          </Button>
        </div>
      </div>
    );

  const scale = a.formats.filter((f) => a.scale.includes(f.format));
  const cut = a.formats.filter((f) => a.cut.includes(f.format) || (f.verdict === 'fix' && !a.cut.length));

  return (
    <div className="space-y-12 sm:space-y-16">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow">Ad format analysis</div>
            <h1 className="display mt-1 text-4xl sm:text-5xl">What worked, what didn’t</h1>
          </div>
          <Button id="add-ad-row" onClick={addRow}>
            Add an ad row
          </Button>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-px border border-ink bg-ink md:grid-cols-4">
          {[r.m.adSpend, r.m.mer, r.m.platformRoas, r.m.cac].map((m) => (
            <div key={m.key} className="bg-surface p-4">
              <div className="eyebrow">{m.label}</div>
              <MetricValue m={m} className="mt-2 text-2xl font-semibold" />
            </div>
          ))}
        </div>
        {a.spendMismatch !== null && Math.abs(a.spendMismatch) > 1 && (
          <p className="mt-2 text-xs text-mute">
            Your channel totals and your ad rows differ by <span className="num">{money(Math.abs(a.spendMismatch))}</span>. Format stats use the rows.
          </p>
        )}
      </section>

      <Reveal as="section" className="grid gap-6 md:grid-cols-2">
        <div className="border border-ink bg-surface p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold">Scale these</h2>
            <Pill solid>Top {scale.length}</Pill>
          </div>
          <ul className="mt-4 space-y-4">
            {scale.length ? (
              scale.map((f) => (
                <li key={f.format} className="flex gap-4">
                  <Thumb format={f.format} />
                  <div className="min-w-0">
                    <div className="font-semibold">{f.format}</div>
                    <div className="num text-sm text-mute">
                      {ratio(f.roas)} ROAS · {money(f.cpa)} CPA · {money(f.profitAfterAdCost)} profit
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {f.labels.map((l) => (
                        <Pill key={l}>{l}</Pill>
                      ))}
                    </div>
                  </div>
                </li>
              ))
            ) : (
              <li className="text-sm text-mute">No format made money after product costs this month.</li>
            )}
          </ul>
        </div>
        <div className="border border-dashed border-ink bg-surface p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold">Cut or fix these</h2>
            <Pill hatch>Bottom {cut.length}</Pill>
          </div>
          <ul className="mt-4 space-y-4">
            {cut.length ? (
              cut.map((f) => (
                <li key={f.format} className="flex gap-4">
                  <Thumb format={f.format} />
                  <div className="min-w-0">
                    <div className="font-semibold">{f.format}</div>
                    <div className="num text-sm text-mute">
                      {money(f.spend)} spent · {count(f.conversions)} sales · {money(f.profitAfterAdCost)}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {f.labels.map((l) => (
                        <Pill key={l} solid={l.startsWith('Money loser')}>
                          {l}
                        </Pill>
                      ))}
                    </div>
                  </div>
                </li>
              ))
            ) : (
              <li className="text-sm text-mute">Every format paid for itself. Nothing to cut.</li>
            )}
          </ul>
        </div>
      </Reveal>

      <Reveal as="section">
        <SectionTitle eyebrow="Visual comparison" title="Formats side by side" />
        <Chart formats={a.formats} />
      </Reveal>

      <Reveal as="section">
        <SectionTitle eyebrow={`Contribution rate ${pct(a.contributionRate)} · profit = revenue × rate − spend`} title="All formats" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm" data-testid="ads-table">
            <thead>
              <tr className="eyebrow text-right">
                <th className="pb-2 text-left font-normal">Format</th>
                {['Spend', 'Impr.', 'Clicks', 'CTR', 'CPC', 'Conv.', 'CPA', 'Revenue', 'ROAS', 'Profit after ads'].map((h) => (
                  <th key={h} className="pb-2 pl-3 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {a.formats.map((f) => (
                <tr key={f.format} className="border-t border-line align-top">
                  <td className="py-3 pr-3">
                    <div className="flex items-start gap-3">
                      {thumbs[f.format] ? <img src={thumbs[f.format]} alt="" className="h-10 w-10 object-cover" /> : null}
                      <div>
                        <div className="font-semibold">{f.format}</div>
                        <div className="text-xs text-mute">{f.platforms.join(', ')}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {f.labels.map((l) => (
                            <Pill key={l} solid={l === 'Best ROAS' || l.startsWith('Money loser')} hatch={l === 'Highest CTR but no sales'}>
                              {l}
                            </Pill>
                          ))}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="num py-3 pl-3 text-right">{money(f.spend)}</td>
                  <td className="num py-3 pl-3 text-right">{count(f.impressions)}</td>
                  <td className="num py-3 pl-3 text-right">{count(f.clicks)}</td>
                  <td className="num py-3 pl-3 text-right">{pct(f.ctr, 2)}</td>
                  <td className="num py-3 pl-3 text-right">{money(f.cpc, { cents: true })}</td>
                  <td className="num py-3 pl-3 text-right">{count(f.conversions)}</td>
                  <td className="num py-3 pl-3 text-right">{money(f.cpa, { cents: true })}</td>
                  <td className="num py-3 pl-3 text-right">{money(f.revenue)}</td>
                  <td className="num py-3 pl-3 text-right font-semibold">{ratio(f.roas)}</td>
                  <td className={`num py-3 pl-3 text-right font-semibold`}>{money(f.profitAfterAdCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-mute">“Not provided” appears where the export didn’t include a number. Revenue here is what the ad platforms reported, which often overlaps between platforms.</p>
      </Reveal>

      <Reveal as="section">
        <SectionTitle
          eyebrow="Raw data"
          title="Ad rows"
          right={
            <Button variant="secondary" onClick={() => setEditing(!editing)}>
              {editing ? 'Done editing' : `Edit ${input.ads.length} rows`}
            </Button>
          }
        />
        {editing ? <RowsEditor /> : <p className="text-sm text-mute">Change formats, fix numbers or remove rows. Every chart above updates as you type.</p>}
      </Reveal>
    </div>
  );
}
