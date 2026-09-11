/**
 * Small shared UI vocabulary: escaping, formatting, skeletons, states,
 * toasts and a modal. Everything renders with the classes in
 * assets/css/dashboard.css, which are themselves built from the marketing
 * site's tokens — so nothing here can invent a look.
 */

/* ─── Escaping ──────────────────────────────────────────────────── */

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * Every value that reaches innerHTML goes through here. Rows come from
 * user-uploaded workbooks and from the API, so product titles and brand
 * names are untrusted text.
 */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

/** Only http(s) links are allowed out of a data row — no javascript: URLs. */
export function safeUrl(value) {
  const raw = String(value ?? '').trim();
  if (!/^https?:\/\//i.test(raw)) return '';
  return esc(raw);
}

/* ─── Formatting ────────────────────────────────────────────────── */

const nf = new Intl.NumberFormat('en-CA');
const nf1 = new Intl.NumberFormat('en-CA', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const cf = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
const cf2 = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const num = (v) => (Number.isFinite(Number(v)) ? nf.format(Math.round(Number(v))) : '—');
export const money = (v) => (Number.isFinite(Number(v)) ? cf.format(Number(v)) : '—');
export const money2 = (v) => (Number.isFinite(Number(v)) ? cf2.format(Number(v)) : '—');
export const pct = (v, digits = 1) =>
  Number.isFinite(Number(v)) ? `${Number(v).toFixed(digits)}%` : '—';
/** Server shares arrive as 0–1 fractions. */
export const share = (v) => (Number.isFinite(Number(v)) ? `${(Number(v) * 100).toFixed(1)}%` : '—');
export const dec = (v) => (Number.isFinite(Number(v)) ? nf1.format(Number(v)) : '—');

/** Big numbers in a KPI tile read better compacted. */
export function compact(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e4) return `${(n / 1e3).toFixed(0)}K`;
  return nf.format(Math.round(n));
}

export function compactMoney(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `$${(n / 1e3).toFixed(0)}K`;
  return cf.format(n);
}

export function dateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function dateOnly(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function relativeTime(value) {
  if (!value) return 'Never';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return 'Never';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days}d ago`;
  return dateOnly(value);
}

/* ─── Icons ─────────────────────────────────────────────────────── */

/**
 * Feather-style 24px strokes, matching the marketing pages exactly:
 * fill none, stroke currentColor, round caps and joins.
 */
const PATHS = {
  box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line>',
  tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line>',
  bank: '<line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>',
  chart: '<line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>',
  target: '<circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle>',
  layers: '<path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path>',
  trend: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>',
  grid: '<rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect>',
  pie: '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path><path d="M22 12A10 10 0 0 0 12 2v10z"></path>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>',
  power: '<path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line>',
  refresh: '<polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>',
  info: '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>',
  check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>',
  x: '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>',
  arrow: '<line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>',
  eyeOff: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>',
  key: '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path>',
  clock: '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline>',
  activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>',
  trash: '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>',
  search: '<circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>',
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>'
};

/** @param {keyof PATHS} name */
export function icon(name, size = 16, strokeWidth = 1.6) {
  const body = PATHS[name] || PATHS.info;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

/* ─── DOM ───────────────────────────────────────────────────────── */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function setHTML(target, html) {
  const el = typeof target === 'string' ? $(target) : target;
  if (el) el.innerHTML = html;
  return el;
}

/* ─── States ────────────────────────────────────────────────────── */

/** A skeleton shaped like the thing it stands in for, not a generic blob. */
export function skeletonKpis(count = 6) {
  return `<div class="kpi-grid">${Array.from({ length: count }, () => `
    <div class="kpi" aria-hidden="true">
      <div class="skeleton skeleton-line is-short" style="height:10px"></div>
      <div class="skeleton" style="height:30px;width:72%;margin:14px 0 10px;border-radius:8px"></div>
      <div class="skeleton skeleton-line is-mid" style="height:9px;margin:0"></div>
    </div>`).join('')}</div>`;
}

export function skeletonPanel(height = 260) {
  return `<div aria-hidden="true">
    <div class="skeleton skeleton-title"></div>
    <div class="skeleton skeleton-line is-mid"></div>
    <div class="skeleton" style="height:${height}px;margin-top:20px;border-radius:12px"></div>
  </div>`;
}

export function skeletonRows(rows = 6) {
  return `<div aria-hidden="true">${Array.from({ length: rows }, (_, i) => `
    <div class="skeleton skeleton-line" style="height:16px;width:${100 - i * 6}%;margin-bottom:14px"></div>`).join('')}</div>`;
}

/**
 * Empty / error / locked panel body.
 * @param {{tone?: 'empty'|'error', icon?: string, title: string, text: string, actions?: string}} opts
 */
export function stateBlock({ tone = 'empty', icon: iconName, title, text, actions = '' }) {
  const glyph = iconName || (tone === 'error' ? 'alert' : 'inbox');
  return `<div class="state-block ${tone === 'error' ? 'is-error' : ''}" role="${tone === 'error' ? 'alert' : 'status'}">
    <div class="state-icon">${icon(glyph, 24, 1.5)}</div>
    <h3 class="state-title">${esc(title)}</h3>
    <p class="state-text">${esc(text)}</p>
    ${actions ? `<div class="state-actions">${actions}</div>` : ''}
  </div>`;
}

/** Renders any thrown error into a panel body using its friendly copy. */
export function errorBlock(err, describeFn, actions = '') {
  const { title, message } = describeFn(err);
  return stateBlock({ tone: 'error', title, text: message, actions });
}

/* ─── Toasts ────────────────────────────────────────────────────── */

function toastHost() {
  let host = $('#toastStack');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toastStack';
    host.className = 'toast-stack';
    // polite, not assertive: a success confirmation should not interrupt
    // whatever a screen reader is currently saying.
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  return host;
}

/** @param {'success'|'error'|'info'} tone */
export function toast(message, tone = 'info', ms = 4600) {
  const host = toastHost();
  const el = document.createElement('div');
  el.className = `toast is-${tone}`;
  const glyph = tone === 'success' ? 'check' : tone === 'error' ? 'alert' : 'info';
  el.innerHTML = `${icon(glyph, 17, 1.7)}<span>${esc(message)}</span>`;
  host.appendChild(el);

  const remove = () => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 320);
  };
  const timer = setTimeout(remove, ms);
  el.addEventListener('click', () => {
    clearTimeout(timer);
    remove();
  });
  return remove;
}

/* ─── Modal ─────────────────────────────────────────────────────── */

/**
 * A focus-trapping modal. Returns a promise resolving to the value passed to
 * `close(value)`, or null when dismissed.
 *
 * @param {{title: string, note?: string, body: string, footer?: string,
 *          onMount?: (root: HTMLElement, close: (v:any)=>void) => void}} opts
 */
export function openModal({ title, note = '', body, footer = '', onMount }) {
  const previouslyFocused = document.activeElement;
  const root = document.createElement('div');
  root.className = 'modal';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', title);
  root.innerHTML = `
    <div class="modal-card">
      <button class="modal-close" type="button" aria-label="Close">${icon('x', 18, 2)}</button>
      <div class="modal-head">
        <h2 class="modal-title">${esc(title)}</h2>
        ${note ? `<p class="modal-note">${esc(note)}</p>` : ''}
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;

  document.body.appendChild(root);
  document.body.style.overflow = 'hidden';

  return new Promise((resolve) => {
    let settled = false;
    const close = (value = null) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKey, true);
      root.remove();
      document.body.style.overflow = '';
      if (previouslyFocused?.focus) previouslyFocused.focus();
      resolve(value);
    };

    const focusables = () =>
      $$('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])', root)
        .filter((el) => el.offsetParent !== null);

    function onKey(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(null);
        return;
      }
      if (event.key !== 'Tab') return;
      // Keep Tab inside the dialog, both directions.
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKey, true);
    $('.modal-close', root).addEventListener('click', () => close(null));
    root.addEventListener('mousedown', (e) => {
      if (e.target === root) close(null);
    });

    if (onMount) onMount(root, close);
    (focusables()[0] || $('.modal-close', root)).focus();
  });
}

