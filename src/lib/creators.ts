/**
 * UGC creators: roster, per-creator stats, and readers for profile screenshots,
 * pasted text and post exports. Pure functions; everything read is a candidate
 * the owner approves.
 */
import { parseNumber, uid } from './parse/common';
import { norm, parseTable, type Table } from './parse/csv';

export type CreatorPlatform = 'TikTok' | 'Instagram' | 'YouTube' | 'Facebook' | 'X' | 'Other';
export const CREATOR_PLATFORMS: CreatorPlatform[] = ['TikTok', 'Instagram', 'YouTube', 'Facebook', 'X', 'Other'];

export interface CreatorPost {
  id: string;
  title: string;
  date: string | null; // YYYY-MM-DD
  url: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
}

export interface Creator {
  id: string;
  name: string;
  handle: string;
  platform: CreatorPlatform;
  profileUrl: string | null;
  followers: number | null;
  /** post count shown on the profile (all time), if known */
  profilePosts: number | null;
  pay: { type: 'per post' | 'per month'; amount: number | null };
  posts: CreatorPost[];
  isSample?: boolean;
}

export function newCreator(): Creator {
  return { id: uid('cr'), name: '', handle: '', platform: 'TikTok', profileUrl: null, followers: null, profilePosts: null, pay: { type: 'per post', amount: null }, posts: [] };
}

export function newPost(p: Partial<CreatorPost> = {}): CreatorPost {
  return { id: uid('po'), title: '', date: null, url: null, views: null, likes: null, comments: null, shares: null, saves: null, ...p };
}

// ---------------------------------------------------------------- stats

