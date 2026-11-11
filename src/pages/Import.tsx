import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { go, monthMessage, useReviewData } from '../App';
import { Button, NumberField, Pill, SectionTitle, Slider, useToast, tabKeys } from '../components/ui';
import { computeReview } from '../lib/calc';
import { BUSINESS_TYPES, FIELD, FIELDS, questionOrder, SOURCE_GUIDE } from '../lib/fields';
import { money, pct } from '../lib/format';
import type { Candidate } from '../lib/parse/common';
import { detectKind, detectRoles, KIND_LABELS, parseTable, ROLE_LABELS, tableAsText, tableCandidates, tableFromJson, type Role, type Table, type TableKind } from '../lib/parse/csv';
import { extractFromText } from '../lib/parse/text';
import { AD_FORMATS, type AdFormat, type BusinessType, type FieldKey, type NamedAmount, type Source } from '../lib/types';
import { nav, useStore } from '../store';

type Status = 'pending' | 'approved' | 'ignored';
type Item = Candidate & { status: Status; batch: string };

const TABS = [
  { key: 'screenshot', label: 'Screenshots' },
  { key: 'file', label: 'Files' },
  { key: 'paste', label: 'Paste text' },
  { key: 'questions', label: 'Questions' },
  { key: 'manual', label: 'Manual' },
] as const;
type Tab = (typeof TABS)[number]['key'];

const SOURCE_LABEL: Record<Source, string> = { sample: 'sample', manual: 'typed', csv: 'file', screenshot: 'screenshot', paste: 'pasted', question: 'answered', pdf: 'PDF', json: 'JSON', share: 'shared' };

// ---------------------------------------------------------------- review queue

