# Design token audit — North Leaf

The brief asked for this document before any code. It is the written audit of
the existing marketing site, followed by an exact list of what the dashboard
added and why.

Source of truth for the original values: `css/style.css` `:root`, plus the
per-page `<style>` blocks in `index.html`, `pages/pricing.html` and
`pages/contact.html`.

Everything the dashboard adds lives in **`assets/css/tokens.css`**, which is
loaded only by `/login.html` and `/dashboard/*`. It never redefines a value
from `css/style.css`, so no marketing page can shift because of it.

---

## 1. Colour

### Palette as it already exists

| Token | Hex | Where the marketing site uses it |
|---|---|---|
| `--ink` | `#0A0614` | Page background, footer background, `.nav-cta` text on cream |
| `--ink-2` | `#120A24` | `.plans-section` background, hero band |
| `--ink-3` | `#1C1036` | Card tint base (`.stage`, `.plan` at 40–50% alpha) |
| `--purple` | `#5B2D8E` | Logo gradient start, deep mesh glows |
| `--purple-bright` | `#8B5CF6` | Primary accent: button hover, active nav underline, card hairline, focus |
| `--purple-glow` | `#B794F6` | Italic display emphasis (`.section-title em`), eyebrow labels, link hover |
| `--purple-soft` | `#2A1550` | The oversized `.footer-brand-text` wordmark only |
| `--cream` | `#F5F0FF` | Body text, headings, `.btn-primary` fill |
| `--cream-dim` | `#C4B5D9` | Secondary body copy, nav links at rest, footer links |
| `--cream-faint` | `#7A6E91` | Small labels: `.footer-heading`, `.footer-bottom`, `.proof-label`, placeholders |
| `--line` | `rgba(139,92,246,0.12)` | Every card border at rest, grid overlay, dividers |
| `--line-strong` | `rgba(139,92,246,0.28)` | `.btn-outline` border, card border on hover |
| `--gold` | `#D4A056` | Declared in `:root`; used sparingly as a warm accent |

**Semantic colours the site does not have:** there is no success, and no error.
A marketing site never has to say *this account is disabled*.

### Surfaces

The site uses exactly three card tints, all translucent over `--ink`:

| Tint | Value | Original use |
|---|---|---|
| `--surface` | `rgba(28,16,54,0.4)` | `.stage` |
| `--surface-2` | `rgba(28,16,54,0.5)` | `.plan` |
| `--surface-3` | `rgba(91,45,142,0.08)` | `.pillar` |
| `--surface-input` | `rgba(10,6,20,0.6)` | `.form-input` rest |
| `--surface-input-focus` | `rgba(10,6,20,0.8)` | `.form-input` focus |

Hover state on any card: `rgba(139,92,246,0.10–0.12)` with the border stepping
from `--line` to `--line-strong`.

---

## 2. Typography

Loaded from Google Fonts, all three variable:

| Family | Token | Axes / weights | Role |
|---|---|---|---|
| **Fraunces** | `--display` | `opsz 9–144`, `wght 200–900`, `SOFT 0–100`, italic | Every heading, the footer tagline, KPI values |
| **Geist** | `--sans` | `300–800` | All body copy, buttons, nav, form fields |
| **Geist Mono** | `--mono` | `400–600` | Eyebrow labels, footer headings, table headers, numbers |

Fraunces is always used with explicit variation settings. The site's own
convention, which the dashboard follows exactly:

```css
font-variation-settings: 'opsz' 144, 'SOFT' 40;   /* upright headings */
font-variation-settings: 'opsz' 144, 'SOFT' 100;  /* italic <em> emphasis */
font-variation-settings: 'opsz' 96,  'SOFT' 40;   /* mid-size headings */
font-variation-settings: 'opsz' 72,  'SOFT' 40;   /* small headings */
```

### Type scale as measured

