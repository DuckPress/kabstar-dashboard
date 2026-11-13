/* Downloads readings from the Google Sheet (via the Apps Script web app),
   merges the small incremental updates, and builds the data set the page shows. */

import { state } from '../state.js';
import { DASHBOARD_FIRST_N, DASHBOARD_INCR_N, DASHBOARD_READ_LIMIT, GAS_API_URL } from '../config.js';
import { T } from '../i18n.js';
import { buildAllSimData } from './demo.js';
import { parseApiData } from './parse.js';
import { calendarTimestamps } from './long-history.js';
import { updateConnectivityPanel } from '../ui/connectivity.js';
import { updateDashboard } from '../ui/dashboard.js';
import { CAL, calRender, calendarSetData } from '../ui/calendar.js';
import { hideErrorBanner, setApiBanner, showErrorBanner } from '../ui/page.js';

let readN = DASHBOARD_FIRST_N;   // rows a full (non-incremental) read asks for
// Incremental API state: the last FULL raw payload we assembled, and the
// server_time cursor to ask for "everything appended after this".
let rawApi = null;
let apiCursor = null;
let firstLoadDone = false;

/* ═══════════════════════════════════════════════════
   API FETCH
═══════════════════════════════════════════════════ */
/**
 * Merge an incremental (`since=`) response into the last full payload.
 * Rows are keyed by `srv` (the append instant, unique per sheet row) so a
 * row can never be double-counted; the per-sensor window is capped at
 * DASHBOARD_READ_LIMIT by dropping the oldest (parseApiData keeps the array
 * chronological, so the front IS the oldest).
 */
function mergeIncremental(delta) {
  const base = rawApi;
  Object.keys(delta).forEach(k => {
    if (k !== 'sensors' && k !== 'cursor' && k !== 'partial') base[k] = delta[k];   // fresh station meta
  });
  const dsensors = delta.sensors || {};
  Object.keys(dsensors).forEach(id => {
    const inc = dsensors[id];
    if (!base.sensors[id]) { base.sensors[id] = inc; return; }
    const tgt  = base.sensors[id];
    tgt.readings = tgt.readings || [];
    const seen = new Set(tgt.readings.map(r => r.srv).filter(Boolean));
    (inc.readings || []).forEach(r => {
      if (r.srv && seen.has(r.srv)) return;
      tgt.readings.push(r);
      if (r.srv) seen.add(r.srv);
    });
    if (tgt.readings.length > DASHBOARD_READ_LIMIT) {
      tgt.readings.splice(0, tgt.readings.length - DASHBOARD_READ_LIMIT);
    }
  });
  if (delta.cursor) apiCursor = delta.cursor;
  return base;
}

async function fetchData() {
  if (!GAS_API_URL || GAS_API_URL === "YOUR_WEB_APP_URL_HERE") {
    return null;
  }
  // Ask the Apps Script for the recent readings (read endpoint), not the
  // bare write endpoint (which would just return {ok:true,msg:'alive'}).
  // After the first full read, poll incrementally: only rows appended since
  // the cursor, from a small tail window.
  const canIncr = !!(rawApi && apiCursor);
  const url = GAS_API_URL + (GAS_API_URL.indexOf('?') >= 0 ? '&' : '?') +
              'read=1&n=' + encodeURIComponent(canIncr ? DASHBOARD_INCR_N : readN) +
              (canIncr ? '&since=' + encodeURIComponent(apiCursor) : '');
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      // GAS returns HTTP 200 even for backend failures — the body carries
      // {ok:false,error:...}. Treating that as success would also CLEAR the
      // error banner while silently falling back to stale/sim data.
      if (data && data.ok === false) {
        throw new Error(data.error ? String(data.error) : T('errBackend'));
      }
      hideErrorBanner();
      if (canIncr) {
        // The cursor fell outside the backend's tail window (long outage on
        // this client) — a merge would leave a hole, so do one full read.
        if (data.partial) { rawApi = null; apiCursor = null; return fetchData(); }
        return mergeIncremental(data);
      }
      rawApi = data;
      apiCursor = data.cursor || null;
      return data;
    } catch (e) {
      console.error(`API fetch failed (attempt ${attempt}/2):`, e);
      if (attempt < 2) { await new Promise(r => setTimeout(r, 2000)); continue; }
      showErrorBanner(T('errFetch', { msg: e.message }));
      return null;
    }
  }
  return null;
}

export async function loadData() {
  const base = buildAllSimData();                 // 10 simulated stations
  const usingApi = GAS_API_URL && GAS_API_URL !== "YOUR_WEB_APP_URL_HERE";
  if (!usingApi) setApiBanner('unconfigured');
  if (usingApi) {
    if (!firstLoadDone) setApiBanner('loading');
    const raw    = await fetchData();
    const parsed = parseApiData(raw);             // updates connectivity panel on success
    // Whatever happened, the "loading" state is over; failures show the red
    // error banner (fetchData) and the stale banner (updateDashboard).
    setApiBanner('hidden');
    firstLoadDone = true;
    if (parsed) {
      // Overlay each real sensor onto the simulated base (id 1 -> index 0).
      Object.keys(parsed).forEach(idx => { base[idx] = parsed[idx]; });
      try { localStorage.setItem('kabstar_lastdata', JSON.stringify(parsed)); } catch (e) {}
    } else {
      // Fetch/parse failed — fall back to the last good real data (if cached)
      // so a transient outage doesn't swap the real station to simulated.
      let cached = null;
      try { cached = JSON.parse(localStorage.getItem('kabstar_lastdata') || 'null'); } catch (e) {}
      if (cached) Object.keys(cached).forEach(idx => { base[idx] = cached[idx]; });
      updateConnectivityPanel(null);              // real node offline / no data yet
    }
  }
  state.allData = base;
}

/** Replace the quick first read with the full DASHBOARD_READ_LIMIT window. */
export async function loadFullHistory() {
  const usingApi = GAS_API_URL && GAS_API_URL !== "YOUR_WEB_APP_URL_HERE";
  if (!usingApi || readN === DASHBOARD_READ_LIMIT) return;
  readN  = DASHBOARD_READ_LIMIT;
  rawApi = null;   // next fetch is a full read, not an incremental merge
  apiCursor = null;
  await loadData();
  if (CAL.open) { calendarSetData(calendarTimestamps()); calRender(); }
  updateDashboard(state.activeStation);
}
