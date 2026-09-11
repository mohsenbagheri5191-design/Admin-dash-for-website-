/**
 * ═══════════════════════════════════════════════════════════════
 * CHART.JS, RESTYLED TO THE NORTH LEAF PALETTE
 * ═══════════════════════════════════════════════════════════════
 *
 * Chart.js ships a light-theme default: #666 grey text, Helvetica, white
 * tooltips, grid lines at rgba(0,0,0,.1). All of that is wrong on an ink
 * background. This module overrides every one of those defaults from the CSS
 * custom properties in tokens.css, so the charts read as the same object as
 * the rest of the page — tooltips, grid lines, axis labels and legends
 * included, as the brief asks.
 *
 * Reading the values from the stylesheet rather than hardcoding them means a
 * palette change in tokens.css moves the charts with it.
 */

const css = (name, fallback) => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
};

/** Site tokens, resolved once the stylesheet is in. */
export const palette = {
  cream: css('--cream', '#F5F0FF'),
  creamDim: css('--cream-dim', '#C4B5D9'),
  // --muted-text, not --cream-faint: axis titles are small body text and
  // must clear WCAG AA on the ink background. See tokens.css.
  creamFaint: css('--muted-text', '#897C9F'),
  ink: css('--ink', '#0A0614'),
  ink3: css('--ink-3', '#1C1036'),
  purple: css('--purple', '#5B2D8E'),
  purpleBright: css('--purple-bright', '#8B5CF6'),
  purpleGlow: css('--purple-glow', '#B794F6'),
  gold: css('--gold', '#D4A056'),
  line: css('--chart-grid', 'rgba(139, 92, 246, 0.12)'),
  axis: css('--chart-axis', '#7A6E91'),
  muted: css('--chart-muted', 'rgba(196, 181, 217, 0.35)'),
  sans: css('--sans', "'Geist', system-ui, sans-serif"),
  mono: css('--mono', "'Geist Mono', monospace")
};

/** Eight categorical slots from tokens.css, cycled for longer series. */
export const series = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => css(`--chart-${i}`, '#8B5CF6'));

export const seriesColor = (i) => series[i % series.length];

/** Hex → rgba, for fills that sit under a line or bar of the same hue. */
export function alpha(hex, a) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex).trim());
  if (!m) return hex;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

let applied = false;

/** Installs the theme on Chart.defaults. Safe to call more than once. */
export function applyChartTheme() {
  if (applied || typeof window.Chart === 'undefined') return;
  const { Chart } = window;

  Chart.defaults.font.family = palette.sans;
  Chart.defaults.font.size = 12;
  Chart.defaults.font.weight = 300;
  Chart.defaults.color = palette.creamDim;
  Chart.defaults.borderColor = palette.line;
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.responsive = true;
  Chart.defaults.animation.duration = 700;
  Chart.defaults.animation.easing = 'easeOutQuart';

  // Legend: the site uses mono uppercase for small labels everywhere else.
  Chart.defaults.plugins.legend.labels.color = palette.creamDim;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.pointStyle = 'rectRounded';
  Chart.defaults.plugins.legend.labels.boxWidth = 9;
  Chart.defaults.plugins.legend.labels.boxHeight = 9;
  Chart.defaults.plugins.legend.labels.padding = 16;
  Chart.defaults.plugins.legend.labels.font = { family: palette.sans, size: 12, weight: 300 };

  // Tooltip: an --ink-3 card with a --line-strong hairline, i.e. a .panel.
  Chart.defaults.plugins.tooltip.backgroundColor = palette.ink3;
  Chart.defaults.plugins.tooltip.titleColor = palette.cream;
  Chart.defaults.plugins.tooltip.bodyColor = palette.creamDim;
  Chart.defaults.plugins.tooltip.borderColor = css('--line-strong', 'rgba(139,92,246,.28)');
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.plugins.tooltip.cornerRadius = 12;
  Chart.defaults.plugins.tooltip.padding = 12;
  Chart.defaults.plugins.tooltip.displayColors = true;
  Chart.defaults.plugins.tooltip.boxPadding = 5;
  Chart.defaults.plugins.tooltip.usePointStyle = true;
  Chart.defaults.plugins.tooltip.titleFont = { family: palette.sans, size: 13, weight: 500 };
  Chart.defaults.plugins.tooltip.bodyFont = { family: palette.sans, size: 12, weight: 300 };

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    Chart.defaults.animation = false;
  }

  applied = true;
}

