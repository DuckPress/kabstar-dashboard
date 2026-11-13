/* Turns the raw rows from the Sheet into clean series for the charts:
   timestamps, water level, temperature, humidity and sensor distances. */

import { state } from '../state.js';
import { updateConnectivityPanel } from '../ui/connectivity.js';

/**
 * Normalise any timestamp the GAS/Arduino may send into "YYYY-MM-DDTHH:mm:ss".
 * Seconds are KEPT: at the 60 s cadence a live reading and a flushed
 * backlog reading can land in the same minute, and minute-truncation made
 * them indistinguishable (identical keys, zero elapsed time).
 * Handles:
 *   "2026-06-06 5:33:15"  → "2026-06-06T05:33:15"  (space sep + single-digit hour)
 *   "2026-06-06 05:33:15" → "2026-06-06T05:33:15"  (space sep, zero-padded)
 *   "2026-06-06T05:33:15" → "2026-06-06T05:33:15"  (already T-sep)
 *   "2026-06-06T05:33"    → "2026-06-06T05:33:00"  (no seconds → :00)
 *   ""  / null / garbage  → ""
 */
function normaliseTs(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const t     = raw.trim().replace(' ', 'T');
  const tIdx  = t.indexOf('T');
  if (tIdx === -1) return t.substring(0, 10);
  const date  = t.substring(0, tIdx);
  const parts = t.substring(tIdx + 1).split(':');
  const hh    = (parts[0] || '00').padStart(2, '0');
  const mm    = (parts[1] || '00').padStart(2, '0');
  // Strip a trailing zone/offset ("15+08:00" → "15") and keep two digits.
  const ss    = String(parts[2] || '00').substring(0, 2).padStart(2, '0');
  return `${date}T${hh}:${mm}:${ss}`;
}

// The node's "no reading" placeholders (−999 °C, −1 %) are never data — even
// from an older backend or a cached payload that still passes them through.
function cleanTemp(v)  { const n = (v === null || v === undefined || v === '') ? NaN : Number(v); return (isNaN(n) || n <= -100) ? null : n; }
function cleanHumid(v) { const n = (v === null || v === undefined || v === '') ? NaN : Number(v); return (isNaN(n) || n < 0)      ? null : n; }

/**
 * One station's chart series from its (chronological) readings — the arrays
 * every chart, card and export works from. Pure: no DOM, no globals, so the
 * raw read and the long-window (bucket-mean) read build identical shapes.
 */
export function buildSeries(readings, opts) {
  opts = opts || {};
  // Full "YYYY-MM-DDTHH:mm:ss" — preserves the date for multi-day filtering
  const timestamps = readings.map(r => normaliseTs(r.timestamp));

  // Chart labels: "HH:MM", but "DD/MM HH:MM" on the first point and at every
  // day change — a window spanning several days is otherwise ambiguous. A
  // multi-week series (opts.dateLabels) dates every point: the axis only shows
  // a dozen ticks, and they rarely land on a day change.
  const labels = timestamps.map((ts, i) => {
    if (ts.length < 16) return ts;
    const hhmm = ts.substring(11, 16);
    const day  = ts.substring(0, 10);
    const prev = i > 0 ? timestamps[i - 1].substring(0, 10) : null;
    return (opts.dateLabels || day !== prev) ? `${ts.substring(8, 10)}/${ts.substring(5, 7)} ${hhmm}` : hhmm;
  });

  // Untouched source timestamps ("YYYY-MM-DDTHH:mm:ss+08:00", full seconds +
  // explicit offset). normaliseTs above drops the offset for chart labels —
  // fine for display, but the CSV export must NOT use that lossy form: a
  // zone-less string makes `new Date()` browser-timezone-dependent.
  const rawTimestamps = readings.map(r => String(r.timestamp || ''));

  const values = readings.map(r => {
    const v = r.finalReading ?? r.waterLevel ?? r.emaDist ?? null;
    // Treat the -1 sentinel (and any invalid negative) as a gap, not a dip.
    return (v === null || v < -0.5) ? null : v;
  });

  // Latest temperature and humidity (KPI cards)
  const latestReading = readings.length ? readings[readings.length - 1] : null;
  const latestTemp    = latestReading ? cleanTemp(latestReading.temp ?? latestReading.temperature ?? null) : null;
  const latestHumid   = latestReading ? cleanHumid(latestReading.humidity ?? latestReading.hum ?? null) : null;

  // Full time-series for the env charts
  const tempValues  = readings.map(r => cleanTemp(r.temp ?? r.temperature ?? null));
  const humidValues = readings.map(r => cleanHumid(r.humidity ?? r.hum ?? null));

  // Per-reading QC (survey-grade export/badge): RTC-valid flag, burst
  // std-dev (cm) and survey-mode tag. Absent on sim data → nulls.
  const rvFlags  = readings.map(r => (r.rv === undefined || r.rv === null) ? null : Number(r.rv));
  // Optional extras (node >= 1.2.9): tilt from vertical (deg), station pressure (hPa).
  const tiltValues = readings.map(r => (r.tilt === undefined || r.tilt === null) ? null : Number(r.tilt));
  const presValues = readings.map(r => (r.pres === undefined || r.pres === null) ? null : Number(r.pres));
  const sdValues = readings.map(r => (r.sd === undefined) ? null : r.sd);
  const smFlags  = readings.map(r => (r.sm === undefined) ? null : Number(r.sm));
  // Dual-sensor build (node >= 1.2.10): the ultrasonic's level on the same
  // datum (m) and which sensor fed the primary level. Absent on older rows.
  const usValues    = readings.map(r => (r.usl === undefined || r.usl === null) ? null : Number(r.usl));
  const sensorNames = readings.map(r => r.sn || null);

  return { labels, values, timestamps, rawTimestamps, latestTemp, latestHumid,
           tempValues, humidValues, rvFlags, sdValues, smFlags, tiltValues, presValues,
           usValues, sensorNames };
}

