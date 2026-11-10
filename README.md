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

## Where things are

| Path | What |
| --- | --- |
| `src/lib/calc.ts` | The one calculation engine: `computeReview`, `applyScenario`, `recommend`, benchmarks. Every number on screen comes from here, with its formula. |
| `src/lib/samples.ts` | Sample months for all five business types (labelled as samples in the UI). |
| `src/lib/parse/` | Import: text/OCR extraction, messy CSV header detection, PDF text, OCR. Everything returns *candidates* that need approval. |
| `src/lib/chat.ts` | Advisor chat. Local rule engine, plus Claude when running as a claude.ai artifact (with a `run_scenario` tool backed by `calc.ts`). |
| `src/lib/export.ts` | PDF (jsPDF) and CSV built from the same review object as the screen. |
| `src/lib/share.ts` | Share codes: compressed month data, `[A-Za-z0-9-]` only. |
| `public/ocr/` | tesseract.js worker, core and English data, served locally. |
| `public/photos/` | Black-and-white photos from the Start Bootstrap theme library (MIT), originally via Unsplash. |
| `scripts/artifact.mjs` | Packages `dist/` as a claude.ai artifact page. |

## Rules the code follows

- Missing inputs are `null` and render as "Not provided". Nothing is guessed.
- Imported values are never applied without Approve.
- Projections list their assumptions next to the number.
- Benchmarks are hand-set rough estimates and labelled that way.
