/**
 * ═══════════════════════════════════════════════════════════════
 * MARKET ANALYSIS
 * ═══════════════════════════════════════════════════════════════
 *
 * The website's counterpart to the extension's "Professional Market
 * Analysis" tab: seven headline KPIs, six charts, the Research Opportunity
 * Score table, and the full product detail table.
 *
 * Every number on this page arrives from one call to research/analyze. This
 * file arranges and labels them. It does not calculate a single one.
 */

import { analyzeMarket } from '../api.js';
import { mountDashboard, handleViewError } from '../shell.js';
import { loadDataset } from '../dataset.js';
import { mountSourceBar, noDataState } from '../source-bar.js';
import {
  $, esc, safeUrl, icon, num, money, money2, compactMoney, compact, pct, dec,
  skeletonKpis, skeletonPanel, stateBlock, downloadCsv, debounce
} from '../ui.js';
import { doughnut, barsH, barsV, destroyAllCharts, seriesColor } from '../charts.js';

const state = {
  user: null,
  dataset: null,
  scored: [],          // ScoredItem[] from the server
  analysis: null,      // MarketAnalysis from the server
  byAsin: new Map(),   // asin -> source row, for display fields
  sort: { key: 'bsrEstimatedRevenueMid', dir: 'desc' },
  filter: ''
};

/* ─── KPI tiles ─────────────────────────────────────────────────── */

/**
 * The seven KPIs the analyze endpoint returns, in the extension's order.
 * `raw` is carried so a tile can show a precise value in its subtitle while
 * the headline stays compact.
 */
function kpiTiles(kpis) {
  const tiles = [
    { icon: 'box', label: 'Total Products', value: num(kpis.totalProducts), sub: 'Rows in this analysis' },
    { icon: 'tag', label: 'Avg. Price', value: money2(kpis.averagePrice), sub: 'Mean listed price' },
    { icon: 'bank', label: 'Est. Market Value', value: compactMoney(kpis.estimatedMarketValue), sub: `${money(kpis.estimatedMarketValue)} monthly` },
    { icon: 'chart', label: 'Monthly Units', value: compact(kpis.monthlyUnits), sub: `${num(kpis.monthlyUnits)} units / month` },
    { icon: 'star', label: 'Avg. Reviews', value: compact(kpis.averageReviews), sub: `${num(kpis.averageReviews)} per listing` },
    { icon: 'target', label: 'Sponsored', value: pct(kpis.sponsoredPercent), sub: 'Share of rows running ads' },
    { icon: 'layers', label: 'Unique Brands', value: num(kpis.uniqueBrands), sub: 'Distinct brands competing' }
  ];

  return `<div class="kpi-grid">${tiles.map((t) => `
    <article class="kpi">
      <p class="kpi-label">${icon(t.icon, 13, 1.8)}${esc(t.label)}</p>
      <p class="kpi-value">${t.value}</p>
      <p class="kpi-sub">${esc(t.sub)}</p>
    </article>`).join('')}</div>`;
}

/* ─── Charts ────────────────────────────────────────────────────── */

