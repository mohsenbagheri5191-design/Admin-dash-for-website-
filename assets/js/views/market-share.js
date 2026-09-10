/**
 * ═══════════════════════════════════════════════════════════════
 * BRAND MARKET SHARE
 * ═══════════════════════════════════════════════════════════════
 *
 * The website's counterpart to the extension's Brand Market Share Dashboard:
 * pick "Our Brand", set the big-brand threshold, and see share, HHI,
 * concentration, the price/rating landscape, competitive advisories and the
 * full brand + ASIN breakdown.
 *
 * Share, HHI, the concentration verdict and every advisory sentence come
 * from research/brand. Nothing here recomputes them; changing the threshold
 * or Our Brand re-asks the server rather than re-deriving in the browser.
 */

import { analyzeBrands } from '../api.js';
import { mountDashboard, handleViewError } from '../shell.js';
import { loadDataset, setOurBrand } from '../dataset.js';
import { mountSourceBar, noDataState } from '../source-bar.js';
import {
  $, esc, icon, num, money, money2, compactMoney, share, dec,
  skeletonKpis, skeletonPanel, stateBlock, downloadCsv, debounce
} from '../ui.js';
import { doughnut, barsH, bubble, destroyAllCharts } from '../charts.js';

const state = {
  session: null,
  dataset: null,
  result: null,          // BrandAnalysis from the server
  ourBrand: null,
  bigThreshold: 0.05,    // 5%, the extension's default
  filter: '',
  sort: { key: 'revenue', dir: 'desc' }
};

/* ─── KPIs ──────────────────────────────────────────────────────── */

function kpiTiles(kpis) {
  const tiles = [
    { icon: 'bank', label: 'Total Revenue', value: compactMoney(kpis.totalRevenue), sub: `${money(kpis.totalRevenue)} estimated / month` },
    { icon: 'chart', label: 'Total Units', value: num(kpis.totalUnits), sub: 'Estimated monthly units' },
    { icon: 'layers', label: 'Brands', value: num(kpis.brandCount), sub: `${num(kpis.bigBrandCount)} above the big-brand line` },
    { icon: 'box', label: 'ASINs', value: num(kpis.asinCount), sub: 'Unique listings in view' },
    { icon: 'star', label: 'Top Brand', value: esc(kpis.topBrand || '—'), sub: `${share(kpis.topBrandShare)} · ${money(kpis.topBrandRevenue)}`, text: true },
    { icon: 'trend', label: 'Top 3 Share', value: share(kpis.top3Share), sub: `HHI ${num(kpis.hhi)}` },
    { icon: 'target', label: 'Concentration', value: esc(kpis.concentration || '—'), sub: 'Herfindahl–Hirschman verdict', text: true }
  ];

  return `<div class="kpi-grid">${tiles.map((t) => `
    <article class="kpi">
      <p class="kpi-label">${icon(t.icon, 13, 1.8)}${esc(t.label)}</p>
      <p class="kpi-value ${t.text ? 'is-text' : ''}">${t.value}</p>
      <p class="kpi-sub">${t.sub}</p>
    </article>`).join('')}</div>`;
}

/* ─── Controls ──────────────────────────────────────────────────── */

function controlPanel(brands) {
  const options = ['<option value="">— none selected —</option>']
    .concat(brands.map((b) =>
      `<option value="${esc(b.brand)}" ${b.brand === state.ourBrand ? 'selected' : ''}>${esc(b.brand)} · ${share(b.share)}</option>`))
    .join('');

  return `<section class="panel">
    <div class="panel-head"><div class="grow">
      <h2 class="panel-title">Competitive lens</h2>
      <p class="panel-note">Choose the brand to diagnose and the share above which a brand counts as “big”. Both are sent to the API, which returns the comparison.</p>
    </div></div>

    <div class="source-bar">
      <div>
        <label class="form-label" for="ourBrandSelect">Our Brand</label>
        <select class="form-select" id="ourBrandSelect">${options}</select>
        <p class="form-hint">Highlighted in every chart and table below.</p>
      </div>
      <div>
        <label class="form-label" for="thresholdInput">Big-brand threshold</label>
        <input class="form-input" id="thresholdInput" type="number" min="0" max="100" step="0.5"
               value="${(state.bigThreshold * 100).toFixed(1)}" inputmode="decimal">
        <p class="form-hint">Percent of total revenue. Default 5%.</p>
      </div>
    </div>
  </section>`;
}

/* ─── Advisories ────────────────────────────────────────────────── */

function advisoryPanel(advisories, insights) {
  const hasAny = advisories.length || insights.length;

  return `<section class="panel">
    <div class="panel-head"><div class="grow">
      <h2 class="panel-title">Diagnostic &amp; executive readout</h2>
      <p class="panel-note">Written server-side from the current metric, threshold and Our Brand selection.</p>
    </div></div>
    ${hasAny ? `<div class="insight-list">
      ${advisories.map((a) => `
        <div class="insight is-${a.tone === 'good' ? 'good' : a.tone === 'bad' ? 'bad' : 'warn'}">
          <span class="insight-dot"></span>
          <div><h3>${esc(a.title)}</h3><p>${esc(a.message)}</p></div>
        </div>`).join('')}
      ${insights.map((i) => `
        <div class="insight">
          <span class="insight-dot"></span>
          <div><h3>${esc(i.title)}</h3><p>${esc(i.message)}</p></div>
        </div>`).join('')}
    </div>` : stateBlock({
      title: 'No advisories yet',
      text: 'Select a brand under Our Brand above and the API will compare it against the category leader.'
    })}
  </section>`;
}