export interface CreatorStats {
  posts: number;
  withViews: number;
  totalViews: number | null;
  avgViews: number | null;
  medianViews: number | null;
  best: CreatorPost | null;
  worst: CreatorPost | null;
  /** (likes + comments + shares + saves) ÷ views, over posts that have views and any engagement */
  engagement: number | null;
  /** average views ÷ followers */
  reach: number | null;
  paid: number | null;
  costPer1k: number | null;
  costPerPost: number | null;
  postsPerWeek: number | null;
  /** typical (median) views of the newer half vs the older half, e.g. 0.2 = +20% */
  trend: number | null;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function creatorStats(c: Creator): CreatorStats {
  const posts = c.posts;
  const viewed = posts.filter((p) => p.views !== null) as (CreatorPost & { views: number })[];
  const views = viewed.map((p) => p.views);
  const totalViews = viewed.length ? sum(views) : null;
  const engaged = viewed.filter((p) => p.views > 0 && [p.likes, p.comments, p.shares, p.saves].some((x) => x !== null));
  const engagement = engaged.length ? sum(engaged.map((p) => (p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0) + (p.saves ?? 0))) / sum(engaged.map((p) => p.views)) : null;
  const avgViews = viewed.length ? (totalViews as number) / viewed.length : null;
  const sortedByViews = [...viewed].sort((a, b) => b.views - a.views);

  const dates = posts.map((p) => p.date).filter(Boolean).sort() as string[];
  const months = new Set(dates.map((d) => d.slice(0, 7))).size || 1;
  let paid: number | null = null;
  if (c.pay.amount !== null) paid = c.pay.type === 'per post' ? c.pay.amount * posts.length : c.pay.amount * months;
  let postsPerWeek: number | null = null;
  if (dates.length >= 2) {
    const days = (Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / 864e5;
    if (days >= 6) postsPerWeek = (dates.length / days) * 7;
  }
  let trend: number | null = null;
  const dated = viewed.filter((p) => p.date).sort((a, b) => (a.date as string).localeCompare(b.date as string));
  if (dated.length >= 4) {
    const h = Math.floor(dated.length / 2);
    // medians, so one viral post doesn't decide the direction
    const older = median(dated.slice(0, h).map((p) => p.views)) as number;
    const newer = median(dated.slice(dated.length - h).map((p) => p.views)) as number;
    if (older > 0) trend = newer / older - 1;
  }
  return {
    posts: posts.length,
    withViews: viewed.length,
    totalViews,
    avgViews,
    medianViews: median(views),
    best: sortedByViews[0] ?? null,
    worst: sortedByViews.length > 1 ? sortedByViews[sortedByViews.length - 1] : null,
    engagement,
    reach: avgViews !== null && c.followers ? avgViews / c.followers : null,
    paid,
    costPer1k: paid !== null && totalViews ? (paid / totalViews) * 1000 : null,
    costPerPost: paid !== null && posts.length ? paid / posts.length : null,
    postsPerWeek,
    trend,
  };
}

/** Plain-language read of one creator, built only from their numbers. */
export function creatorInsights(c: Creator, s: CreatorStats): string[] {
  const out: string[] = [];
  const n = (x: number) => Math.round(x).toLocaleString('en-US');
  if (!s.withViews) return ['Add posts with view counts to see how this creator performs.'];
  if (s.best && s.avgViews) {
    const x = s.best.views! / s.avgViews;
    out.push(`Best post${s.best.title ? ` (“${s.best.title}”)` : ''} got ${n(s.best.views!)} views, ${x.toFixed(1)}× their average.${x >= 3 ? ' One post is carrying the average; the median is the fairer number.' : ''}`);
  }
  if (s.medianViews !== null && s.avgViews !== null && s.avgViews > s.medianViews * 1.5) out.push(`A typical post gets about ${n(s.medianViews)} views (median), well below the ${n(s.avgViews)} average.`);
  if (s.reach !== null) out.push(s.reach >= 0.3 ? `Posts reach ${Math.round(s.reach * 100)}% of their follower count on average. Strong for their size.` : s.reach < 0.05 ? `Posts reach only ${Math.round(s.reach * 100)}% of their follower count. Followers may not be engaged.` : `Posts reach about ${Math.round(s.reach * 100)}% of their follower count.`);
  if (s.engagement !== null) out.push(`Engagement is ${(s.engagement * 100).toFixed(1)}% of views${s.engagement >= 0.08 ? ', which is high' : s.engagement < 0.02 ? ', which is low' : ''}.`);
  if (s.trend !== null && Math.abs(s.trend) >= 0.15) out.push(`Recent posts typically get ${Math.abs(Math.round(s.trend * 100))}% ${s.trend > 0 ? 'more' : 'fewer'} views than earlier ones.`);
  if (s.costPer1k !== null) out.push(`You pay about $${s.costPer1k.toFixed(2)} per 1,000 views${s.costPerPost !== null ? ` ($${n(s.costPerPost)} per post)` : ''}.`);
  if (s.postsPerWeek !== null) out.push(`Posting about ${s.postsPerWeek.toFixed(1)} times a week.`);
  return out;
}

/** Labels across the roster: who wins what. */
export function rosterLabels(list: { c: Creator; s: CreatorStats }[]): Record<string, string[]> {
  const out: Record<string, string[]> = Object.fromEntries(list.map((x) => [x.c.id, []]));
  const top = (pick: (s: CreatorStats) => number | null, label: string, low = false) => {
    const xs = list.filter((x) => pick(x.s) !== null);
    if (xs.length < 2) return;
    const w = xs.reduce((a, b) => ((low ? pick(b.s)! < pick(a.s)! : pick(b.s)! > pick(a.s)!) ? b : a));
    out[w.c.id].push(label);
  };
  top((s) => s.medianViews, 'Most views per post');
  top((s) => s.engagement, 'Best engagement');
  top((s) => s.costPer1k, 'Cheapest views', true);
  top((s) => s.best?.views ?? null, 'Best single post');
  return out;
}

// ---------------------------------------------------------------- reading screenshots / pasted profile text

export interface ProfileRead {
  platform: CreatorPlatform | null;
  handle: string | null;
  followers: number | null;
  profilePosts: number | null;
  /** view counts read off the post grid, in reading order */
  gridViews: number[];
}

const NUM = String.raw`(\d[\d,]*(?:\.\d+)?\s?[KkMm]?)`;

function near(lines: string[], label: RegExp): number | null {
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!label.test(l)) continue;
    const same = l.match(new RegExp(NUM + String.raw`\s*` + label.source, 'i')) || l.match(new RegExp(label.source + String.raw`\s*:?\s*` + NUM, 'i'));
    const tok = same?.[same.length - 1] && /\d/.test(same[same.length - 1]) ? same[same.length - 1] : same?.[1];
    if (tok) {
      const v = parseNumber(tok.replace(/\s/g, ''));
      if (v !== null) return v;
    }
    // label on its own line: TikTok/Instagram put the number on the line above, sometimes below
    for (const j of [i - 1, i + 1]) {
      const m = lines[j]?.trim().match(new RegExp('^' + NUM + '$'));
      if (m) return parseNumber(m[1].replace(/\s/g, ''));
    }
  }
  return null;
}

