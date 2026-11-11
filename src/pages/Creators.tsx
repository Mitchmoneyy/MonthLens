import { useMemo, useState } from 'react';
import { useReviewData } from '../App';
import { Button, NumberField, Pill, Reveal, SectionTitle, useToast, tabKeys } from '../components/ui';
import { CREATOR_PLATFORMS, creatorInsights, creatorStats, newCreator, newPost, postsFromCsv, readProfileText, rosterLabels, type Creator, type CreatorPlatform, type CreatorPost, type CreatorStats } from '../lib/creators';
import { count, money, pct, ratio } from '../lib/format';
import { useStore } from '../store';

const compact = (x: number | null) => (x === null ? '—' : x >= 1e6 ? (x / 1e6).toFixed(1) + 'M' : x >= 1e4 ? Math.round(x / 1e3) + 'K' : x >= 1e3 ? (x / 1e3).toFixed(1) + 'K' : String(Math.round(x)));

type Metric = 'median' | 'avg' | 'engagement' | 'cpm';
const METRICS: { key: Metric; label: string; get: (s: CreatorStats) => number | null; fmt: (x: number | null) => string; low?: boolean }[] = [
  { key: 'median', label: 'Typical views', get: (s) => s.medianViews, fmt: compact },
  { key: 'avg', label: 'Average views', get: (s) => s.avgViews, fmt: compact },
  { key: 'engagement', label: 'Engagement', get: (s) => s.engagement, fmt: (x) => pct(x) },
  { key: 'cpm', label: 'Cost per 1K views', get: (s) => s.costPer1k, fmt: (x) => (x === null ? '—' : money(x, { cents: true })), low: true },
];

// ---------------------------------------------------------------- scan (screenshot / export / paste)

type Found = { kind: 'followers' | 'profilePosts' | 'handle' | 'platform'; value: string | number; on: boolean } | { kind: 'post'; post: CreatorPost; on: boolean };

