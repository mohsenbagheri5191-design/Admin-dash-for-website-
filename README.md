# North Leaf

The North Leaf marketing site plus a login-gated research platform at
`/login` and `/dashboard`, sharing one Supabase backend with the **Amazon
Market Research Pro** Chrome extension.

Static HTML, CSS and ES modules. No framework, no bundler, one small build
step.

| Document | What's in it |
|---|---|
| **[DASHBOARD.md](DASHBOARD.md)** | Local dev, environment variables, adding a user, deploying, security, the shared-file diff |
| **[DESIGN-TOKENS.md](DESIGN-TOKENS.md)** | The design audit of the existing site, and exactly what the dashboard added |
| **[docs/proof/](docs/proof/)** | Review screenshots and the visual-regression diffs |

---

## Structure

```
index.html                  Homepage
css/style.css               Shared styles — nav, footer, buttons, tokens
js/main.js                  Shared scripts — sticky nav, mobile menu, reveals
images/                     Put logo.png here (see below)
pages/                      services · pricing · about · contact

login.html                  Client sign in
dashboard/                  Market Analysis · Market Share · My Products · Admin
assets/                     Dashboard CSS, JS, vendored libraries, sample data
tools/                      Build script and the no-secrets check
netlify.toml · _redirects   Routing
robots.txt · sitemap.xml    Marketing pages indexed; the platform is not
```

## Running it

```bash
node tools/build-config.mjs      # writes assets/js/env.js and _headers
npx http-server -p 8080 -s .
```

Then <http://127.0.0.1:8080>. Use **http://**, not `file://` — the dashboard
uses absolute paths and ES modules.

## Deploying

Push. Netlify runs `node tools/build-config.mjs` and publishes the repo root.
Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in the Netlify UI; the build falls
back to committed values if they are absent.

**Then add the site's origin to the API's CORS allowlist** or the dashboard
will refuse its first request — see
[DASHBOARD.md § The CORS allowlist](DASHBOARD.md#7-the-cors-allowlist).

---

## Changing the logo

1. Save your logo as `images/logo.png` — PNG with a transparent background,
   72×72 or 108×108 for retina (it displays at 36×36).
2. In **every** HTML file, in **both** the nav and the footer, replace:

   ```html
   <div class="nav-logo logo-fallback">N</div>
   ```

   with:

   ```html
   <div class="nav-logo"><img src="/images/logo.png" alt="North Leaf"></div>
   ```

   The gated pages already use absolute paths. On the marketing pages inside
   `pages/`, use `../images/logo.png`.

## Wiring up the contact form

`pages/contact.html` currently shows a success message without sending
anything. Two ways to make it real:

**Netlify Forms** — add `netlify` to the `<form>` tag, drop the `action`, and
delete the inline script at the bottom of the page.

> If you delete that inline script, re-run `node tools/build-config.mjs`. It
> regenerates the CSP hash list, and a stale hash is what would otherwise
> silently break the page.

**Formspree** — create a form, then set
`action="https://formspree.io/f/YOUR_ID" method="POST"` and remove the
`e.preventDefault()` line. You will also need to add `https://formspree.io`
to `form-action` in the CSP, in `tools/build-config.mjs`.

---

## Notes

- Fully responsive; no horizontal scroll down to 375px.
- Zero axe-core accessibility violations on every gated page.
- Google Fonts is the only external request the site makes.
- `prefers-reduced-motion` is honoured throughout.
