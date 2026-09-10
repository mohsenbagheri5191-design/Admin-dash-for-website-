/**
 * ═══════════════════════════════════════════════════════════════
 * MY PRODUCTS  —  portfolio view
 * ═══════════════════════════════════════════════════════════════
 *
 * The website's counterpart to the extension's "My Products Share &
 * Tracking" tab: portfolio totals, variation-family rollups, per-listing
 * estimates and stock state.
 *
 * ── One honest limitation, stated where it matters ──────────────────
 * The extension's version of this tab compares dated snapshots to show
 * week-on-week movement. That comparison has no Edge Function behind it
 * yet — there is no endpoint that stores or diffs portfolio history — so
 * this page deliberately does NOT show period change. Writing that
 * comparison in the browser would be exactly the client-side logic the
 * brief rules out. DASHBOARD.md § "Endpoints that do not exist yet" names
 * the endpoint that would be needed.
 *
 * Everything shown here is a server-computed value. Family rollups add up
 * per-ASIN figures the server returned; they do not re-derive them.
 */

import { research } from '../api.js';
import { mountDashboard, handleViewError } from '../shell.js';
import { loadDataset } from '../dataset.js';
import { mountSourceBar, noDataState } from '../source-bar.js';
import {
  $, esc, safeUrl, icon, num, money, money2, compactMoney, compact, dec, pct,
  skeletonKpis, skeletonPanel, stateBlock, downloadCsv, debounce
} from '../ui.js';
import { doughnut, barsH, barsV, destroyAllCharts } from '../charts.js';

const state = {
  session: null,
  dataset: null,
  scored: [],
  byAsin: new Map(),
  filter: '',
  sort: { key: 'bsrEstimatedRevenueMid', dir: 'desc' }
};

/** In-stock reading is a field lookup on the uploaded row, not a computation. */
const OUT_OF_STOCK = /out of stock|unavailable|currently unavailable|sold out/i;

function stockOf(asin) {
  const text = String(state.byAsin.get(asin)?.availability ?? '').trim();
  if (!text) return { label: 'Unknown', tone: '' };
  return OUT_OF_STOCK.test(text)
    ? { label: 'Out of stock', tone: 'is-danger' }
    : { label: 'In stock', tone: 'is-success' };
}

/* ─── KPIs ──────────────────────────────────────────────────────── */

function kpiTiles() {
  // Sums of server-returned per-ASIN values. No model, no coefficients.
  const revenue = state.scored.reduce((sum, r) => sum + (Number(r.bsrEstimatedRevenueMid) || 0), 0);
  const units = state.scored.reduce((sum, r) => sum + (Number(r.bsrEstimatedUnitsMid) || 0), 0);
  const families = new Set(state.scored.map((r) => r.familyKey || r.asin)).size;
  const inStock = state.scored.filter((r) => stockOf(r.asin).label === 'In stock').length;
  const outOfStock = state.scored.filter((r) => stockOf(r.asin).label === 'Out of stock').length;
  const highConfidence = state.scored.filter((r) => /high/i.test(String(r.estimateConfidence))).length;
  const priced = state.scored.filter((r) => Number.isFinite(Number(r.priceNumber)));
  const avgPrice = priced.length
    ? priced.reduce((sum, r) => sum + Number(r.priceNumber), 0) / priced.length
    : null;

  const tiles = [
    { icon: 'briefcase', label: 'Products Tracked', value: num(state.scored.length), sub: `${num(families)} variation famil${families === 1 ? 'y' : 'ies'}` },
    { icon: 'bank', label: 'Portfolio Revenue', value: compactMoney(revenue), sub: `${money(revenue)} estimated / month` },
    { icon: 'chart', label: 'Portfolio Units', value: compact(units), sub: `${num(units)} units / month` },
    { icon: 'tag', label: 'Avg. Price', value: avgPrice === null ? '—' : money2(avgPrice), sub: 'Across priced listings' },
    { icon: 'check', label: 'In Stock', value: num(inStock), sub: outOfStock ? `${num(outOfStock)} out of stock` : 'No stock-outs detected' },
    { icon: 'target', label: 'High Confidence', value: num(highConfidence), sub: `${pct((highConfidence / (state.scored.length || 1)) * 100)} of estimates` },
    { icon: 'layers', label: 'Variation Families', value: num(families), sub: 'Distinct parent groups' }
  ];

  return `<div class="kpi-grid">${tiles.map((t) => `
    <article class="kpi">
      <p class="kpi-label">${icon(t.icon, 13, 1.8)}${esc(t.label)}</p>
      <p class="kpi-value">${t.value}</p>
      <p class="kpi-sub">${esc(t.sub)}</p>
    </article>`).join('')}</div>`;
}