function Scan({ creator, onApply }: { creator: Creator; onApply: (c: Creator, n: number) => void }) {
  const [tab, setTab] = useState<'shot' | 'file' | 'paste'>('shot');
  const [busy, setBusy] = useState<string | null>(null);
  const [found, setFound] = useState<Found[] | null>(null);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const fromText = (t: string) => {
    const r = readProfileText(t);
    const f: Found[] = [];
    if (r.platform && r.platform !== creator.platform) f.push({ kind: 'platform', value: r.platform, on: true });
    if (r.handle && r.handle !== creator.handle) f.push({ kind: 'handle', value: r.handle, on: true });
    if (r.followers !== null) f.push({ kind: 'followers', value: r.followers, on: true });
    if (r.profilePosts !== null) f.push({ kind: 'profilePosts', value: r.profilePosts, on: true });
    r.gridViews.forEach((v, i) => f.push({ kind: 'post', post: newPost({ title: `Post ${i + 1} from grid`, views: v }), on: true }));
    const csvPosts = postsFromCsv(t);
    csvPosts.forEach((p) => f.push({ kind: 'post', post: p, on: true }));
    return f;
  };

  const run = async (files: File[]) => {
    setErr(null);
    const f = files[0];
    if (!f) return;
    try {
      if (f.type.startsWith('image/')) {
        setBusy('Reading screenshot…');
        const { ocrImage } = await import('../lib/parse/ocr');
        const t = await ocrImage(f, (p) => setBusy(`Reading screenshot… ${Math.round(p * 100)}%`));
        const res = fromText(t);
        setFound(res);
        if (!res.length) setErr('Nothing readable found. Try a sharper screenshot of the profile header or the post grid.');
      } else {
        setBusy('Reading file…');
        const posts = postsFromCsv(await f.text());
        setFound(posts.map((p) => ({ kind: 'post', post: p, on: true })));
        if (!posts.length) setErr('No views column found. Export posts with a views (or plays) column.');
      }
    } catch {
      setErr('That file couldn’t be read here. Try a different screenshot or paste the text instead.');
    } finally {
      setBusy(null);
    }
  };

  const apply = () => {
    if (!found) return;
    const c: Creator = { ...creator, posts: [...creator.posts] };
    let n = 0;
    for (const x of found) {
      if (!x.on) continue;
      n++;
      if (x.kind === 'post') c.posts.push(x.post);
      else if (x.kind === 'followers') c.followers = x.value as number;
      else if (x.kind === 'profilePosts') c.profilePosts = x.value as number;
      else if (x.kind === 'handle') c.handle = x.value as string;
      else if (x.kind === 'platform') c.platform = x.value as CreatorPlatform;
    }
    onApply({ ...c, isSample: false }, n);
    setFound(null);
    setText('');
  };

  const labels: Record<string, string> = { followers: 'Followers', profilePosts: 'Posts on profile', handle: 'Handle', platform: 'Platform' };
  return (
    <div className="border border-line bg-surface">
      <div className="flex gap-4 border-b border-line px-4" role="tablist" onKeyDown={tabKeys}>
        {(
          [
            ['shot', 'Screenshot'],
            ['file', 'Post export'],
            ['paste', 'Paste text'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`-mb-px border-b-2 py-3 text-sm ${tab === k ? 'border-ink font-semibold' : 'border-transparent text-mute'}`}>
            {l}
          </button>
        ))}
      </div>
      <div className="p-4">
        {tab === 'paste' ? (
          <div>
            <textarea id="creator-paste" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={'@maya.makes\n48.2K Followers · 212 posts\n18.4K\n9,108\n142K'} className="w-full rounded-[3px] border border-line bg-bg p-3 font-mono text-xs outline-none focus:border-ink" />
            <Button className="mt-2" variant="secondary" disabled={!text.trim()} onClick={() => setFound(fromText(text))}>
              Read it
            </Button>
          </div>
        ) : (
          <label htmlFor={`scan-${tab}`} className="flex cursor-pointer flex-col items-center gap-1 border-2 border-dashed border-line px-4 py-8 text-center hover:border-ink">
            <span className="font-semibold">{tab === 'shot' ? 'Drop a profile or analytics screenshot' : 'Drop a CSV of their posts'}</span>
            <span className="text-xs text-mute">{tab === 'shot' ? 'Followers, post count, handle, and the view counts on their post grid are read on this device.' : 'TikTok, Instagram or YouTube analytics exports, or any sheet with a views column.'}</span>
            <input id={`scan-${tab}`} type="file" className="sr-only" accept={tab === 'shot' ? 'image/*' : '.csv,.tsv,.txt,text/csv'} onChange={(e) => e.target.files && run([...e.target.files])} />
          </label>
        )}
        {busy && <p className="mt-3 font-mono text-xs text-mute">{busy}</p>}
        {err && <p className="mt-3 text-sm">{err}</p>}
        {found && found.length > 0 && (
          <div className="mt-4" data-testid="creator-found">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">Found {found.length} — untick anything that’s wrong</span>
              <button type="button" onClick={() => setFound(found.map((x) => ({ ...x, on: !found.every((y) => y.on) })))} className="text-xs underline">
                {found.every((y) => y.on) ? 'Untick all' : 'Tick all'}
              </button>
            </div>
            <ul className="mt-2 max-h-64 divide-y divide-line overflow-y-auto border-y border-line">
              {found.map((x, i) => (
                <li key={i}>
                  <label className="flex cursor-pointer items-center gap-3 py-2 text-sm">
                    <input type="checkbox" checked={x.on} onChange={() => setFound(found.map((y, j) => (j === i ? { ...y, on: !y.on } : y)))} className="h-4 w-4 accent-current" />
                    {x.kind === 'post' ? (
                      <span className="flex min-w-0 flex-1 justify-between gap-2">
                        <span className="truncate">{x.post.title || 'Post'}</span>
                        <span className="num shrink-0">{count(x.post.views)} views</span>
                      </span>
                    ) : (
                      <span className="flex flex-1 justify-between gap-2">
                        <span>{labels[x.kind]}</span>
                        <span className="num">{typeof x.value === 'number' ? count(x.value) : x.value}</span>
                      </span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
            <Button id="creator-apply" className="mt-3" onClick={apply} disabled={!found.some((x) => x.on)}>
              Add {found.filter((x) => x.on).length} to {creator.name || 'this creator'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- one creator

function EditCreator({ c, onSave, onCancel }: { c: Creator; onSave: (c: Creator) => void; onCancel?: () => void }) {
  const [d, setD] = useState<Creator>(c);
  return (
    <form
      className="grid gap-4 border border-ink bg-surface p-5 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...d, handle: d.handle.replace(/^@/, '').trim(), name: d.name.trim() || d.handle.replace(/^@/, '') || 'Creator', isSample: false });
      }}
    >
      <label className="block text-sm">
        <span className="font-medium">Name</span>
        <input id="cr-name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} className="mt-1 block w-full rounded-[3px] border border-line bg-bg px-3 py-2" placeholder="Maya" />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Handle</span>
        <input id="cr-handle" value={d.handle} onChange={(e) => setD({ ...d, handle: e.target.value })} className="mt-1 block w-full rounded-[3px] border border-line bg-bg px-3 py-2" placeholder="@maya.makes" />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Platform</span>
        <select id="cr-platform" value={d.platform} onChange={(e) => setD({ ...d, platform: e.target.value as CreatorPlatform })} className="mt-1 block w-full rounded-[3px] border border-line bg-bg px-3 py-2">
          {CREATOR_PLATFORMS.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="font-medium">Profile link (optional)</span>
        <input id="cr-url" value={d.profileUrl ?? ''} onChange={(e) => setD({ ...d, profileUrl: e.target.value || null })} className="mt-1 block w-full rounded-[3px] border border-line bg-bg px-3 py-2" placeholder="https://www.tiktok.com/@…" />
      </label>
      <div className="text-sm">
        <span className="font-medium">Followers</span>
        <NumberField id="cr-followers" value={d.followers} onChange={(v) => setD({ ...d, followers: v })} className="mt-1" />
      </div>
      <div className="text-sm">
        <span className="font-medium">What you pay them</span>
        <div className="mt-1 flex gap-2">
          <NumberField id="cr-pay" value={d.pay.amount} onChange={(v) => setD({ ...d, pay: { ...d.pay, amount: v } })} prefix="$" className="flex-1" />
          <select aria-label="Pay basis" value={d.pay.type} onChange={(e) => setD({ ...d, pay: { ...d.pay, type: e.target.value as Creator['pay']['type'] } })} className="rounded-[3px] border border-line bg-bg px-2">
            <option>per post</option>
            <option>per month</option>
          </select>
        </div>
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" id="cr-save">
          Save creator
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

function ViewsChart({ posts, best, onPick, picked }: { posts: CreatorPost[]; best: CreatorPost | null; onPick: (id: string) => void; picked: string | null }) {
  const list = [...posts].filter((p) => p.views !== null).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  if (list.length < 2) return null;
  const max = Math.max(...list.map((p) => p.views!));
  const avg = list.reduce((s, p) => s + p.views!, 0) / list.length;
  return (
    <div>
      <div className="relative flex h-40 items-end gap-1 border-b border-ink" role="group" aria-label="Views per post. Each bar is a post.">
        <div className="absolute inset-x-0 border-t border-dashed border-ink/60" style={{ bottom: `${(avg / max) * 100}%` }}>
          <span className="absolute -top-4 right-0 font-mono text-[10px] text-mute">avg {compact(avg)}</span>
        </div>
        {list.map((p) => (
          <button key={p.id} type="button" onClick={() => onPick(p.id)} title={`${p.title || 'Post'}: ${count(p.views)} views`} className={`relative min-w-[6px] flex-1 transition-opacity ${p.id === best?.id ? 'bg-ink' : 'bg-faint'} ${picked && picked !== p.id ? 'opacity-40' : ''}`} style={{ height: `${Math.max(2, (p.views! / max) * 100)}%` }}>
            <span className="sr-only">{p.title}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-mute">Each bar is a post, oldest first. Black is the best one. Tap a bar to find it in the list.</p>
    </div>
  );
}

function CreatorDetail({ c, labels }: { c: Creator; labels: string[] }) {
  const save = useStore((s) => s.saveCreator);
  const remove = useStore((s) => s.removeCreator);
  const toast = useToast();
  const [editing, setEditing] = useState(!c.name);
  const [confirm, setConfirm] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [showPosts, setShowPosts] = useState(false);
  const s = useMemo(() => creatorStats(c), [c]);
  const insights = creatorInsights(c, s);
  const upd = (id: string, patch: Partial<CreatorPost>) => save({ ...c, isSample: false, posts: c.posts.map((p) => (p.id === id ? { ...p, ...patch } : p)) });

  if (editing) return <EditCreator c={c} onSave={(x) => (save(x), setEditing(false))} onCancel={c.name ? () => setEditing(false) : undefined} />;

  const tiles: [string, string][] = [
    ['Posts tracked', `${s.posts}${c.profilePosts ? ` of ${count(c.profilePosts)}` : ''}`],
    ['Typical views', compact(s.medianViews)],
    ['Average views', compact(s.avgViews)],
    ['Engagement', pct(s.engagement)],
    ['Cost / 1K views', s.costPer1k === null ? '—' : money(s.costPer1k, { cents: true })],
    ['Reach of followers', s.reach === null ? '—' : pct(s.reach, 0)],
  ];

  return (
    <div className="space-y-6" data-testid="creator-detail">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-3xl font-bold">{c.name}</h2>
            {c.isSample && <Pill solid>Sample</Pill>}
            {labels.map((l) => (
              <Pill key={l}>{l}</Pill>
            ))}
          </div>
          <p className="mt-1 text-sm text-mute">
            {c.handle ? `@${c.handle}` : 'No handle'} · {c.platform} · {c.followers === null ? 'followers not provided' : `${compact(c.followers)} followers`} · {c.pay.amount === null ? 'pay not set' : `${money(c.pay.amount)} ${c.pay.type}`}
            {c.profileUrl && (
              <>
                {' · '}
                <a href={c.profileUrl} target="_blank" rel="noreferrer" className="underline">
                  profile
                </a>
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Edit
          </Button>
          {confirm ? (
            <Button onClick={() => (remove(c.id), toast(`Removed ${c.name}`))}>Confirm remove</Button>
          ) : (
            <Button variant="ghost" onClick={() => setConfirm(true)}>
              Remove
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px border border-ink bg-ink sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map(([k, v]) => (
          <div key={k} className="bg-surface p-4">
            <div className="eyebrow">{k}</div>
            <div className="num mt-1 text-xl font-semibold">{v}</div>
          </div>
        ))}
      </div>

      {s.withViews > 0 ? (
        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <ViewsChart posts={c.posts} best={s.best} picked={picked} onPick={(id) => (setPicked(picked === id ? null : id), setShowPosts(true))} />
          <div className="space-y-4">
            {s.best && (
              <div className="border border-ink bg-inv p-4 text-invink">
                <div className="font-mono text-[11px] uppercase tracking-widest opacity-60">Best post</div>
                <div className="mt-1 font-semibold">{s.best.title || 'Untitled post'}</div>
                <div className="num mt-1 text-2xl">{count(s.best.views)} views</div>
                <div className="num mt-1 text-xs opacity-70">
                  {s.best.date ?? 'no date'} · {count(s.best.likes)} likes · {count(s.best.comments)} comments
                  {s.best.url && (
                    <>
                      {' · '}
                      <a href={s.best.url} target="_blank" rel="noreferrer" className="underline">
                        open
                      </a>
                    </>
                  )}
                </div>
              </div>
            )}
            <ul className="space-y-2 text-sm">
              {insights.map((t) => (
                <li key={t} className="border-l-2 border-ink pl-3">
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <p className="text-mute">No posts yet. Scan a screenshot of their profile or analytics, drop an export, or add posts by hand below.</p>
      )}

      <div>
        <h3 className="mb-3 text-lg font-bold">Scan their account</h3>
        <Scan
          creator={c}
          onApply={(x, n) => {
            save(x);
            toast(`Added ${n} item${n === 1 ? '' : 's'} to ${x.name}`);
          }}
        />
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-bold">Posts ({c.posts.length})</h3>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => (save({ ...c, isSample: false, posts: [...c.posts, newPost({ title: 'New post' })] }), setShowPosts(true))}>
              Add a post
            </Button>
            {c.posts.length > 0 && (
              <Button variant="ghost" onClick={() => setShowPosts(!showPosts)}>
                {showPosts ? 'Hide' : 'Show'} posts
              </Button>
            )}
          </div>
        </div>
        {showPosts && c.posts.length > 0 && (
          <div className="mt-3 overflow-x-auto" tabIndex={0} role="group" aria-label="Table. Scrolls sideways.">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="eyebrow text-left">
                  {['Post', 'Date', 'Views', 'Likes', 'Comments', 'Shares', 'Saves', ''].map((h) => (
                    <th key={h} className="pb-2 pr-2 font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.posts.map((p) => (
                  <tr key={p.id} className={`border-t border-line ${picked === p.id ? 'bg-raised' : ''}`}>
                    <td className="py-1.5 pr-2">
                      <input aria-label="Post title" value={p.title} onChange={(e) => upd(p.id, { title: e.target.value })} className="w-full rounded-[3px] border border-line bg-surface px-2 py-1.5" />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input aria-label="Post date" type="date" value={p.date ?? ''} onChange={(e) => upd(p.id, { date: e.target.value || null })} className="rounded-[3px] border border-line bg-surface px-2 py-1.5" />
                    </td>
                    {(['views', 'likes', 'comments', 'shares', 'saves'] as const).map((k) => (
                      <td key={k} className="w-24 py-1.5 pr-2">
                        <NumberField id={`p-${p.id}-${k}`} value={p[k]} onChange={(v) => upd(p.id, { [k]: v })} placeholder="—" />
                      </td>
                    ))}
                    <td className="py-1.5">
                      <button type="button" onClick={() => save({ ...c, posts: c.posts.filter((x) => x.id !== p.id) })} className="px-2 text-mute hover:text-ink" aria-label={`Remove ${p.title}`}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- page

export default function Creators() {
  const creators = useStore((s) => s.creators);
  const save = useStore((s) => s.saveCreator);
  const clearSamples = useStore((s) => s.clearSampleCreators);
  const { review } = useReviewData();
  const [sel, setSel] = useState<string | null>(creators[0]?.id ?? null);
  const [metric, setMetric] = useState<Metric>('median');
  const list = useMemo(() => creators.map((c) => ({ c, s: creatorStats(c) })), [creators]);
  const labels = useMemo(() => rosterLabels(list), [list]);
  const current = creators.find((c) => c.id === sel) ?? creators[0] ?? null;
  const m = METRICS.find((x) => x.key === metric)!;
  const vals = list.map((x) => m.get(x.s)).filter((x): x is number => x !== null);
  const max = Math.max(1e-9, ...vals);
  const ugc = review.ads.formats.filter((f) => f.format === 'UGC / Creator Video' || f.format === 'Influencer / Sponsorship');

  const add = () => {
    const c = newCreator();
    save(c);
    setSel(c.id);
  };

  return (
    <div className="space-y-12 sm:space-y-16">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow">UGC creators</div>
            <h1 className="display mt-1 text-4xl sm:text-5xl">Your creators</h1>
            <p className="mt-2 max-w-xl text-mute">Track the creators you pay. Scan a screenshot or export of their account to see post count, best post, typical views and what each view costs you.</p>
          </div>
          <Button id="add-creator" onClick={add}>
            Add a creator
          </Button>
        </div>
        {creators.some((c) => c.isSample) && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border border-line bg-surface p-4 text-sm">
            <span>
              <Pill solid>Sample</Pill> <span className="ml-2">Creators marked “sample” are examples, not real accounts.</span>
            </span>
            <Button variant="secondary" onClick={() => (clearSamples(), setSel(null))}>
              Remove samples
            </Button>
          </div>
        )}
        {ugc.length > 0 && (
          <p className="mt-4 text-sm">
            This month your creator-led ads ({ugc.map((f) => f.format).join(', ')}) spent <span className="num font-semibold">{money(ugc.reduce((s, f) => s + f.spend, 0))}</span> and returned{' '}
            <span className="num font-semibold">{ratio(ugc.reduce((s, f) => s + (f.revenue ?? 0), 0) / Math.max(1, ugc.reduce((s, f) => s + f.spend, 0)))}</span> ROAS. <a href="#ads" className="underline">See ads</a>
          </p>
        )}
      </section>

      {list.length > 0 ? (
        <>
          <Reveal as="section">
            <SectionTitle eyebrow={`${list.length} creator${list.length === 1 ? '' : 's'}`} title="Side by side" />
            <div className="mb-5 flex flex-wrap gap-1" role="tablist" onKeyDown={tabKeys} aria-label="Compare by">
              {METRICS.map((x) => (
                <button key={x.key} role="tab" aria-selected={metric === x.key} onClick={() => setMetric(x.key)} className={`rounded-[3px] border px-3 py-1.5 text-xs font-semibold ${metric === x.key ? 'border-inv bg-inv text-invink' : 'border-line hover:border-ink'}`}>
                  {x.label}
                </button>
              ))}
            </div>
            <ul className="space-y-1">
              {[...list]
                .sort((a, b) => {
                  const x = m.get(a.s);
                  const y = m.get(b.s);
                  if (x === null) return 1;
                  if (y === null) return -1;
                  return m.low ? x - y : y - x;
                })
                .map(({ c, s }) => {
                  const v = m.get(s);
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSel(c.id);
                          requestAnimationFrame(() => document.getElementById('creator-detail-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
                        }}
                        aria-pressed={current?.id === c.id} className={`grid w-full grid-cols-[minmax(0,9rem)_1fr_5.5rem] items-center gap-3 px-2 py-2 text-left text-sm sm:grid-cols-[13rem_1fr_7rem] ${current?.id === c.id ? 'bg-raised' : 'hover:bg-raised/60'}`}>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{c.name || 'New creator'}</span>
                          <span className="block truncate text-xs text-mute">
                            {c.platform} · {s.posts} posts{labels[c.id]?.length ? ` · ${labels[c.id][0]}` : ''}
                          </span>
                        </span>
                        <span className="h-3 bg-surface">
                          <span className={`block h-full transition-[width] duration-500 ${m.low ? 'hatch border border-ink' : 'bg-ink'}`} style={{ width: v === null ? '0%' : `${(v / max) * 100}%` }} />
                        </span>
                        <span className={`num text-right ${v === null ? 'text-faint' : ''}`}>{m.fmt(v)}</span>
                      </button>
                    </li>
                  );
                })}
            </ul>
            <p className="mt-2 text-xs text-mute">{m.low ? 'Lower is better.' : 'Higher is better.'} “Typical views” is the median, so one viral post doesn’t skew it.</p>
          </Reveal>

          {current && (
            <section id="creator-detail-top" className="scroll-mt-28 border-t border-ink pt-8">
              <CreatorDetail key={current.id} c={current} labels={labels[current.id] ?? []} />
            </section>
          )}
        </>
      ) : (
        <div className="py-12 text-center">
          <p className="display text-3xl">No creators yet.</p>
          <p className="mt-2 text-mute">Add the first one, then scan their profile.</p>
          <Button className="mt-6" onClick={add}>
            Add a creator
          </Button>
        </div>
      )}
    </div>
  );
}
