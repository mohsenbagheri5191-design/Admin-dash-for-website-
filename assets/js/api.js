/**
 * ═══════════════════════════════════════════════════════════════
 * SHARED SUPABASE CLIENT + API LAYER
 * ═══════════════════════════════════════════════════════════════
 *
 * One client, one place that knows how to talk to the Edge Functions, and
 * one error shape. Every dashboard view imports from here and nothing else
 * touches the network.
 *
 * Division of labour, on purpose:
 *
 *   supabase-js  →  auth only. Sign in, session persistence, silent token
 *                   refresh, cross-tab sync. It is very good at this.
 *   fetch        →  the Edge Functions. The functions return a precise
 *                   envelope — { error: { code, message, detail } } — and
 *                   the UI branches on `code`. Going through fetch directly
 *                   keeps that envelope intact instead of flattening every
 *                   non-2xx into one generic client error.
 *
 * NOTHING IN THIS FILE COMPUTES ANYTHING. Units, revenue, opportunity
 * scores, market share, HHI and every advisory string arrive finished from
 * the `research` Edge Function. The browser's entire job is to send rows up
 * and draw what comes back. See DASHBOARD.md § "Where the logic lives".
 */

const ENV = window.__NORTHLEAF_ENV__ || {};

export const SUPABASE_URL = String(ENV.SUPABASE_URL || '').replace(/\/+$/, '');
export const SUPABASE_ANON_KEY = String(ENV.SUPABASE_ANON_KEY || '');

/** True when env.js was populated. A missing config is a setup error, not a runtime one. */
export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/* ─────────────────────────────────────────────────────────────────
   Error type
   ───────────────────────────────────────────────────────────────── */

/**
 * Mirrors the Edge Functions' ErrorCode union so the UI can switch on a
 * stable string instead of pattern-matching prose. Kept in sync by hand with
 * supabase/functions/_shared/errors.ts.
 */
export const ErrorCode = {
  MISSING_TOKEN: 'missing_token',
  INVALID_TOKEN: 'invalid_token',
  NO_PROFILE: 'no_profile',
  ACCOUNT_DISABLED: 'account_disabled',
  ACCOUNT_EXPIRED: 'account_expired',
  QUOTA_EXCEEDED: 'quota_exceeded',
  NOT_ADMIN: 'not_admin',
  ORIGIN_NOT_ALLOWED: 'origin_not_allowed',
  BAD_REQUEST: 'bad_request',
  METHOD_NOT_ALLOWED: 'method_not_allowed',
  SERVER_ERROR: 'server_error',
  KILL_SWITCH: 'kill_switch',
  NETWORK: 'network_error',
  NOT_CONFIGURED: 'not_configured'
};

