/**
 * ═══════════════════════════════════════════════════════════════
 * WORKBOOK READER  —  CSV / TSV / XLSX → raw listing rows
 * ═══════════════════════════════════════════════════════════════
 *
 * The website cannot scrape Amazon; only the Chrome extension can, because
 * only an extension has host permissions for amazon.ca / amazon.com. So the
 * website's way in is a file: a Helium 10 Xray export, or a Product Details
 * workbook exported from the extension.
 *
 * This module turns that file into the RawItem[] shape the `research` Edge
 * Function expects, using the same header aliases the extension's
 * normalizeObject() uses so a workbook that works in one works in the other.
 *
 * It maps names. It does not compute anything — no estimates, no scores, no
 * derived metrics. Every number the dashboard displays comes back from the
 * server.
 *
 * XLSX is read without a third-party parser: an .xlsx is a ZIP of XML, and
 * DecompressionStream('deflate-raw') is available in every browser this site
 * supports. That is ~200 lines here instead of a 900 KB dependency whose
 * only npm-published version carries a known prototype-pollution advisory.
 */

import { url } from './paths.js';

/* ─────────────────────────────────────────────────────────────────
   Header aliases
   ─────────────────────────────────────────────────────────────────
   Left side: a column heading squashed to lowercase alphanumerics.
   Right side: the RawItem field the Edge Function reads.
   Covers the extension's own export and Helium 10 Xray's column names. */

const HEADER_ALIASES = {
  // identity
  productdetails: 'name',
  productname: 'name',
  title: 'name',
  name: 'name',
  asin: 'asin',
  parentasin: 'parentAsin',
  brand: 'brand',
  manufacturer: 'brand',

  // price
  price: 'priceNumber',
  pricenumber: 'priceNumber',
  currentprice: 'priceNumber',
  priceca: 'priceNumber',
  priceusd: 'priceNumber',
  priceus: 'priceNumber',
  originalprice: 'originalPrice',
  discount: 'discountPercentage',
  discountpercent: 'discountPercentage',

  // rank
  bsr: 'rank',
  mainrank: 'rank',
  rank: 'rank',
  bestsellersrank: 'rank',
  mainrankcategory: 'rankCategory',
  category: 'rankCategory',
  subcategoryrank: 'subcategoryRank',
  rankedsubcategory: 'rankedSubcategory',

  // social proof
  rating: 'review',
  ratings: 'review',
  review: 'review',
  stars: 'review',
  reviewcount: 'reviewCount',
  reviews: 'reviewCount',
  ratingcount: 'reviewCount',

  // variation family
  variationtype: 'variationType',
  selectedvariation: 'selectedVariation',
  variationcount: 'variationCount',
  familysize: 'familySize',

  // badges / marketplace
  amazonmonthlybadge: 'amazonMonthlyBadge',
  badgeminimumunits: 'amazonBadgeMinimumUnits',
  boughtinpastmonth: 'amazonBadgeMinimumUnits',
  recentpurchases: 'amazonBadgeMinimumUnits',
  sponsored: 'sponsored',
  fulfillment: 'fulfillment',
  fulfilment: 'fulfillment',
  seller: 'seller',
  buybox: 'buyBoxSeller',
  buyboxseller: 'buyBoxSeller',
  sizetier: 'sizeTier',
  availability: 'availability',
  stock: 'availability',
  shipsfrom: 'shipsFrom',
  countryoforigin: 'countryOfOrigin',

  // links
  url: 'itemLink',
  productlink: 'itemLink',
  link: 'itemLink',
  imageurl: 'imageLink',
  imagelink: 'imageLink',
  image: 'imageLink',

  // reference figures a source file may already carry. Passed through for
  // display only; the server does not read them when estimating.
  asinrevenue: 'asinRevenue',
  parentlevelrevenue: 'parentLevelRevenue',
  asinsalesunit: 'asinSalesUnit',
  parentlevelsalesunit: 'parentLevelSalesUnit',
  sellerage: 'sellerAgeMonths',
  selleragemo: 'sellerAgeMonths'
};

