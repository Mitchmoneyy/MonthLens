# MonthLens — audit and proposed roadmap

Status: **Fixes and Refinements approved and built** (November 11, 2026). Expansions and the two larger restructures are not started and still need a decision.

Done: Fixes 1–7 and Refinements 1, 2 (errors and loading), 3, 8, plus larger touch targets from 4. Fix 2 and Fix 3 were done without the data-model restructure. Not done: Refinement 7 (splitting the two largest files) and swipe between tabs.
Audit date: November 10, 2026, at commit `fbf9bd9`.

## Audit

### What the app does today
A monthly business review for online business owners. They import last month's numbers (screenshots, exports, paste, questions, manual), approve what was read, and get a breakdown, ad format and platform analysis, a UGC creators section, a ranked next-month plan with what-if tools, history, sharing and exports. Optional accounts sync between devices. It runs as a website, an installable offline app, and an iOS project ready for the App Store.

### Stack and structure
- React 18, TypeScript, Vite, Tailwind, Zustand. Static site, no server of its own.
- `src/lib/` holds all logic with no UI: `calc.ts` (every number and formula), `parse/` (OCR, CSV, PDF, text), `creators.ts`, `sync.ts`, `cloud.ts`, `share.ts`, `export.ts`, `chat.ts`.
- `src/pages/` one file per tab; `src/components/` shared UI and tools; `src/store.ts` state saved to the browser; `src/account.ts` sign-in and sync.
- Supabase for accounts (one JSON row per user, row-level security). Capacitor for iOS (`ios/`). GitHub Actions deploys the site and builds the iOS app.
- About 8,500 lines of app code, 70 unit tests, 36 browser checks, 11 account checks.

### Working well
- Every number comes from one tested calculation module; missing inputs stay "Not provided".
- Imports never apply without approval; tested end to end including real OCR.
- Landing page loads 521 KB; Lighthouse on a simulated phone: performance 87, accessibility 95, best practices 100, layout shift 0.
- No requests to third-party servers. Works offline.

### Broken, unfinished or fragile
| # | Finding | Evidence |
| --- | --- | --- |
| A1 | Accounts are built but switched off: no Supabase project is connected. | Account page shows "not switched on" |
| A2 | The iOS build has never run. It needs Apple credentials, and the Mac runner / Xcode version is unverified. | `ios.yml` untested |
| A3 | Outdated dependencies with published advisories: Supabase auth client, jsPDF's HTML sanitizer, pdf.js. | `npm audit`: 8 findings |
| A4 | Changing the month in the top bar only relabels the numbers on screen. It does not open that month. | `setMonth` in `store.ts` |
| A5 | Two devices editing the same month offline: the later one overwrites the other's working month (saved months are safe). | `mergeData` in `sync.ts` |
| A6 | Text contrast fails in places (the lightest gray, and sections mid-reveal). | axe: color-contrast on 8 of 10 screens |
| A7 | Keyboard and screen-reader gaps: no main landmark on landing/onboarding, wide tables can't be scrolled by keyboard, a chart nests buttons inside an image role, heading order skips, dialogs don't trap focus, tabs lack arrow keys. | axe + review |
| A8 | Outside claude.ai the "AI advisor" is a rule engine, not a model. When Claude fails inside claude.ai it falls back silently. | `chat.ts`, `Advisor.tsx` |
| A9 | All data lives in browser storage (about 5 MB, can be cleared by the browser). No full backup or restore. | `store.ts` |
| A10 | Dropping several files imports only the first. | `FileTab` in `Import.tsx` |
| A11 | No lint or format tooling; 33 loose `any` types; browser tests don't run in CI. | repo config |
| A12 | The offline cache downloads 4.8 MB, including font subsets for scripts the app doesn't use. | build output |
| A13 | Dead code: unused `deleteCloudData`, unused jsPDF HTML chunks shipped. | grep |
| A14 | The claude.ai copy is updated by hand and is behind the website. | last published before Creators |
| A15 | No social preview, no `robots.txt`; USD and English only. | Lighthouse SEO 92 |
| A16 | `Import.tsx` (733 lines) and `calc.ts` (861) are large single files. | line counts |

## Proposed roadmap

### Fixes
1. **Upgrade vulnerable dependencies** (Supabase client, jsPDF, pdf.js) and add `npm audit` to CI. (A3)
2. **Month picker opens the month.** Selecting a month loads its saved numbers or starts a blank one, after confirming unsaved changes. (A4)
3. **Safer sync.** Merge the working month field by field using per-field timestamps, so two devices don't overwrite each other. (A5)
4. **Full backup and restore**: one file with everything, plus a warning before storage fills. (A9)
5. **Multi-file import.** (A10)
6. **Remove dead code and unused chunks; trim the offline cache** to Latin fonts and what's used. (A12, A13)
7. **CI runs the browser tests** on every push; add ESLint and Prettier; tighten the loose types. (A11)
8. **Automate the claude.ai publish**, or retire that copy. (A14)

### Refinements
1. **Accessibility to WCAG AA**: contrast, landmarks, heading order, keyboard-scrollable tables, focus-trapped dialogs, arrow-key tabs, chart alternatives; add the axe scan to CI. (A6, A7)
2. **Consistent states everywhere**: one loading, empty and error pattern on every screen; clear OCR and file errors with a next step.
3. **Advisor honesty and failure handling**: say plainly which engine answered; show timeouts, rate limits and bad responses with a retry. (A8)
4. **Mobile pass**: thumb-reach primary actions, larger tap targets in tables, swipe between tabs in the installed app.
5. **Performance**: target Lighthouse 95+ on a mid-range phone; trim first-load JavaScript further.
6. **Copy pass**: one voice, shorter labels, consistent terms across tabs.
7. **Split the two largest files** by feature without changing behaviour. (A16)
8. **Social preview and `robots.txt`.** (A15)

### Expansions
1. **Real AI advisor on the website and app**, through a small server function that holds the API key. *Why: the key feature is currently rules outside claude.ai.*
2. **Multi-month workspace**: every month kept and editable, with year-to-date and rolling averages. *Why: a monthly review is only useful over time.*
3. **Live connections** to Stripe and Shopify (read-only). *Why: removes the monthly import chore, the biggest reason people stop.*
4. **Monthly reminder and email summary.** *Why: brings people back on the 1st.*
5. **Android app** from the same Capacitor project. *Why: half of phone users.*
6. **Currencies and number formats.** *Why: opens it to non-US businesses.*
7. **Team sharing**: invite a partner or bookkeeper to an account, view-only or edit. *Why: replaces sending share codes.*
8. **Creator connections** via official TikTok and Instagram APIs. *Why: real scanning instead of screenshots; needs platform approval.*

### Larger restructures to decide on
- **Month-keyed data model** (Fix 2, Fix 3, Expansion 2). Today the app holds one "current month" plus snapshots. Moving to "a list of months" makes the month picker, sync and history simpler and more correct. Tradeoff: it touches the store, sync and History, and needs a one-time migration of saved data. Recommended.
- **A backend for AI and live connections** (Expansions 1, 3, 4, 8). Supabase Edge Functions keep it on the current stack. Tradeoff: running costs, secrets to manage, and the privacy page changes from "nothing leaves your device" to "what you send to the advisor is processed by Anthropic".
