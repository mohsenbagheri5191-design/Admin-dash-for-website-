/**
 * The working dataset, shared between the three dashboards.
 *
 * A user uploads a workbook on Market Analysis and expects Market Share and
 * My Products to be looking at the same products. This keeps the rows in
 * sessionStorage so navigating between the three pages does not mean
 * re-uploading and re-spending a request on every hop.
 *
 * sessionStorage, not localStorage, and namespaced by user id: research data
 * is the customer's commercial information, so it should not outlive the tab
 * or leak to the next person who signs in on a shared machine.
 *
 * Only source rows are cached. Everything the server computed is re-fetched,
 * so a change to the model on the server shows up on the next load rather
 * than being pinned by a stale cache.
 */

const KEY_PREFIX = 'northleaf.dataset.';
const VERSION = 1;

function key(userId) {
  return `${KEY_PREFIX}${userId || 'anon'}`;
}

/** @returns {{rows: object[], sourceName: string, ourBrand: string|null, savedAt: string}|null} */
export function loadDataset(userId) {
  try {
    const raw = sessionStorage.getItem(key(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.version !== VERSION || !Array.isArray(parsed.rows) || !parsed.rows.length) return null;
    return parsed;
  } catch {
    // A quota error, a private-mode restriction or corrupt JSON all mean the
    // same thing to a caller: there is no cached dataset.
    return null;
  }
}

export function saveDataset(userId, { rows, sourceName, ourBrand = null }) {
  const payload = {
    version: VERSION,
    rows,
    sourceName,
    ourBrand,
    savedAt: new Date().toISOString()
  };
  try {
    sessionStorage.setItem(key(userId), JSON.stringify(payload));
  } catch {
    // Over the ~5 MB sessionStorage budget. The dashboard still works for
    // this page load; only the hop to another page loses the rows.
  }
  return payload;
}

export function clearDataset(userId) {
  try {
    sessionStorage.removeItem(key(userId));
  } catch {
    /* nothing to clear */
  }
}

/** Remembers the "Our Brand" selection without rewriting the whole row set. */
export function setOurBrand(userId, ourBrand) {
  const current = loadDataset(userId);
  if (!current) return null;
  return saveDataset(userId, { ...current, ourBrand });
}
