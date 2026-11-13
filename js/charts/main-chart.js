/* The main water-level chart: level line, average, predicted tide, datum lines,
   anomaly markers and their show/hide toggle. */

import { state } from '../state.js';
import { CHART_FONT, TIDE_MIN_RANGE_M } from '../config.js';
import { T } from '../i18n.js';
import { detectAnomalies, robustInlierMask } from '../analysis/anomalies.js';
import { lttbIndices } from '../analysis/downsample.js';
import { chartTheme, gapSpanMs, mytMs, timeAxisX } from './theme.js';
import { attachDragSelect } from './drag-select.js';
import { updateDashboard } from '../ui/dashboard.js';
import { fmtTsLong } from '../ui/time-window.js';

// Anomaly flags for the CURRENTLY rendered main-chart data. Module-level (not
// a render-time closure) because the chart's tooltip callbacks are created
// once and must see fresh flags after every in-place data update.
let shownAnomalyFlags = [];

// Build the annotation set for the main chart: vertical-datum planes (CD/MSL,
// drawn only when a non-zero offset is configured in the Config tab — they sit
// at gauge height = −offset, since the offsets are "gauge zero above datum")
// and High/Low-water markers for the displayed window. Requires the
// chartjs-plugin-annotation script loaded in <head>.
function buildMainChartAnnotations(values, labels, xs) {
  const ann = {};

  const mkDatumLine = (offCm, name) => ({
    type: 'line',
    yMin: -offCm / 100, yMax: -offCm / 100,
    borderColor: 'rgba(76,85,119,0.55)',
    borderWidth: 1.2,
    borderDash: [8, 5],
    label: {
      display: true, content: name, position: 'start',
      font: { size: 9, family: CHART_FONT, weight: '700' },
      backgroundColor: 'rgba(76,85,119,0.10)', color: '#4c5577',
      padding: { x: 4, y: 2 },
    },
  });
  if (state.stationMeta.cd_off)  ann.cdLine  = mkDatumLine(state.stationMeta.cd_off,  'CD');
  if (state.stationMeta.msl_off) ann.mslLine = mkDatumLine(state.stationMeta.msl_off, 'MSL');

  // High / Low water of the displayed series — outlier-rejected, and only
  // drawn when the window actually spans a tide: on a flat record the
  // "HW/LW" of a 5 cm wiggle is noise wearing a label.
  const okMask = robustInlierMask(values, 6, TIDE_MIN_RANGE_M);
  let hi = -Infinity, lo = Infinity, hiI = -1, loI = -1;
  values.forEach((v, i) => {
    if (!okMask[i]) return;
    if (v > hi) { hi = v; hiI = i; }
    if (v < lo) { lo = v; loI = i; }
  });
  if (hiI >= 0 && loI >= 0 && hiI !== loI && (hi - lo) >= TIDE_MIN_RANGE_M) {
    const mkTideLabel = (idx, val, tag, colour, bg, yAdj) => ({
      type: 'label',
      xValue: xs ? xs[idx] : idx, yValue: val, yAdjust: yAdj,
      content: [`${tag} ${val.toFixed(3)} m`, labels[idx] || ''],
      font: { size: 9, family: CHART_FONT, weight: '700' },
      color: colour, backgroundColor: bg, padding: 3, borderRadius: 4,
    });
    ann.hw = mkTideLabel(hiI, hi, 'HW', '#1a9e5f', 'rgba(26,158,95,0.10)', -20);
    ann.lw = mkTideLabel(loI, lo, 'LW', '#c0392b', 'rgba(192,57,43,0.10)',  20);
  }
  return ann;
}

// The main chart draws at most this many points; lttbIndices() thins longer
// windows first (keeping every anomaly), so Chart.js's own decimation is off.
const MAIN_CHART_MAX_PTS = 600;

