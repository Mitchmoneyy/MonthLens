# Launch checklist

What's automated, and what only the owner can do.

## Already automated

| What | Where |
| --- | --- |
| Tests, security audit, lint and accessibility scan before every deploy | `.github/workflows/deploy.yml` |
| Live site check after every deploy and once a day (site loads, calculates, account server answers). GitHub emails the owner on failure. | `.github/workflows/live-check.yml` |
| Weekly dependency update pull requests, each fully tested | `.github/dependabot.yml` |
| App Store screenshots at Apple's sizes | `node scripts/store-screenshots.mjs` |
| iOS build and upload to App Store Connect | `.github/workflows/ios.yml` (needs Apple secrets) |

## Owner steps, in order

1. **Run the feedback SQL.** In Supabase → SQL Editor, run the last block of `supabase/schema.sql` (the `feedback` table). Until then the in-app feedback form falls back to the issue tracker. Read feedback in Table Editor → `feedback`.
2. **Create your own account on the live site** and confirm the email link returns you signed in.
3. **Set the Site URL** in Supabase → Authentication → URL Configuration to the site's address.
4. **Paste the branded email templates** from `supabase/email-templates/` (see its README).
5. **Connect an email service** (Supabase → Authentication → Emails → SMTP Settings). The built-in sender only sends a few emails an hour.
6. **Buy a domain**, then:
   - add a `public/CNAME` file containing the domain, and set it under GitHub → Settings → Pages
   - change `VITE_SITE_URL` in `.env` (and optionally `VITE_SUPPORT_EMAIL`)
   - update the Site URL in Supabase and the URLs in `store/APP_STORE.md`
7. **Run a real month through the app** with your own exports and screenshots.
8. **Have the privacy and terms page reviewed** by a lawyer before taking payments or marketing widely.
9. **App Store:** enrol in the Apple Developer Program, add the four signing secrets, run the iOS workflow, then submit with `store/APP_STORE.md`.

## Decisions still open

- Pricing (free, paid, or subscription). Affects the App Store setup.
- A real AI advisor on the website and app (needs a small paid backend; changes the privacy promise).
- Visitor analytics (the privacy page currently promises none).