function chartPanels() {
  return `
    <div class="chart-grid">
      <section class="panel">
        <div class="panel-head"><div class="grow">
          <h2 class="panel-title">Products by price band</h2>
          <p class="panel-note">Where the listings sit, not where the money is. A crowded band is a crowded fight.</p>
        </div></div>
        <div class="chart-box"><canvas id="chartPrice" role="img"
          aria-label="Doughnut chart of product counts by price band"></canvas></div>
      </section>

      <section class="panel">
        <div class="panel-head"><div class="grow">
          <h2 class="panel-title">Brand share of estimated revenue</h2>
          <p class="panel-note">Top six brands by estimated monthly revenue; everything else collapsed into Other.</p>
        </div></div>
        <div class="chart-box"><canvas id="chartBrandShare" role="img"
          aria-label="Doughnut chart of estimated revenue share by brand"></canvas></div>
      </section>
    </div>

    <section class="panel">
      <div class="panel-head"><div class="grow">
        <h2 class="panel-title">Top brands by estimated market value</h2>
        <p class="panel-note">Estimated monthly revenue per brand across every product in this dataset.</p>
      </div></div>
      <div class="chart-box is-tall"><canvas id="chartBrandValue" role="img"
        aria-label="Horizontal bar chart of estimated monthly revenue by brand"></canvas></div>
    </section>

    <div class="chart-grid">
      <section class="panel">
        <div class="panel-head"><div class="grow">
          <h2 class="panel-title">Monthly unit distribution</h2>
          <p class="panel-note">How many listings fall into each sales-volume band.</p>
        </div></div>
        <div class="chart-box"><canvas id="chartUnits" role="img"
          aria-label="Bar chart of listing counts by monthly unit band"></canvas></div>
      </section>

      <section class="panel">
        <div class="panel-head"><div class="grow">
          <h2 class="panel-title">Rating distribution</h2>
          <p class="panel-note">Star ratings across the market. A low-rated band is an opening.</p>
        </div></div>
        <div class="chart-box"><canvas id="chartRatings" role="img"
          aria-label="Bar chart of listing counts by star rating"></canvas></div>
      </section>

      <section class="panel">
        <div class="panel-head"><div class="grow">
          <h2 class="panel-title">Market value by rank band</h2>
          <p class="panel-note">Estimated revenue grouped by Best Sellers Rank, showing how top-heavy the category is.</p>
        </div></div>
        <div class="chart-box"><canvas id="chartRank" role="img"
          aria-label="Bar chart of estimated revenue by best sellers rank band"></canvas></div>
      </section>

      <section class="panel">
        <div class="panel-head"><div class="grow">
          <h2 class="panel-title">Top categories</h2>
          <p class="panel-note">Product counts by the category each listing is ranked in.</p>
        </div></div>
        <div class="chart-box"><canvas id="chartCategories" role="img"
          aria-label="Horizontal bar chart of product counts by category"></canvas></div>
      </section>
    </div>`;
}

function drawCharts(analysis) {
  const c = analysis.charts;

  doughnut('chartPrice', {
    labels: Object.keys(c.priceBands),
    values: Object.values(c.priceBands)
  });

  doughnut('chartBrandShare', {
    labels: Object.keys(c.brandShare),
    values: Object.values(c.brandShare),
    money: true
  });

  barsH('chartBrandValue', {
    labels: c.brandValue.map(([name]) => name),
    values: c.brandValue.map(([, value]) => value),
    money: true,
    axisTitle: 'Estimated monthly revenue'
  });

  barsV('chartUnits', {
    labels: Object.keys(c.unitBands),
    values: Object.values(c.unitBands),
    yTitle: 'Listings'
  });

  barsV('chartRatings', {
    labels: Object.keys(c.ratings),
    values: Object.values(c.ratings),
    yTitle: 'Listings'
  });

  barsV('chartRank', {
    labels: Object.keys(c.rankBandValue),
    values: Object.values(c.rankBandValue),
    money: true,
    yTitle: 'Est. revenue'
  });

  barsH('chartCategories', {
    labels: c.categories.map(([name]) => name),
    values: c.categories.map(([, count]) => count),
    axisTitle: 'Products'
  });
}

/* ─── Research Opportunity Score ────────────────────────────────── */

/**
 * The score itself is computed server-side and arrives on each row. High
 * demand against few reviews is the signal: a listing selling well without
 * a review moat is one a new entrant can realistically take share from.
 */
