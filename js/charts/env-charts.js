/* Temperature and humidity charts. */

import { state } from '../state.js';
import { CHART_FONT } from '../config.js';
import { T } from '../i18n.js';
import { chartTheme, gapSpanMs, mytMs, timeAxisX } from './theme.js';
import { fmtTsLong } from '../ui/time-window.js';

/* ═══════════════════════════════════════════════════
   ENV CHARTS — Temperature & Humidity
   Same time axis as the main chart (timeAxisX), so the three line up and an
   outage shows at its real width.
═══════════════════════════════════════════════════ */
// {x, y} points + x positions for an env series: real time when every stamp
// parses, else the point index (sim/legacy data).
function envSeries(data, timestamps) {
  let xs = (timestamps && timestamps.length === data.length) ? timestamps.map(mytMs) : null;
  if (xs && xs.some(x => isNaN(x))) xs = null;
  const X = i => xs ? xs[i] : i;
  const nums = data.filter(v => v !== null && !isNaN(v));
  const avg  = nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length * 10) / 10 : null;
  return {
    xs,
    pts: data.map((y, i) => ({ x: X(i), y: (y === undefined ? null : y) })),
    avg: (avg === null || !data.length) ? [] : [{ x: X(0), y: avg }, { x: X(data.length - 1), y: avg }],
  };
}

// `style` (optional) overrides the temperature/humidity defaults that are
// otherwise picked from `unit`: { label, gradTop, gradBottom }.
function _buildEnvChartConfig(ctx, data, labels, timestamps, color, unit, threshold, style) {
  const th = chartTheme();
  const s  = envSeries(data, timestamps);
  const dsLabel = (style && style.label) || (unit === '°C' ? T('ttTemp') : T('ttHumid'));

  const plugins = {
    decimation: { enabled: true, algorithm: 'lttb', samples: 200, threshold: 200 },
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
          const ts = (c._tsStrings || [])[items[0].dataIndex];
          return ts && ts.length >= 16 ? fmtTsLong(ts) : ((c._labels || [])[items[0].dataIndex] || '');
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
          spanGaps: s.xs ? gapSpanMs(s.xs) : false,
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
