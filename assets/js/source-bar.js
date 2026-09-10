/**
 * The data-source panel that opens all three research dashboards.
 *
 * Mirrors the extension's two ways in — "upload a Product Details workbook"
 * and "use the data already loaded" — and adds the bundled Helium 10 sample
 * so a brand-new account sees a populated dashboard on its first visit
 * instead of an empty state it has no way to fill.
 */

import { $, esc, icon, num, toast } from './ui.js';
import { readWorkbook, loadSampleDataset, MAX_ROWS } from './workbook.js';
import { saveDataset, clearDataset } from './dataset.js';

/**
 * @param {object} opts
 * @param {HTMLElement} opts.host        element to render into
 * @param {string} opts.userId           namespaces the cached dataset
 * @param {{rows:object[],sourceName:string}|null} opts.current
 * @param {(dataset: object) => void} opts.onLoad  called with the new rows
 * @param {string} [opts.hint]           view-specific line of guidance
 */
export function mountSourceBar({ host, userId, current, onLoad, hint }) {
  const has = Boolean(current?.rows?.length);

  host.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <div class="grow">
          <h2 class="panel-title">Data source</h2>
          <p class="panel-note">${esc(hint || 'Upload a Helium 10 Xray export or a Product Details workbook from the extension. Rows are sent to the research API, which returns every estimate and score.')}</p>
        </div>
        ${has ? `<div class="panel-actions">
          <button type="button" class="btn-sm" id="srcClear">${icon('trash', 14)} Clear</button>
        </div>` : ''}
      </div>

      <div class="source-bar">
        <label class="dropzone" id="srcDrop" for="srcFile">
          <div class="dropzone-icon">${icon('upload', 22, 1.5)}</div>
          <div class="dropzone-title">Upload a workbook</div>
          <div class="dropzone-note">Drop a file here, or click to browse.<br>CSV, TSV or XLSX · up to ${num(MAX_ROWS)} products</div>
          <input type="file" id="srcFile" accept=".csv,.tsv,.txt,.xlsx,.xlsm"
               aria-label="Upload a workbook: CSV, TSV or XLSX, up to ${num(MAX_ROWS)} products">
        </label>

        <div class="stack" style="gap:12px">
          <button type="button" class="btn-sm is-solid" id="srcSample" style="justify-content:center">
            ${icon('layers', 15)} Load the sample market
          </button>
          <p class="form-hint" style="margin:0">
            273 real listings across 41 brands (Permanent Vinyl, Amazon.ca) —
            the same Helium 10 export bundled with the extension. Useful for
            seeing every panel populated before you upload your own.
          </p>
          <div id="srcStatus" class="source-status" ${has ? '' : 'hidden'}>
            ${icon('file', 15)}
            <span class="grow" id="srcStatusText">${has ? esc(current.sourceName) : ''}</span>
          </div>
        </div>
      </div>
    </div>`;

  const fileInput = $('#srcFile', host);
  const drop = $('#srcDrop', host);
  const status = $('#srcStatus', host);
  const statusText = $('#srcStatusText', host);

  let busy = false;

  function setStatus(text) {
    if (!status) return;
    status.hidden = !text;
    statusText.textContent = text || '';
  }

  async function accept(promise, label) {
    if (busy) return;
    busy = true;
    setStatus(`Reading ${label}…`);

    try {
      const result = await promise;
      const dataset = saveDataset(userId, {
        rows: result.rows,
        sourceName: result.sourceName,
        ourBrand: result.ourBrand ?? current?.ourBrand ?? null
      });

      setStatus(`${result.sourceName} — ${num(result.rows.length)} products`);
      if (result.skipped > 0) {
        toast(`${num(result.skipped)} row${result.skipped === 1 ? '' : 's'} skipped: no ASIN.`, 'info');
      }
      if (result.truncated) {
        toast(`Only the first ${num(MAX_ROWS)} products were kept — that is the API's per-request limit.`, 'info', 6500);
      }
      onLoad(dataset);
    } catch (err) {
      setStatus('');
      toast(err?.message || 'That file could not be read.', 'error', 6500);
    } finally {
      busy = false;
    }
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) accept(readWorkbook(file), file.name);
    fileInput.value = '';
  });

  // No role="button" or tabindex on the <label>: the file input inside is
  // already focusable and opens the picker on Enter or Space, so adding a
  // second control on the wrapper just nests two interactive elements.
  // .dropzone:focus-within draws the focus ring for it.

  ['dragenter', 'dragover'].forEach((type) =>
    drop.addEventListener(type, (event) => {
      event.preventDefault();
      drop.classList.add('is-over');
    }));

  ['dragleave', 'drop'].forEach((type) =>
    drop.addEventListener(type, (event) => {
      event.preventDefault();
      drop.classList.remove('is-over');
    }));

  drop.addEventListener('drop', (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) accept(readWorkbook(file), file.name);
  });

  $('#srcSample', host).addEventListener('click', () => accept(loadSampleDataset(), 'the sample market'));

  const clear = $('#srcClear', host);
  if (clear) {
    clear.addEventListener('click', () => {
      clearDataset(userId);
      window.location.reload();
    });
  }
}

/** The empty state every research view shows before a dataset is chosen. */
export function noDataState() {
  return `<div class="state-block">
    <div class="state-icon">${icon('inbox', 24, 1.5)}</div>
    <h3 class="state-title">No dataset loaded</h3>
    <p class="state-text">
      Upload a workbook above, or load the sample market, and every KPI, chart
      and table on this page fills in from the research API.
    </p>
  </div>`;
}