export class ApiError extends Error {
  constructor(code, message, { status = 0, detail = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.detail = detail;
  }

  /** Codes that mean "this session can no longer be used". */
  get isAuthFailure() {
    return this.code === ErrorCode.MISSING_TOKEN || this.code === ErrorCode.INVALID_TOKEN;
  }

  /**
   * Codes that mean "signed in, but the door is shut". These are shown as a
   * full-panel state rather than a toast, because nothing on the page can
   * work until an administrator changes something.
   */
  get isAccessFailure() {
    return (
      this.code === ErrorCode.NO_PROFILE ||
      this.code === ErrorCode.ACCOUNT_DISABLED ||
      this.code === ErrorCode.ACCOUNT_EXPIRED ||
      this.code === ErrorCode.KILL_SWITCH
    );
  }
}

/**
 * Friendly copy for every failure the brief calls out. The Edge Functions
 * already return good messages; these are the fallbacks for the cases the
 * server never gets to answer (network down, misconfiguration) and the
 * headline/description split the UI renders.
 */
const COPY = {
  [ErrorCode.MISSING_TOKEN]: ['Please sign in', 'Your session could not be found. Sign in to continue.'],
  [ErrorCode.INVALID_TOKEN]: ['Session expired', 'For your security we signed you out. Please sign in again.'],
  [ErrorCode.NO_PROFILE]: ['No access on this account', 'This email can sign in but has not been granted access to the platform. Contact your administrator.'],
  [ErrorCode.ACCOUNT_DISABLED]: ['Access turned off', 'An administrator has disabled this account. Contact them to have it restored.'],
  [ErrorCode.ACCOUNT_EXPIRED]: ['Access period ended', 'This account has passed its access expiry date. Contact your administrator to extend it.'],
  [ErrorCode.QUOTA_EXCEEDED]: ['Monthly quota used up', 'This account has spent its request allowance for the month. The counter resets on the 1st.'],
  [ErrorCode.NOT_ADMIN]: ['Administrators only', 'This area requires an administrator account.'],
  [ErrorCode.ORIGIN_NOT_ALLOWED]: ['This site is not authorised', 'Add this site’s origin to the API allowlist, then reload. See DASHBOARD.md.'],
  [ErrorCode.KILL_SWITCH]: ['Down for maintenance', 'The platform is temporarily unavailable. Please try again shortly.'],
  [ErrorCode.NETWORK]: ['Cannot reach the server', 'Check your connection and try again. If it persists the API may be down.'],
  [ErrorCode.NOT_CONFIGURED]: ['Not configured', 'SUPABASE_URL and SUPABASE_ANON_KEY are missing from this build.'],
  [ErrorCode.SERVER_ERROR]: ['Something went wrong', 'The server hit an unexpected error. Please try again.'],
  [ErrorCode.BAD_REQUEST]: ['That request was not valid', 'Check the values you entered and try again.']
};

/** @returns {{title: string, message: string}} display copy for any error. */
export function describeError(err) {
  const code = err instanceof ApiError ? err.code : ErrorCode.SERVER_ERROR;
  const [title, fallback] = COPY[code] || COPY[ErrorCode.SERVER_ERROR];
  // The server's own message is more specific than ours whenever it sent one.
  const message = err && err.message && err.message !== code ? err.message : fallback;
  return { title, message };
}

/* ─────────────────────────────────────────────────────────────────
   Client
   ───────────────────────────────────────────────────────────────── */

let client = null;

/**
 * The single Supabase client for the whole site.
 *
 * persistSession + autoRefreshToken give us the two things the brief asks
 * for: a session that survives a refresh, and a token that renews itself
 * before it expires so a long sitting on one dashboard never 401s.
 *
 * The storage key is namespaced so the marketing site, the dashboard and any
 * other Supabase app on the same origin cannot collide.
 */
export function getClient() {
  if (client) return client;
  if (!isConfigured) {
    throw new ApiError(ErrorCode.NOT_CONFIGURED, COPY[ErrorCode.NOT_CONFIGURED][1]);
  }
  if (!window.supabase || !window.supabase.createClient) {
    throw new ApiError(ErrorCode.NOT_CONFIGURED, 'The Supabase library did not load.');
  }

  client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Nothing in this product uses magic links or OAuth redirects, so
      // there is never a token in the URL to detect.
      detectSessionInUrl: false,
      storageKey: 'northleaf.mrp.auth',
      flowType: 'pkce'
    },
    global: {
      headers: { 'x-client-info': 'northleaf-dashboard/1.0.0' }
    }
  });
  return client;
}

/* ─────────────────────────────────────────────────────────────────
   Auth
   ───────────────────────────────────────────────────────────────── */

/** @returns {Promise<import('@supabase/supabase-js').Session|null>} */
export async function getSession() {
  const { data, error } = await getClient().auth.getSession();
  if (error) return null;
  return data.session ?? null;
}

/**
 * Email + password sign in. There is deliberately no signUp export in this
 * module: the product is invite-only and accounts are created exclusively by
 * an admin through the admin-users Edge Function.
 */
