/* Radar and ultrasonic distance charts (one per sensor), shown for the real station. */

import { state } from '../state.js';
import { T } from '../i18n.js';
import { chartTheme } from './theme.js';
import { _renderEnvChart } from './env-charts.js';

/**
 * Each distance sensor's range to the water (cm), per reading of a chart
 * series. The read API has no per-sensor distance, so it is worked back from
 * the levels the cloud computed: distance = datum_cm − level × 100.
 *   radar      — the primary level, but only on rows the radar fed (sn
 *                'LD2413'); when its burst was empty the ultrasonic stood in.
 *                The bucket-mean series carries no `sn`, so there it is the
 *                primary sensor's mean (stand-in rows included).
 *   ultrasonic — from `usl`, which already includes Config us_offset_cm.
 * Returns nulls throughout when the datum is unknown.
 */
export function sensorDistances(cs, isLong) {
  const datum = state.stationMeta ? state.stationMeta.datum_cm : null;
  const n = (cs.values || []).length;
  if (datum === null || datum === undefined || isNaN(datum)) {
    return { radar: new Array(n).fill(null), us: new Array(n).fill(null) };
  }
  const toDist = (lvl) => (lvl === null || lvl === undefined || isNaN(lvl))
    ? null : Math.round((datum - lvl * 100) * 100) / 100;
  const sn = cs.sensorNames || [];
  const us = cs.usValues || [];
  return {
    radar: cs.values.map((v, i) => (isLong || sn[i] === 'LD2413') ? toDist(v) : null),
    us:    cs.values.map((v, i) => toDist(us[i] === undefined ? null : us[i])),
  };
}

// One distance chart (radar or ultrasonic): placeholder when the window holds
// no reading from that sensor, else latest/mean in the subtitle + the chart.
function renderSensorDistChart(which, labels, data, timestamps, aggS) {
  const isRadar  = which === 'radar';
  const canvasEl = document.getElementById(isRadar ? 'radarChart' : 'usChart');
  const noDataEl = document.getElementById(isRadar ? 'radar-no-data' : 'us-no-data');
  const statEl   = document.getElementById(isRadar ? 'radar-chart-stat' : 'us-chart-stat');
  const nums     = (data || []).filter(v => v !== null && !isNaN(v));
  const inst     = isRadar ? state.radarChart : state.usChart;
  const setInst  = (c) => { if (isRadar) state.radarChart = c; else state.usChart = c; };

  if (noDataEl) noDataEl.style.display = nums.length ? 'none' : 'flex';
  if (!nums.length) {
    if (inst) { inst.destroy(); setInst(null); }
    if (statEl) statEl.textContent = '—';
    return;
  }

  const latest = nums[nums.length - 1];
  const avg    = nums.reduce((a, b) => a + b, 0) / nums.length;
  let stat = T('envStat', { latest: latest.toFixed(1) + ' cm', avg: avg.toFixed(1) + ' cm' });
  if (aggS) stat += ' · ' + T('aggMeans', { m: Math.round(aggS / 60) }) + (isRadar ? ' ' + T('distPrimaryNote') : '');
  if (statEl) statEl.textContent = stat;

  const th = chartTheme();
  const style = isRadar
    ? { label: T('ttRadar'), gradTop: th.fillTop,   gradBottom: th.fillBot }
    : { label: T('ttUs'),    gradTop: th.usFillTop, gradBottom: th.usFillBot };
  setInst(_renderEnvChart(inst, canvasEl, labels, data, timestamps,
                          isRadar ? th.line : th.usSolid, 'cm', null, style));
}

// Both distance charts, shown for the real (IoT) station only.
export function renderSensorDistCharts(show, labels, dist, timestamps, aggS) {
  const grid = document.getElementById('sensor-chart-grid');
  if (grid) grid.hidden = !show;
  if (!show) {
    if (state.radarChart) { state.radarChart.destroy(); state.radarChart = null; }
    if (state.usChart)    { state.usChart.destroy();    state.usChart    = null; }
    return;
  }
  renderSensorDistChart('radar', labels, dist.radar, timestamps, aggS);
  renderSensorDistChart('us',    labels, dist.us,    timestamps, aggS);
}