/* ─── Brand table ───────────────────────────────────────────────── */

const BRAND_COLUMNS = [
  { key: 'brand', label: 'Brand' },
  { key: 'share', label: 'Share', num: true, format: share },
  { key: 'revenue', label: 'Est. revenue', num: true, format: money },
  { key: 'units', label: 'Est. units', num: true, format: num },
  { key: 'asinCount', label: 'ASINs', num: true, format: num },
  { key: 'avgPrice', label: 'Avg price', num: true, format: money2 },
  { key: 'avgRating', label: 'Avg rating', num: true, format: (v) => (Number.isFinite(Number(v)) ? `${Number(v).toFixed(2)} ★` : '—') },
  { key: 'avgBsr', label: 'Avg BSR', num: true, format: num },
  { key: 'reviews', label: 'Reviews', num: true, format: num },
  { key: 'fbaShare', label: 'FBA', num: true, format: share }
];

function visibleBrands() {
  const needle = state.filter.trim().toLowerCase();
  let rows = state.result.brands;
  if (needle) rows = rows.filter((b) => b.brand.toLowerCase().includes(needle));

  const column = BRAND_COLUMNS.find((c) => c.key === state.sort.key) || BRAND_COLUMNS[2];
  const sign = state.sort.dir === 'asc' ? 1 : -1;

  return [...rows].sort((a, b) => {
    const av = a[column.key];
    const bv = b[column.key];
    if (Number.isFinite(Number(av)) && Number.isFinite(Number(bv))) return (Number(av) - Number(bv)) * sign;
    return String(av ?? '').localeCompare(String(bv ?? '')) * sign;
  });
}

function brandTablePanel() {
  return `<section class="panel">
    <div class="panel-head">
      <div class="grow">
        <h2 class="panel-title">All brands</h2>
        <p class="panel-note">Every brand in the filtered set with its share. Our Brand is highlighted.</p>
      </div>
      <div class="panel-actions">
        <button type="button" class="btn-sm" id="exportBrands">${icon('download', 14)} Export brands</button>
      </div>
    </div>

    <div class="filter-bar">
      <label class="sr-only" for="brandSearch">Search brands</label>
      <input type="search" class="form-input" id="brandSearch" placeholder="Search brand" value="${esc(state.filter)}">
      <span class="count-note" id="brandCount"></span>
    </div>

    <div class="table-scroll"><div id="brandTable"></div></div>
  </section>`;
}

function renderBrandTable() {
  const rows = visibleBrands();
  $('#brandCount').textContent = `${num(rows.length)} of ${num(state.result.brands.length)}`;

  const head = BRAND_COLUMNS.map((c) => {
    const sorted = state.sort.key === c.key;
    const aria = sorted ? ` aria-sort="${state.sort.dir === 'asc' ? 'ascending' : 'descending'}"` : '';
    return `<th scope="col" class="${c.num ? 'is-num ' : ''}is-sortable"${aria} data-sort="${c.key}" tabindex="0">${esc(c.label)}</th>`;
  }).join('');

  const body = rows.map((b) => {
    const ours = state.ourBrand && b.brand === state.ourBrand;
    const cells = BRAND_COLUMNS.map((c) => {
      const raw = b[c.key];
      const text = c.format ? c.format(raw) : esc(raw ?? '—');
      return `<td class="${c.num ? 'is-num' : ''}">${c.key === 'brand' ? `<b>${esc(raw)}</b>${ours ? ' ★' : ''}` : text}</td>`;
    }).join('');
    return `<tr class="${ours ? 'is-ours' : ''}">${cells}</tr>`;
  }).join('');

  $('#brandTable').innerHTML = rows.length
    ? `<table class="data-table">
         <caption class="sr-only">Brand market share</caption>
         <thead><tr>${head}</tr></thead><tbody>${body}</tbody>
       </table>`
    : stateBlock({ title: 'No brand matches', text: 'Clear the search to see every brand again.' });

  document.querySelectorAll('#brandTable th[data-sort]').forEach((th) => {
    const apply = () => {
      const key = th.dataset.sort;
      state.sort = state.sort.key === key
        ? { key, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'desc' };
      renderBrandTable();
    };
    th.addEventListener('click', apply);
    th.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); apply(); }
    });
  });
}

/* ─── Charts ────────────────────────────────────────────────────── */

