/* The "Export CSV" button: writes the selected station's readings to a CSV file. */

import { state } from '../state.js';
import { STATIONS } from '../config.js';

/** Wire this file's buttons and listeners (called once from main.js). */
export function setupCsvExport() {
  /* ─── CSV EXPORT ─── */
  document.getElementById('export-csv-btn').addEventListener('click', () => {
    if (!state.allData || !state.allData[state.activeStation]) return;
    const s    = STATIONS[state.activeStation];
    const d    = state.allData[state.activeStation];
    const rows = [];

    // Build rows from the full raw dataset (not just what's shown on chart).
    // Use rawTimestamps (full seconds + explicit +08:00), never the minute-
    // truncated chart labels — the export feeds survey reduction.
    const ts   = (d.rawTimestamps && d.rawTimestamps.length) ? d.rawTimestamps : (d.timestamps || []);
    const vals = d.values      || [];
    const temp = d.tempValues  || [];
    const hum  = d.humidValues || [];
    const rv   = d.rvFlags     || [];
    const sd   = d.sdValues    || [];
    const sm   = d.smFlags     || [];

    // Vertical datum for the exported heights. The Config-tab offsets are
    // "gauge zero ABOVE <datum>" in cm, so height_<datum> = gauge height + off.
    const datumSel = (document.getElementById('export-datum-sel') || {}).value || 'GAUGE';
    const offM = datumSel === 'CD'  ? (state.stationMeta.cd_off  || 0) / 100
               : datumSel === 'MSL' ? (state.stationMeta.msl_off || 0) / 100
               : 0;

    // UTC alongside MYT: hydrographic software expects UTC. Stored strings
    // carry an explicit +08:00 offset, so Date resolves the exact instant.
    function toUtc(t) {
      if (!t) return '';
      const dd = new Date(t);
      return isNaN(dd.getTime()) ? '' : dd.toISOString().replace(/\.\d{3}Z$/, 'Z');
    }
    const fmt = (v, dp) => (v !== null && v !== undefined && !isNaN(v)) ? Number(v).toFixed(dp) : '';

    // The backend endpoint is unauthenticated, so any field sourced from the
    // sheet (timestamps in particular) must be treated as untrusted before it
    // reaches a CSV a survey team will open in Excel: quote/escape per RFC
    // 4180, and neutralise leading =/+/-/@ so a crafted value can't run as a
    // spreadsheet formula (CSV formula injection).
    const csvField = (v) => {
      let s = (v === null || v === undefined) ? '' : String(v);
      if (/^[=+\-@]/.test(s)) s = "'" + s;
      if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
      return s;
    };

    const tiltArr = d.tiltValues || [], presArr = d.presValues || [];
    const usArr   = d.usValues   || [], snArr   = d.sensorNames || [];
    rows.push(['Timestamp_UTC', 'Timestamp_MYT', `Height_${datumSel}_m`,
               'Suhu_C', 'Kelembapan_%', 'RTC_Valid', 'Burst_SD_cm',
               'SurveyMode', 'Datum_cm', 'Stesen_ID', 'Stesen_Nama',
               'Tilt_deg', 'Pressure_hPa',
               'Sensor', `Height_US_${datumSel}_m`].map(csvField).join(','));
    // "Julat dipilih sahaja": export only what the chart is showing. Same rule
    // as getFilteredData — a date range wins; otherwise the newest-N cap.
    const rangeOnly = !!(document.getElementById('export-range-only') || {}).checked;
    let keep = () => true;
    if (rangeOnly) {
      const f = state.chartFilter.dtFrom, t = state.chartFilter.dtTo, tsMin = d.timestamps || [];
      if (f || t) keep = i => { const m = (tsMin[i] || '').substring(0, 16); return (!f || m >= f) && (!t || m <= t); };
      else { const startAt = Math.max(0, vals.length - state.chartFilter.maxPts); keep = i => i >= startAt; }
    }
    for (let i = 0; i < vals.length; i++) {
      if (!keep(i)) continue;
      rows.push([
        toUtc(ts[i]),
        ts[i] || '',
        vals[i] !== null && vals[i] !== undefined ? (vals[i] + offM).toFixed(3) : '',
        fmt(temp[i], 1),
        fmt(hum[i], 1),
        (rv[i] === null || rv[i] === undefined) ? '' : rv[i],
        fmt(sd[i], 2),
        (sm[i] === null || sm[i] === undefined) ? '' : sm[i],
        state.stationMeta.datum_cm !== null ? state.stationMeta.datum_cm : '',
        s.id,
        s.name,
        fmt(tiltArr[i], 1),
        fmt(presArr[i], 1),
        snArr[i] || '',
        (usArr[i] !== null && usArr[i] !== undefined) ? (usArr[i] + offM).toFixed(3) : '',
      ].map(csvField).join(','));
    }

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href     = url;
    a.download = `STAR_${s.id}_${datumSel}_${dateStr}${rangeOnly ? '_julat' : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });
}