const squash = (header) => String(header ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** "CA$26.99" → 26.99 · "1,682" → 1682 · "" → null */
function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[^0-9.\-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const TRUE_WORDS = new Set(['true', 'yes', 'y', '1', 'sponsored']);

/**
 * One source row → one RawItem.
 * Unmapped columns are kept under their camelCase name so nothing the user
 * uploaded is silently dropped from the detail tables.
 */
function normalizeRow(row) {
  const out = {};

  for (const [key, value] of Object.entries(row)) {
    const alias = HEADER_ALIASES[squash(key)];
    const field = alias || (String(key).charAt(0).toLowerCase() + String(key).slice(1)).replace(/\s+/g, '');
    if (out[field] === undefined || out[field] === '' || out[field] === null) out[field] = value;
  }

  out.asin = String(out.asin ?? '').trim().toUpperCase();
  out.name = String(out.name ?? '').trim();
  out.brand = String(out.brand ?? '').trim() || 'Unknown';
  out.priceNumber = toNumber(out.priceNumber);
  out.rank = toNumber(out.rank);
  out.reviewCount = toNumber(out.reviewCount) ?? 0;
  out.review = toNumber(out.review);
  out.variationCount = toNumber(out.variationCount) ?? null;
  out.familySize = toNumber(out.familySize) ?? null;
  out.amazonBadgeMinimumUnits = toNumber(out.amazonBadgeMinimumUnits) ?? 0;
  out.sponsored = typeof out.sponsored === 'boolean'
    ? out.sponsored
    : TRUE_WORDS.has(String(out.sponsored ?? '').trim().toLowerCase());

  if (out.priceNumber !== null && !out.price) out.price = `$${out.priceNumber.toFixed(2)}`;
  return out;
}

/** A row is usable when we can name it and price it. */
function isUsable(row) {
  return Boolean(row.asin) && row.asin.length >= 6;
}

/* ─────────────────────────────────────────────────────────────────
   CSV / TSV
   ───────────────────────────────────────────────────────────────── */

/**
 * RFC-4180 reader: quoted fields, escaped quotes, and newlines inside
 * quotes. Product titles routinely contain commas and 12" measurements, so
 * a split(',') reader corrupts real exports.
 */
export function parseDelimited(text, delimiter) {
  const clean = text.replace(/^﻿/, '');
  const sep = delimiter || (clean.slice(0, 4000).split('\t').length > clean.slice(0, 4000).split(',').length ? '\t' : ',');

  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];

    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') { inQuotes = true; continue; }
    if (ch === sep) { row.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += ch;
  }

  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => String(cell).trim() !== ''));
}

/**
 * Some exports put a title or a blank line above the real header. Pick the
 * first row that actually looks like column headings.
 */
function findHeaderRow(rows) {
  const limit = Math.min(rows.length, 12);
  let best = 0;
  let bestScore = -1;

  for (let i = 0; i < limit; i += 1) {
    const score = rows[i].filter((cell) => HEADER_ALIASES[squash(cell)]).length;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return bestScore > 0 ? best : 0;
}

function rowsToObjects(rows) {
  if (!rows.length) return [];
  const headerIndex = findHeaderRow(rows);
  const headers = rows[headerIndex].map((h, i) => String(h).trim() || `column${i + 1}`);

  return rows.slice(headerIndex + 1).map((cells) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cells[i] ?? ''; });
    return obj;
  });
}

/* ─────────────────────────────────────────────────────────────────
   XLSX  (ZIP → inflate → XML)
   ───────────────────────────────────────────────────────────────── */

/**
 * Reads the ZIP central directory and returns { name: Uint8Array } for the
 * entries we care about. Only STORE (0) and DEFLATE (8) are handled, which
 * is everything Excel, Numbers, LibreOffice and Helium 10 produce.
 */
async function unzip(buffer, wanted) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // End of central directory: scan back from the tail for its signature.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && i > bytes.length - 66000; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid .xlsx file.');

  const entryCount = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const files = {};

  for (let n = 0; n < entryCount; n += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;

    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));

    offset += 46 + nameLength + extraLength + commentLength;

    if (!wanted(name)) continue;

    // The local header repeats the name and extra fields at their own lengths.
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const raw = bytes.subarray(start, start + compressedSize);

    if (method === 0) {
      files[name] = raw;
    } else if (method === 8) {
      if (typeof DecompressionStream === 'undefined') {
        throw new Error('This browser cannot read .xlsx files. Please upload CSV instead.');
      }
      const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      files[name] = new Uint8Array(await new Response(stream).arrayBuffer());
    } else {
      throw new Error(`Unsupported compression in ${name}.`);
    }
  }

  return files;
}

const decode = (bytes) => new TextDecoder('utf-8').decode(bytes);

