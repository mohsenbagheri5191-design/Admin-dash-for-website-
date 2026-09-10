# Review screenshots

Captured with Playwright + Chromium at real widths, with the real Google
Fonts loaded. The Edge Functions were stubbed at the network layer with the
server's exact response shapes so the UI could be exercised end to end.

Not served on the public site — `netlify.toml` returns 404 for `/docs/*`.

## Proof that the marketing pages are unchanged

| File | What it shows |
|---|---|
| `before-home.png` / `after-home.png` | The homepage before and after, full page at 1440px |
| `diff-*-1440.png` | Pixel diff per marketing page. Colour marks a changed pixel; grey means identical |

Every diff shows colour in exactly two places — the nav bar and one footer
column — which is the four-line change documented in
`DASHBOARD.md § Before and after`. Page heights at 1440px are identical.

| Page | Pixels changed at 1440px |
|---|---|
| Home | 0.056 % |
| Services | 0.057 % |
| Pricing | 0.048 % |
| About | 0.056 % |
| Contact | 0.104 % |

`marketing-*.png` are the current marketing pages at 1440px, for side-by-side
comparison with the dashboard.

## Login

| File | |
|---|---|
| `login-desktop.png` | 1440px |
| `login-mobile.png` | 375px |
| `guard-redirect.png` | Visiting `/dashboard/` signed out — lands on `/login.html?next=%2Fdashboard%2F&reason=signed-out` |

## Dashboard, 1440px

| File | |
|---|---|
| `dash-01-empty.png` | First visit: the empty state and the data-source panel |
| `dash-02-analysis-top.png` | Market Analysis — seven KPI tiles |
| `dash-03…05` | Price bands, brand share, brand value, unit/rating/rank bands, categories |
| `dash-06-opportunity.png` | Research Opportunity Score — ranked bars and table |
| `dash-07-detail-table.png` | Sortable product detail |
| `dash-08…12` | Market Share — KPIs, share chart, mix + scatter, advisories, brand table |
| `dash-13…16` | My Products — KPIs, top listings, confidence/stock/opportunity, and the stated period-comparison limitation |
| `dash-17-admin-users.png` | Administration — accounts, roles, quota meters, status |
| `dash-18-admin-controls.png` | Kill switch, maintenance message, default quota, CORS allowlist |
| `dash-19-admin-usage.png` | Usage KPIs, calls per day, calls by endpoint, per account |
| `dash-20-admin-invite-modal.png` | Invite an account |
| `dash-21-admin-audit.png` | Audit trail |

## Dashboard, 375px

`dash-22-mobile-top.png`, `dash-23-mobile-charts.png`,
`dash-24-mobile-table.png` — no horizontal page scroll; the table scrolls
inside its own container.
