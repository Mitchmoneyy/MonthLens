import { useMemo, useState } from 'react';
import { useReviewData } from '../App';
import { Button, Reveal, SectionTitle, useToast } from '../components/ui';
import { applyScenario, computeReview, monthName, type MetricKey, type Review } from '../lib/calc';
import { toCsv, toPdf } from '../lib/export';
import { fmtUnit, money, pct } from '../lib/format';
import { copyText, saveFile } from '../lib/runtime';
import { decodeShare, encodeShare, shareLink } from '../lib/share';
import { useStore } from '../store';
import { makeBackup, parseBackup, storageUse } from '../lib/backup';

const COMPARE: MetricKey[] = ['revenue', 'totalExpenses', 'netProfit', 'margin', 'adSpend', 'mer', 'cac', 'conversionRate', 'aov', 'cashEnd'];
const LOWER_BETTER: MetricKey[] = ['totalExpenses', 'cac', 'adSpend'];

function ProfitBars({ reviews }: { reviews: { label: string; r: Review; current: boolean }[] }) {
  const vals = reviews.map((x) => x.r.m.netProfit.value ?? 0);
  const revs = reviews.map((x) => x.r.m.revenue.value ?? 0);
  const max = Math.max(1, ...revs, ...vals.map(Math.abs));
  const hasNeg = vals.some((v) => v < 0);
  const H = 180;
  const zero = hasNeg ? H * 0.75 : H;
  return (
    <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Table. Scrolls sideways.">
      <div className="flex min-w-max items-end gap-4 border-b border-ink pb-0" style={{ height: H + 4 }} role="img" aria-label="Revenue and profit by month">
        {reviews.map((x, i) => {
          const rev = revs[i];
          const p = vals[i];
          const scale = zero / max;
          return (
            <div key={i} className="relative flex w-14 flex-col items-center" style={{ height: H }}>
              <div className="absolute w-full border border-ink" style={{ bottom: H - zero, height: rev * scale }} title={`Revenue ${money(rev)}`} />
              <div className={`absolute w-8 ${p >= 0 ? 'bg-ink' : 'hatch border border-ink'}`} style={p >= 0 ? { bottom: H - zero, height: p * scale } : { top: zero, height: -p * scale }} title={`Profit ${money(p)}`} />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex min-w-max gap-4">
        {reviews.map((x, i) => (
          <div key={i} className={`w-14 text-center font-mono text-[10px] ${x.current ? 'font-semibold' : 'text-mute'}`}>
            {x.label}
            <div className="num">{money(x.r.m.netProfit.value, { compact: true })}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-mute">Outline = revenue. Solid = profit. Hatched = loss.</p>
    </div>
  );
}

export default function History() {
  const { review: r, prevReview, input, recs, projected } = useReviewData();
  const snapshots = useStore((s) => s.snapshots);
  const save = useStore((s) => s.saveSnapshot);
  const del = useStore((s) => s.deleteSnapshot);
  const open = useStore((s) => s.openSnapshot);
  const replace = useStore((s) => s.replaceInput);
  const resetAll = useStore((s) => s.resetAll);
  const restoreBackup = useStore((s) => s.restoreBackup);
  const [pendingRestore, setPendingRestore] = useState<ReturnType<typeof parseBackup> | null>(null);
  const usage = useMemo(() => {
    try {
      return storageUse(JSON.stringify({ snapshots, input }) + JSON.stringify((useStore.getState() as any).thumbs ?? {}));
    } catch {
      return storageUse(null);
    }
  }, [snapshots, input]);
  const A = useStore((s) => s.scenarioA);
  const B = useStore((s) => s.scenarioB);
  const toast = useToast();
  const [code, setCode] = useState<string | null>(null);
  const [paste, setPaste] = useState('');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const snapReviews = useMemo(() => snapshots.map((s) => ({ s, r: computeReview(s.input) })), [snapshots]);
  const chartData = useMemo(() => {
    const list = snapReviews.filter((x) => x.s.input.businessType === input.businessType).map((x) => ({ label: monthName(x.s.month, true), r: x.r, current: x.s.month === input.month }));
    if (!list.some((x) => x.current)) list.push({ label: 'Now', r, current: true });
    return list;
  }, [snapReviews, input, r]);

  const scenarios = useMemo(() => {
    const out: { name: string; r: Review }[] = [{ name: 'Now', r }];
    if (A) out.push({ name: `A · ${A.name}`, r: computeReview(applyScenario(input, A.s)) });
    if (B) out.push({ name: `B · ${B.name}`, r: computeReview(applyScenario(input, B.s)) });
    return out;
  }, [A, B, input, r]);

  const makeCode = async () => {
    const c = await encodeShare(input);
    setCode(c);
    return c;
  };

  return (
    <div className="space-y-12 sm:space-y-16">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow">Saved in this browser</div>
            <h1 className="display mt-1 text-4xl sm:text-5xl">History</h1>
          </div>
          <Button
            id="save-snapshot"
            onClick={() => {
              save();
              toast(`Saved ${monthName(input.month)}`);
            }}
          >
            Save {monthName(input.month)}
          </Button>
        </div>
        <div className="mt-8">{chartData.length > 1 ? <ProfitBars reviews={chartData} /> : <p className="text-mute">Save a month to start your history. Each saved month appears here as a bar, and Overview shows trend lines once you have two.</p>}</div>
      </section>

      {snapReviews.length > 0 && (
        <Reveal as="section">
          <SectionTitle eyebrow={`${snapReviews.length} saved`} title="Saved months" />
          <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Table. Scrolls sideways.">
            <table className="w-full min-w-[640px] text-sm" data-testid="snapshots">
              <thead>
                <tr className="eyebrow text-left">
                  <th className="pb-2 font-normal">Month</th>
                  <th className="pb-2 text-right font-normal">Revenue</th>
                  <th className="pb-2 text-right font-normal">Profit</th>
                  <th className="pb-2 text-right font-normal">Margin</th>
                  <th className="pb-2 text-right font-normal">Health</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {[...snapReviews].reverse().map(({ s, r: sr }) => (
                  <tr key={s.id} className="border-t border-line">
                    <td className="py-3">
                      <div className="font-semibold">{monthName(s.month)}</div>
                      <div className="text-xs text-mute">
                        {s.label} · saved {new Date(s.savedAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="num py-3 text-right">{money(sr.m.revenue.value)}</td>
                    <td className="num py-3 text-right font-semibold">{money(sr.m.netProfit.value)}</td>
                    <td className="num py-3 text-right">{pct(sr.m.margin.value)}</td>
                    <td className="num py-3 text-right">{sr.health.score ?? '—'}</td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            open(s.id);
                            toast(`Opened ${monthName(s.month)}`);
                          }}
                          className="rounded-[3px] border border-ink px-3 py-1 text-xs"
                        >
                          Open
                        </button>
                        {confirmDel === s.id ? (
                          <button
                            type="button"
                            onClick={() => {
                              del(s.id);
                              setConfirmDel(null);
                            }}
                            className="rounded-[3px] bg-inv px-3 py-1 text-xs text-invink"
                          >
                            Confirm delete
                          </button>
                        ) : (
                          <button type="button" onClick={() => setConfirmDel(s.id)} className="rounded-[3px] border border-line px-3 py-1 text-xs">
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      )}

      <Reveal as="section">
        <SectionTitle eyebrow={prevReview ? `${monthName(prevReview.input.month)} → ${monthName(input.month)}${input.isSample ? ' · sample history' : ''}` : 'Needs a saved earlier month'} title="This month vs last month" />
        {prevReview ? (
          <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Table. Scrolls sideways.">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="eyebrow text-right">
                  <th className="pb-2 text-left font-normal">Metric</th>
                  <th className="pb-2 font-normal">Last month</th>
                  <th className="pb-2 font-normal">This month</th>
                  <th className="pb-2 font-normal">Change</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((k) => {
                  const a = prevReview.m[k].value;
                  const b = r.m[k].value;
                  const d = a !== null && b !== null ? b - a : null;
                  const good = d !== null && (LOWER_BETTER.includes(k) ? d < 0 : d > 0);
                  return (
                    <tr key={k} className="border-t border-line">
                      <td className="py-2">{r.m[k].label}</td>
                      <td className="num py-2 text-right text-mute">{fmtUnit(a, r.m[k].unit)}</td>
                      <td className="num py-2 text-right">{fmtUnit(b, r.m[k].unit)}</td>
                      <td className={`num py-2 text-right ${good ? 'font-semibold' : 'text-mute'}`}>{d === null ? '—' : `${d > 0 ? '▲' : d < 0 ? '▼' : '■'} ${r.m[k].unit === 'pct' ? `${Math.abs(d * 100).toFixed(1)} pts` : fmtUnit(Math.abs(d), r.m[k].unit)}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-mute">Save this month now. When you review next month, the comparison appears here.</p>
        )}
      </Reveal>

      <Reveal as="section">
        <SectionTitle eyebrow="From the what-if panel" title="Scenario A vs B" />
        {scenarios.length > 1 ? (
          <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Table. Scrolls sideways.">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="eyebrow text-right">
                  <th className="pb-2 text-left font-normal">Metric</th>
                  {scenarios.map((s) => (
                    <th key={s.name} className="max-w-[12rem] pb-2 font-normal normal-case tracking-normal">
                      {s.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(['netProfit', 'revenue', 'margin', 'adSpend', 'cac', 'mer'] as MetricKey[]).map((k) => (
                  <tr key={k} className="border-t border-line">
                    <td className="py-2">{r.m[k].label}</td>
                    {scenarios.map((s) => (
                      <td key={s.name} className={`num py-2 text-right ${k === 'netProfit' ? 'font-semibold' : ''}`}>
                        {fmtUnit(s.r.m[k].value, s.r.m[k].unit)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-mute">
            On <a href="#advisor" className="underline">Next month</a>, set the what-if sliders and tap “Save as A” or “Save as B” to compare them here.
          </p>
        )}
      </Reveal>

      <Reveal as="section">
        <SectionTitle eyebrow="Same numbers as on screen" title="Share & export" />
        <div className="grid gap-px border border-ink bg-ink md:grid-cols-2">
          <div className="space-y-4 bg-surface p-5">
            <h3 className="font-semibold">Share with a partner or coach</h3>
            <p className="text-sm text-mute">The code holds this month’s numbers, compressed. Nothing is uploaded. Whoever opens it sees the same review.</p>
            <div className="flex flex-wrap gap-2">
              <Button
                id="copy-share-code"
                variant="secondary"
                onClick={async () => {
                  const c = code ?? (await makeCode());
                  toast((await copyText(c)) ? 'Share code copied' : 'Select the code below to copy it');
                }}
              >
                Copy share code
              </Button>
              <Button
                id="copy-share-link"
                variant="secondary"
                onClick={async () => {
                  const c = code ?? (await makeCode());
                  toast((await copyText(shareLink(c))) ? 'Share link copied' : 'Select the link below to copy it');
                }}
              >
                Copy share link
              </Button>
            </div>
            {code && (
              <textarea id="share-code" readOnly value={code} rows={3} onFocus={(e) => e.target.select()} className="w-full rounded-[3px] border border-line bg-bg p-2 font-mono text-[11px]" aria-label="Share code" />
            )}
            <div className="border-t border-line pt-4">
              <label htmlFor="open-code" className="text-sm font-semibold">
                Open a code someone sent you
              </label>
              <div className="mt-2 flex gap-2">
                <input id="open-code" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="ML1-…" className="min-w-0 flex-1 rounded-[3px] border border-line bg-bg px-4 py-2 font-mono text-xs" />
                <Button
                  variant="secondary"
                  disabled={!paste.trim()}
                  onClick={async () => {
                    try {
                      const data = await decodeShare(paste);
                      replace(data);
                      setPaste('');
                      toast(`Opened shared ${monthName(data.month)}`);
                    } catch (e: any) {
                      toast(e.message || 'That code could not be read');
                    }
                  }}
                >
                  Open
                </Button>
              </div>
            </div>
          </div>
          <div className="space-y-4 bg-surface p-5">
            <h3 className="font-semibold">Download</h3>
            <p className="text-sm text-mute">A one-page report and a CSV summary, built from the same calculation as the screen.</p>
            <div className="flex flex-wrap gap-2">
              <Button
                id="export-pdf"
                disabled={busy === 'pdf'}
                onClick={async () => {
                  setBusy('pdf');
                  const res = await saveFile(`monthlens-${input.month}.pdf`, await toPdf(r, recs, projected), 'application/pdf');
                  setBusy(null);
                  toast(res === 'saved' ? 'Report PDF ready' : res === 'declined' ? 'Download cancelled' : 'Could not save here');
                }}
              >
                {busy === 'pdf' ? 'Building…' : 'Monthly report PDF'}
              </Button>
              <Button
                id="export-csv"
                variant="secondary"
                onClick={async () => {
                  const res = await saveFile(`monthlens-${input.month}.csv`, toCsv(r, recs, projected), 'text/csv');
                  toast(res === 'saved' ? 'CSV ready' : res === 'declined' ? 'Download cancelled' : 'Could not save here');
                }}
              >
                CSV summary
              </Button>
            </div>
            <dl className="grid grid-cols-3 gap-2 border-t border-line pt-4 text-sm">
              <div>
                <dt className="text-mute">Revenue</dt>
                <dd className="num">{money(r.m.revenue.value)}</dd>
              </div>
              <div>
                <dt className="text-mute">Profit</dt>
                <dd className="num font-semibold">{money(r.m.netProfit.value)}</dd>
              </div>
              <div>
                <dt className="text-mute">Margin</dt>
                <dd className="num">{pct(r.m.margin.value)}</dd>
              </div>
            </dl>
          </div>
        </div>
        <div className="mt-6 border border-line bg-surface p-5">
          <h3 className="font-semibold">Back up everything</h3>
          <p className="mt-1 text-sm text-mute">One file with every month, plan, scenario and creator. Keep it somewhere safe, or use it to move to another browser.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              id="backup-download"
              variant="secondary"
              onClick={async () => {
                const s = useStore.getState() as any;
                const res = await saveFile(`monthlens-backup-${new Date().toISOString().slice(0, 10)}.json`, makeBackup(s), 'application/json');
                toast(res === 'saved' ? 'Backup ready' : res === 'declined' ? 'Download cancelled' : 'Could not save here');
              }}
            >
              Download backup
            </Button>
            <label htmlFor="backup-restore" className="inline-flex cursor-pointer items-center rounded-[3px] border border-line px-5 py-2.5 text-sm font-semibold hover:border-ink">
              Restore from a backup
              <input
                id="backup-restore"
                type="file"
                accept=".json,application/json"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  try {
                    setPendingRestore(parseBackup(await f.text()));
                  } catch (x: any) {
                    toast(x.message);
                  }
                }}
              />
            </label>
          </div>
          {pendingRestore && (
            <div className="mt-4 border border-ink p-4 text-sm" role="alertdialog" aria-label="Restore backup">
              <p className="font-semibold">Replace what’s in this browser with the backup?</p>
              <p className="mt-1 text-mute">
                Backup from {pendingRestore.exportedAt ? new Date(pendingRestore.exportedAt).toLocaleDateString() : 'an unknown date'}: {pendingRestore.snapshots?.length ?? 0} saved months, {pendingRestore.creators?.length ?? 0} creators. This browser currently has {snapshots.length} saved months.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  id="backup-restore-confirm"
                  onClick={() => {
                    restoreBackup(pendingRestore as any);
                    setPendingRestore(null);
                    toast('Backup restored');
                  }}
                  className="rounded-[3px] bg-inv px-4 py-2 font-semibold text-invink"
                >
                  Replace with backup
                </button>
                <button type="button" onClick={() => setPendingRestore(null)} className="px-3 underline">
                  Cancel
                </button>
              </div>
            </div>
          )}
          {usage.nearlyFull && (
            <p className="mt-3 border-l-2 border-ink pl-3 text-sm" role="status">
              This browser’s storage for MonthLens is {Math.round(usage.share * 100)}% full. Download a backup, then remove old months or creative thumbnails you no longer need.
            </p>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-mute">
          <span>Everything stays in this browser. There’s no account.</span>
          {confirmDel === 'ALL' ? (
            <span className="flex items-center gap-2">
              <span className="text-ink">Delete every saved month, plan and setting?</span>
              <button
                type="button"
                id="confirm-reset"
                onClick={() => {
                  resetAll();
                  setConfirmDel(null);
                  location.hash = 'home';
                }}
                className="rounded-[3px] bg-inv px-3 py-1 text-invink"
              >
                Delete everything
              </button>
              <button type="button" onClick={() => setConfirmDel(null)} className="underline">
                Cancel
              </button>
            </span>
          ) : (
            <button type="button" id="reset-all" onClick={() => setConfirmDel('ALL')} className="underline underline-offset-2 hover:text-ink">
              Delete all my data from this browser
            </button>
          )}
        </div>
      </Reveal>
    </div>
  );
}