/** "BC12" → 54 (zero-based column index) */
function columnIndex(ref) {
  const letters = /^([A-Z]+)/.exec(ref);
  if (!letters) return 0;
  let n = 0;
  for (const ch of letters[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * Excel serial date → ISO string. 1900-based, with the deliberate
 * Lotus 1-2-3 leap-year bug Excel still carries (hence the -2 offset).
 */
function excelDate(serial) {
  const ms = Math.round((Number(serial) - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? String(serial) : d.toISOString().slice(0, 10);
}

export async function parseXlsx(buffer) {
  const files = await unzip(buffer, (name) =>
    name === 'xl/workbook.xml' ||
    name === 'xl/sharedStrings.xml' ||
    name === 'xl/styles.xml' ||
    name === 'xl/_rels/workbook.xml.rels' ||
    /^xl\/worksheets\/sheet\d+\.xml$/.test(name));

  const parser = new DOMParser();

  // Shared strings: cells of type "s" hold an index into this table.
  const shared = [];
  if (files['xl/sharedStrings.xml']) {
    const doc = parser.parseFromString(decode(files['xl/sharedStrings.xml']), 'application/xml');
    for (const si of doc.getElementsByTagName('si')) {
      // Rich text splits one string across several <t> runs.
      shared.push(Array.from(si.getElementsByTagName('t')).map((t) => t.textContent).join(''));
    }
  }

  // Which cellXfs entries are dates, so serials become readable.
  const dateStyles = new Set();
  if (files['xl/styles.xml']) {
    const doc = parser.parseFromString(decode(files['xl/styles.xml']), 'application/xml');
    const custom = new Set();
    for (const fmt of doc.getElementsByTagName('numFmt')) {
      const code = fmt.getAttribute('formatCode') || '';
      if (/[dmyhs]/i.test(code) && !/[#0]/.test(code)) custom.add(fmt.getAttribute('numFmtId'));
    }
    const xfs = doc.getElementsByTagName('cellXfs')[0];
    if (xfs) {
      Array.from(xfs.getElementsByTagName('xf')).forEach((xf, i) => {
        const id = xf.getAttribute('numFmtId');
        // 14–22 and 45–47 are Excel's built-in date and time formats.
        if (custom.has(id) || (Number(id) >= 14 && Number(id) <= 22) || (Number(id) >= 45 && Number(id) <= 47)) {
          dateStyles.add(String(i));
        }
      });
    }
  }

  // Prefer a sheet named like the extension's export, else the first one.
  const sheetNames = Object.keys(files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

  let target = sheetNames[0];
  if (files['xl/workbook.xml'] && sheetNames.length > 1) {
    const wb = parser.parseFromString(decode(files['xl/workbook.xml']), 'application/xml');
    const titles = Array.from(wb.getElementsByTagName('sheet')).map((s) => s.getAttribute('name') || '');
    const preferred = titles.findIndex((t) => /product\s*details/i.test(t));
    if (preferred >= 0 && sheetNames[preferred]) target = sheetNames[preferred];
  }
  if (!target) throw new Error('That workbook has no readable sheet.');

  const sheet = parser.parseFromString(decode(files[target]), 'application/xml');
  const grid = [];

  for (const rowEl of sheet.getElementsByTagName('row')) {
    const cells = [];
    for (const cellEl of rowEl.getElementsByTagName('c')) {
      const ref = cellEl.getAttribute('r') || '';
      const type = cellEl.getAttribute('t');
      const style = cellEl.getAttribute('s');
      const index = ref ? columnIndex(ref) : cells.length;

      let value = '';
      if (type === 'inlineStr') {
        value = Array.from(cellEl.getElementsByTagName('t')).map((t) => t.textContent).join('');
      } else {
        const v = cellEl.getElementsByTagName('v')[0];
        const text = v ? v.textContent : '';
        if (type === 's') value = shared[Number(text)] ?? '';
        else if (type === 'b') value = text === '1' ? 'TRUE' : 'FALSE';
        else if (text !== '' && dateStyles.has(String(style))) value = excelDate(text);
        else value = text;
      }

      while (cells.length < index) cells.push('');
      cells[index] = value;
    }
    if (cells.some((c) => String(c).trim() !== '')) grid.push(cells);
  }

  return grid;
}

/* ─────────────────────────────────────────────────────────────────
   Public entry point
   ───────────────────────────────────────────────────────────────── */

export const MAX_ROWS = 1000; // matches MAX_ITEMS in the research Edge Function

/**
 * @param {File} file
 * @returns {Promise<{rows: object[], skipped: number, truncated: boolean, sourceName: string}>}
 */
export async function readWorkbook(file) {
  const name = file.name || 'upload';
  const lower = name.toLowerCase();
  let grid;

  if (lower.endsWith('.xlsx') || lower.endsWith('.xlsm')) {
    grid = await parseXlsx(await file.arrayBuffer());
  } else if (lower.endsWith('.xls')) {
    // Legacy binary .xls is a different format entirely (OLE2 compound file).
    throw new Error('Old .xls workbooks are not supported. Re-save as .xlsx or .csv and upload again.');
  } else {
    grid = parseDelimited(await file.text(), lower.endsWith('.tsv') ? '\t' : null);
  }

  if (!grid.length) throw new Error('That file has no rows in it.');

  const objects = rowsToObjects(grid);
  const normalized = objects.map(normalizeRow);
  const usable = normalized.filter(isUsable);

  if (!usable.length) {
    throw new Error('No ASIN column found. Export from Helium 10 Xray or from the extension’s Product Details sheet.');
  }

  // De-duplicate on ASIN, keeping the first occurrence — Xray exports repeat
  // a parent row once per child.
  const seen = new Set();
  const unique = [];
  for (const row of usable) {
    if (seen.has(row.asin)) continue;
    seen.add(row.asin);
    unique.push(row);
  }

  return {
    rows: unique.slice(0, MAX_ROWS),
    skipped: normalized.length - usable.length,
    truncated: unique.length > MAX_ROWS,
    sourceName: name
  };
}

/** The bundled Helium 10 sample, so a new account sees a full dashboard. */
export async function loadSampleDataset() {
  const response = await fetch(url('assets/data/sample-market.json'), { cache: 'force-cache' });
  if (!response.ok) throw new Error('Could not load the sample dataset.');
  const payload = await response.json();
  return {
    rows: payload.rows.slice(0, MAX_ROWS),
    skipped: 0,
    truncated: payload.rows.length > MAX_ROWS,
    sourceName: `${payload.name} (sample)`,
    ourBrand: payload.ourBrand || null
  };
}
