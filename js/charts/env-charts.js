/* Temperature and humidity charts. */

import { state } from '../state.js';
import { CHART_FONT, MYT_OFFSET_MS } from '../config.js';
import { T } from '../i18n.js';
import { chartTheme, gapSpanMs, mytMs, timeAxisX } from './theme.js';
import { lttbIndices } from '../analysis/downsample.js';
import { fmtTsLong } from '../ui/time-window.js';

/* ═══════════════════════════════════════════════════
   ENV CHARTS — Temperature & Humidity
   Same time axis as the main chart (timeAxisX), so the three line up and an
   outage shows at its real width.
═══════════════════════════════════════════════════ */
// The env and sensor-distance charts draw at most this many points;
// envSeries() thins longer windows itself, so Chart.js's decimation is off.
const ENV_CHART_MAX_PTS = 400;

// {x, y} points + x positions for an env series: real time when every stamp
// parses, else the point index (sim/legacy data).
// Outages are decided HERE, on the raw readings, before any thinning: where no
// valid reading arrives for longer than gapSpanMs, one null point goes in the
// middle of the hole, and only those nulls break the line (spanGaps: false).
// Measuring the gap on thinned points instead drew false outages, because
// thinning alone leaves 10+ minutes between kept points on a 24 h window.
function envSeries(data, timestamps) {
  let xs = (timestamps && timestamps.length === data.length) ? timestamps.map(mytMs) : null;
  if (xs && xs.some(x => isNaN(x))) xs = null;
  const ok   = v => v !== null && v !== undefined && !isNaN(v);
  const nums = data.filter(ok);
  const avg  = nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length * 10) / 10 : null;
  let px = [], py = [];
  if (xs) {
    const gap = gapSpanMs(xs);
    let prev = null;
    for (let i = 0; i < data.length; i++) {
      if (!ok(data[i])) continue;   // invalid reading: a short run is bridged, a long one becomes a hole
      if (prev !== null && xs[i] - prev > gap) { px.push((prev + xs[i]) / 2); py.push(null); }
      px.push(xs[i]); py.push(data[i]); prev = xs[i];
    }
  } else {
    px = data.map((_, i) => i);
    py = data.map(v => ok(v) ? v : null);
  }
  const idx = lttbIndices(py, ENV_CHART_MAX_PTS);   // keeps a null wherever a bucket holds one
  if (idx) { px = idx.map(i => px[i]); py = idx.map(i => py[i]); }
  const x0 = xs ? xs[0] : 0, x1 = xs ? xs[xs.length - 1] : data.length - 1;
  return {
    xs,
    pts: px.map((x, i) => ({ x, y: py[i] })),
    avg: (avg === null || !data.length) ? [] : [{ x: x0, y: avg }, { x: x1, y: avg }],
  };
}

