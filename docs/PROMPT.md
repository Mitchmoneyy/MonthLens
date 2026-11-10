# MonthLens — the current brief

The original brief plus every change requested since, merged into one prompt. This describes what the product is supposed to be today.

## What it is

MonthLens is a monthly business review for online business owners (e-commerce, SaaS, courses, agencies, creators). They bring last month's numbers from Stripe, Shopify, PayPal, their bank and their ad platforms; it tells them in plain English whether they made money, where it went, which ads worked, and what to change next month. It should feel like a smart CFO plus an ad analyst, not a spreadsheet.

## Who it's for

A solo founder or small team with no finance person. Revenue in Stripe / Shopify / PayPal, ad spend across Meta / Google / TikTok and smaller platforms, costs spread over tools, ads, contractors and fees.

## Where it runs

- A website that works on phone and computer, installable as an app, usable offline.
- An iPhone/iPad app on the App Store, built from the same code.
- Optional accounts on both, syncing data between devices. No login wall.

## Core workflow

1. **Landing page** with real black-and-white photography, a draggable scrolling photo strip, a scroll-driven "where the money went" animation, a scroll-driven focus-lens image (a professional, success-themed photo), and a live try-it panel.
2. **Onboarding in under 60 seconds**: business type (photo cards), money sources, ad platforms, monthly profit goal. Ends on a sample month with a clear "Use my real numbers" button. The answers shape what the app asks for next.
3. **Import center**: screenshots read on the device (OCR), CSV / TSV / TXT / JSON / PDF exports with messy headers and a preview, pasted text, at most 8 plain-language questions, manual entry with sliders. Every detected value is Approve / Edit / Ignore. Nothing is applied without approval. Inputs survive a reload.
4. **Monthly breakdown**: revenue, expenses, net profit, margin, cash in vs out; revenue by product, channel, new vs returning; each expense as $ and % of revenue with a per-sale split; a P&L that downloads as PDF; cash, runway and run-out date; trends vs last month and goal with sparklines; a 0–100 health score with a one-line verdict; break-even and runway tools.
5. **Ad analysis**: by format (video, static, carousel, UGC, story/reel, collection, catalog, search, shopping, Performance Max, display, lead form, influencer, audio, other) and by platform (Meta, Google, TikTok, Pinterest, Snapchat, LinkedIn, Microsoft, Reddit, X, Amazon, other). Spend, impressions, clicks, CTR, CPC, conversions, CPA, revenue, ROAS, profit after ad cost. Auto-labels for winners and losers, a visual comparison, creative thumbnails, a budget mixer.
6. **UGC creators**: a roster of creators with what they're paid. Scan a profile screenshot, post export or pasted text to get post count, best post, typical and average views, engagement, and cost per 1,000 views. Compare creators side by side.
7. **Advisor / next month**: 3–5 fixes ranked by projected monthly profit, each with what to do, why (using their numbers), expected $/month and difficulty; what-if sliders that update profit live; a first-week checklist with a projected profit; a chat grounded in their numbers that always cites its sources; benchmarks labelled as estimates.
8. **History, sharing, export**: monthly snapshots, month-vs-month, Scenario A vs B, share code and link, one-page PDF and CSV.
9. **Accounts**: create account, sign in, email link, password reset, delete account. Privacy and support page.

## Design

- Black, white and gray only. No gradients, neon, coloured cards or AI-looking illustrations. Real photography.
- Should look as little "AI-generated" as possible: distinctive type that fits (Bodoni Moda headlines, Schibsted Grotesk text, Martian Mono figures), square corners, sentence-case labels.
- Interactive enough to keep people in the app: count-up numbers, scroll reveals, sliders, tools, tap-any-number-for-its-formula. Sticky bar with monthly profit always visible.
- Tabs as separate pages. One clear primary action per page. No filler.
- Mobile-first. Light and dark mode. Respects reduced motion.

## Technical

- React + Vite + Tailwind, static site first. All calculations client-side in one tested module, with formulas visible in the app.
- OCR in the browser. Sample data for all five business types.
- Accounts via Supabase. iOS via Capacitor. Fast and smooth on a phone.

## Never

- Invent or guess numbers. Missing values show "Not provided" and are asked for.
- Auto-apply imported values.
- Fake testimonials, benchmarks presented as live data, or stock AI images.
- A login wall. Hardcoded keys or secrets.

## Acceptance tests

1. Sample e-commerce month shows correct profit, margin, ROAS and CAC.
2. Upload a CSV and a screenshot, approve values, see the numbers update.
3. Price +10% in the what-if updates profit live.
4. Onboarding to a finished breakdown in under 60 seconds.
5. A saved snapshot survives a reload.
6. PDF and share link show the same numbers as the screen.
