/* updateDashboard(): redraws everything for the selected station: the metric
   cards, every chart, the station header and the side panel. */

import { state } from '../state.js';
import { STATIONS, TIDE_MIN_RANGE_M } from '../config.js';
import { T, stationDisplayName, stationTypeLabel, statusLabel_ } from '../i18n.js';
import { calendarTimestamps, chartSeriesFor, maybeLoadLong } from '../data/long-history.js';
import { alignToFilter, getFilteredData } from '../analysis/window-filter.js';
import { robustInlierMask } from '../analysis/anomalies.js';
import { getRateOfChange, getTideStatus, harmonicFit } from '../analysis/tide.js';
import { renderMainChart } from '../charts/main-chart.js';
import { renderMiniChart } from '../charts/mini-chart.js';
import { renderHumidChart, renderTempChart } from '../charts/env-charts.js';
import { renderSensorDistCharts, sensorDistances } from '../charts/sensor-charts.js';
import { renderTideEvents } from './tide-events.js';
import { updateSensorCards } from './cards.js';
import { fmtAge } from './connectivity.js';
import { updateStationMap } from './map.js';
import { updateWindowSpan } from './time-window.js';
import { calendarSetData } from './calendar.js';

/* ═══════════════════════════════════════════════════
   UPDATE DASHBOARD
═══════════════════════════════════════════════════ */
export function updateDashboard(idx) {
  const s = STATIONS[idx];
  const d = state.allData[idx];
  const { labels: rawLabels, values: rawValues } = d;

  if (!rawValues || rawValues.length === 0) return;

  // Show connectivity panel only for the real IoT station (index 0)
  const connPanel = document.getElementById('conn-panel');
  if (connPanel) {
    if (idx === 0 && s.isIoT) connPanel.classList.add('visible');
    else connPanel.classList.remove('visible');
  }

  // Prominent notice when viewing a simulated (non-IoT) station.
  const simBanner = document.getElementById('sim-banner');
  if (simBanner) simBanner.classList.toggle('visible', !s.isIoT);

  const rawTimestamps = d.timestamps || [];

  // Chart series: the raw readings, or the long-window 10-minute means when
  // the window reaches back before the raw read (see chartSeriesFor).
  const cs       = chartSeriesFor(idx);
  const csIsLong = (cs !== d);
  const csLabels = cs.labels, csValues = cs.values, csTimestamps = cs.timestamps || [];

  // ── Populate calendar pickers from the actual data timestamps ──────────────
  calendarSetData(idx === state.activeStation ? calendarTimestamps() : rawTimestamps);

  // ── Apply filters to get the chart slice ──────────────────────────────────
  // A long series is only ever drawn whole or by date range — never capped at
  // the raw point count (state.chartFilter.maxPts).
  const capPts = csIsLong ? csValues.length : undefined;
  const { labels, values, timestamps: filtTimestamps } = getFilteredData(csLabels, csValues, csTimestamps, capPts);

  // ── Update slider max to match total available points ─────────────────────
  const totalPts = rawValues.length;
  const slider   = document.getElementById('pts-slider');
  const input    = document.getElementById('pts-input');
  if (slider) {
    slider.max = totalPts;
    if (parseInt(slider.value) > totalPts) slider.value = totalPts;
  }
  if (input) {
    input.max = totalPts;
    if (parseInt(input.value) > totalPts) input.value = totalPts;
  }
  const shownPts = values.length;
  const badge = document.getElementById('pts-badge');
  if (badge) badge.textContent = csIsLong ? `${shownPts}` : `${shownPts} / ${totalPts}`;
  updateWindowSpan(filtTimestamps, shownPts, csIsLong ? cs.aggS : 0);
  if (idx === state.activeStation) maybeLoadLong();

  // ── KPI cards use filtered slice ───────────────────────────────────────────
  // The real IoT station (index 0) can have null gaps in its readings — including
  // a null as the most-recent point (sensor dropout). Derive "current" and stats
  // from the valid (non-null) values only; otherwise current.toFixed() below throws
  // and aborts updateDashboard *before* the chart renders, blanking the graph.
  // A long (10-minute-mean) view still describes NOW from the raw readings.
  const kpiValues = csIsLong ? rawValues : values;
  const kpiTs     = csIsLong ? rawTimestamps : filtTimestamps;
  const validValues = kpiValues.filter(v => v !== null && !isNaN(v));
  const current = validValues.length ? validValues[validValues.length - 1] : null;
  const tideInfo = getTideStatus(kpiValues, kpiTs);
  const rate = getRateOfChange(kpiValues, kpiTs);
  const computedAvg = validValues.length
    ? validValues.reduce((a, b) => a + b, 0) / validValues.length
    : null;

  // Header
  document.getElementById('breadcrumb-station').textContent = `${T('stationWord')} ${idx + 1}`;
  document.getElementById('main-station-name').textContent = stationDisplayName(s);
  document.getElementById('main-station-meta').textContent = `${T('coords')}: ${s.lat.toFixed(4)}° N, ${s.lng.toFixed(4)}° E · ${s.location} · MYT (UTC+8)`;

  // Station status badge in header
  const ssb = document.getElementById('station-status-badge');
  if (ssb) {
    const statusLabel = statusLabel_(s.sysStatus);
    const statusCls   = { active: 'ssb-active', warning: 'ssb-warning', offline: 'ssb-offline' }[s.sysStatus] || 'ssb-offline';
    ssb.className = `station-status-badge ${statusCls}`;
    ssb.textContent = s.sysStatus === 'warning' && s.errorCode
      ? `⚠ ${statusLabel} · ${s.errorCode}`
      : statusLabel;
  }

  // Sidebar health summary counts
  // Real stations only: the 9 demo stations carry invented statuses and
  // error codes, and rolling them into this summary made fake faults look real.
  const realStations = STATIONS.filter(st => st.isIoT);
  const nActive  = realStations.filter(st => st.sysStatus === 'active').length;
  const nWarning = realStations.filter(st => st.sysStatus === 'warning').length;
  const nOffline = realStations.filter(st => st.sysStatus === 'offline').length;
  const hcA = document.getElementById('hc-active-count');
  const hcW = document.getElementById('hc-warning-count');
  const hcO = document.getElementById('hc-offline-count');
  if (hcA) hcA.textContent = nActive;
  if (hcW) hcW.textContent = nWarning;
  if (hcO) hcO.textContent = nOffline;

  // Cards
  if (current !== null) {
    document.getElementById('card-level').innerHTML = `${current.toFixed(3)}<span class="metric-unit">m</span>`;
    document.getElementById('card-level-sub').textContent = T('levelSub', { mm: (current * 1000).toFixed(0), avg: computedAvg.toFixed(3) });
  } else {
    document.getElementById('card-level').innerHTML = `—<span class="metric-unit">m</span>`;
    document.getElementById('card-level-sub').textContent = T('levelWait');
  }

  const pill = document.getElementById('card-status-pill');
  pill.innerHTML = `<span class="status-pill ${tideInfo.cls}">${tideInfo.label}</span>`;
  document.getElementById('card-status-sub').textContent = tideInfo.status === 'rising' ? T('subRising') : tideInfo.status === 'falling' ? T('subFalling') : tideInfo.status === 'high' ? T('subHigh') : T('subLow');

  document.getElementById('card-trend').innerHTML = `${rate > 0 ? '+' : ''}${rate}<span class="metric-unit">mm/min</span>`;
  document.getElementById('card-trend-sub').textContent = rate > 0 ? T('rateUp') : rate < 0 ? T('rateDown') : T('rateNone');

  // ── Suhu Terkini & Kelembapan Terkini KPI cards ──────────────────────────
  const latestTemp  = d.latestTemp  ?? null;
  const latestHumid = d.latestHumid ?? null;
  const TEMP_THRESHOLD = 35; // °C — warning threshold

  const tempCard    = document.getElementById('card-temp-wrap');
  const tempValEl   = document.getElementById('card-temp');
  const tempWarnEl  = document.getElementById('card-temp-warn');
  const tempSubEl   = document.getElementById('card-temp-sub');

  if (latestTemp !== null) {
    tempValEl.innerHTML = `${latestTemp.toFixed(1)}<span class="metric-unit">°C</span>`;
    const isHot = latestTemp > TEMP_THRESHOLD;
    tempCard.classList.toggle('temp-warning', isHot);
    tempWarnEl.innerHTML = isHot
      ? `<span class="metric-warn-badge">${T('tempHot', { t: TEMP_THRESHOLD })}</span>`
      : '';
    tempSubEl.textContent = isHot ? T('tempOver') : T('inRange');
  } else {
    tempValEl.innerHTML = `—<span class="metric-unit">°C</span>`;
    tempCard.classList.remove('temp-warning');
    tempWarnEl.innerHTML = '';
    tempSubEl.textContent = T('tempNone');
  }

  const humidValEl  = document.getElementById('card-humid');
  const humidSubEl  = document.getElementById('card-humid-sub');
  if (latestHumid !== null) {
    humidValEl.innerHTML = `${latestHumid.toFixed(1)}<span class="metric-unit">%</span>`;
    humidSubEl.textContent = latestHumid > 80 ? T('humidHigh') : latestHumid < 40 ? T('humidLow') : T('inRange');
  } else {
    humidValEl.innerHTML = `—<span class="metric-unit">%</span>`;
    humidSubEl.textContent = T('humidNone');
  }

  // ── Radar & ultrasonic cards (real station only) ──────────────────────────
  updateSensorCards(d, idx === 0 && s.isIoT);

  // ── Stale-data honesty ───────────────────────────────────────────────
  // The tiles above are labelled "SEMASA / TERKINI". When the real station's
  // newest reading is old, say so loudly and stop making live claims (tide
  // state, temperature alarm) from it.
  const isReal   = (idx === 0 && s.isIoT);
  const ageMsNow = (isReal && s._lastSeenMs) ? (Date.now() - s._lastSeenMs) : null;
  const isStale  = isReal && (s.sysStatus === 'offline' || s.sysStatus === 'warning');
  const gridEl   = document.querySelector('.metric-grid');
  if (gridEl) gridEl.classList.toggle('stale', !!isStale);
  const staleBanner = document.getElementById('stale-banner');
  const staleMsg    = document.getElementById('stale-banner-msg');
  if (staleBanner) staleBanner.classList.toggle('visible', !!isStale);
  if (staleMsg) {
    staleMsg.textContent = !isStale ? ''
      : (ageMsNow !== null
          ? T('staleBanner', { age: fmtAge(ageMsNow) })
          : T('staleNone'));
  }
  if (isStale) {
    pill.innerHTML = `<span class="status-pill status-high">${T('tideStale')}</span>`;
    document.getElementById('card-status-sub').textContent = T('subStale');
    tempCard.classList.remove('temp-warning');
    tempWarnEl.innerHTML = '';
    if (latestTemp !== null) tempSubEl.textContent = T('tempStale');
  }

  // For the real IoT station use actual last-post time; for others use now
  const cardTimeBase = (idx === 0 && s.isIoT && s._lastSeenMs)
    ? new Date(s._lastSeenMs) : new Date();
  document.getElementById('card-updated').textContent =
    cardTimeBase.getHours().toString().padStart(2,'0') + ':' +
    cardTimeBase.getMinutes().toString().padStart(2,'0') + ':' +
    cardTimeBase.getSeconds().toString().padStart(2,'0');
  document.getElementById('card-updated-sub').textContent =
    cardTimeBase.toLocaleDateString(T('locale'), { weekday: 'short', day: 'numeric', month: 'short' }) +
    (idx === 0 && s.isIoT && s._lastSeenMs ? T('updatedSrc') : '');

  // Station info (uses raw stats) — exclude null gaps so min/amplitude aren't
  // dragged to 0 by the real station's missing readings.
  // Outlier-rejected: a single handling spike used to become the
  // station's "highest level" and a fake metre of amplitude.
  const rawMask  = robustInlierMask(rawValues, 6, TIDE_MIN_RANGE_M);
  const rawValid = rawValues.filter((v, i) => rawMask[i]);
  const rawMax = rawValid.length ? Math.max(...rawValid) : null;
  const rawMin = rawValid.length ? Math.min(...rawValid) : null;
  document.getElementById('info-id').textContent  = s.id;
  document.getElementById('info-lat').textContent = s.lat.toFixed(4) + '° N';
  document.getElementById('info-lng').textContent = s.lng.toFixed(4) + '° E';
  document.getElementById('info-type').textContent = stationTypeLabel(s);
  document.getElementById('info-max').textContent = rawMax !== null ? rawMax.toFixed(3) + ' m' : '—';
  document.getElementById('info-min').textContent = rawMin !== null ? rawMin.toFixed(3) + ' m' : '—';
  document.getElementById('info-amp').textContent = (rawMax !== null && rawMin !== null) ? (rawMax - rawMin).toFixed(3) + ' m' : '—';

  // Update station map
  updateStationMap(s);

  // Charts — filtered slice (with harmonic prediction overlay + surge residual)
  const fit = harmonicFit(values, filtTimestamps);
  renderMainChart(labels, values, s.mean, fit ? fit.pred : null, filtTimestamps,
                  alignToFilter(cs.usValues || [], csLabels, csTimestamps.length ? csTimestamps : csLabels, capPts));
  renderMiniChart(rawLabels, rawValues);  // mini chart always shows last 6h of full data
  renderTideEvents(values, filtTimestamps, labels);

  // Update chart date-range subtitle (coverage of the series on the chart)
  const rangeEl = document.getElementById('chart-date-range');
  const covTs = csIsLong ? csTimestamps : rawTimestamps;
  if (rangeEl && covTs.length) {
    const first = covTs[0];
    const last  = covTs[covTs.length - 1];
    const fmtTs = ts => ts ? ts.replace('T', ' ') : '—';
    const surgeTxt = (fit && fit.rms !== null)
      ? ` &nbsp;·&nbsp; <span class="chart-surge">${T('surge', { v: fit.rms.toFixed(3) })}</span>`
      : '';
    rangeEl.innerHTML = `${T('chartSubUnit')} &nbsp;·&nbsp; ${fmtTs(first)} — ${fmtTs(last)} &nbsp;·&nbsp; <span id="chart-avg-display" class="chart-avg">—</span>${surgeTxt}`;
    // Re-apply avg text since the span was recreated
    const avgEl = document.getElementById('chart-avg-display');
    if (avgEl && state.mainChart) {
      const vals = state.mainChart.data.datasets[0].data.map(p => p.y).filter(v => v !== null && !isNaN(v));
      if (vals.length) avgEl.textContent = T('avgOnly', { v: (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(3) });
    }
  }

  // ── Env charts — apply same filter to temp/humid arrays ───────────────────
  const rawTempVals  = cs.tempValues  || [];
  const rawHumidVals = cs.humidValues || [];

  // Align filtered indices with the tide filter result (same window rule)
  const filtLabels = labels;
  const rawTs      = csTimestamps.length ? csTimestamps : csLabels;
  const filtTemp   = alignToFilter(rawTempVals,  csLabels, rawTs, capPts);
  const filtHumid  = alignToFilter(rawHumidVals, csLabels, rawTs, capPts);

  renderTempChart(filtLabels,  filtTemp.length  ? filtTemp  : rawTempVals,  filtTemp.length  ? filtTimestamps : null);
  renderHumidChart(filtLabels, filtHumid.length ? filtHumid : rawHumidVals, filtHumid.length ? filtTimestamps : null);

  // ── Per-sensor distance charts (below the map), same window ───────────────
  const dist = sensorDistances(cs, csIsLong);
  const filtRadar = alignToFilter(dist.radar, csLabels, rawTs, capPts);
  const filtUs    = alignToFilter(dist.us,    csLabels, rawTs, capPts);
  renderSensorDistCharts(idx === 0 && s.isIoT, filtLabels,
                         { radar: filtRadar.length ? filtRadar : dist.radar,
                           us:    filtUs.length    ? filtUs    : dist.us },
                         filtRadar.length ? filtTimestamps : null,
                         csIsLong ? cs.aggS : 0);
}