const LABEL_RE = /\b(following|followers|likes|posts|subscribers|videos)\b/gi;
const NUM_TOKEN = /\d[\d,]*(?:\.\d+)?\s?[KkMm]?(?![\w])/g;

/**
 * Profiles put a row of numbers over a row of labels ("210 63.5K 1.1M" / "Following Followers Likes"),
 * so OCR reads them as two lines. Pair them up by column.
 */
function headerColumns(lines: string[]): { map: Record<string, number>; numberLine: number } | null {
  for (let i = 1; i < lines.length; i++) {
    const labels = [...lines[i].matchAll(LABEL_RE)].map((m) => m[1].toLowerCase());
    if (labels.length < 2) continue;
    const nums = (lines[i - 1].match(NUM_TOKEN) ?? []).map((t) => parseNumber(t.replace(/\s/g, '')));
    if (nums.length !== labels.length || nums.some((x) => x === null)) continue;
    return { map: Object.fromEntries(labels.map((l, k) => [l, nums[k] as number])), numberLine: i - 1 };
  }
  return null;
}

export function readProfileText(text: string): ProfileRead {
  const t = text.toLowerCase();
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const platform: CreatorPlatform | null = /tiktok/.test(t) ? 'TikTok' : /instagram|\breels\b/.test(t) ? 'Instagram' : /youtube|subscribers/.test(t) ? 'YouTube' : /facebook/.test(t) ? 'Facebook' : null;
  const handle = text.match(/@([A-Za-z0-9._]{2,30})/)?.[1] ?? null;
  const cols = headerColumns(lines);
  const followers = cols?.map.followers ?? cols?.map.subscribers ?? near(lines, /followers|subscribers/i);
  // "Videos" on TikTok is a tab label, so only trust it when the count is on the same line (YouTube: "96 videos")
  const sameLineVideos = text.match(new RegExp(NUM + String.raw`\s*videos\b`, 'i'))?.[1];
  const profilePosts = cols?.map.posts ?? near(lines, /\bposts\b/i) ?? (sameLineVideos ? parseNumber(sameLineVideos.replace(/\s/g, '')) : null);
  const used = new Set([followers, profilePosts, cols?.map.following ?? near(lines, /following/i), cols?.map.likes ?? near(lines, /\blikes\b/i)].filter((x) => x !== null));
  const gridViews: number[] = [];
  lines.forEach((l, i) => {
    if (i === cols?.numberLine) return;
    // a row of grid tiles: only counts, maybe with play icons OCR'd as > or D, maybe "views"
    const bare = l.replace(/[▷►>]|\bD\b|\b(views?|plays?)\b/gi, ' ').trim();
    if (!bare || !/^[\d.,\sKkMm]+$/.test(bare)) return;
    for (const tok of bare.match(NUM_TOKEN) ?? []) {
      const v = parseNumber(tok.replace(/\s/g, ''));
      if (v === null || v < 10 || used.has(v) || /^\d{4}$/.test(tok.trim())) continue;
      gridViews.push(v);
    }
  });
  return { platform, handle, followers, profilePosts, gridViews: gridViews.slice(0, 30) };
}

// ---------------------------------------------------------------- post exports (CSV / TSV)

type PostRole = 'title' | 'date' | 'views' | 'likes' | 'comments' | 'shares' | 'saves' | 'url' | 'ignore';
const POST_SYNONYMS: [PostRole, string[]][] = [
  ['url', ['permalink', 'link', 'url', 'video link', 'post link']],
  ['title', ['video title', 'title', 'description', 'caption', 'post', 'content', 'video']],
  ['date', ['post time', 'publish time', 'published', 'date posted', 'date', 'created', 'time']],
  ['views', ['total views', 'video views', 'views', 'plays', 'impressions', 'reach']],
  ['likes', ['total likes', 'likes', 'reactions', 'hearts']],
  ['comments', ['total comments', 'comments']],
  ['shares', ['total shares', 'shares', 'reposts']],
  ['saves', ['saves', 'saved', 'favorites', 'bookmarks']],
];