export async function signIn(email, password) {
  const { data, error } = await getClient().auth.signInWithPassword({
    email: String(email).trim().toLowerCase(),
    password
  });

  if (error) {
    // Supabase reports both "no such user" and "wrong password" as the same
    // 400. Keep it that way — telling an attacker which one it was turns the
    // login form into an account-existence oracle.
    const status = error.status || 400;
    if (status === 400 || status === 401) {
      throw new ApiError(ErrorCode.INVALID_TOKEN, 'That email and password combination is not correct.', { status });
    }
    if (status === 429) {
      throw new ApiError(ErrorCode.BAD_REQUEST, 'Too many attempts. Wait a minute and try again.', { status });
    }
    throw new ApiError(ErrorCode.NETWORK, error.message || COPY[ErrorCode.NETWORK][1], { status });
  }
  return data.session;
}

export async function signOut() {
  try {
    await getClient().auth.signOut();
  } catch {
    /* Signing out is best-effort: the local session is cleared either way. */
  }
}

/** Fires on sign-in, sign-out and token refresh, in this tab and every other. */
export function onAuthChange(handler) {
  const { data } = getClient().auth.onAuthStateChange((event, session) => handler(event, session));
  return () => data.subscription.unsubscribe();
}

/* ─────────────────────────────────────────────────────────────────
   Edge Function transport
   ───────────────────────────────────────────────────────────────── */

/**
 * POST to an Edge Function with the caller's access token attached.
 *
 * getSession() rather than a cached token: supabase-js refreshes in the
 * background, and reading it fresh each call means we always send the newest
 * one rather than a copy that expired while the tab sat open.
 */
async function callFunction(name, body = {}, { signal } = {}) {
  if (!isConfigured) {
    throw new ApiError(ErrorCode.NOT_CONFIGURED, COPY[ErrorCode.NOT_CONFIGURED][1]);
  }

  const session = await getSession();
  if (!session?.access_token) {
    throw new ApiError(ErrorCode.MISSING_TOKEN, COPY[ErrorCode.MISSING_TOKEN][1], { status: 401 });
  }

  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify(body),
      signal
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    // A CORS rejection also lands here, because the browser refuses to expose
    // the response at all. The origin-allowlist hint is in DASHBOARD.md.
    throw new ApiError(ErrorCode.NETWORK, COPY[ErrorCode.NETWORK][1]);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const err = payload?.error ?? {};
    throw new ApiError(
      err.code || (response.status === 403 ? ErrorCode.NOT_ADMIN : ErrorCode.SERVER_ERROR),
      err.message || `Request failed (${response.status}).`,
      { status: response.status, detail: err.detail ?? null }
    );
  }

  return payload ?? {};
}

/* ─────────────────────────────────────────────────────────────────
   Endpoints
   ───────────────────────────────────────────────────────────────── */

/**
 * Who am I and what may I do right now?
 *
 * The gate. Called on every dashboard load. A non-200 here means the
 * dashboards stay locked, and the code says which lock it is.
 *
 * @returns {Promise<{profile: Profile, quota: Quota, settings: {killSwitch: boolean}}>}
 */
export function fetchMe(options) {
  return callFunction('me', {}, options);
}

/**
 * Scored listings only — units, revenue and the Research Opportunity Score
 * per row, straight from the server's model.
 *
 * @param {object[]} items raw listing rows, at most 1000
 */
export function research(items, options) {
  return callFunction('research', { op: 'score', items }, options);
}

/**
 * Scored listings plus every KPI and chart series for the Market Analysis
 * view. One billable call regardless of how many rows you send.
 *
 * @returns {Promise<{items: ScoredItem[], analysis: MarketAnalysis, quota: Quota}>}
 */
export function analyzeMarket(items, { query = null, ...options } = {}) {
  return callFunction('research', { op: 'analyze', items, query }, options);
}

