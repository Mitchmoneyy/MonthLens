# MonthLens

A plain-English monthly business review for online business owners: a landing page, 60-second onboarding, import center (screenshots with in-browser OCR, CSV/TSV/JSON/PDF, pasted text, guided questions, manual entry), breakdown, ad-format analysis, AI advisor with what-if sliders, history, sharing and exports.

Static site. React + Vite + Tailwind. No backend, no account. Data lives in the browser's localStorage.

```bash
npm install
npm run dev          # local dev server
npm test             # unit tests for the calculation engine and parsers
npm run build        # static site in dist/
node scripts/e2e.mjs # acceptance tests in a real browser (needs Playwright + Chromium)
```

## Live site

https://mitchmoneyy.github.io/MonthLens/ — deployed by `.github/workflows/deploy.yml` on every push to `main` (unit tests must pass first).

## Accounts (optional)

Accounts sync saved months, plans and settings across devices. They use [Supabase](https://supabase.com) (free tier is enough). Without it, the app works the same and keeps data in the browser.

1. Create a Supabase project.
2. In **SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql). It creates one table where each user can only read and write their own row.
3. In **Authentication → URL Configuration**, set **Site URL** to `https://mitchmoneyy.github.io/MonthLens/` and add it under **Redirect URLs**.
4. In **Project Settings → API**, copy the **Project URL** and the **anon public** key.
5. In this GitHub repo: **Settings → Secrets and variables → Actions → Variables**, add `SUPABASE_URL` and `SUPABASE_ANON_KEY`, then re-run the deploy.

The anon key is meant to be public; row-level security in the schema is what keeps each account's data private. Locally, put the same two values in `.env.local` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

`node scripts/e2e-account.mjs` tests sign-up, sign-in, sync between two devices and sign-out against a fake Supabase.

## Where things are

| Path | What |
| --- | --- |
| `src/lib/calc.ts` | The one calculation engine: `computeReview`, `applyScenario`, `recommend`, benchmarks. Every number on screen comes from here, with its formula. |
| `src/lib/samples.ts` | Sample months for all five business types (labelled as samples in the UI). |
| `src/lib/parse/` | Import: text/OCR extraction, messy CSV header detection, PDF text, OCR. Everything returns *candidates* that need approval. |
| `src/lib/chat.ts` | Advisor chat. Local rule engine, plus Claude when running as a claude.ai artifact (with a `run_scenario` tool backed by `calc.ts`). |
| `src/lib/export.ts` | PDF (jsPDF) and CSV built from the same review object as the screen. |
| `src/lib/cloud.ts`, `src/lib/sync.ts`, `src/account.ts` | Optional accounts: Supabase auth, one JSON row per user, merge rules (saved months are never dropped). |
| `src/lib/share.ts` | Share codes: compressed month data, `[A-Za-z0-9-]` only. |
| `public/ocr/` | tesseract.js worker, core and English data, served locally. |
| `public/photos/` | Black-and-white photos from the Start Bootstrap theme library (MIT), originally via Unsplash. |
| `scripts/artifact.mjs` | Packages `dist/` as a claude.ai artifact page. |

## Rules the code follows

- Missing inputs are `null` and render as "Not provided". Nothing is guessed.
- Imported values are never applied without Approve.
- Projections list their assumptions next to the number.
- Benchmarks are hand-set rough estimates and labelled that way.
