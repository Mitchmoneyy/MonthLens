/**
 * Where the site lives and how to reach its owner. Change these in `.env` (not here) when moving
 * to a custom domain: VITE_SITE_URL, and optionally VITE_SUPPORT_EMAIL.
 */
const raw = (import.meta.env.VITE_SITE_URL as string | undefined) || 'https://mitchmoneyy.github.io/MonthLens/';
export const SITE_URL = raw.endsWith('/') ? raw : raw + '/';
export const SUPPORT_EMAIL = (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined) || null;
export const ISSUES_URL = 'https://github.com/Mitchmoneyy/MonthLens/issues';
