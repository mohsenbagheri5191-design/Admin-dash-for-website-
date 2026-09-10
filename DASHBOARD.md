# North Leaf — gated dashboard

The marketing site with a login-gated research platform bolted on at
`/login` and `/dashboard`, sharing one Supabase project — the same accounts
and the same Edge Functions — with the **Amazon Market Research Pro** Chrome
extension.

One login works in both places. No business logic is duplicated anywhere.

- **Design audit and token list:** [`DESIGN-TOKENS.md`](DESIGN-TOKENS.md)
- **Review screenshots:** [`docs/proof/`](docs/proof/)

---

## Contents

1. [What this is](#1-what-this-is)
2. [Where the logic lives](#2-where-the-logic-lives)
3. [Local development](#3-local-development)
4. [Environment variables](#4-environment-variables)
5. [Adding a user](#5-adding-a-user)
6. [Deploying](#6-deploying)
7. [The CORS allowlist](#7-the-cors-allowlist)
8. [Security posture](#8-security-posture)
9. [Before and after: shared files](#9-before-and-after-shared-files)
10. [Endpoints that do not exist yet](#10-endpoints-that-do-not-exist-yet)
11. [Acceptance criteria, checked](#11-acceptance-criteria-checked)

---

## 1. What this is

```
/                       marketing site — unchanged except one nav + footer link
/login                  sign in. Invite only. No signup link anywhere.
/dashboard/             Market Analysis   — 7 KPIs, 6 charts, Opportunity Score
/dashboard/market-share Market Share      — 7 KPIs, 3 charts, advisories, brand table
/dashboard/portfolio    My Products       — 7 KPIs, 4 charts, family rollups
/dashboard/admin        Administration    — admins only, enforced server-side
```

Twenty-one KPI tiles across the three research dashboards, thirteen Chart.js
visualisations, and the Research Opportunity Score in both a ranked bar list
and a sortable table.

### Stack

Static HTML, CSS and ES modules. **No bundler, no framework, no build output
directory.** The one build step (`tools/build-config.mjs`) writes two files
and exits. This matches how the marketing site was already built, and it means
what you read in `assets/js/` is exactly what the browser runs.

Chart.js 4.4.7 and supabase-js 2.58.0 are **vendored** into
`assets/vendor/`, not loaded from a CDN. That buys a stricter Content
Security Policy (no third-party script origin at all), removes a CDN outage
from the critical path, and makes the site work offline in development.

### File map

```
assets/
├── css/
│   ├── tokens.css          derived design tokens (see DESIGN-TOKENS.md)
│   └── dashboard.css       every dashboard component
├── js/
│   ├── env.js              GENERATED — Supabase URL + anon key
│   ├── api.js              the Supabase client and the whole API layer
│   ├── shell.js            route guard + sidebar/account/quota chrome
│   ├── ui.js               escaping, formatting, icons, skeletons, toasts, modal, CSV
│   ├── charts.js           Chart.js restyled to the site palette
│   ├── workbook.js         CSV/TSV/XLSX → raw rows (no third-party parser)
│   ├── dataset.js          the working dataset, per user, per tab
│   ├── source-bar.js       the upload / sample-data panel
│   ├── login.js            login page behaviour
│   ├── boot/*.js           four two-line page entry points
│   └── views/
│       ├── analysis.js     Market Analysis
│       ├── market-share.js Market Share
│       ├── portfolio.js    My Products
│       └── admin.js        Administration
├── vendor/                 Chart.js + supabase-js, pinned, with licences
└── data/
    └── sample-market.json  273 real listings, 41 brands — the sample dataset
tools/
├── build-config.mjs        writes assets/js/env.js and _headers
└── verify-no-secrets.sh    proves no model or credential is in the bundle
```

Dashboard code and marketing code never share a file. The only overlap is
`css/style.css` and `js/main.js`, which the dashboard **consumes unchanged**
so the nav, footer and buttons are literally the same objects.

---

## 2. Where the logic lives

> **The rule: the browser sends rows up and draws what comes back.**

Every unit estimate, revenue estimate, opportunity score, market share
figure, HHI value, concentration verdict and advisory sentence is computed by
the `research` Edge Function and arrives finished. `assets/js/` contains no
coefficient, no regression, no scoring formula.

| The client does | The server does |
|---|---|
| Map workbook column names to the API's field names | Estimate units and revenue from BSR, price, reviews, badge, family size |
| POST the rows | Compute the Research Opportunity Score |
| Sort, filter, paginate and format what comes back | Bucket price / unit / rank / rating bands |
| Sum server-returned per-ASIN values for a family subtotal | Compute brand share, HHI, concentration |
| Draw charts | Write the competitive advisories |

**Proof:**

```bash
bash tools/verify-no-secrets.sh
```

It greps everything served (excluding the vendored MIT libraries) for each of
the seven model coefficients, for the formula shapes, and for anything shaped
like a private credential. It exits non-zero on a single hit. Current result:

```
PASS — no model coefficients, no derived formulas, no secrets in anything served.
```

### The API layer

`assets/js/api.js` is the only file that touches the network.

- **supabase-js handles auth only** — sign in, session persistence, silent
  token refresh, cross-tab sync. It is very good at this.
- **`fetch` handles the Edge Functions** — because they return a precise
  envelope, `{ error: { code, message, detail } }`, and the UI branches on
  `code`. Routing through `functions.invoke()` would flatten every non-2xx
  into one generic client error and lose that.

`ErrorCode` in `api.js` mirrors `supabase/functions/_shared/errors.ts`. Each
code maps to friendly copy in `describeError()`:

| Code | Status | What the user sees |
|---|---|---|
| `invalid_token` | 401 | "Session expired" → bounced to `/login?reason=expired` |
| `no_profile` | 403 | "No access on this account" |
| `account_disabled` | 403 | "Access turned off" |
| `account_expired` | 403 | "Access period ended" |
| `quota_exceeded` | 403 | "Monthly quota used up" |
| `not_admin` | 403 | "Administrators only" |
| `origin_not_allowed` | 403 | "This site is not authorised" (see §7) |
| `kill_switch` | 503 | "Down for maintenance" |
| `network_error` | — | "Cannot reach the server" |

### Where the data comes from

The website **cannot scrape Amazon** — only an extension can, because only an
extension holds host permissions for `amazon.ca` / `amazon.com`. So the way
in is a file, exactly as it is in the extension's own Market Analysis and
Brand Share tabs: upload a Helium 10 Xray export or a Product Details
workbook, and the rows go to `research` for scoring.

A bundled sample (273 real listings, 41 brands, the same Helium 10 export
that ships inside the extension) is one click away, so a new account sees
every panel populated before uploading anything.

`workbook.js` reads `.csv`, `.tsv` and `.xlsx` with **no third-party parser**.
An `.xlsx` is a ZIP of XML, and `DecompressionStream('deflate-raw')` is
available in every browser this site supports — about 200 lines here, versus
a 900 KB dependency whose only npm-published version (`xlsx@0.18.5`) carries
CVE-2023-30533. The newer fixed releases are not on npm.

---

## 3. Local development

```bash
git clone <this repo>
cd Admin-dash-for-website-

node tools/build-config.mjs        # writes assets/js/env.js and _headers
npx http-server -p 8080 -s .       # or: python3 -m http.server 8080
```

Open <http://127.0.0.1:8080>. Sign in at `/login.html` with a real account.

`http://localhost:5173` and `http://127.0.0.1:5173` are already on the API's
CORS allowlist; add your port with the SQL in §7 if you use a different one.

> Open pages over **http://**, not `file://`. Everything uses absolute paths
> (`/assets/js/...`) and ES modules, both of which need a real origin.

### Running the checks

Accessibility, visual regression against the original marketing site,
keyboard traversal and screenshots all run through Playwright. The harness is
not committed (it needs network-stubbing fixtures specific to a CI runner);
`docs/proof/` holds its output.

---

## 4. Environment variables

Exactly two, both public by design. See `.env.example`.

| Variable | Value | Why it is safe in a browser |
|---|---|---|
| `SUPABASE_URL` | `https://ftwkxuqqnbtuegabxxnj.supabase.co` | A hostname |
| `SUPABASE_ANON_KEY` | anon JWT or `sb_publishable_…` | Identifies the project; grants nothing. Every table is behind RLS, and every Edge Function re-reads the caller's profile before doing any work |

Set them in **Netlify → Site configuration → Environment variables**. The
build writes them into `assets/js/env.js`. If they are unset, the build falls
back to the committed values so a fresh clone and preview deploys still run.

### The one key that must never appear here

`SUPABASE_SERVICE_ROLE_KEY` bypasses every RLS policy. It belongs only in
**Supabase → Edge Functions → Secrets**, where the functions already read it.
It is not in this repo, not in the build, and not in any served file.

`tools/build-config.mjs` **refuses to build** if `SUPABASE_ANON_KEY` looks
like a service-role or `sb_secret_` key.

---

## 5. Adding a user

There is no public signup and no self-service password reset. Accounts exist
only because an administrator created them.

1. Sign in as an admin → **Administration**.
2. **Invite account**. A 20-character password is generated for you; the
   refresh button makes a new one.
3. Set role, monthly quota and optional access expiry.
4. **Create account**, then hand over the password directly. It is hashed
   immediately and is never readable again.

The same credentials work in the Chrome extension straight away.

### Managing an account

| Action | Effect |
|---|---|
| **Edit** | Name, role, quota, expiry, notes |
| **Set password** | New password now; no email round trip |
| **Disable** | Their **very next request** fails, on the website and in the extension — `authenticate()` re-reads status on every call, so nothing waits for a token to expire |
| **Delete** | Account, profile and usage history removed. The audit trail keeps the record |

**Kill switch** (Platform controls) refuses every research call from every
account with a 503 and your maintenance message. Administration deliberately
stays reachable, so turning it on is never a one-way door.

**Audit trail** records every administrative action with actor, target and
timestamp. Entries survive account deletion because emails are denormalised.

### Doing it in SQL instead

```sql
-- Promote an existing account to admin
update profiles set role = 'admin' where email = 'someone@example.com';

-- Raise a quota
update profiles set monthly_request_quota = 5000 where email = 'someone@example.com';
```

---

## 6. Deploying

Netlify, from `netlify.toml`:

```toml
[build]
  publish = "."
  command = "node tools/build-config.mjs"
```

The build writes `assets/js/env.js` and `_headers`, then Netlify publishes
the repo root. There is no `dist/`.

### Routing

`netlify.toml` (and a mirrored `_redirects` for portability) makes
`/login`, `/dashboard`, `/dashboard/market-share`, `/dashboard/portfolio` and
`/dashboard/admin` resolve without an extension, and rewrites any other
`/dashboard/*` to the dashboard home so a refresh or a stale bookmark never
404s. `/tools/*`, `/docs/*`, `/.env.example` and `/netlify.toml` return 404 —
they are for the repo, not the web.

### Headers

`_headers` is generated, never hand-edited. The CSP:

```
default-src 'self';
script-src  'self' 'sha256-…';        ← one hash, for the contact form's inline script
style-src   'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src    https://fonts.gstatic.com;
img-src     'self' data: https://m.media-amazon.com https://images-na.ssl-images-amazon.com;
connect-src 'self' https://ftwkxuqqnbtuegabxxnj.supabase.co wss://…;
form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none';
upgrade-insecure-requests
```

`script-src` is `'self'` plus a SHA-256 hash per inline script — **not
`'unsafe-inline'`**. An injected `<script>` cannot execute. The build
recomputes the hashes on every deploy by scanning the HTML, so editing a page
can never silently break it. Chart.js and supabase-js being vendored is what
makes this possible: there is no third-party script origin to trust.

`'unsafe-inline'` remains for **styles only**, because the marketing pages
carry per-page `<style>` blocks and inline `style` attributes. Inline CSS
cannot exfiltrate data or execute code the way inline script can.

Also set: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`
(geolocation, mic, camera, payment, FLoC all off), HSTS with preload,
`Cross-Origin-Opener-Policy: same-origin`. `/login` and `/dashboard/*` add
`Cache-Control: no-store` and `X-Robots-Tag: noindex, nofollow, noarchive`.

### Not indexed

Three independent layers, because `robots.txt` alone is a request rather than
a control:

1. `<meta name="robots" content="noindex, nofollow">` on every gated page.
2. `X-Robots-Tag: noindex, nofollow, noarchive` from `_headers`.
3. `Disallow:` in `robots.txt`.

`sitemap.xml` lists the five marketing pages and nothing else.

---

## 7. The CORS allowlist

The Edge Functions run a **strict allowlist with no wildcard**. An origin
that is not on it gets a 403 with code `origin_not_allowed`, and no
`Access-Control-Allow-Origin` header at all.

**Every new site origin must be added, or the dashboard shows "This site is
not authorised" on its very first request.**

The list resolves from the `ALLOWED_ORIGINS` Edge Function secret if set,
otherwise from `app_settings.allowed_origins` — so it can be changed with SQL
and no redeploy:

```sql
update app_settings
set allowed_origins = allowed_origins || ',https://your-site.netlify.app'
where id = true;
```

The current value is shown read-only in **Administration → Platform
controls** so you can see what is permitted without opening Supabase.

There is a 30-second cache per warm Edge Function instance, so a change takes
effect within about half a minute.

---

## 8. Security posture

**The browser is never the control.** Hiding the Administration link from a
non-admin is a courtesy. The control is that `admin-users` and `admin-usage`
call `authenticate(req, { requireAdmin: true })`, which re-reads the caller's
role from the database on every single request. A non-admin who types
`/dashboard/admin` or crafts a `fetch` by hand gets a **403 `not_admin`**, and
the guard renders it as a locked page.

The same applies to disabled and expired accounts: status is re-read per
request, never trusted from the JWT, which is what makes "disable an account
and their next request fails" true rather than aspirational.

Other measures in this repo:

- **Escaping.** Every value that reaches `innerHTML` goes through `esc()`.
  Product titles and brand names come from user-uploaded files and are
  untrusted.
- **URL scheme check.** `safeUrl()` allows only `http(s)`, so a crafted
  `javascript:` product link in a workbook cannot become a live link.
- **CSV injection.** Exported cells beginning `= + - @` are prefixed with an
  apostrophe, so opening an export in Excel cannot execute a formula.
- **Open redirect.** `safeNext()` accepts only same-origin paths, so
  `/login?next=https://evil.example` cannot bounce a freshly authenticated
  user off the site.
- **Login enumeration.** Wrong password and unknown account return the same
  message, so the form is not an account-existence oracle.
- **Half-sessions.** If sign-in succeeds but `me` refuses (disabled, expired,
  no profile), the session is ended immediately rather than left in place to
  cause a redirect loop.
- **Session storage.** Research data lives in `sessionStorage`, namespaced by
  user id: it does not outlive the tab and does not leak to the next person
  who signs in on a shared machine.
- **Focus trapping.** The modal traps Tab in both directions, restores focus
  on close, and closes on Escape.

---

## 9. Before and after: shared files

Four files are shared between the marketing site and the dashboard. Here is
every change made to them.

### `index.html`, `pages/services.html`, `pages/pricing.html`, `pages/about.html`, `pages/contact.html`

Four lines per page. Nothing else.

| # | Change | Why |
|---|---|---|
| 1 | `+ <li><a href="login.html" class="nav-link">Client Login</a></li>` | The platform has to be reachable |
| 2 | `+ <a href="login.html">Client Login</a>` in `.mobile-menu` | Same, on mobile |
| 3 | Footer column heading `Services` → `Platform` | Renaming an existing column rather than adding a fifth keeps the 1.5fr/1fr/1fr/1fr grid at its exact proportions |
| 4 | `+ <li><a href="login.html">Client Login</a></li>` as that column's first item | Same |

**Measured impact** (`docs/proof/diff-*.png`, Playwright + pixelmatch,
animations frozen, full-page):

| Width | Page height before → after | Pixels changed |
|---|---|---|
| 1440px | **identical** on all five pages | 0.048 – 0.104 % |
| 768px | +38px (the extra footer list item) | 0.162 – 0.318 % |
| 375px | +38px (same) | 0.126 – 0.306 % |

The diff images show colour in exactly two places: the nav bar and one footer
column. Hero, stats, cards, CTA and the rest are pixel-identical.

### `css/style.css` — **not modified**

Zero changes. The dashboard's two scoped overrides live in
`assets/css/dashboard.css` under `.dash-body`, a class that only exists on
gated pages:

- `.dash-body .footer-heading, .dash-body .footer-bottom { color: var(--muted-text); }`
  — raises inherited footer text from 4.25:1 to 5.0:1 (see
  `DESIGN-TOKENS.md § 5.3`).
- `.dash-body .nav-cta:focus-visible` and friends — an explicit focus ring.
  Chromium's default computes to `rgb(16,16,16)`, effectively invisible on
  `--ink`.

### `js/main.js` — **not modified**

Zero changes. Dashboard pages load it as-is for the sticky nav, mobile menu
and reveal-on-scroll, so those behave identically everywhere.

### New files on the gated pages only

`login.html` and the four `dashboard/*.html` pages use `<h3 class="footer-heading">`
where the marketing pages use `<h4>`. Purely semantic — the class carries all
the styling — and it fixes a skipped heading level (`h2` → `h4`) that axe
flags. The marketing pages keep `<h4>`, so they are untouched.

---

## 10. Endpoints that do not exist yet

Per the brief: rather than write missing logic in the browser, here is what is
missing.

### Portfolio history / period comparison

The extension's **My Products** tab compares dated snapshots to show
week-on-week movement in revenue, rank, reviews and stock. There is no Edge
Function that stores or diffs portfolio history, so **the website does not
show period change at all** — the panel says so plainly instead of faking it.

To add it, `research` would need something like:

```
op: "portfolio.snapshot"   { items, label, takenAt }  → stores a dated snapshot
op: "portfolio.compare"    { baselineId, currentId }  → returns per-ASIN deltas
                                                        and the movers list
```

Comparison arithmetic is trivial, but the *thresholds* the extension applies
(a >20% review swing inside 7 days is flagged as a recount rather than growth;
a parent/variation scope change invalidates the comparison) are judgement
calls that belong with the rest of the model, server-side.

### What the browser does compute, and why it is not business logic

Two things, both plain arithmetic over numbers the server already returned,
and both called out in the code:

1. **Variation-family subtotals** (`portfolio.js`) — grouping child ASINs by
   parent and adding up their server-returned revenue and units.
2. **Opportunity-score histogram bins** (`portfolio.js`) — counting how many
   listings fall in each band of the server's score.

Neither derives a new number from raw inputs; both are display aggregation. If
you would rather they moved server-side too, a `research` op returning
family rollups would do it.

---

## 11. Acceptance criteria, checked

| Criterion | Result |
|---|---|
| `/dashboard` signed out → `/login`, then back after sign-in | ✅ Redirects to `/login.html?next=%2Fdashboard%2F&reason=signed-out`; `safeNext()` returns the user to the intended page |
| Non-admin never sees the admin route; direct URL or crafted call → 403 | ✅ Link hidden, route guarded, and `admin-*` enforce `requireAdmin` server-side against a freshly read profile |
| Disabling an account logs the user out of website **and** extension on next request | ✅ `authenticate()` re-reads `status` per request; no token wait |
| Same email and password works on the website and in the extension | ✅ One Supabase project, one `auth.users` table, one `profiles` table |
| No business logic, formulas or secrets in the bundle — prove it by grepping | ✅ `bash tools/verify-no-secrets.sh` → PASS |
| Side by side, identical fonts, colours, button styles and spacing | ✅ Same `css/style.css`; every dashboard token derived from it (`DESIGN-TOKENS.md`) |
| Lighthouse accessibility ≥ 90, keyboard navigation throughout | ✅ **0 axe-core violations** (WCAG 2.0/2.1 A + AA + best-practice) on all five gated pages, including the invite modal. Marketing baseline for comparison: 3 pre-existing violation types. Keyboard: skip link, visible rings on every control, sortable headers operable by Enter/Space, modal traps Tab and closes on Escape |
| Existing site pages visually unchanged — show proof | ✅ Pixel diff in §9 and `docs/proof/diff-*.png` |
| Responsive to 375px, tables usable on mobile | ✅ No horizontal page scroll at 375px; tables scroll inside their own container with the action column pinned |
| Loading, empty and error states on every panel | ✅ Shaped skeletons, empty states and typed error states, all from existing styles |
| Export to CSV where it makes sense | ✅ Analysis (all / filtered / opportunity), brands, portfolio, families, admin usage — plus print-to-PDF |