/** Yes/no confirmation in the same clothes as the rest of the product. */
export function confirmDialog({ title, note, confirmLabel = 'Confirm', danger = false }) {
  return openModal({
    title,
    note,
    body: '',
    footer: `
      <button type="button" class="btn-sm" data-act="cancel">Cancel</button>
      <button type="button" class="btn-sm ${danger ? 'is-danger' : 'is-solid'}" data-act="ok">${esc(confirmLabel)}</button>`,
    onMount(root, close) {
      $('[data-act="cancel"]', root).addEventListener('click', () => close(false));
      $('[data-act="ok"]', root).addEventListener('click', () => close(true));
    }
  }).then((v) => v === true);
}

/* ─── CSV export ────────────────────────────────────────────────── */

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  // Neutralise spreadsheet formula injection: a cell starting with = + - @
  // is executed by Excel and Sheets when the file is opened.
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/**
 * @param {string[]} headers
 * @param {Array<Array<unknown>>} rows
 */
export function toCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) lines.push(row.map(csvCell).join(','));
  // BOM so Excel opens UTF-8 product titles correctly.
  return `﻿${lines.join('\r\n')}`;
}

export function downloadCsv(filename, headers, rows) {
  const blob = new Blob([toCsv(headers, rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ─── Misc ──────────────────────────────────────────────────────── */

export function debounce(fn, ms = 220) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** A password an admin can read out loud without ambiguity. */
export function generatePassword(length = 20) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}
