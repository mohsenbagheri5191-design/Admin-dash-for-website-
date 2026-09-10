/**
 * ═══════════════════════════════════════════════════════════════
 * ROUTE GUARD + DASHBOARD SHELL
 * ═══════════════════════════════════════════════════════════════
 *
 * Every /dashboard/* page starts by calling mountDashboard(). It:
 *
 *   1. resolves the session (redirecting to /login with a `next` param when
 *      there isn't one),
 *   2. asks the `me` Edge Function what this account may do right now,
 *   3. renders the sidebar, account card, quota meter and sign-out,
 *   4. hands the view its profile and a ready-to-use content root.
 *
 * The redirect happens before the page paints, so a signed-out visitor never
 * sees a flash of dashboard chrome.
 */

import {
  getSession, fetchMe, signOut, onAuthChange, describeError,
  ApiError, ErrorCode, isConfigured
} from './api.js';
import { $, esc, icon, num, stateBlock, toast } from './ui.js';

const LOGIN_PATH = '/login.html';
const DASHBOARD_HOME = '/dashboard/';

/** Sidebar routes. `admin: true` entries are only rendered for admins. */
const ROUTES = [
  { href: '/dashboard/', key: 'analysis', label: 'Market Analysis', icon: 'chart' },
  { href: '/dashboard/market-share.html', key: 'market', label: 'Market Share', icon: 'pie' },
  { href: '/dashboard/portfolio.html', key: 'portfolio', label: 'My Products', icon: 'briefcase' },
  { href: '/dashboard/admin.html', key: 'admin', label: 'Administration', icon: 'shield', admin: true }
];

/* ─── Redirect helpers ──────────────────────────────────────────── */

/**
 * Where to send someone after they sign in.
 *
 * Only ever a same-origin path. Taking the raw `next` value would make the
 * login page an open redirect: /login?next=https://evil.example would bounce
 * a freshly authenticated user straight off the site.
 */
export function safeNext(raw) {
  const value = String(raw || '');
  if (!value.startsWith('/') || value.startsWith('//')) return DASHBOARD_HOME;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return DASHBOARD_HOME;
    return url.pathname + url.search + url.hash;
  } catch {
    return DASHBOARD_HOME;
  }
}

function toLogin(reason) {
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  const suffix = reason ? `&reason=${encodeURIComponent(reason)}` : '';
  window.location.replace(`${LOGIN_PATH}?next=${next}${suffix}`);
}

/* ─── Gate overlay ──────────────────────────────────────────────── */

function gate(message) {
  let el = $('#routeGate');
  if (!el) {
    el = document.createElement('div');
    el.id = 'routeGate';
    el.className = 'route-gate';
    el.innerHTML = '<div class="spinner"></div><p></p>';
    document.body.appendChild(el);
  }
  el.hidden = false;
  $('p', el).textContent = message;
}

function ungate() {
  const el = $('#routeGate');
  if (el) el.hidden = true;
}

/* ─── Sidebar rendering ─────────────────────────────────────────── */

function initials(profile) {
  const source = (profile.fullName || profile.email || '?').trim();
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || source[0].toUpperCase();
}