/** Cartesian axis styling shared by every bar and line chart. */
export function scales({ xTitle, yTitle, money = false, xGrid = false } = {}) {
  const tickFont = { family: palette.mono, size: 10, weight: 500 };
  const titleFont = { family: palette.mono, size: 10, weight: 500 };

  return {
    x: {
      grid: { color: palette.line, display: xGrid, drawTicks: false },
      border: { color: palette.line },
      ticks: { color: palette.axis, font: tickFont, maxRotation: 0, autoSkipPadding: 12, padding: 8 },
      title: xTitle
        ? { display: true, text: xTitle.toUpperCase(), color: palette.creamFaint, font: titleFont, padding: { top: 10 } }
        : { display: false }
    },
    y: {
      beginAtZero: true,
      grid: { color: palette.line, drawTicks: false },
      border: { display: false },
      ticks: {
        color: palette.axis,
        font: tickFont,
        padding: 10,
        callback: (value) => (money ? formatAxisMoney(value) : formatAxisNumber(value))
      },
      title: yTitle
        ? { display: true, text: yTitle.toUpperCase(), color: palette.creamFaint, font: titleFont, padding: { bottom: 10 } }
        : { display: false }
    }
  };
}

function formatAxisNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toLocaleString('en-CA');
}

function formatAxisMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString('en-CA')}`;
}

/* ─── Chart factories ───────────────────────────────────────────── */

const registry = new Map();

/**
 * Creates or replaces a chart on a canvas id. Replacing rather than updating
 * keeps re-renders simple: every view can just call this again with new data
 * and never worry about a stale instance holding the canvas.
 */
export function renderChart(canvasId, config) {
  applyChartTheme();
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof window.Chart === 'undefined') return null;

  const existing = registry.get(canvasId);
  if (existing) existing.destroy();

  const chart = new window.Chart(canvas.getContext('2d'), config);
  registry.set(canvasId, chart);
  return chart;
}

export function destroyChart(canvasId) {
  const existing = registry.get(canvasId);
  if (existing) {
    existing.destroy();
    registry.delete(canvasId);
  }
}

export function destroyAllCharts() {
  registry.forEach((chart) => chart.destroy());
  registry.clear();
}

/**
 * Doughnut. Used for share-of-total questions where the parts are few and
 * the whole is meaningful — price bands, unit bands, brand share.
 */
export function doughnut(canvasId, { labels, values, money = false, cutout = '62%' }) {
  const colors = labels.map((_, i) => seriesColor(i));
  const total = values.reduce((sum, v) => sum + (Number(v) || 0), 0) || 1;

  return renderChart(canvasId, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderColor: palette.ink,
        borderWidth: 2,
        hoverBorderColor: palette.cream,
        hoverOffset: 8
      }]
    },
    options: {
      cutout,
      layout: { padding: 6 },
      plugins: {
        legend: { position: 'right', labels: { padding: 12 } },
        tooltip: {
          callbacks: {
            label(ctx) {
              const value = Number(ctx.parsed) || 0;
              const formatted = money ? formatAxisMoney(value) : value.toLocaleString('en-CA');
              return ` ${ctx.label}: ${formatted} (${((value / total) * 100).toFixed(1)}%)`;
            }
          }
        }
      }
    }
  });
}

/**
 * Horizontal bars. The right form for ranked categorical comparisons —
 * top brands, top categories — because the labels are words, and words are
 * readable on a horizontal axis without rotation.
 */
export function barsH(canvasId, { labels, values, money = false, highlightIndex = -1, axisTitle }) {
  const colors = labels.map((_, i) =>
    i === highlightIndex ? palette.purpleGlow : alpha(seriesColor(i), 0.85));

  return renderChart(canvasId, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        hoverBackgroundColor: palette.purpleGlow,
        borderRadius: 5,
        borderSkipped: false,
        barThickness: 'flex',
        maxBarThickness: 26
      }]
    },
    options: {
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${money ? formatAxisMoney(ctx.parsed.x) : Number(ctx.parsed.x).toLocaleString('en-CA')}`
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: palette.line, drawTicks: false },
          border: { display: false },
          ticks: {
            color: palette.axis,
            font: { family: palette.mono, size: 10, weight: 500 },
            padding: 8,
            callback: (v) => (money ? formatAxisMoney(v) : formatAxisNumber(v))
          },
          title: axisTitle
            ? { display: true, text: axisTitle.toUpperCase(), color: palette.creamFaint, font: { family: palette.mono, size: 10, weight: 500 }, padding: { top: 8 } }
            : { display: false }
        },
        y: {
          grid: { display: false },
          border: { color: palette.line },
          ticks: { color: palette.creamDim, font: { family: palette.sans, size: 12, weight: 300 }, padding: 6 }
        }
      }
    }
  });
}

