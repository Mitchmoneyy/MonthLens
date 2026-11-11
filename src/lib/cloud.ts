/**
 * Optional accounts, backed by Supabase (auth + one row of JSON per user).
 * Configured at build time with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
 * The anon key is public by design; each user can only read and write their own row
 * (row-level security, see supabase/schema.sql).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SyncedData } from './sync';
import { SITE_URL } from './site';

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Inside the claude.ai viewer the page can't reach other servers, so accounts live on the web app only. */
export const inClaudeViewer = () => typeof window !== 'undefined' && !!window.claude?.use;

export type CloudAvailability = 'ready' | 'not-configured' | 'viewer';
export function availability(): CloudAvailability {
  if (inClaudeViewer()) return 'viewer';
  if (!URL_ || !KEY) return 'not-configured';
  return 'ready';
}

export const WEB_APP_URL = SITE_URL;

let clientPromise: Promise<SupabaseClient> | null = null;
export function client(): Promise<SupabaseClient> {
  if (availability() !== 'ready') return Promise.reject(new Error('Accounts are not available here.'));
  if (!clientPromise)
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(URL_!, KEY!, {
        auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'monthlens.auth' },
      }),
    );
  return clientPromise;
}

/** Where emailed links send people back to: this page, on the Account tab. */
const backHere = () => (/^https?:/.test(location.protocol) ? `${location.origin}${location.pathname}#account` : `${WEB_APP_URL}#account`);

/** In the iPhone app, emailed links open the website, so they can't sign the app in. */
export const emailLinksReturnHere = () => /^https?:/.test(location.protocol);

/** Plain-language versions of Supabase's auth errors. */
export function friendly(err: unknown): string {
  const m = String((err as { message?: string })?.message ?? err ?? '');
  if (/invalid login credentials/i.test(m)) return 'That email and password don’t match an account.';
  if (/email not confirmed/i.test(m)) return 'Confirm your email first. Check your inbox for the link we sent.';
  if (/already registered|already been registered/i.test(m)) return 'There’s already an account with that email. Sign in instead.';
  if (/password should be at least/i.test(m)) return 'Use a password of at least 8 characters.';
  if (/rate limit|too many/i.test(m)) return 'Too many tries. Wait a minute and try again.';
  if (/failed to fetch|network/i.test(m)) return 'Couldn’t reach the account server. Check your connection and try again.';
  if (/invalid email|unable to validate email/i.test(m)) return 'That email address doesn’t look right.';
  return m || 'Something went wrong. Try again.';
}

export async function signUp(email: string, password: string) {
  const sb = await client();
  const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: backHere() } });
  if (error) throw error;
  // Supabase returns a user with no identities when the email is already taken (to avoid leaking it)
  if (data.user && data.user.identities && data.user.identities.length === 0) throw new Error('already registered');
  return { needsConfirm: !data.session };
}

export async function signIn(email: string, password: string) {
  const sb = await client();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function sendMagicLink(email: string) {
  const sb = await client();
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: backHere(), shouldCreateUser: true } });
  if (error) throw error;
}

export async function sendReset(email: string) {
  const sb = await client();
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: backHere() });
  if (error) throw error;
}

export async function setPassword(password: string) {
  const sb = await client();
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw error;
}

export async function signOut() {
  const sb = await client();
  await sb.auth.signOut();
}

// ---------------------------------------------------------------- data (one row per user)

export async function loadRemote(userId: string): Promise<SyncedData | null> {
  const sb = await client();
  const { data, error } = await sb.from('workspaces').select('data').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return (data?.data as SyncedData) ?? null;
}

export async function saveRemote(userId: string, payload: SyncedData) {
  const sb = await client();
  const { error } = await sb.from('workspaces').upsert({ user_id: userId, data: payload, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/** Send a note to the site owner. Stored in the `feedback` table; the app can write to it but not read it. */
export async function sendFeedback(message: string, contact: string, page: string) {
  const sb = await client();
  const { data } = await sb.auth.getSession();
  const { error } = await sb.from('feedback').insert({ message: message.trim().slice(0, 4000), contact: contact.trim().slice(0, 200) || null, page: page.slice(0, 60), user_id: data.session?.user.id ?? null });
  if (error) throw error;
}

/** Delete the login and everything stored with it. */
export async function deleteAccount() {
  const sb = await client();
  const { error } = await sb.rpc('delete_my_account');
  if (error) throw error;
  await sb.auth.signOut({ scope: 'local' }).catch(() => {});
}