function quotaMeter(quota) {
  const limit = Number(quota?.limit) || 0;
  const used = Number(quota?.used) || 0;
  const ratio = limit > 0 ? Math.min(1, used / limit) : 0;
  const tone = ratio >= 1 ? 'is-danger' : ratio >= 0.85 ? 'is-warning' : '';
  const resets = quota?.resetsAt
    ? new Date(quota.resetsAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
    : null;

  return `
    <div class="quota-meter">
      <div class="quota-head">
        <span>Requests</span>
        <span>${num(used)} / ${num(limit)}</span>
      </div>
      <div class="quota-track"
           role="progressbar"
           aria-valuenow="${used}"
           aria-valuemin="0"
           aria-valuemax="${limit}"
           aria-label="Monthly request quota used">
        <div class="quota-fill ${tone}" style="width:${(ratio * 100).toFixed(1)}%"></div>
      </div>
      <p class="quota-note">${
        ratio >= 1
          ? 'Quota spent for this month.'
          : `${num(Math.max(0, limit - used))} left${resets ? ` · resets ${esc(resets)}` : ''}`
      }</p>
    </div>`;
}

function renderSidebar(host, { profile, quota, active }) {
  const isAdmin = profile.role === 'admin';
  const links = ROUTES.filter((r) => !r.admin || isAdmin);

  host.innerHTML = `
    <nav class="dash-nav" aria-label="Dashboard sections">
      <p class="dash-nav-heading">Research</p>
      ${links.map((r) => `
        <a href="${r.href}"
           class="dash-nav-link ${r.key === active ? 'active' : ''}"
           ${r.key === active ? 'aria-current="page"' : ''}>
          ${icon(r.icon, 17)}<span>${esc(r.label)}</span>
        </a>`).join('')}
    </nav>

    <div class="dash-account">
      <div class="dash-account-who">
        <div class="dash-avatar" aria-hidden="true">${esc(initials(profile))}</div>
        <div class="grow">
          <div class="dash-account-name" title="${esc(profile.email)}">${esc(profile.fullName || profile.email)}</div>
          <div class="dash-account-role">${isAdmin ? 'Administrator' : 'Member'}</div>
        </div>
      </div>
      ${quotaMeter(quota)}
      <button type="button" class="dash-signout" id="signOutBtn">
        ${icon('logout', 15)}<span>Sign out</span>
      </button>
    </div>`;

  $('#signOutBtn', host).addEventListener('click', async () => {
    gate('Signing out');
    await signOut();
    window.location.replace(LOGIN_PATH);
  });
}

/* ─── Access-denied rendering ───────────────────────────────────── */

/**
 * A signed-in account the API refuses. Not a redirect: the user is who they
 * say they are, so telling them exactly which lock is closed is more useful
 * than bouncing them to a login form that will succeed and land here again.
 */
function renderLocked(err) {
  const { title, message } = describeError(err);
  document.body.innerHTML = `
    <div class="dash-atmosphere"></div>
    <main class="auth-main">
      <div class="container" style="display:flex;justify-content:center">
        <div class="auth-card">
          <div class="auth-label">Access</div>
          <h1 class="auth-title">${esc(title)}</h1>
          <p class="auth-sub">${esc(message)}</p>
          <div class="state-actions" style="justify-content:flex-start">
            <a href="/pages/contact.html" class="btn-sm is-solid">Contact North Leaf</a>
            <button type="button" class="btn-sm" id="lockedSignOut">Sign out</button>
          </div>
        </div>
      </div>
    </main>`;
  document.body.className = 'dash-body';
  $('#lockedSignOut').addEventListener('click', async () => {
    await signOut();
    window.location.replace(LOGIN_PATH);
  });
}

/* ─── Public API ────────────────────────────────────────────────── */

/**
 * Guard + shell for a dashboard page.
 *
 * @param {{active: string, requireAdmin?: boolean}} options
 * @returns {Promise<{profile: object, quota: object, settings: object,
 *                    refreshMe: () => Promise<object>}>}
 *          Resolves only when the page may render. Otherwise it has already
 *          navigated away or painted a locked state, and the returned promise
 *          never settles — so callers can rely on `await` meaning "allowed".
 */
export async function mountDashboard({ active, requireAdmin = false }) {
  document.body.classList.add('dash-body');
  gate('Checking your session');

  if (!isConfigured) {
    ungate();
    renderLocked(new ApiError(ErrorCode.NOT_CONFIGURED, 'This build has no Supabase configuration.'));
    return new Promise(() => {});
  }

  const session = await getSession();
  if (!session) {
    toLogin('signed-out');
    return new Promise(() => {});
  }

  let me;
  try {
    me = await fetchMe();
  } catch (err) {
    if (err instanceof ApiError && err.isAuthFailure) {
      await signOut();
      toLogin('expired');
      return new Promise(() => {});
    }
    ungate();
    renderLocked(err);
    return new Promise(() => {});
  }

  const { profile, quota, settings } = me;

  // Admin routes are gated here too, but this is convenience only: the
  // admin-users and admin-usage Edge Functions re-check the role server-side
  // on every call, so a hand-crafted request from a non-admin gets a 403
  // whatever the browser believes.
  if (requireAdmin && profile.role !== 'admin') {
    ungate();
    renderLocked(new ApiError(ErrorCode.NOT_ADMIN, 'This area requires an administrator account.'));
    return new Promise(() => {});
  }

  const side = $('#dashSide');
  if (side) renderSidebar(side, { profile, quota, active });

  // Signing out in another tab should not leave this one showing data.
  onAuthChange((event, next) => {
    if (event === 'SIGNED_OUT' || (!next && event !== 'INITIAL_SESSION')) {
      window.location.replace(LOGIN_PATH);
    }
  });

  ungate();

  return {
    profile,
    quota,
    settings,
    /** Re-reads quota and status after work that spends requests. */
    async refreshMe() {
      try {
        const fresh = await fetchMe();
        if (side) renderSidebar(side, { profile: fresh.profile, quota: fresh.quota, active });
        return fresh;
      } catch (err) {
        if (err instanceof ApiError && err.isAuthFailure) {
          await signOut();
          toLogin('expired');
        }
        return null;
      }
    }
  };
}

/**
 * Panel-level error renderer shared by every view.
 * Auth failures bounce to login; everything else paints in place.
 */
export function handleViewError(err, host, retry) {
  if (err instanceof ApiError && err.isAuthFailure) {
    signOut().then(() => toLogin('expired'));
    return;
  }
  const { title, message } = describeError(err);
  host.innerHTML = stateBlock({
    tone: 'error',
    title,
    text: message,
    actions: retry ? '<button type="button" class="btn-sm is-solid" data-retry>Try again</button>' : ''
  });
  const button = $('[data-retry]', host);
  if (button && retry) button.addEventListener('click', retry);
}

export { toast, LOGIN_PATH, DASHBOARD_HOME };