/**
 * Brand-level market share, HHI, concentration verdict and the competitive
 * advisories for the Market Share view.
 *
 * @param {string|null} ourBrand the brand to diagnose against the leader
 * @param {number} bigThreshold share above which a brand counts as "big", 0-1
 */
export function analyzeBrands(items, { ourBrand = null, bigThreshold = 0.05, ...options } = {}) {
  return callFunction('research', { op: 'brand', items, ourBrand, bigThreshold }, options);
}

/* ── Admin control plane ──────────────────────────────────────────
   Every one of these is authorised server-side by admin-users /
   admin-usage, which re-read the caller's role from the database on each
   request. Hiding the nav link for a non-admin is a courtesy; this is the
   actual control. A non-admin calling any of these gets a 403 back. */

export const admin = {
  listUsers: (options) => callFunction('admin-users', { op: 'list' }, options),

  createUser: (input, options) =>
    callFunction('admin-users', {
      op: 'create',
      email: input.email,
      password: input.password,
      fullName: input.fullName ?? null,
      role: input.role ?? 'user',
      quota: input.quota,
      accessExpiresAt: input.accessExpiresAt ?? null,
      notes: input.notes ?? null
    }, options),

  updateUser: (userId, patch, options) =>
    callFunction('admin-users', { op: 'update', userId, ...patch }, options),

  setEnabled: (userId, enabled, options) =>
    callFunction('admin-users', { op: enabled ? 'enable' : 'disable', userId }, options),

  deleteUser: (userId, options) => callFunction('admin-users', { op: 'delete', userId }, options),

  resetPassword: (userId, password, options) =>
    callFunction('admin-users', { op: 'reset-password', userId, password }, options),

  getSettings: (options) => callFunction('admin-users', { op: 'settings.get' }, options),

  updateSettings: (patch, options) =>
    callFunction('admin-users', { op: 'settings.update', ...patch }, options),

  auditLog: (limit = 100, options) => callFunction('admin-users', { op: 'audit', limit }, options),

  usage: (days = 30, recent = 50, options) =>
    callFunction('admin-usage', { days, recent }, options)
};

/* ─────────────────────────────────────────────────────────────────
   Shapes returned by the API, for reference at the call sites.
   ─────────────────────────────────────────────────────────────────

   Profile        { id, email, fullName, role: 'admin'|'user',
                    status: 'active'|'disabled'|'expired',
                    accessExpiresAt, createdAt }

   Quota          { used, limit, remaining, resetsAt? }

   ScoredItem     { asin, rankNumber, reviewCountNumber, priceNumber,
                    familySize, bsrEstimatedUnitsLow|Mid|High,
                    bsrEstimatedRevenueLow|Mid|High, estimateModel,
                    estimateConfidence, estimateReason, opportunityScore }

   MarketAnalysis { kpis:   { totalProducts, averagePrice,
                              estimatedMarketValue, monthlyUnits,
                              averageReviews, sponsoredPercent,
                              uniqueBrands },
                    charts: { priceBands, unitBands, ratings,
                              rankBandValue, brandShare,
                              brandValue: [name, value][],
                              categories: [name, count][] },
                    opportunities: [{ asin, name, brand, opportunityScore,
                                      estimatedUnits, reviewCount,
                                      itemLink }] }

   BrandAnalysis  { total, brands: BrandRow[],
                    kpis: { totalRevenue, totalUnits, brandCount,
                            bigBrandCount, asinCount, topBrand,
                            topBrandShare, topBrandRevenue, top3Share,
                            hhi, concentration },
                    advisories: [{ tone, title, message }],
                    insights:   [{ title, message }] }

   BrandRow       { brand, brandKey, revenue, units, asinCount, share,
                    avgPrice, avgRating, avgBsr, reviews, fbaShare,
                    sponsoredRows, topAsin }
   ───────────────────────────────────────────────────────────────── */