| Role | Family | Size | Weight | Line height | Tracking |
|---|---|---|---|---|---|
| Page header title | display | `clamp(48px, 7vw, 96px)` | 400 | 0.95 | −0.03em |
| Section title | display | `clamp(40px, 5.5vw, 76px)` | 400 | 1.0 | −0.03em |
| Plan / card name | display | 36px | 500 | 1.0 | −0.02em |
| Nav brand | display | 24px | 500 | — | −0.02em |
| Footer tagline | display italic | 22px | 400 | 1.3 | — |
| Section sub | sans | 18px | 300 | 1.5 | — |
| Body | sans | 15px | 300 | 1.5–1.65 | — |
| Nav link, footer link | sans | 14px | 400 / 300 | — | — |
| Eyebrow label | mono | 11px | 500 | — | 0.2em, uppercase |
| Plan badge | mono | 9px | 600 | — | 0.15em, uppercase |

Base `font-size: 16px`, `line-height: 1.5`, antialiased.

---

## 3. Spacing, radii, shadows, motion

**Spacing beats that actually recur:** 4, 8, 12, 16, 24, 32, 48, 80. Section
padding is `140px` desktop / `100px` at ≤1024 / unchanged at ≤640. Container
gutter `40px` → `24px` at ≤1024.

**Radii:** `8px` small pill/tag · `9px` logo · `11–12px` inputs · `20px`
`.pillar` · `24px` `.stage` / `.plan` · `100px` every button.

**Shadows** — the site only ever casts purple light, never neutral black:

```
0 4px 20px  rgba(139,92,246,0.4)   logo
0 10px 30px rgba(139,92,246,0.4)   nav CTA hover
0 15px 40px rgba(139,92,246,0.4)   primary button hover
0 0 0 3px   rgba(139,92,246,0.15)  input focus ring
```

**Motion:** `--ease: cubic-bezier(0.22, 1, 0.36, 1)` for everything;
`--ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1)` for the one springy case.
Durations 0.25s (colour) → 0.3–0.4s (buttons, cards) → 0.5–1s (reveals).
Hover lifts are `translateY(-2px)` (small), `-3px` (buttons), `-4/-6/-8px`
(cards). `prefers-reduced-motion` collapses everything to 0.01ms.

---

## 4. Component patterns inherited as-is

| Component | Classes | Notes |
|---|---|---|
| Primary button | `.btn-primary` | Cream pill → purple on hover, lifts 3px, arrow slides 4px |
| Outline button | `.btn-outline` | Transparent, `--line-strong` border, purple on hover |
| Nav CTA | `.nav-cta` | Same as primary at 11px/22px |
| Nav | `.nav`, `.nav-inner`, `.nav-link`, `.nav-hamburger` | Fixed; `.scrolled` adds blur + border |
| Mobile menu | `.mobile-menu` | Full-screen blur, Fraunces 32px links |
| Card | `.stage`, `.pillar`, `.plan` | Translucent, `--line` border, gradient hairline on hover |
| Form field | `.form-input/-select/-textarea` | 14×18px, 12px radius, purple focus ring |
| Section header | `.section-label`, `.section-title`, `.section-sub` | Mono eyebrow with a 24px rule, display title with italic `<em>` |
| Footer | `.footer-grid` 1.5fr 1fr 1fr 1fr | Collapses 2-up at 1024, 1-up at 640 |
| Reveal | `.reveal` + `.reveal-delay-1..4` | IntersectionObserver adds `.in-view` |

**Breakpoints:** `1024px` and `640px`. Container `max-width: 1320px`.

---

## 5. What the dashboard added, and why

Every item below is in `assets/css/tokens.css` and loads only on the gated
pages. Nothing here changes a marketing page.

### 5.1 Derived, not new

Spacing scale (`--space-1..8`), radii (`--radius-sm..pill`), surfaces
(`--surface`, `--surface-2`, `--surface-3`, `--surface-input`,
`--surface-input-focus`), shadows (`--shadow-sm/md/lg`, `--focus-ring`),
layout (`--dash-sidebar: 248px`, `--nav-height: 76px`). Each one is a value
already present in the marketing CSS, given a name so the dashboard can reuse
it instead of retyping it.

