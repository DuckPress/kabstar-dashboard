/* Longer windows (over a day): fetches the 10-minute averages from the Sheet
   and decides when the charts should use them instead of the raw readings. */

import { state } from '../state.js';
import { GAS_API_URL, STATIONS } from '../config.js';
import { buildSeries } from './parse.js';
import { updateDashboard } from '../ui/dashboard.js';
import { activeSeries, updateWindowSpan } from '../ui/time-window.js';
import { CAL, calRender, calendarSetData } from '../ui/calendar.js';

/* ═══════════════════════════════════════════════════
   LONG WINDOWS (7H / 15H / 30H / Semua)
   The raw read is capped at DASHBOARD_READ_LIMIT rows (≈21 hours at one
   reading per 15 s), so windows longer than that come from the backend's
   bucket-mean read (?read=1&days=31&bucket=600 → 10-minute means). Real
   station (index 0) only; fetched on demand, refreshed at most every
   LONG_REFRESH_MS, and never mixed into the raw series (cards, exports and
   the live poll keep working from the raw readings).
═══════════════════════════════════════════════════ */
const LONG_DAYS       = 31;
const LONG_BUCKET_S   = 600;
const LONG_REFRESH_MS = 10 * 60 * 1000;
export const longHistory = { series: null, fetchedAt: 0, loading: null, unsupported: false, failed: false };

/** Fetch (or refresh) the long-window series. Resolves true when one is available. */
export function ensureLongData(force) {
  const usingApi = GAS_API_URL && GAS_API_URL !== "YOUR_WEB_APP_URL_HERE";
  if (!usingApi || !(STATIONS[0] && STATIONS[0].isIoT) || longHistory.unsupported) return Promise.resolve(false);
  if (!force && longHistory.series && Date.now() - longHistory.fetchedAt < LONG_REFRESH_MS) return Promise.resolve(true);
  if (longHistory.loading) return longHistory.loading;
  longHistory.loading = (async () => {
    try {
      const url = GAS_API_URL + (GAS_API_URL.indexOf('?') >= 0 ? '&' : '?') +
                  'read=1&days=' + LONG_DAYS + '&bucket=' + LONG_BUCKET_S;
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (data && data.ok === false) throw new Error(data.error ? String(data.error) : 'backend');
      // An older backend ignores days= and answers with raw rows (no `agg`):
      // don't mistake those for 10-minute means — just stay on the raw data.
      if (!data || data.agg === undefined) { longHistory.unsupported = true; return false; }
      const sensors = data.sensors || {};
      const s1 = sensors['1'] || Object.values(sensors).find(x => Number(x.id) === 1) || null;
      const readings = (s1 && s1.readings) ? s1.readings.slice() : [];
      readings.sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
      longHistory.series = readings.length ? Object.assign(buildSeries(readings, { dateLabels: true }), { aggS: Number(data.agg) || LONG_BUCKET_S }) : null;
      longHistory.fetchedAt = Date.now();
      longHistory.failed = false;
      return !!longHistory.series;
    } catch (e) {
      console.error('Long-window fetch failed:', e);
      longHistory.failed = true;
      return false;
    } finally {
      longHistory.loading = null;
    }
  })();
  return longHistory.loading;
}

/** The long-window series for a station, when one is loaded. */
export function longSeriesFor(idx) {
  return (idx === 0 && STATIONS[0].isIoT && longHistory.series && longHistory.series.values.length) ? longHistory.series : null;
}

/** Does the current window need data older than the raw read holds? */
export function windowNeedsLong(idx) {
  const d = state.allData && state.allData[idx];
  if (idx !== 0 || !d || !STATIONS[0].isIoT) return false;
  const rawFirst = (d.timestamps && d.timestamps.length) ? d.timestamps[0].substring(0, 16) : null;
  if (state.chartFilter.dtFrom) return !!rawFirst && state.chartFilter.dtFrom < rawFirst;
  return state.chartFilter.preset === 'all';
}

/**
 * The series the CHARTS draw for a station: the raw readings, or — when the
 * window reaches back before the first raw reading and the long-window read
 * has more history — its 10-minute means. Cards, the connectivity panel and
 * the CSV export always use the raw series.
 */
export function chartSeriesFor(idx) {
  const d = state.allData[idx];
  const L = longSeriesFor(idx);
  if (!L || !windowNeedsLong(idx)) return d;
  const rawFirst  = (d.timestamps && d.timestamps.length) ? d.timestamps[0] : null;
  const longFirst = L.timestamps.length ? L.timestamps[0] : null;
  return (rawFirst && longFirst && longFirst < rawFirst) ? L : d;
}

/** Kick off the long-window read if the window needs it; re-render when it lands. */
export function maybeLoadLong() {
  if (!windowNeedsLong(state.activeStation)) return;
  if (longSeriesFor(state.activeStation) && Date.now() - longHistory.fetchedAt < LONG_REFRESH_MS) return;
  const wasLoading = !!longHistory.loading;
  ensureLongData().then(ok => {
    if (ok && state.allData) {
      if (CAL.open) { calendarSetData(calendarTimestamps()); calRender(); }
      if (windowNeedsLong(state.activeStation)) updateDashboard(state.activeStation);
    } else if (state.lastSpan) {
      updateWindowSpan(state.lastSpan.ts, state.lastSpan.n, state.lastSpan.aggS);   // show "older script" / failure note
    }
  });
  if (!wasLoading && state.lastSpan) updateWindowSpan(state.lastSpan.ts, state.lastSpan.n, state.lastSpan.aggS);   // "loading…"
}

/** Calendar days: the raw readings plus, when loaded, the long window's. */
export function calendarTimestamps() {
  const d = activeSeries();
  const raw = (d && d.timestamps) ? d.timestamps : [];
  const L = longSeriesFor(state.activeStation);
  return L ? L.timestamps.concat(raw) : raw;
}
