import type { MonthInput } from './types';

/** Share codes: the month's input as compressed JSON, encoded with [A-Za-z0-9-] only. */
const PREFIX = 'ML1';

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate-raw');
  const out = new Response(new Blob([bytes]).stream().pipeThrough(cs));
  return new Uint8Array(await out.arrayBuffer());
}
async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}
function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/=+$/, '').replace(/\+/g, '-p').replace(/\//g, '-s');
}
function fromB64(code: string): Uint8Array {
  const b = atob(code.replace(/-p/g, '+').replace(/-s/g, '/'));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

export async function encodeShare(input: MonthInput): Promise<string> {
  const json = JSON.stringify({ v: 1, input });
  return PREFIX + '-' + toB64(await deflate(new TextEncoder().encode(json)));
}

export async function decodeShare(code: string): Promise<MonthInput> {
  const c = code.trim().replace(/^.*#share-/, '');
  if (!c.startsWith(PREFIX + '-')) throw new Error('This is not a MonthLens share code. Codes start with ML1-.');
  const json = new TextDecoder().decode(await inflate(fromB64(c.slice(PREFIX.length + 1))));
  const parsed = JSON.parse(json);
  if (!parsed?.input?.values) throw new Error('The share code is incomplete. Ask for a fresh copy.');
  return parsed.input as MonthInput;
}

export function shareLink(code: string): string {
  // the iPhone app's own address isn't reachable from outside, so app links point at the website
  const base = /^https?:/.test(location.protocol) ? `${location.origin}${location.pathname}` : 'https://mitchmoneyy.github.io/MonthLens/';
  return `${base}#share-${code}`;
}