### 5.2 Two new hues — `--success` and `--danger`

```css
--success: #34D399;
--danger:  #FB7185;
--warning: var(--gold);   /* reuses the existing token, no new hue */
```

**Why:** a dashboard has to say *active* / *disabled*, *in stock* / *out of
stock*, *quota fine* / *quota spent*. The marketing palette has no colour for
either state, and encoding them in purple alone would make status invisible.

**Why these two specifically:** they are the exact colours the Chrome
extension's own dark theme already uses (`--green: #34d399`, `--red: #fb7185`
in `brand-dashboard.html`). A user moving between the extension and the
website therefore sees one language, not two. Both clear WCAG AA on the
dashboard's panel background (10.0:1 and 7.2:1).

### 5.3 One new tint — `--muted-text: #897C9F`

**Why:** the site's `--cream-faint` (`#7A6E91`) measures **4.25:1** on `--ink`.
That is fine for the marketing pages, where it only carries decorative
labels — but it fails WCAG AA (4.5:1) for small body text, and a data product
is mostly small body text: hints, counts, axis ticks, quota notes, table
headers. `--muted-text` is the same hue nudged 20% toward `--cream-dim`; it
reads as the identical role and measures **5.0:1** on a panel and **5.2:1** on
`--ink`.

`--cream-faint` itself is untouched. The audit script confirms zero
`color-contrast` violations on the gated pages afterwards.

> **Note for the marketing site:** the same finding exists there —
> `.footer-heading`, `.footer-bottom` and `.proof-label` are all
> `--cream-faint` and all fail AA. Fixing it means editing `css/style.css`,
> which would change pages the brief says to leave alone, so I have not.
> Say the word and it is a one-line change.

### 5.4 Chart series

Eight categorical slots. **Six are existing tokens**, two are tints mixed from
existing ones so a long tail stays separable without inventing a hue:

```
--chart-1  #8B5CF6   = --purple-bright
--chart-2  #B794F6   = --purple-glow
--chart-3  #D4A056   = --gold
--chart-4  #34D399   = --success        (new, see 5.2)
--chart-5  #C4B5D9   = --cream-dim
--chart-6  #FB7185   = --danger         (new, see 5.2)
--chart-7  #6D4AAF   = --purple lifted toward --purple-bright
--chart-8  #E8C88A   = --gold lifted toward --cream
--chart-grid  = --line
--chart-axis  = --muted-text
```

### 5.5 New components, built from the tokens above

Nothing here uses a value that is not in this document.

| Component | Built from |
|---|---|
| `.kpi` tile | `.pillar` exactly — same tint, radius, hover lift, gradient hairline |
| `.panel` | `.stage` exactly — same tint, 24px radius, hairline on hover |
| `.dash-nav-link` | Nav link type + `.pillar` hover tint |
| `.badge` / `.tag` | `.plan-badge` and `.stage-tag` geometry, status colours from 5.2 |
| `.data-table` | Mono uppercase headers (footer-heading treatment), `--line` row rules |
| `.skeleton` | `--line` → `--line-strong` sweep on the site's `--ease` |
| `.toast` | `--ink-3` card, `--line-strong` border, `--ease-bounce` entry |
| `.modal` | `.mobile-menu`'s blur scrim + a `.plan`-style card |
| `.switch` | Pill geometry from `.btn-primary`, `--ease-bounce` thumb |
| `.quota-meter` | New; `--purple` → `--purple-bright` gradient, gold/rose at 85%/100% |
| `.bar-list` | The extension's `bars()` chart, restyled to the same gradient |

### 5.6 One structural change to shared files

`.dash-body .footer-heading` / `.dash-body .footer-bottom` are raised to
`--muted-text`, and the shared nav gets an explicit `:focus-visible` ring —
both scoped to `.dash-body`, which only exists on gated pages. See
`DASHBOARD.md § Before and after` for the full list of shared-file edits.