/* ─── Family rollup ─────────────────────────────────────────────── */

function families() {
  const groups = new Map();

  for (const row of state.scored) {
    const raw = state.byAsin.get(row.asin) || {};
    const key = row.familyKey || raw.parentAsin || row.asin;
    if (!groups.has(key)) groups.set(key, { key, children: [], revenue: 0, units: 0 });
    const group = groups.get(key);
    group.children.push(row);
    group.revenue += Number(row.bsrEstimatedRevenueMid) || 0;
    group.units += Number(row.bsrEstimatedUnitsMid) || 0;
  }

  return [...groups.values()].sort((a, b) => b.revenue - a.revenue);
}

function familyPanel() {
  const groups = families();
  const grand = groups.reduce((sum, g) => sum + g.revenue, 0) || 1;
  const top = groups.slice(0, 12);

  return `<section class="panel">
    <div class="panel-head">
      <div class="grow">
        <h2 class="panel-title">Variation families</h2>
        <p class="panel-note">
          Child ASINs grouped by parent, ranked by estimated revenue. Each family
          total is the sum of its children's server-returned estimates.
        </p>
      </div>
      <div class="panel-actions">
        <button type="button" class="btn-sm" id="exportFamilies">${icon('download', 14)} Export families</button>
      </div>
    </div>

    <div class="table-scroll">
      <table class="data-table">
        <caption class="sr-only">Variation families by estimated revenue</caption>
        <thead><tr>
          <th scope="col">Parent</th>
          <th scope="col" class="is-num">Children</th>
          <th scope="col" class="is-num">Est. units</th>
          <th scope="col" class="is-num">Est. revenue</th>
          <th scope="col" class="is-num">Share of portfolio</th>
        </tr></thead>
        <tbody>${top.map((g) => `
          <tr>
            <td class="cell-mono"><b>${esc(g.key)}</b></td>
            <td class="is-num">${num(g.children.length)}</td>
            <td class="is-num">${num(g.units)}</td>
            <td class="is-num">${money(g.revenue)}</td>
            <td class="is-num">${pct((g.revenue / grand) * 100)}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>
    ${groups.length > 12 ? `<p class="form-hint" style="padding-top:12px">Showing the top 12 of ${num(groups.length)} families.</p>` : ''}
  </section>`;
}

/* ─── Charts ────────────────────────────────────────────────────── */

function chartPanels() {
  return `
    <section class="panel">
      <div class="panel-head"><div class="grow">
        <h2 class="panel-title">Top listings by estimated revenue</h2>
        <p class="panel-note">The twelve products carrying the most of the portfolio.</p>
      </div></div>
      <div class="chart-box is-tall"><canvas id="chartTopProducts" role="img"
        aria-label="Horizontal bar chart of top products by estimated monthly revenue"></canvas></div>
    </section>

    <div class="chart-grid">
      <section class="panel">
        <div class="panel-head"><div class="grow">
          <h2 class="panel-title">Estimate confidence</h2>
          <p class="panel-note">How sure the model is about each listing, as returned with the estimate.</p>
        </div></div>
        <div class="chart-box"><canvas id="chartConfidence" role="img"
          aria-label="Doughnut chart of listings by estimate confidence"></canvas></div>
      </section>

      <section class="panel">
        <div class="panel-head"><div class="grow">
          <h2 class="panel-title">Stock state</h2>
          <p class="panel-note">Read from the availability column of the uploaded workbook.</p>
        </div></div>
        <div class="chart-box"><canvas id="chartStock" role="img"
          aria-label="Doughnut chart of listings by stock state"></canvas></div>
      </section>

      <section class="panel">
        <div class="panel-head"><div class="grow">
          <h2 class="panel-title">Opportunity spread</h2>
          <p class="panel-note">Server-scored opportunity across the portfolio, bucketed.</p>
        </div></div>
        <div class="chart-box"><canvas id="chartOpportunity" role="img"
          aria-label="Bar chart of listing counts by opportunity score band"></canvas></div>
      </section>
    </div>`;
}

function tally(values) {
  const out = new Map();
  for (const v of values) out.set(v, (out.get(v) || 0) + 1);
  return out;
}

function drawCharts() {
  const top = [...state.scored]
    .sort((a, b) => (Number(b.bsrEstimatedRevenueMid) || 0) - (Number(a.bsrEstimatedRevenueMid) || 0))
    .slice(0, 12);

  barsH('chartTopProducts', {
    labels: top.map((r) => {
      const name = state.byAsin.get(r.asin)?.name || r.asin;
      return name.length > 34 ? `${name.slice(0, 33)}…` : name;
    }),
    values: top.map((r) => Number(r.bsrEstimatedRevenueMid) || 0),
    money: true,
    axisTitle: 'Estimated monthly revenue'
  });

  const confidence = tally(state.scored.map((r) => String(r.estimateConfidence || 'Unknown')));
  doughnut('chartConfidence', {
    labels: [...confidence.keys()],
    values: [...confidence.values()]
  });

  const stock = tally(state.scored.map((r) => stockOf(r.asin).label));
  doughnut('chartStock', {
    labels: [...stock.keys()],
    values: [...stock.values()]
  });

  // Bucketing server-returned scores for display. The scores themselves are
  // the server's; only the histogram bins are drawn here.
  const bands = { '0–1': 0, '1–5': 0, '5–20': 0, '20–100': 0, '100+': 0 };
  for (const row of state.scored) {
    const s = Number(row.opportunityScore) || 0;
    const key = s < 1 ? '0–1' : s < 5 ? '1–5' : s < 20 ? '5–20' : s < 100 ? '20–100' : '100+';
    bands[key] += 1;
  }

  barsV('chartOpportunity', {
    labels: Object.keys(bands),
    values: Object.values(bands),
    xTitle: 'Opportunity score',
    yTitle: 'Listings'
  });
}

/* ─── Product table ─────────────────────────────────────────────── */

const COLUMNS = [
  { key: 'name', label: 'Product' },
  { key: 'priceNumber', label: 'Price', num: true, format: money2 },
  { key: 'rankNumber', label: 'BSR', num: true, format: num },
  { key: 'reviewCountNumber', label: 'Reviews', num: true, format: num },
  { key: 'bsrEstimatedUnitsMid', label: 'Est. units', num: true, format: num },
  { key: 'bsrEstimatedRevenueMid', label: 'Est. revenue', num: true, format: money },
  { key: 'opportunityScore', label: 'Opp. score', num: true, format: dec },
  { key: 'stock', label: 'Stock' },
  { key: 'estimateConfidence', label: 'Confidence' }
];

function visibleRows() {
  const needle = state.filter.trim().toLowerCase();
  let rows = state.scored;

  if (needle) {
    rows = rows.filter((row) => {
      const raw = state.byAsin.get(row.asin) || {};
      return `${row.asin} ${raw.name ?? ''} ${raw.brand ?? ''}`.toLowerCase().includes(needle);
    });
  }

  const sign = state.sort.dir === 'asc' ? 1 : -1;
  const key = state.sort.key;

  return [...rows].sort((a, b) => {
    const av = key === 'stock' ? stockOf(a.asin).label : a[key];
    const bv = key === 'stock' ? stockOf(b.asin).label : b[key];
    if (Number.isFinite(Number(av)) && Number.isFinite(Number(bv))) return (Number(av) - Number(bv)) * sign;
    return String(av ?? '').localeCompare(String(bv ?? '')) * sign;
  });
}

function productPanel() {
  return `<section class="panel">
    <div class="panel-head">
      <div class="grow">
        <h2 class="panel-title">Portfolio detail</h2>
        <p class="panel-note">Every tracked listing with its server-returned estimate.</p>
      </div>
      <div class="panel-actions">
        <button type="button" class="btn-sm" id="exportPortfolio">${icon('download', 14)} Export CSV</button>
        <button type="button" class="btn-sm" id="printPortfolio">${icon('file', 14)} Print / PDF</button>
      </div>
    </div>

    <div class="filter-bar">
      <label class="sr-only" for="portfolioSearch">Search portfolio</label>
      <input type="search" class="form-input" id="portfolioSearch" placeholder="Search ASIN, product or brand" value="${esc(state.filter)}">
      <span class="count-note" id="portfolioCount"></span>
    </div>

    <div class="table-scroll"><div id="portfolioTable"></div></div>
  </section>`;
}

function renderProductTable() {
  const rows = visibleRows();
  $('#portfolioCount').textContent = `${num(rows.length)} of ${num(state.scored.length)}`;

  const head = COLUMNS.map((c) => {
    const sorted = state.sort.key === c.key;
    const aria = sorted ? ` aria-sort="${state.sort.dir === 'asc' ? 'ascending' : 'descending'}"` : '';
    const sortable = c.key !== 'name';
    return `<th scope="col" class="${c.num ? 'is-num ' : ''}${sortable ? 'is-sortable' : ''}"${aria}${sortable ? ` data-sort="${c.key}" tabindex="0"` : ''}>${esc(c.label)}</th>`;
  }).join('');

  const body = rows.slice(0, 400).map((row) => {
    const raw = state.byAsin.get(row.asin) || {};
    const stock = stockOf(row.asin);

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
      if (c.key === 'stock') {
        return `<td><span class="badge ${stock.tone}">${esc(stock.label)}</span></td>`;
      }
      const v = row[c.key];
      return `<td class="${c.num ? 'is-num' : ''}">${c.format ? c.format(v) : esc(v || '—')}</td>`;
    }).join('');

    return `<tr>${cells}</tr>`;
  }).join('');

  $('#portfolioTable').innerHTML = rows.length
    ? `<table class="data-table">
         <caption class="sr-only">Portfolio detail</caption>
         <thead><tr>${head}</tr></thead><tbody>${body}</tbody>
       </table>
       ${rows.length > 400 ? `<p class="form-hint" style="padding:14px 4px">Showing the first 400 rows. Export for the full ${num(rows.length)}.</p>` : ''}`
    : stateBlock({ title: 'Nothing matches', text: 'No product matches that search.' });

  document.querySelectorAll('#portfolioTable th[data-sort]').forEach((th) => {
    const apply = () => {
      const key = th.dataset.sort;
      state.sort = state.sort.key === key
        ? { key, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'desc' };
      renderProductTable();
    };
    th.addEventListener('click', apply);
    th.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); apply(); }
    });
  });
}

/* ─── Load ──────────────────────────────────────────────────────── */

async function run() {
  const root = $('#viewRoot');
  root.innerHTML = `<section class="panel">${skeletonKpis(7)}</section>
                    <section class="panel">${skeletonPanel(300)}</section>`;
  destroyAllCharts();

  try {
    const response = await research(state.dataset.rows);
    state.scored = response.items || [];
    state.byAsin = new Map(state.dataset.rows.map((row) => [String(row.asin).toUpperCase(), row]));

    root.innerHTML = `
      ${kpiTiles()}
      ${chartPanels()}
      ${familyPanel()}
      ${productPanel()}
      <section class="panel">
        <div class="panel-head"><div class="grow">
          <h2 class="panel-title">Period comparison</h2>
          <p class="panel-note">Not available on the website yet.</p>
        </div></div>
        ${stateBlock({
          icon: 'clock',
          title: 'Week-on-week tracking lives in the extension',
          text: 'Comparing dated snapshots needs an API endpoint that stores portfolio history, and that endpoint does not exist yet. Rather than recompute the comparison in your browser, this panel stays empty until it does. The extension’s My Products tab has the snapshot history today.'
        })}
      </section>`;

    drawCharts();
    renderProductTable();

    $('#portfolioSearch').addEventListener('input', debounce((event) => {
      state.filter = event.target.value;
      renderProductTable();
    }, 200));

    $('#printPortfolio').addEventListener('click', () => window.print());

    $('#exportPortfolio').addEventListener('click', () =>
      downloadCsv(
        'northleaf-portfolio.csv',
        ['ASIN', 'Product', 'Brand', 'Price', 'BSR', 'Reviews', 'Est units', 'Est revenue', 'Opportunity score', 'Stock', 'Confidence', 'Link'],
        visibleRows().map((row) => {
          const raw = state.byAsin.get(row.asin) || {};
          return [
            row.asin, raw.name ?? '', raw.brand ?? '', row.priceNumber ?? '', row.rankNumber ?? '',
            row.reviewCountNumber ?? '', row.bsrEstimatedUnitsMid ?? '', row.bsrEstimatedRevenueMid ?? '',
            row.opportunityScore ?? '', stockOf(row.asin).label, row.estimateConfidence ?? '', raw.itemLink ?? ''
          ];
        })
      ));

    $('#exportFamilies').addEventListener('click', () => {
      const groups = families();
      const grand = groups.reduce((sum, g) => sum + g.revenue, 0) || 1;
      downloadCsv(
        'northleaf-variation-families.csv',
        ['Parent', 'Children', 'Est units', 'Est revenue', 'Share of portfolio %'],
        groups.map((g) => [g.key, g.children.length, Math.round(g.units), Math.round(g.revenue), ((g.revenue / grand) * 100).toFixed(2)])
      );
    });

    await state.session.refreshMe();
  } catch (err) {
    handleViewError(err, root, run);
  }
}

/* ─── Boot ──────────────────────────────────────────────────────── */

export async function boot() {
  const session = await mountDashboard({ active: 'portfolio' });
  state.session = session;
  state.dataset = loadDataset(session.profile.id);

  mountSourceBar({
    host: $('#sourceRoot'),
    userId: session.profile.id,
    current: state.dataset,
    hint: 'Upload the products you own or track. The same dataset is shared with Market Analysis and Market Share.',
    onLoad(dataset) {
      state.dataset = dataset;
      run();
    }
  });

  if (state.dataset) {
    run();
  } else {
    $('#viewRoot').innerHTML = `<section class="panel">${noDataState()}</section>`;
  }
}