function ReviewQueue({ items, setItems }: { items: Item[]; setItems: (f: (x: Item[]) => Item[]) => void }) {
  const values = useStore((s) => s.input.values);
  const apply = useStore((s) => s.applyCandidates);
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const approved = items.filter((i) => i.status === 'approved');
  const pending = items.filter((i) => i.status === 'pending');
  const input = useStore((s) => s.input);
  const before = computeReview(input).m.netProfit.value;

  const upd = (id: string, patch: Partial<Item>) => setItems((xs) => xs.map((x) => (x.id === id ? ({ ...x, ...patch } as Item) : x)));

  if (!items.length) return null;
  return (
    <section className="mt-10" aria-label="Detected values">
      <SectionTitle eyebrow={`${pending.length} waiting · ${approved.length} approved`} title="Review detected values" />
      <div className="-mt-2 mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-mute">Nothing is applied until you approve it. Check each number against your dashboard.</p>
        {items.some((i) => i.status === 'pending' && i.confidence === 'high') && (
          <button type="button" id="approve-high" onClick={() => setItems((xs) => xs.map((x) => (x.status === 'pending' && x.confidence === 'high' ? { ...x, status: 'approved' } : x)))} className="rounded-[3px] border border-ink px-3 py-1.5 text-xs font-semibold">
            Approve all high-confidence ({items.filter((i) => i.status === 'pending' && i.confidence === 'high').length})
          </button>
        )}
      </div>
      <ul className="divide-y divide-line border-y border-line">
        {items.map((c) => {
          const isField = c.kind === 'field';
          const cur = isField ? values[c.field] : null;
          return (
            <li key={c.id} className={`grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center ${c.status === 'ignored' ? 'opacity-40' : ''}`} data-testid="candidate">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {c.kind === 'field' && (
                    <select aria-label="Field" value={c.field} onChange={(e) => upd(c.id, { field: e.target.value as FieldKey } as any)} className="rounded-md border border-line bg-surface px-2 py-1 text-sm font-semibold">
                      {FIELDS.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  )}
                  {c.kind === 'ad' && (
                    <>
                      <span className="font-semibold">
                        {c.row.platform} ad · {c.row.name}
                      </span>
                      <select aria-label="Ad format" value={c.row.format} onChange={(e) => upd(c.id, { row: { ...c.row, format: e.target.value as AdFormat } } as any)} className="rounded-md border border-line bg-surface px-2 py-1 text-sm">
                        {AD_FORMATS.map((f) => (
                          <option key={f}>{f}</option>
                        ))}
                      </select>
                    </>
                  )}
                  {c.kind === 'product' && <span className="font-semibold">Product · {c.name}</span>}
                  <Pill solid={c.confidence === 'high'} hatch={c.confidence === 'low'}>
                    {c.confidence}
                  </Pill>
                  <span className="font-mono text-[11px] text-mute">{c.batch}</span>
                </div>
                <div className="mt-1 truncate font-mono text-xs text-mute" title={c.raw}>
                  Read from: {c.raw}
                </div>
                {c.note && <div className="mt-1 text-xs">{c.note}</div>}
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                {c.kind === 'ad' ? (
                  <span className="num text-sm">
                    {money(c.row.spend)} spend · {c.row.revenue === null ? 'no revenue' : money(c.row.revenue) + ' rev'}
                  </span>
                ) : editing === c.id ? (
                  <NumberField id={`edit-${c.id}`} value={c.value} onChange={(v) => v !== null && upd(c.id, { value: v } as any)} className="w-36" />
                ) : (
                  <span className="text-right">
                    <span className="num block text-lg font-semibold">{c.kind === 'field' && FIELD[c.field].unit === 'pct' ? `${c.value}%` : c.kind === 'field' && FIELD[c.field].unit !== 'money' ? c.value.toLocaleString() : money(c.value, { cents: c.value % 1 !== 0 })}</span>
                    {isField && <span className="num block text-[11px] text-mute">now: {cur == null ? 'Not provided' : FIELD[c.field].unit === 'money' ? money(cur) : cur.toLocaleString()}</span>}
                  </span>
                )}
                <div className="flex gap-1">
                  <button type="button" onClick={() => upd(c.id, { status: c.status === 'approved' ? 'pending' : 'approved' })} aria-pressed={c.status === 'approved'} className={`rounded-[3px] border px-3 py-1.5 text-xs font-semibold ${c.status === 'approved' ? 'border-inv bg-inv text-invink' : 'border-ink'}`}>
                    {c.status === 'approved' ? '✓ Approved' : 'Approve'}
                  </button>
                  {c.kind !== 'ad' && (
                    <button type="button" onClick={() => setEditing(editing === c.id ? null : c.id)} className="rounded-[3px] border border-line px-3 py-1.5 text-xs">
                      {editing === c.id ? 'Done' : 'Edit'}
                    </button>
                  )}
                  <button type="button" onClick={() => upd(c.id, { status: c.status === 'ignored' ? 'pending' : 'ignored' })} className="rounded-[3px] border border-line px-3 py-1.5 text-xs">
                    {c.status === 'ignored' ? 'Undo' : 'Ignore'}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="sticky bottom-[72px] z-30 mt-4 flex flex-wrap items-center justify-between gap-3 border border-ink bg-surface p-3 sm:bottom-4">
        <span className="text-sm">
          <span className="num font-semibold">{approved.length}</span> approved
          {pending.length > 0 && <span className="text-mute"> · {pending.length} still waiting</span>}
        </span>
        <Button
          id="apply-approved"
          disabled={!approved.length}
          onClick={() => {
            const wasSample = useStore.getState().input.isSample;
            apply(approved);
            setItems((xs) => xs.filter((x) => x.status !== 'approved'));
            const after = computeReview(useStore.getState().input).m.netProfit.value;
            toast(wasSample ? `Started a new month with your ${approved.length} values` : after === null ? `Applied ${approved.length} values` : `Applied ${approved.length} values · profit now ${money(after)}${before !== null ? ` (was ${money(before)})` : ''}`);
          }}
        >
          Apply {approved.length || ''} approved
        </Button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- drop zone

function Drop({ accept, onFiles, label, hint, id }: { accept: string; onFiles: (f: File[]) => void; label: string; hint: string; id: string }) {
  const [over, setOver] = useState(false);
  return (
    <label
      htmlFor={id}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onFiles([...e.dataTransfer.files]);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed px-6 py-12 text-center transition ${over ? 'border-ink bg-raised' : 'border-line bg-surface hover:border-ink'}`}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden>
        <path d="M12 16V4m0 0l-5 5m5-5l5 5M4 16v4h16v-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
      <span className="text-base font-semibold">{label}</span>
      <span className="max-w-md text-sm text-mute">{hint}</span>
      <input id={id} type="file" accept={accept} multiple className="sr-only" onChange={(e) => e.target.files && onFiles([...e.target.files])} />
    </label>
  );
}

// ---------------------------------------------------------------- screenshot tab

interface Shot {
  id: string;
  url: string;
  name: string;
  progress: number;
  status: string;
  text: string | null;
  label: string | null;
  error: string | null;
}

function ScreenshotTab({ addItems }: { addItems: (c: Candidate[], batch: string) => void }) {
  const [shots, setShots] = useState<Shot[]>([]);
  const run = useCallback(
    async (files: File[]) => {
      const { ocrImage } = await import('../lib/parse/ocr');
      for (const f of files.filter((x) => x.type.startsWith('image/'))) {
        const id = Math.random().toString(36).slice(2);
        const url = URL.createObjectURL(f);
        setShots((s) => [...s, { id, url, name: f.name || 'Pasted image', progress: 0, status: 'Starting', text: null, label: null, error: null }]);
        try {
          const text = await ocrImage(f, (p, st) => setShots((s) => s.map((x) => (x.id === id ? { ...x, progress: p, status: st } : x))));
          const { candidates, label } = extractFromText(text, 'screenshot');
          setShots((s) => s.map((x) => (x.id === id ? { ...x, text, label, progress: 1, status: `${candidates.length} values found` } : x)));
          addItems(candidates, `${label} · screenshot`);
        } catch {
          setShots((s) => s.map((x) => (x.id === id ? { ...x, error: 'Could not read this image here. Try a sharper screenshot, or paste the dashboard text instead.' } : x)));
        }
      }
    },
    [addItems],
  );
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (files.length) run(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [run]);
  return (
    <div>
      <Drop id="shot-input" accept="image/*" onFiles={run} label="Drop screenshots here, or tap to choose" hint="Stripe, Shopify analytics, Meta Ads Manager, Google Ads or a bank statement. Text is read on this device; images are not uploaded. You can also paste an image." />
      {shots.length > 0 && (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {shots.map((s) => (
            <li key={s.id} className="flex gap-4 border border-line bg-surface p-3">
              <img src={s.url} alt={s.name} className="h-24 w-24 shrink-0 object-cover object-top grayscale" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{s.label ?? s.name}</div>
                {s.error ? (
                  <p className="mt-1 text-sm">{s.error}</p>
                ) : (
                  <>
                    <div className="mt-2 h-1.5 bg-raised">
                      <div className="h-full bg-ink transition-[width]" style={{ width: `${Math.round(s.progress * 100)}%` }} />
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-mute">{s.status}</div>
                  </>
                )}
                {s.text && (
                  <details className="mt-1 text-xs">
                    <summary className="cursor-pointer text-mute">Text read</summary>
                    <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px]">{s.text}</pre>
                  </details>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- file tab

interface Loaded {
  name: string;
  table: Table | null;
  roles: Role[];
  kind: TableKind;
  text: string | null;
  source: Source;
}

function FileTab({ addItems }: { addItems: (c: Candidate[], batch: string, scroll?: boolean) => void }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [waiting, setWaiting] = useState<File[]>([]);
  const [position, setPosition] = useState({ n: 0, of: 0 });
  /** Several files can be dropped at once; each gets its own preview, in order. */
  const onFiles = (files: File[]) => {
    if (!files.length) return;
    setWaiting(files.slice(1));
    setPosition({ n: 1, of: files.length });
    void loadFile(files[0]);
  };
  const nextFile = () => {
    setLoaded(null);
    if (!waiting.length) return setPosition({ n: 0, of: 0 });
    const [f, ...rest] = waiting;
    setWaiting(rest);
    setPosition((p) => ({ ...p, n: p.n + 1 }));
    void loadFile(f);
  };
  const loadFile = async (f: File) => {
    setErr(null);
    setBusy(true);
    try {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
      if (ext === 'pdf') {
        const { pdfToText } = await import('../lib/parse/pdf');
        const text = await pdfToText(f);
        setLoaded({ name: f.name, table: null, roles: [], kind: 'generic', text, source: 'pdf' });
      } else if (ext === 'json') {
        const json = JSON.parse(await f.text());
        const table = tableFromJson(json);
        if (table) {
          const roles = detectRoles(table.headers);
          setLoaded({ name: f.name, table, roles, kind: detectKind(table.headers, roles), text: null, source: 'json' });
        } else {
          const flat: string[] = [];
          const walk = (o: any, p: string) => {
            if (o && typeof o === 'object') Object.entries(o).forEach(([k, v]) => walk(v, k));
            else if (typeof o === 'number' || (typeof o === 'string' && /\d/.test(o))) flat.push(`${p.replace(/[_-]/g, ' ')} ${o}`);
          };
          walk(json, '');
          setLoaded({ name: f.name, table: null, roles: [], kind: 'generic', text: flat.join('\n'), source: 'json' });
        }
      } else {
        const text = await f.text();
        const table = parseTable(text);
        if (table.headers.length >= 2 && table.rows.length) {
          const roles = detectRoles(table.headers);
          setLoaded({ name: f.name, table, roles, kind: detectKind(table.headers, roles), text: null, source: 'csv' });
        } else {
          setLoaded({ name: f.name, table: null, roles: [], kind: 'generic', text, source: 'csv' });
        }
      }
    } catch {
      setErr('That file could not be read. Check it opens in a spreadsheet app, or paste its contents on the Paste tab.');
    } finally {
      setBusy(false);
    }
  };

  const result = useMemo(() => {
    if (!loaded) return null;
    if (loaded.table) {
      const r = tableCandidates(loaded.table, loaded.roles, loaded.kind, loaded.source, loaded.name);
      if (!r.candidates.length && loaded.kind === 'generic') {
        const t = extractFromText(tableAsText(loaded.table), loaded.source);
        return { candidates: t.candidates, summary: t.candidates.length ? `${t.candidates.length} labelled values found` : r.summary };
      }
      return r;
    }
    const t = extractFromText(loaded.text ?? '', loaded.source);
    return { candidates: t.candidates, summary: `${t.label}: ${t.candidates.length} values found` };
  }, [loaded]);

  return (
    <div>
      <Drop id="file-input" accept=".csv,.tsv,.txt,.json,.pdf,text/csv,application/pdf,application/json,text/plain" onFiles={onFiles} label="Drop a CSV, TSV, TXT, JSON or PDF export" hint="Stripe payments, Shopify orders or sales, Meta / Google / TikTok ad exports, bank statements. You’ll see a preview first." />
      {busy && <div className="scan mt-4 h-1" />}
      {err && <p className="mt-4 text-sm">{err}</p>}
      {loaded && result && (
        <div className="mt-6 border border-ink bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
            <div>
              <div className="font-semibold">{loaded.name}</div>
              <div className="text-sm text-mute">{result.summary}</div>
            </div>
            {loaded.table && (
              <label className="flex items-center gap-2 text-sm">
                <span className="text-mute">Read as</span>
                <select id="table-kind" value={loaded.kind} onChange={(e) => setLoaded({ ...loaded, kind: e.target.value as TableKind })} className="rounded-md border border-line bg-surface px-2 py-1">
                  {Object.entries(KIND_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {loaded.table ? (
            <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Table. Scrolls sideways.">
              <table className="min-w-full text-xs">
                <thead>
                  <tr>
                    {loaded.table.headers.map((h, i) => (
                      <th key={i} className="border-b border-line p-2 text-left align-top font-normal">
                        <div className="max-w-[10rem] truncate font-semibold" title={h}>
                          {h || '—'}
                        </div>
                        <select aria-label={`Column ${h} meaning`} value={loaded.roles[i]} onChange={(e) => setLoaded({ ...loaded, roles: loaded.roles.map((r, j) => (j === i ? (e.target.value as Role) : r)) })} className={`mt-1 rounded border bg-surface px-1 py-0.5 ${loaded.roles[i] === 'ignore' ? 'border-line text-faint' : 'border-ink'}`}>
                          {Object.entries(ROLE_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loaded.table.rows.slice(0, 8).map((r, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      {loaded.table!.headers.map((_, j) => (
                        <td key={j} className="num max-w-[10rem] truncate p-2">
                          {r[j]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="p-3 text-xs text-mute">
                Showing {Math.min(8, loaded.table.rows.length)} of {loaded.table.rows.length} rows{loaded.table.skipped ? ` · skipped ${loaded.table.skipped} lines above the header` : ''}. Change a column’s meaning if it was guessed wrong.
              </div>
            </div>
          ) : (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap p-4 font-mono text-xs">{(loaded.text ?? '').slice(0, 3000)}</pre>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line p-3">
            <span className="text-xs text-mute">{position.of > 1 ? `File ${position.n} of ${position.of}` : ''}</span>
            <div className="flex gap-2">
              {(position.of > 1 || !result.candidates.length) && (
                <Button variant="ghost" id="skip-file" onClick={nextFile}>
                  {waiting.length ? 'Skip this file' : 'Close'}
                </Button>
              )}
              <Button
                id="send-to-review"
                disabled={!result.candidates.length}
                onClick={() => {
                  addItems(result.candidates, `${loaded.name}`, waiting.length === 0);
                  nextFile();
                }}
              >
                Review {result.candidates.length} values{waiting.length ? ' · next file' : ''}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- paste tab

function PasteTab({ addItems }: { addItems: (c: Candidate[], batch: string) => void }) {
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div>
      <label htmlFor="paste-box" className="text-sm text-mute">
        Select everything on a dashboard (Ctrl/Cmd + A), copy, and paste it here.
      </label>
      <textarea id="paste-box" value={text} onChange={(e) => setText(e.target.value)} rows={10} placeholder={'Gross volume\n$48,200.00\nRefunds  −$1,450.00\nSuccessful payments  820'} className="mt-2 w-full rounded-[3px] border border-line bg-surface p-4 font-mono text-sm outline-none focus:border-ink" />
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-sm text-mute">{msg}</span>
        <Button
          id="read-paste"
          disabled={!text.trim()}
          onClick={() => {
            const { candidates, label } = extractFromText(text, 'paste');
            setMsg(candidates.length ? `${label}: ${candidates.length} values sent to review` : 'No labelled numbers found. Try including the labels next to each number.');
            if (candidates.length) addItems(candidates, `${label} · pasted`);
          }}
        >
          Read numbers
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- questions

function QuestionsTab() {
  const input = useStore((s) => s.input);
  const setValue = useStore((s) => s.setValue);
  const queue = useMemo(() => {
    const list = questionOrder(input.businessType, useStore.getState().profile.adPlatforms).filter((k) => input.values[k] == null);
    return list.slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.businessType]);
  const [i, setI] = useState(0);
  const [val, setVal] = useState<number | null>(null);
  const done = i >= queue.length;
  const k = queue[i];
  if (!queue.length) return <p className="py-8 text-lg">Nothing missing for the core review. Fine-tune anything on the Manual tab.</p>;
  if (done)
    return (
      <div className="py-10 text-center">
        <p className="display text-3xl">That’s everything.</p>
        <p className="mt-2 text-mute">Your breakdown has been updated.</p>
        <Button className="mt-6" onClick={() => go('overview')}>
          See the breakdown
        </Button>
      </div>
    );
  const f = FIELD[k];
  const next = () => {
    setVal(null);
    setI(i + 1);
  };
  return (
    <div className="mx-auto max-w-xl py-4" key={k}>
      <div className="flex items-center justify-between">
        <span className="eyebrow">
          Question {i + 1} of {queue.length}
        </span>
        <div className="flex gap-1" aria-hidden>
          {queue.map((_, j) => (
            <span key={j} className={`h-1 w-5 ${j <= i ? 'bg-ink' : 'bg-line'}`} />
          ))}
        </div>
      </div>
      <h3 className="rise mt-4 text-2xl font-extrabold sm:text-3xl">{f.question}</h3>
      {f.hint && <p className="mt-2 text-sm text-mute">{f.hint}</p>}
      <form
        className="mt-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (val === null) return;
          setValue(k, val, 'question');
          next();
        }}
      >
        <NumberField id={`q-${k}`} value={val} onChange={setVal} prefix={f.unit === 'money' ? '$' : undefined} suffix={f.unit === 'pct' ? '%' : undefined} placeholder="Type a number" className="text-lg" />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={next} className="text-sm text-mute underline-offset-4 hover:underline">
            Skip — leave as “Not provided”
          </button>
          <Button type="submit" id="q-save" disabled={val === null}>
            Save & next
          </Button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- manual

function NamedList({ title, hint, items, onChange, idPrefix, total }: { title: string; hint: string; items: NamedAmount[]; onChange: (x: NamedAmount[]) => void; idPrefix: string; total: number | null }) {
  const sum = items.reduce((s, i) => s + (i.amount || 0), 0);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-medium">{title}</h4>
        {items.length > 0 && total ? <span className={`num text-[11px] ${Math.abs(sum - total) > 1 ? '' : 'text-mute'}`}>{money(sum)} of {money(total)}{Math.abs(sum - total) > 1 ? ' — doesn’t match revenue' : ''}</span> : null}
      </div>
      <p className="text-xs text-mute">{hint}</p>
      <ul className="mt-2 space-y-2">
        {items.map((it, i) => (
          <li key={i} className="grid grid-cols-[1fr_8.5rem_auto] items-center gap-2">
            <input id={`${idPrefix}-name-${i}`} aria-label={`${title} name`} value={it.name} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="min-w-0 rounded-[3px] border border-line bg-surface px-3 py-2 text-sm" />
            <NumberField id={`${idPrefix}-amt-${i}`} value={it.amount} onChange={(v) => onChange(items.map((x, j) => (j === i ? { ...x, amount: v ?? 0 } : x)))} prefix="$" />
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="px-2 text-mute hover:text-ink" aria-label={`Remove ${it.name}`}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => onChange([...items, { name: '', amount: 0 }])} className="mt-2 rounded-[3px] border border-line px-3 py-1.5 text-xs hover:border-ink">
        + Add {title.toLowerCase().includes('channel') ? 'a channel' : 'a product'}
      </button>
    </div>
  );
}

function ManualTab() {
  const input = useStore((s) => s.input);
  const setValue = useStore((s) => s.setValue);
  const setGoal = useStore((s) => s.setGoal);
  const openMonth = useStore((s) => s.openMonth);
  const toast = useToast();
  const setProducts = useStore((s) => s.setProducts);
  const setChannels = useStore((s) => s.setChannels);
  const groups = [...new Set(FIELDS.map((f) => f.group))];
  if (input.isSample)
    return (
      <div className="mx-auto max-w-lg py-10 text-center">
        <p className="display text-2xl">These are sample numbers.</p>
        <p className="mt-2 text-mute">Start a blank month to type your own, so nothing from the sample mixes in.</p>
        <Button className="mt-6" id="manual-start-blank" onClick={() => useStore.getState().startReal()}>
          Start a blank month
        </Button>
      </div>
    );
  return (
    <div className="space-y-10">
      <div className="grid gap-6 sm:grid-cols-3">
        <label className="block">
          <span className="text-sm text-mute">Business type</span>
          <select id="manual-type" value={input.businessType} onChange={(e) => useStore.getState().setBusinessType(e.target.value as BusinessType)} className="mt-1 block w-full rounded-[3px] border border-line bg-surface px-3 py-2 text-sm">
            {BUSINESS_TYPES.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm text-mute">Month</span>
          <input id="manual-month" type="month" value={input.month} onChange={(e) => e.target.value && toast(monthMessage(e.target.value, openMonth(e.target.value)))} className="mt-1 block w-full rounded-[3px] border border-line bg-surface px-3 py-2 font-mono text-sm" />
        </label>
        <div>
          <span className="text-sm text-mute">Monthly profit goal</span>
          <NumberField id="manual-goal" value={input.goal} onChange={setGoal} prefix="$" className="mt-1" />
        </div>
      </div>
      {groups.map((g) => (
        <fieldset key={g}>
          <legend className="mb-4 w-full border-b border-ink pb-2 text-lg font-extrabold" style={{ fontFamily: 'var(--font-display)' }}>
            {g}
          </legend>
          <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
            {FIELDS.filter((f) => f.group === g).map((f) => {
              const v = input.values[f.key];
              const src = input.sources[f.key];
              return (
                <div key={f.key}>
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor={`m-${f.key}`} className="text-sm font-medium">
                      {f.label}
                    </label>
                    {v != null && src ? <span className="font-mono text-[10px] uppercase tracking-wider text-mute">{SOURCE_LABEL[src]}</span> : <span className="font-mono text-[10px] uppercase tracking-wider text-faint">not provided</span>}
                  </div>
                  <div className="mt-1 grid grid-cols-[1fr_8.5rem] items-center gap-3">
                    <Slider id={`s-${f.key}`} value={v ?? 0} min={0} max={Math.max(f.max, v ?? 0)} step={f.step} onChange={(x) => setValue(f.key, x, 'manual')} />
                    <NumberField id={`m-${f.key}`} value={v} onChange={(x) => setValue(f.key, x, 'manual')} prefix={f.unit === 'money' ? '$' : undefined} suffix={f.unit === 'pct' ? '%' : undefined} />
                  </div>
                  {v != null && (
                    <button type="button" onClick={() => setValue(f.key, null, 'manual')} className="mt-1 text-[11px] text-mute underline-offset-2 hover:underline">
                      Clear
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
      <fieldset>
        <legend className="mb-4 w-full border-b border-ink pb-2 text-lg font-extrabold" style={{ fontFamily: 'var(--font-display)' }}>
          Revenue breakdown
        </legend>
        <div className="grid gap-x-10 gap-y-8 md:grid-cols-2">
          <NamedList idPrefix="prod" title="By product" hint="Your top products or plans and what each brought in." items={input.products} onChange={setProducts} total={input.values.grossRevenue ?? null} />
          <NamedList idPrefix="chan" title="By channel" hint="Where sales came from: paid social, search, email, organic, referrals." items={input.channels} onChange={setChannels} total={input.values.grossRevenue ?? null} />
        </div>
      </fieldset>
    </div>
  );
}

/** What to bring from the sources picked in onboarding, ticked off as numbers arrive. */
function SourceChecklist() {
  const profile = useStore((s) => s.profile);
  const values = useStore((s) => s.input.values);
  const picked = [...profile.moneySources, ...profile.adPlatforms].filter((s) => SOURCE_GUIDE[s]);
  if (!picked.length) return null;
  const done = picked.filter((s) => values[SOURCE_GUIDE[s].field] != null).length;
  return (
    <section className="mt-6 border border-line bg-surface p-4" aria-label="Your sources" data-testid="source-checklist">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold">Your sources</h2>
        <span className="num text-xs text-mute">
          {done} of {picked.length} in
        </span>
      </div>
      <ul className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
        {picked.map((s) => {
          const g = SOURCE_GUIDE[s];
          const ok = values[g.field] != null;
          return (
            <li key={s} className="grid grid-cols-[1.25rem_1fr] gap-2 text-sm">
              <span className={`mt-0.5 flex h-4 w-4 items-center justify-center border border-ink text-[10px] ${ok ? 'bg-inv text-invink' : ''}`} aria-hidden>
                {ok ? '✓' : ''}
              </span>
              <span className={ok ? 'text-mute' : ''}>
                <span className="font-semibold">{s}</span>: {g.bring} <span className="text-mute">→ {g.gives}</span>
                <span className="sr-only">{ok ? ' (received)' : ' (not yet)'}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------- page

export default function Import() {
  const { review, input } = useReviewData();
  const [tab, setTab] = useState<Tab>(() => (nav.importTab as Tab) || 'screenshot');
  const [items, setItems] = useState<Item[]>([]);
  const queueRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    nav.importTab = null;
  }, []);
  const addItems = useCallback((c: Candidate[], batch: string, scroll = true) => {
    if (!c.length) return;
    setItems((xs) => [...xs, ...c.map((x) => ({ ...x, status: 'pending' as Status, batch }))]);
    if (scroll) setTimeout(() => queueRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  }, []);
  const filled = FIELDS.filter((f) => input.values[f.key] != null).length;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Import center</div>
          <h1 className="display mt-1 text-4xl sm:text-5xl">Bring in your numbers</h1>
          <p className="mt-2 max-w-xl text-mute">Use whatever you have. Every detected number waits for your approval.</p>
        </div>
        <div className="text-right">
          <div className="num text-2xl font-semibold">
            {filled}/{FIELDS.length}
          </div>
          <div className="text-xs text-mute">inputs provided{input.isSample ? ' (sample)' : ''}</div>
        </div>
      </div>

      {input.isSample && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border border-line bg-surface p-4 text-sm">
          <span>You’re looking at sample numbers. Start a blank month so nothing sample mixes with yours.</span>
          <Button variant="secondary" onClick={() => useStore.getState().startReal()}>
            Start a blank month
          </Button>
        </div>
      )}

      {!input.isSample && <SourceChecklist />}

      <div className="no-scrollbar mt-8 flex gap-1 overflow-x-auto border-b border-line" role="tablist" onKeyDown={tabKeys}>
        {TABS.map((t) => (
          <button key={t.key} id={`tab-${t.key}`} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={`relative shrink-0 px-4 py-3 text-sm ${tab === t.key ? 'font-semibold' : 'text-mute hover:text-ink'}`}>
            {t.label}
            {t.key === 'questions' && review.missingCore.length > 0 && <span className="num ml-1.5 rounded-[3px] bg-inv px-1.5 text-[10px] text-invink">{Math.min(8, review.missingCore.length)}</span>}
            {tab === t.key && <span className="absolute inset-x-2 bottom-[-1px] h-[3px] bg-ink" />}
          </button>
        ))}
      </div>

      <div className="pt-8" role="tabpanel">
        {tab === 'screenshot' && <ScreenshotTab addItems={addItems} />}
        {tab === 'file' && <FileTab addItems={addItems} />}
        {tab === 'paste' && <PasteTab addItems={addItems} />}
        {tab === 'questions' && <QuestionsTab />}
        {tab === 'manual' && <ManualTab />}
      </div>

      <div ref={queueRef} className="scroll-mt-32">
        <ReviewQueue items={items} setItems={setItems} />
      </div>

      {review.m.netProfit.value !== null && !items.length && (
        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
          <span className="text-sm text-mute">
            Profit right now: <span className="num font-semibold text-ink">{money(review.m.netProfit.value)}</span> · margin {pct(review.m.margin.value)}
          </span>
          <Button variant="secondary" onClick={() => go('overview')}>
            See the breakdown →
          </Button>
        </div>
      )}
    </div>
  );
}
