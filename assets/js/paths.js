/**
 * Where is the site rooted?
 *
 * On Netlify the answer is "/". On GitHub Pages for a project repo it is
 * "/Admin-dash-for-website-/". Anywhere the site is dropped into a
 * subdirectory it is something else again.
 *
 * Rather than hardcode a base or rewrite paths at build time, this module
 * derives it at runtime from its own URL. This file always lives at
 * `<base>assets/js/paths.js`, so two levels up from `assets/js/` is the base,
 * whatever the host decided that is.
 *
 * HTML pages use ordinary relative hrefs, which need no help. This exists for
 * the handful of places JavaScript has to build an absolute path: a redirect,
 * a sidebar link, a fetch.
 */

/** Site root, always with a trailing slash. "/" or "/some/prefix/". */
export const BASE = new URL('../../', import.meta.url).pathname;

/**
 * Resolve a site-root-relative path against the base.
 *
 *   url('login.html')  → "/login.html"  or  "/Admin-dash-for-website-/login.html"
 *
 * @param {string} path with or without a leading slash
 */
export function url(path) {
  return BASE + String(path).replace(/^\/+/, '');
}

/**
 * Strip the base off a full pathname, so a location can be stored and later
 * resolved again through url() without the prefix being doubled.
 *
 *   relative('/Admin-dash-for-website-/dashboard/')  →  "dashboard/"
 */
export function relative(pathname) {
  const value = String(pathname || '');
  return value.startsWith(BASE) ? value.slice(BASE.length) : value.replace(/^\/+/, '');
}