function chartPanels() {
  return `
    <section class="panel">
      <div class="panel-head"><div class="grow">
        <h2 class="panel-title">Revenue share by brand</h2>
        <p class="panel-note">Top 20 brands. Our Brand is drawn in the lighter accent.</p>
      </div></div>
      <div class="chart-box is-tall"><canvas id="chartShare" role="img"
        aria-label="Horizontal bar chart of revenue share by brand"></canvas></div>
    </section>

    <div class="chart-grid">
      <section class="panel">
        <div class="panel-head"><div class="grow">
          <h2 class="panel-title">Big brands vs. everyone else</h2>
          <p class="panel-note">Brands above the threshold shown individually; the tail is collapsed.</p>
        </div></div>
        <div class="chart-box"><canvas id="chartMix" role="img"
          aria-label="Doughnut chart of revenue split between big brands and the tail"></canvas></div>
      </section>

      <section class="panel">
        <div class="panel-head"><div class="grow">
          <h2 class="panel-title">Pricing &amp; rating landscape</h2>
          <p class="panel-note">Each bubble is a brand. Bubble area is estimated revenue.</p>
        </div></div>
        <div class="chart-box"><canvas id="chartScatter" role="img"
          aria-label="Bubble chart of brands by average price, average rating and revenue"></canvas></div>
      </section>
    </div>`;
}

function drawCharts(result) {
  const top = result.brands.slice(0, 20);
  const ourIndex = top.findIndex((b) => b.brand === state.ourBrand);

  barsH('chartShare', {
    labels: top.map((b) => b.brand),
    values: top.map((b) => Number((b.share * 100).toFixed(2))),
    highlightIndex: ourIndex,
    axisTitle: 'Share of revenue (%)'
  });

  const big = result.brands.filter((b) => b.share >= state.bigThreshold && b.revenue > 0);
  const tail = Math.max(0, result.total - big.reduce((sum, b) => sum + b.revenue, 0));
  const mixLabels = big.map((b) => b.brand);
  const mixValues = big.map((b) => b.revenue);
  if (tail > 0) {
    mixLabels.push('Other brands');
    mixValues.push(tail);
  }

  doughnut('chartMix', { labels: mixLabels, values: mixValues, money: true });

  bubble('chartScatter', {
    ourBrand: state.ourBrand,
    points: result.brands
      .filter((b) => b.avgPrice > 0 && b.avgRating > 0 && b.revenue > 0)
      .map((b) => ({ x: b.avgPrice, y: b.avgRating, revenue: b.revenue, label: b.brand }))
  });
}

/* ─── Load ──────────────────────────────────────────────────────── */

function renderLoading() {
  $('#viewRoot').innerHTML = `
    <section class="panel">${skeletonKpis(7)}</section>
    <section class="panel">${skeletonPanel(320)}</section>`;
}

async function run() {
  const root = $('#viewRoot');
  renderLoading();
  destroyAllCharts();

  try {
    const response = await analyzeBrands(state.dataset.rows, {
      ourBrand: state.ourBrand,
      bigThreshold: state.bigThreshold
    });

    state.result = response.brandAnalysis;

    root.innerHTML = `
      ${kpiTiles(state.result.kpis)}
      ${controlPanel(state.result.brands)}
      ${chartPanels()}
      ${advisoryPanel(state.result.advisories || [], state.result.insights || [])}
      ${brandTablePanel()}`;

    drawCharts(state.result);
    renderBrandTable();

    $('#ourBrandSelect').addEventListener('change', (event) => {
      state.ourBrand = event.target.value || null;
      setOurBrand(state.session.profile.id, state.ourBrand);
      run();
    });

    $('#thresholdInput').addEventListener('change', debounce((event) => {
      const percent = Number(event.target.value);
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) return;
      state.bigThreshold = percent / 100;
      run();
    }, 300));

    $('#brandSearch').addEventListener('input', debounce((event) => {
      state.filter = event.target.value;
      renderBrandTable();
    }, 200));

    $('#exportBrands').addEventListener('click', () =>
      downloadCsv(
        'northleaf-brand-share.csv',
        ['Brand', 'Share %', 'Est revenue', 'Est units', 'ASINs', 'Avg price', 'Avg rating', 'Avg BSR', 'Reviews', 'FBA share %', 'Top ASIN'],
        visibleBrands().map((b) => [
          b.brand, (b.share * 100).toFixed(2), b.revenue, b.units, b.asinCount,
          b.avgPrice, b.avgRating, b.avgBsr, b.reviews, (b.fbaShare * 100).toFixed(1), b.topAsin
        ])
      ));

    await state.session.refreshMe();
  } catch (err) {
    handleViewError(err, root, run);
  }
}

/* ─── Boot ──────────────────────────────────────────────────────── */

export async function boot() {
  const session = await mountDashboard({ active: 'market' });
  state.session = session;
  state.dataset = loadDataset(session.profile.id);
  state.ourBrand = state.dataset?.ourBrand || null;

  mountSourceBar({
    host: $('#sourceRoot'),
    userId: session.profile.id,
    current: state.dataset,
    hint: 'The same dataset powers all three dashboards. Load one here or on Market Analysis and it carries across.',
    onLoad(dataset) {
      state.dataset = dataset;
      state.ourBrand = dataset.ourBrand || null;
      run();
    }
  });

  if (state.dataset) {
    run();
  } else {
    $('#viewRoot').innerHTML = `<section class="panel">${noDataState()}</section>`;
  }
}