export function postRoles(headers: string[]): PostRole[] {
  const seen = new Set<PostRole>();
  return headers.map((h) => {
    const n = norm(h);
    let role: PostRole = 'ignore';
    for (const [r, syns] of POST_SYNONYMS) if (syns.some((s) => n === s)) { role = r; break; }
    if (role === 'ignore') for (const [r, syns] of POST_SYNONYMS) if (syns.some((s) => s.length > 3 && n.includes(s))) { role = r; break; }
    if (role !== 'ignore' && seen.has(role)) return 'ignore';
    seen.add(role);
    return role;
  });
}

function isoDate(s: string): string | null {
  if (!s) return null;
  const d = Date.parse(s);
  if (Number.isNaN(d)) return null;
  return new Date(d).toISOString().slice(0, 10);
}

export function postsFromTable(table: Table): CreatorPost[] {
  const roles = postRoles(table.headers);
  const at = (r: PostRole) => roles.indexOf(r);
  if (at('views') < 0) return [];
  return table.rows
    .map((row) => {
      const cell = (r: PostRole) => (at(r) >= 0 ? row[at(r)] ?? '' : '');
      const n = (r: PostRole) => (at(r) >= 0 ? parseNumber(cell(r)) : null);
      return newPost({ title: cell('title').slice(0, 120), date: isoDate(cell('date')), url: cell('url') || null, views: n('views'), likes: n('likes'), comments: n('comments'), shares: n('shares'), saves: n('saves') });
    })
    .filter((p) => p.views !== null);
}

export function postsFromCsv(text: string): CreatorPost[] {
  return postsFromTable(parseTable(text));
}

// ---------------------------------------------------------------- sample roster (labelled as samples in the UI)

const sp = (title: string, date: string, views: number, likes: number, comments: number, shares: number, saves: number) => newPost({ title, date, views, likes, comments, shares, saves });

export const SAMPLE_CREATORS: Creator[] = [
  {
    id: 'sample-maya',
    name: 'Maya (sample)',
    handle: 'maya.makes',
    platform: 'TikTok',
    profileUrl: null,
    followers: 48200,
    profilePosts: 212,
    pay: { type: 'per post', amount: 350 },
    isSample: true,
    posts: [
      sp('Unboxing the canvas tote', '2026-10-02', 18400, 1320, 88, 140, 210),
      sp('3 ways to pack it', '2026-10-06', 9100, 610, 41, 52, 98),
      sp('Rain test', '2026-10-11', 142000, 9800, 620, 1900, 2400),
      sp('Day in my bag', '2026-10-17', 12600, 840, 57, 66, 130),
      sp('Gift guide', '2026-10-24', 21300, 1510, 102, 180, 330),
      sp('Before / after wallet', '2026-10-29', 15800, 990, 64, 81, 150),
    ],
  },
  {
    id: 'sample-jordan',
    name: 'Jordan (sample)',
    handle: 'jordanreviews',
    platform: 'Instagram',
    profileUrl: null,
    followers: 126000,
    profilePosts: 640,
    pay: { type: 'per month', amount: 1800 },
    isSample: true,
    posts: [
      sp('Reel: honest review', '2026-10-03', 22100, 610, 40, 22, 95),
      sp('Carousel: what fits inside', '2026-10-09', 8400, 380, 18, 6, 140),
      sp('Reel: commute setup', '2026-10-15', 19800, 520, 31, 19, 70),
      sp('Story set: Q&A', '2026-10-21', 6100, 90, 12, 3, 8),
      sp('Reel: 30-day wear test', '2026-10-28', 25400, 700, 52, 30, 110),
    ],
  },
  {
    id: 'sample-sam',
    name: 'Sam (sample)',
    handle: 'samshoots',
    platform: 'YouTube',
    profileUrl: null,
    followers: 21500,
    profilePosts: 96,
    pay: { type: 'per post', amount: 900 },
    isSample: true,
    posts: [
      sp('Short: leather close-up', '2026-10-05', 31000, 1900, 74, 120, 0),
      sp('Everyday carry review (10 min)', '2026-10-19', 11800, 830, 140, 40, 0),
    ],
  },
];