export function renderMainChart(labels, values, mean, prediction, timestamps, usValues) {
  const ctx = document.getElementById('mainChart').getContext('2d');
  const th  = chartTheme();
  // Ultrasonic cross-check series (dual-sensor nodes): drawn only when the
  // window actually has some, so single-sensor stations see no change.
  let usSeries = usValues || [];
  const hasUs  = usSeries.some(v => v !== null && v !== undefined);

  // Compute average
  const validVals = values.filter(v => v !== null && !isNaN(v));
  const computedAvg = validVals.length > 0
    ? validVals.reduce((a, b) => a + b, 0) / validVals.length
    : mean;

  // Anomaly detection on the FULL series (counts and flags stay exact)
  let anomalyFlags = detectAnomalies(values, timestamps);
  const anomalyCount = anomalyFlags.filter(Boolean).length;

  // Thin long windows before drawing — every anomaly point is kept so it still
  // shows. `full` keeps the original arrays for exact drag-selection stats.
  const full = { values, idx: null };
  let idx = lttbIndices(values, MAIN_CHART_MAX_PTS);
  if (idx) {
    anomalyFlags.forEach((f, i) => { if (f) idx.push(i); });
    idx = Array.from(new Set(idx)).sort((x, y) => x - y);
    const pick = arr => (arr && arr.length === values.length) ? idx.map(i => arr[i]) : arr;
    labels       = pick(labels);
    timestamps   = pick(timestamps);
    prediction   = pick(prediction);
    usSeries     = pick(usSeries);
    anomalyFlags = pick(anomalyFlags);
    values       = pick(values);
    full.idx     = idx;
  }
  shownAnomalyFlags = anomalyFlags;   // refresh what the tooltip callbacks see

  // x positions: real time when every point has a usable stamp, so outages
  // show at their true width; otherwise the point index.
  let xs = (timestamps && timestamps.length === values.length) ? timestamps.map(mytMs) : null;
  if (xs && xs.some(x => isNaN(x))) xs = null;
  const X = i => xs ? xs[i] : i;
  const pts = arr => (arr || []).map((y, i) => ({ x: X(i), y: (y === undefined ? null : y) }));
  const spanGaps = xs ? gapSpanMs(xs) : false;

  const avgY = Math.round(computedAvg * 1000) / 1000;
  const avgLine = values.length ? [{ x: X(0), y: avgY }, { x: X(values.length - 1), y: avgY }] : [];
  const showA = state.showAnomalies;
  const pointColours = values.map((_, i) => (showA && anomalyFlags[i]) ? 'rgba(220,38,38,0.85)' : 'transparent');
  const pointRadii   = values.map((_, i) => (showA && anomalyFlags[i]) ? 3 : 0);
  const pointHoverR  = values.map((_, i) => anomalyFlags[i] ? 5 : 4);

  // Update anomaly KPI card
  const anomCard = document.getElementById('card-anomaly-wrap');
  const anomVal  = document.getElementById('card-anomaly');
  const anomSub  = document.getElementById('card-anomaly-sub');
  if (anomVal) anomVal.textContent = anomalyCount;
  if (anomSub) anomSub.textContent = anomalyCount > 0
    ? T('anomCount', { n: anomalyCount })
    : T('anomNone');
  if (anomCard) anomCard.classList.toggle('has-anomalies', anomalyCount > 0);
  syncAnomalyLegend(anomalyCount);

  const annotations = buildMainChartAnnotations(values, labels, xs);

  if (state.mainChart) {
    state.mainChart._tsStrings = timestamps || [];   // for drag-zoom
    state.mainChart._labels    = labels;
    state.mainChart._full      = full;
    const ds = state.mainChart.data.datasets;
    ds[0].data = pts(values);
    ds[0].spanGaps = spanGaps;
    ds[0].pointBackgroundColor = pointColours;
    ds[0].pointBorderColor     = pointColours;
    ds[0].pointRadius          = pointRadii;
    ds[0].pointHoverRadius     = pointHoverR;
    ds[1].data = avgLine;
    ds[2].data = prediction ? pts(prediction) : [];
    ds[2].spanGaps = spanGaps;
    ds[3].data = pts(usSeries);
    ds[3].spanGaps = spanGaps;
    ds[3].hidden = !hasUs;
    state.mainChart.options.scales.x = timeAxisX(xs, labels, th);
    state.mainChart.options.plugins.annotation = { annotations };
    const avgEl = document.getElementById('chart-avg-display');
    if (avgEl) avgEl.textContent = T('avgNow', { v: computedAvg.toFixed(3) });
    // Default update mode, NOT 'active': 'active' is Chart.js's hover
    // transition and resolves every point with its hover style if a refresh
    // lands while the cursor is on the chart.
    state.mainChart.update();
    return;
  }

  state.mainChart = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: T('dsLevel'),
          data: pts(values),
          borderColor: th.line,
          borderWidth: 2,
          pointRadius: pointRadii,
          pointHoverRadius: pointHoverR,
          pointBackgroundColor: pointColours,
          pointBorderColor: pointColours,
          pointHoverBackgroundColor: th.line,
          fill: true,
          spanGaps,          // joins short holes, breaks across real outages
          backgroundColor: (ctx2) => {
            const g = ctx2.chart.ctx.createLinearGradient(0, 0, 0, ctx2.chart.height);
            g.addColorStop(0, th.fillTop);
            g.addColorStop(1, th.fillBot);
            return g;
          },
          tension: 0.3,
          cubicInterpolationMode: 'monotone',   // no overshoot loops at steps
        },
        {
          label: T('dsAvg'),
          data: avgLine,
          borderColor: 'rgba(201,162,39,0.65)',
          borderWidth: 1.5,
          borderDash: [6, 4],
          pointRadius: 0,
          pointHoverRadius: 0,
          fill: false,
          tension: 0,
        },
        {
          label: T('dsForecast'),
          data: prediction ? pts(prediction) : [],
          borderColor: 'rgba(192,57,43,0.60)',
          borderWidth: 1.4,
          borderDash: [3, 3],
          pointRadius: 0,
          fill: false,
          spanGaps,
          tension: 0.3,
          cubicInterpolationMode: 'monotone',   // no overshoot loops at steps
        },
        {
          label: T('dsUs'),
          data: pts(usSeries),
          hidden: !hasUs,
          borderColor: th.us,
          borderWidth: 1.4,
          borderDash: [2, 3],
          pointRadius: 0,
          fill: false,
          spanGaps,
          tension: 0.3,
          cubicInterpolationMode: 'monotone',   // no overshoot loops at steps
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      normalized: true,
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      plugins: {
        decimation: { enabled: false },
        legend: { display: false },
        annotation: { annotations },
        tooltip: {
          backgroundColor: '#0d2149',
          titleColor: '#c9a227',
          bodyColor: '#e8f0fe',
          borderColor: 'rgba(201,162,39,0.3)',
          borderWidth: 1,
          padding: 10,
          filter: (item) => item.datasetIndex !== 1,   // the flat mean line needs no row
          callbacks: {
            // Created ONCE (in-place updates never rebuild them), so they read
            // state stored on the chart / module, not render-time locals.
            title: (items) => {
              if (!items.length) return '';
              const c = items[0].chart;
              const ts = (c._tsStrings || [])[items[0].dataIndex];
              return ts && ts.length >= 16 ? fmtTsLong(ts) : ((c._labels || [])[items[0].dataIndex] || '');
            },
            label: (ctx3) => {
              if (ctx3.datasetIndex === 0) {
                const flag = shownAnomalyFlags[ctx3.dataIndex] ? T('ttAnom') : '';
                return `  ${T('ttLevel')}: ${ctx3.parsed.y.toFixed(3)} m${flag}`;
              }
              if (ctx3.datasetIndex === 2) return `  ${T('ttForecast')}: ${ctx3.parsed.y.toFixed(3)} m`;
              if (ctx3.datasetIndex === 3) return `  ${T('ttUs')}: ${ctx3.parsed.y.toFixed(3)} m`;
              return `  ${T('ttAvg')}: ${ctx3.parsed.y.toFixed(3)} m`;
            },
            labelColor: (ctx3) => {
              if (ctx3.datasetIndex === 0 && shownAnomalyFlags[ctx3.dataIndex]) {
                return { borderColor: '#dc2626', backgroundColor: '#dc2626' };
              }
              if (ctx3.datasetIndex === 3) return { borderColor: '#6b748f', backgroundColor: '#6b748f' };
              return { borderColor: '#1e4096', backgroundColor: '#1e4096' };
            },
          },
        },
      },
      scales: {
        x: timeAxisX(xs, labels, th),
        y: {
          grid: { color: th.grid, drawBorder: false },
          ticks: {
            color: th.tick,
            font: { size: 10, family: CHART_FONT },
            callback: v => v.toFixed(2) + ' m',
          },
        },
      },
    },
  });

  state.mainChart._tsStrings = timestamps || [];   // for drag-zoom
  state.mainChart._labels    = labels;
  state.mainChart._full      = full;

  // Update avg display after chart creation
  const avgEl = document.getElementById('chart-avg-display');
  if (avgEl) avgEl.textContent = T('avgNow', { v: computedAvg.toFixed(3) });

  // Attach drag-select brush after chart is ready
  attachDragSelect();
}

/** Legend toggle for the anomaly markers: label, count and on/off state. */
function syncAnomalyLegend(count) {
  const btn = document.getElementById('legend-anom-toggle');
  if (!btn) return;
  btn.hidden = !count;
  btn.classList.toggle('off', !state.showAnomalies);
  btn.setAttribute('aria-pressed', state.showAnomalies ? 'true' : 'false');
  const n = document.getElementById('legend-anom-count');
  if (n) n.textContent = count;
}

export function toggleAnomalyMarkers() {
  state.showAnomalies = !state.showAnomalies;
  try { localStorage.setItem('kabstar_anom', state.showAnomalies ? '1' : '0'); } catch (e) {}
  updateDashboard(state.activeStation);   // demo stations too, not just live data
}

/** Wire this file's buttons and listeners (called once from main.js). */
export function setupAnomalyToggle() {
  // ── Anomaly markers on/off (chart legend) ────────────────────────────────────
  (function wireAnomToggle() {
    const btn = document.getElementById('legend-anom-toggle');
    if (btn) btn.addEventListener('click', toggleAnomalyMarkers);
  })();
}