/** Vertical bars, for ordered bands where the order carries meaning. */
export function barsV(canvasId, { labels, values, money = false, xTitle, yTitle, gradient = true }) {
  const colors = gradient
    ? labels.map((_, i) => alpha(seriesColor(i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : 2), 0.85))
    : labels.map((_, i) => alpha(seriesColor(i), 0.85));

  return renderChart(canvasId, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        hoverBackgroundColor: palette.purpleGlow,
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 56
      }]
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${money ? formatAxisMoney(ctx.parsed.y) : Number(ctx.parsed.y).toLocaleString('en-CA')}`
          }
        }
      },
      scales: scales({ xTitle, yTitle, money })
    }
  });
}

/**
 * Bubble scatter for the price / rating landscape. Bubble area encodes
 * revenue, so radius is scaled by sqrt to keep area proportional — a linear
 * radius would exaggerate the leaders by squaring their advantage.
 */
export function bubble(canvasId, { points, ourBrand }) {
  const maxRevenue = Math.max(1, ...points.map((p) => Number(p.revenue) || 0));

  const data = points.map((p, i) => {
    const isOurs = ourBrand && p.label === ourBrand;
    return {
      x: Number(p.x) || 0,
      y: Number(p.y) || 0,
      r: Math.max(5, Math.min(26, Math.sqrt((Number(p.revenue) || 0) / maxRevenue) * 24)),
      label: p.label,
      revenue: Number(p.revenue) || 0,
      isOurs,
      _i: i
    };
  });

  return renderChart(canvasId, {
    type: 'bubble',
    data: {
      datasets: [{
        data,
        backgroundColor: (ctx) => {
          const d = ctx.raw;
          if (!d) return palette.muted;
          return d.isOurs ? alpha(palette.purpleGlow, 0.75) : alpha(seriesColor(d._i), 0.5);
        },
        borderColor: (ctx) => (ctx.raw?.isOurs ? palette.cream : alpha(seriesColor(ctx.raw?._i ?? 0), 0.95)),
        borderWidth: (ctx) => (ctx.raw?.isOurs ? 2.5 : 1)
      }]
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => items[0]?.raw?.label ?? '',
            label(ctx) {
              const d = ctx.raw;
              return [
                ` Avg price: $${Number(d.x).toFixed(2)}`,
                ` Avg rating: ${Number(d.y).toFixed(2)} / 5`,
                ` Revenue: ${formatAxisMoney(d.revenue)}`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: palette.line, drawTicks: false },
          border: { color: palette.line },
          ticks: { color: palette.axis, font: { family: palette.mono, size: 10, weight: 500 }, padding: 8, callback: (v) => `$${Number(v).toFixed(0)}` },
          title: { display: true, text: 'AVERAGE PRICE', color: palette.creamFaint, font: { family: palette.mono, size: 10, weight: 500 }, padding: { top: 8 } }
        },
        y: {
          min: 0,
          max: 5,
          grid: { color: palette.line, drawTicks: false },
          border: { display: false },
          ticks: { color: palette.axis, font: { family: palette.mono, size: 10, weight: 500 }, padding: 8, stepSize: 1 },
          title: { display: true, text: 'AVERAGE RATING', color: palette.creamFaint, font: { family: palette.mono, size: 10, weight: 500 }, padding: { bottom: 8 } }
        }
      }
    }
  });
}

/** Line chart for the admin usage-over-time panel. */
export function line(canvasId, { labels, values, label = 'Calls', yTitle }) {
  return renderChart(canvasId, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label,
        data: values,
        borderColor: palette.purpleBright,
        backgroundColor: alpha(palette.purpleBright, 0.16),
        pointBackgroundColor: palette.purpleGlow,
        pointBorderColor: palette.ink,
        pointBorderWidth: 2,
        pointRadius: values.length > 40 ? 0 : 3,
        pointHoverRadius: 6,
        borderWidth: 2,
        tension: 0.35,
        fill: true
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      interaction: { mode: 'index', intersect: false },
      scales: scales({ yTitle })
    }
  });
}

/**
 * A DOM legend for charts whose own legend would crowd the canvas. Same
 * markup the .chart-legend rules in dashboard.css expect.
 */
export function legendHtml(entries) {
  return `<div class="chart-legend">${entries.map((e, i) => `
    <span class="chart-legend-item">
      <span class="chart-legend-dot" style="background:${e.color || seriesColor(i)}"></span>
      ${e.label}${e.value ? ` <b>${e.value}</b>` : ''}
    </span>`).join('')}</div>`;
}