export function parseApiData(raw) {
  // GAS response format:
  // { sensors: { "1": { id, name, type, location, readings: [...] }, "2": {...}, ... } }
  // Each reading: { timestamp, finalReading, waterLevel, temp, humidity, status, ... }
  // We map sensor id (1-based) → dashboard index (0-based).
  if (!raw || !raw.sensors) return null;

  // Station metadata (datum + offsets + survey mode) rides along with reads.
  if (raw.datum_cm !== undefined) {
    state.stationMeta = {
      datum_cm:       (raw.datum_cm === null) ? null : Number(raw.datum_cm),
      cd_off:         Number(raw.chart_datum_offset_cm) || 0,
      msl_off:        Number(raw.msl_offset_cm) || 0,
      survey_mode:    Number(raw.survey_mode) ? 1 : 0,
      benchmark_id:   String(raw.benchmark_id || ''),
      levelling_date: String(raw.levelling_date || ''),
      max_sd_cm:      Number(raw.survey_max_sd_cm) || 0,
      max_skew_s:     Number(raw.max_clock_skew_s) || 0
    };
  }

  const data = {};
  const keys = Object.keys(raw.sensors);
  if (keys.length === 0) return null;

  // The sheet is APPEND-ordered, not time-ordered: the node's SD queue and the
  // gateway's flash buffer both backfill late after an outage. Sort every
  // sensor's readings chronologically so the chart x-axis is monotonic and
  // "latest reading" is truly the newest — the connectivity panel and KPI
  // cards all read from these arrays too. The backend emits every timestamp
  // as "YYYY-MM-DDTHH:MM:SS+08:00"; with one shared format+zone the
  // fixed-width strings compare lexicographically = chronologically.
  keys.forEach(key => {
    const s = raw.sensors[key];
    if (s && Array.isArray(s.readings)) {
      s.readings.sort((a, b) =>
        String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
    }
  });

  keys.forEach(key => {
    const sensor   = raw.sensors[key];
    // Convert 1-based sensor id → 0-based dashboard index. Fall back to the
    // (numeric) object key if `id` is missing/non-numeric, so a malformed row
    // can't write to data[NaN] and vanish from the dashboard.
    const rawId    = Number(sensor.id);
    const idx      = (Number.isFinite(rawId) ? rawId : Number(key)) - 1;
    if (!Number.isFinite(idx) || idx < 0) return;  // unusable id — skip
    data[idx] = buildSeries(sensor.readings || []);
  });

  // ── Update connectivity panel for the real station (sensor id 1) ──────────
  const s1 = Object.values(raw.sensors).find(s => s.id === 1 || s.type === 'real');
  updateConnectivityPanel(s1 ? (s1.readings || []) : []);

  // Return null if we got an empty dataset (all sensors had 0 readings)
  const hasData = Object.values(data).some(d => d.values.length > 0);
  return hasData ? data : null;
}