// `style` (optional) overrides the temperature/humidity defaults that are
// otherwise picked from `unit`: { label, gradTop, gradBottom }.
function _buildEnvChartConfig(ctx, data, labels, timestamps, color, unit, threshold, style) {
  const th = chartTheme();
  const s  = envSeries(data, timestamps);
  const dsLabel = (style && style.label) || (unit === '°C' ? T('ttTemp') : T('ttHumid'));

  const plugins = {
    decimation: { enabled: false },   // envSeries() already thinned the series
    legend: { display: false },
    tooltip: {
      backgroundColor: '#0d2149',
      titleColor: '#c9a227',
      bodyColor: '#e8f0fe',
      borderColor: 'rgba(201,162,39,0.3)',
      borderWidth: 1,
      padding: 10,
      filter: (item) => item.datasetIndex === 0,
      callbacks: {
        title: (items) => {
          if (!items.length) return '';
          const c  = items[0].chart;
          // envSeries() thins the series (LTTB), so dataIndex counts the thinned
          // points, not the full series: never index _tsStrings with it. The
          // point's own x is the reading's epoch ms (timed axis) or its index.
          const x  = items[0].parsed.x;
          if (x > 1e11) {
            const d = new Date(x + MYT_OFFSET_MS), p = n => String(n).padStart(2, '0');
            return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
          }
          const i  = Math.round(x);
          const ts = (c._tsStrings || [])[i];
          return ts && ts.length >= 16 ? fmtTsLong(ts) : ((c._labels || [])[i] || '');
        },
        label: (c) => `  ${dsLabel}: ${c.parsed.y.toFixed(1)} ${unit}`,
      },
    },
  };

  // Threshold annotation line for temperature
  if (threshold !== null) {
    plugins.annotation = {
      annotations: {
        threshLine: {
          type: 'line',
          yMin: threshold,
          yMax: threshold,
          borderColor: 'rgba(192,57,43,0.55)',
          borderWidth: 1.5,
          borderDash: [5, 4],
          label: {
            display: true,
            content: `Had ${threshold}${unit}`,
            position: 'end',
            backgroundColor: 'rgba(192,57,43,0.12)',
            color: '#c0392b',
            font: { size: 9, weight: '700', family: CHART_FONT },
            padding: { x: 5, y: 2 },
          },
        },
      },
    };
  }

  // Pre-compute RGBA stop colours so the gradient closure has no dependency on
  // the `color` hex string (which can't be transformed at paint time).
  const gradTop    = (style && style.gradTop)    || (unit === '°C' ? 'rgba(224,82,82,0.22)' : 'rgba(39,163,201,0.22)');
  const gradBottom = (style && style.gradBottom) || (unit === '°C' ? 'rgba(224,82,82,0.01)' : 'rgba(39,163,201,0.01)');

  return {
    type: 'line',
    data: {
      datasets: [
        {
          label: dsLabel,
          data: s.pts,
          borderColor: color,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: color,
          fill: true,
          spanGaps: false,   // only envSeries()'s outage nulls (and sim-data nulls) break the line
          backgroundColor: (ctx2) => {
            const g = ctx2.chart.ctx.createLinearGradient(0, 0, 0, ctx2.chart.height);
            g.addColorStop(0, gradTop);
            g.addColorStop(1, gradBottom);
            return g;
          },
          tension: 0.3,
          cubicInterpolationMode: 'monotone',   // no overshoot loops at steps
        },
        {
          label: T('dsAvg'),
          data: s.avg,
          borderColor: 'rgba(201,162,39,0.65)',
          borderWidth: 1.5,
          borderDash: [6, 4],
          pointRadius: 0,
          pointHoverRadius: 0,
          fill: false,
          tension: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      normalized: true,
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      plugins,
      scales: {
        x: timeAxisX(s.xs, labels, th),
        y: {
          grid: { color: th.grid, drawBorder: false },
          ticks: {
            color: th.tick,
            font: { size: 10, family: CHART_FONT },
            callback: v => v.toFixed(1) + ' ' + unit,
          },
        },
      },
    },
  };
}

// Create or update one env chart in place. Returns the (possibly new) instance.
export function _renderEnvChart(inst, canvasEl, labels, data, timestamps, color, unit, threshold, style) {
  const config = _buildEnvChartConfig(canvasEl.getContext('2d'), data, labels, timestamps, color, unit, threshold, style);
  if (inst) {
    inst.data.datasets[0].data     = config.data.datasets[0].data;
    inst.data.datasets[0].spanGaps = config.data.datasets[0].spanGaps;
    inst.data.datasets[1].data     = config.data.datasets[1].data;
    inst.options.scales.x          = config.options.scales.x;
    inst.update();   // see renderMainChart: never 'active'
  } else {
    inst = new Chart(canvasEl.getContext('2d'), config);
  }
  inst._tsStrings = timestamps || [];
  inst._labels    = labels;
  return inst;
}

export function renderTempChart(labels, tempData, timestamps) {
  const canvasEl  = document.getElementById('tempChart');
  const noDataEl  = document.getElementById('temp-no-data');
  const statEl    = document.getElementById('temp-chart-stat');
  const hasData   = tempData && tempData.some(v => v !== null && !isNaN(v));

  if (noDataEl) noDataEl.style.display = hasData ? 'none' : 'flex';
  if (!hasData) {
    if (state.tempChart) { state.tempChart.destroy(); state.tempChart = null; }
    return;
  }

  const nums = tempData.filter(v => v !== null && !isNaN(v));
  const latest = nums[nums.length - 1];
  const avg    = nums.reduce((a, b) => a + b, 0) / nums.length;
  if (statEl) statEl.textContent = T('envStat', { latest: latest.toFixed(1) + '°C', avg: avg.toFixed(1) + '°C' });

  state.tempChart = _renderEnvChart(state.tempChart, canvasEl, labels, tempData, timestamps, '#e05252', '°C', 35);
}

export function renderHumidChart(labels, humidData, timestamps) {
  const canvasEl = document.getElementById('humidChart');
  const noDataEl = document.getElementById('humid-no-data');
  const statEl   = document.getElementById('humid-chart-stat');
  const hasData  = humidData && humidData.some(v => v !== null && !isNaN(v));

  if (noDataEl) noDataEl.style.display = hasData ? 'none' : 'flex';
  if (!hasData) {
    if (state.humidChart) { state.humidChart.destroy(); state.humidChart = null; }
    return;
  }

  const nums   = humidData.filter(v => v !== null && !isNaN(v));
  const latest = nums[nums.length - 1];
  const avg    = nums.reduce((a, b) => a + b, 0) / nums.length;
  if (statEl) statEl.textContent = T('envStat', { latest: latest.toFixed(1) + '%', avg: avg.toFixed(1) + '%' });

  state.humidChart = _renderEnvChart(state.humidChart, canvasEl, labels, humidData, timestamps, '#27a3c9', '%', null);
}