function opportunityPanel(opportunities) {
  if (!opportunities.length) {
    return `<section class="panel">
      <div class="panel-head"><div class="grow">
        <h2 class="panel-title">Research Opportunity Score</h2>
      </div></div>
      ${stateBlock({
        title: 'No scored opportunities',
        text: 'None of these listings had both a rank and a review count, which the score needs. Upload a richer export to see this panel.'
      })}
    </section>`;
  }

  const top = opportunities.slice(0, 12);
  const max = Math.max(...top.map((o) => o.opportunityScore), 1);

  return `<section class="panel">
    <div class="panel-head">
      <div class="grow">
        <h2 class="panel-title">Research Opportunity Score</h2>
        <p class="panel-note">
          High demand, low review moat. Scored by the research API from estimated
          monthly units against review count — a high score means the listing sells
          without a review wall protecting it.
        </p>
      </div>
      <div class="panel-actions">
        <button type="button" class="btn-sm" id="exportOpportunity">${icon('download', 14)} Export CSV</button>
      </div>
    </div>

    <div class="bar-list">
      ${top.map((o, i) => `
        <div class="bar-row">
          <span class="bar-name" title="${esc(o.name || o.asin)}">
            ${o.itemLink
              ? `<a href="${safeUrl(o.itemLink)}" target="_blank" rel="noopener noreferrer">${esc(o.asin)}</a>`
              : esc(o.asin)}
          </span>
          <span class="bar-track">
            <span class="bar-fill" style="width:${((o.opportunityScore / max) * 100).toFixed(1)}%;background:${seriesColor(i)}"></span>
          </span>
          <span class="bar-value">${dec(o.opportunityScore)}</span>
        </div>`).join('')}
    </div>

    <div class="table-scroll" style="margin-top:24px">
      <table class="data-table">
        <caption class="sr-only">Top opportunities by Research Opportunity Score</caption>
        <thead><tr>
          <th scope="col">Product</th>
          <th scope="col">Brand</th>
          <th scope="col" class="is-num">Score</th>
          <th scope="col" class="is-num">Est. units / mo</th>
          <th scope="col" class="is-num">Reviews</th>
        </tr></thead>
        <tbody>
          ${top.map((o) => `
            <tr>
              <td>
                <div class="cell-product">
                  <div>
                    <div class="cell-mono">${
                      o.itemLink
                        ? `<a href="${safeUrl(o.itemLink)}" target="_blank" rel="noopener noreferrer">${esc(o.asin)}</a>`
                        : esc(o.asin)}</div>
                    <div class="cell-name">${esc(o.name || '—')}</div>
                  </div>
                </div>
              </td>
              <td>${esc(o.brand || '—')}</td>
              <td class="is-num"><b>${dec(o.opportunityScore)}</b></td>
              <td class="is-num">${num(o.estimatedUnits)}</td>
              <td class="is-num">${num(o.reviewCount)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </section>`;
}

/* ─── Detail table ──────────────────────────────────────────────── */

const COLUMNS = [
  { key: 'name', label: 'Product', sortable: false },
  { key: 'brand', label: 'Brand', sortable: true, from: 'raw' },
  { key: 'priceNumber', label: 'Price', sortable: true, num: true, format: money2 },
  { key: 'rankNumber', label: 'BSR', sortable: true, num: true, format: num },
  { key: 'review', label: 'Rating', sortable: true, num: true, from: 'raw', format: (v) => (Number.isFinite(Number(v)) ? `${Number(v).toFixed(1)} ★` : '—') },
  { key: 'reviewCountNumber', label: 'Reviews', sortable: true, num: true, format: num },
  { key: 'bsrEstimatedUnitsMid', label: 'Est. units', sortable: true, num: true, format: num },
  { key: 'bsrEstimatedRevenueMid', label: 'Est. revenue', sortable: true, num: true, format: money },
  { key: 'opportunityScore', label: 'Opp. score', sortable: true, num: true, format: dec },
  { key: 'estimateConfidence', label: 'Confidence', sortable: true }
];

function value(row, column) {
  if (column.from === 'raw') return state.byAsin.get(row.asin)?.[column.key];
  return row[column.key];
}

function visibleRows() {
  const needle = state.filter.trim().toLowerCase();

  let rows = state.scored;
  if (needle) {
    rows = rows.filter((row) => {
      const raw = state.byAsin.get(row.asin) || {};
      return `${row.asin} ${raw.name ?? ''} ${raw.brand ?? ''}`.toLowerCase().includes(needle);
    });
  }

  const { key, dir } = state.sort;
  const column = COLUMNS.find((c) => c.key === key) || COLUMNS[7];
  const sign = dir === 'asc' ? 1 : -1;

  return [...rows].sort((a, b) => {
    const av = value(a, column);
    const bv = value(b, column);
    const an = Number(av);
    const bn = Number(bv);
    if (Number.isFinite(an) && Number.isFinite(bn)) return (an - bn) * sign;
    return String(av ?? '').localeCompare(String(bv ?? '')) * sign;
  });
}

function detailPanel() {
  return `<section class="panel" id="detailPanel">
    <div class="panel-head">
      <div class="grow">
        <h2 class="panel-title">Product detail</h2>
        <p class="panel-note">Every scored listing. Click a column heading to sort.</p>
      </div>
      <div class="panel-actions">
        <button type="button" class="btn-sm" id="exportFiltered">${icon('download', 14)} Export view</button>
        <button type="button" class="btn-sm" id="exportAll">${icon('download', 14)} Export all</button>
        <button type="button" class="btn-sm" id="printReport">${icon('file', 14)} Print / PDF</button>
      </div>
    </div>

    <div class="filter-bar">
      <label class="sr-only" for="detailSearch">Search products</label>
      <input type="search" class="form-input" id="detailSearch"
             placeholder="Search ASIN, product or brand" value="${esc(state.filter)}">
      <span class="count-note" id="detailCount"></span>
    </div>

    <div class="table-scroll"><div id="detailTable"></div></div>
  </section>`;
}

function renderDetailTable() {
  const rows = visibleRows();
  const countEl = $('#detailCount');
  if (countEl) countEl.textContent = `${num(rows.length)} of ${num(state.scored.length)}`;

  const head = COLUMNS.map((c) => {
    const sorted = state.sort.key === c.key;
    const aria = sorted ? ` aria-sort="${state.sort.dir === 'asc' ? 'ascending' : 'descending'}"` : '';
    const cls = `${c.num ? 'is-num ' : ''}${c.sortable !== false ? 'is-sortable' : ''}`.trim();
    return `<th scope="col" class="${cls}"${aria}${c.sortable !== false ? ` data-sort="${c.key}" tabindex="0" role="columnheader"` : ''}>${esc(c.label)}</th>`;
  }).join('');

  const body = rows.slice(0, 400).map((row) => {
    const raw = state.byAsin.get(row.asin) || {};
    const cells = COLUMNS.map((c) => {
      if (c.key === 'name') {
        return `<td>
          <div class="cell-product">
            ${raw.imageLink ? `<img class="cell-thumb" src="${safeUrl(raw.imageLink)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
            <div>
              <div class="cell-mono">${
                raw.itemLink
                  ? `<a href="${safeUrl(raw.itemLink)}" target="_blank" rel="noopener noreferrer">${esc(row.asin)}</a>`
                  : esc(row.asin)}</div>
              <div class="cell-name">${esc(raw.name || '—')}</div>
            </div>
          </div></td>`;
      }
      const v = value(row, c);
      const text = c.format ? c.format(v) : esc(v ?? '—');
      return `<td class="${c.num ? 'is-num' : ''}">${c.format ? text : (v ? text : '—')}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  $('#detailTable').innerHTML = rows.length
    ? `<table class="data-table">
         <caption class="sr-only">Scored product detail</caption>
         <thead><tr>${head}</tr></thead>
         <tbody>${body}</tbody>
       </table>
       ${rows.length > 400 ? `<p class="form-hint" style="padding:14px 4px">Showing the first 400 rows. Export the view for the full ${num(rows.length)}.</p>` : ''}`
    : stateBlock({ title: 'Nothing matches', text: 'No product matches that search. Clear it to see the full list.' });

  wireSortHandlers();
}

function wireSortHandlers() {
  document.querySelectorAll('#detailTable th[data-sort]').forEach((th) => {
    const apply = () => {
      const key = th.dataset.sort;
      state.sort = state.sort.key === key
        ? { key, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'desc' };
      renderDetailTable();
    };
    th.addEventListener('click', apply);
    th.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        apply();
      }
    });
  });
}

/* ─── CSV ───────────────────────────────────────────────────────── */

const EXPORT_HEADERS = [
  'ASIN', 'Product', 'Brand', 'Price', 'BSR', 'Rating', 'Reviews',
  'Est units low', 'Est units mid', 'Est units high',
  'Est revenue low', 'Est revenue mid', 'Est revenue high',
  'Opportunity score', 'Estimate model', 'Confidence', 'Link'
];

function exportRow(row) {
  const raw = state.byAsin.get(row.asin) || {};
  return [
    row.asin, raw.name ?? '', raw.brand ?? '', row.priceNumber ?? '',
    row.rankNumber ?? '', raw.review ?? '', row.reviewCountNumber ?? '',
    row.bsrEstimatedUnitsLow ?? '', row.bsrEstimatedUnitsMid ?? '', row.bsrEstimatedUnitsHigh ?? '',
    row.bsrEstimatedRevenueLow ?? '', row.bsrEstimatedRevenueMid ?? '', row.bsrEstimatedRevenueHigh ?? '',
    row.opportunityScore ?? '', row.estimateModel ?? '', row.estimateConfidence ?? '',
    raw.itemLink ?? ''
  ];
}

/* ─── Render ────────────────────────────────────────────────────── */

function renderLoading() {
  $('#viewRoot').innerHTML = `
    <section class="panel">${skeletonKpis(7)}</section>
    <div class="chart-grid">
      <section class="panel">${skeletonPanel(240)}</section>
      <section class="panel">${skeletonPanel(240)}</section>
    </div>`;
}

async function analyze() {
  const root = $('#viewRoot');
  renderLoading();
  destroyAllCharts();

  try {
    const response = await analyzeMarket(state.dataset.rows, { query: state.dataset.sourceName });

    state.scored = response.items || [];
    state.analysis = response.analysis;
    state.byAsin = new Map(state.dataset.rows.map((row) => [String(row.asin).toUpperCase(), row]));

    root.innerHTML = `
      ${kpiTiles(state.analysis.kpis)}
      ${chartPanels()}
      ${opportunityPanel(state.analysis.opportunities || [])}
      ${detailPanel()}`;

    drawCharts(state.analysis);
    renderDetailTable();

    // Wire the panel actions
    $('#detailSearch').addEventListener('input', debounce((event) => {
      state.filter = event.target.value;
      renderDetailTable();
    }, 200));

    $('#exportAll').addEventListener('click', () =>
      downloadCsv('northleaf-market-analysis-all.csv', EXPORT_HEADERS, state.scored.map(exportRow)));

    $('#exportFiltered').addEventListener('click', () =>
      downloadCsv('northleaf-market-analysis-view.csv', EXPORT_HEADERS, visibleRows().map(exportRow)));

    $('#printReport').addEventListener('click', () => window.print());

    const oppButton = $('#exportOpportunity');
    if (oppButton) {
      oppButton.addEventListener('click', () =>
        downloadCsv(
          'northleaf-opportunity-scores.csv',
          ['ASIN', 'Product', 'Brand', 'Opportunity score', 'Est units/mo', 'Reviews', 'Link'],
          (state.analysis.opportunities || []).map((o) => [
            o.asin, o.name, o.brand, o.opportunityScore, o.estimatedUnits, o.reviewCount, o.itemLink
          ])
        ));
    }

    // The call spent a request; show the new balance.
    await state.session.refreshMe();
  } catch (err) {
    handleViewError(err, root, analyze);
  }
}

/* ─── Boot ──────────────────────────────────────────────────────── */

export async function boot() {
  const session = await mountDashboard({ active: 'analysis' });
  state.session = session;
  state.user = session.profile;
  state.dataset = loadDataset(session.profile.id);

  mountSourceBar({
    host: $('#sourceRoot'),
    userId: session.profile.id,
    current: state.dataset,
    hint: 'Upload a Helium 10 Xray export or a Product Details workbook from the extension. The rows go to the research API, which returns every estimate, KPI and score on this page.',
    onLoad(dataset) {
      state.dataset = dataset;
      analyze();
    }
  });

  if (state.dataset) {
    analyze();
  } else {
    $('#viewRoot').innerHTML = `<section class="panel">${noDataState()}</section>`;
  }
}
