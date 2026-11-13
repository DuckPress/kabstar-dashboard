/* Cuts a series down to the selected time window (a preset, a date range
   or a newest-N-points cap) and keeps the other series aligned with it. */

import { state } from '../state.js';

/* ═══════════════════════════════════════════════════
   FILTER HELPER — applies state.chartFilter to raw data
═══════════════════════════════════════════════════ */
/**
 * Returns { labels, values, timestamps } after applying:
 *   1. Datetime range (dtFrom / dtTo)  — filters by timestamp string
 *   2. Point count cap (maxPts)        — keeps the N most-recent remaining points
 *
 * Each label is "HH:mm" and each timestamps[i] is a Date object built from
 * today's date combined with the label (good enough for 24 h windows).
 * When the API is live, labels come from the server; for sim data labels are
 * already "HH:mm" strings generated relative to now.
 */
// capPts: the newest-N cap for the no-range case (default state.chartFilter.maxPts,
// which counts RAW readings — a long-window series passes its own length).
export function getFilteredData(rawLabels, rawValues, rawTimestamps, capPts) {
  let labels     = rawLabels.slice();
  let values     = rawValues.slice();
  let timestamps = rawTimestamps ? rawTimestamps.slice() : rawLabels.slice();

  const hasFilter = !!(state.chartFilter.dtFrom || state.chartFilter.dtTo);

  // ── Step 1: timestamp range filter ────────────────────────────────────────
  // Uses the stored "YYYY-MM-DDTHH:mm" strings — lexicographic = chronological.
  if (hasFilter) {
    const fromStr = state.chartFilter.dtFrom || null;  // "YYYY-MM-DDTHH:mm" or null
    const toStr   = state.chartFilter.dtTo   || null;
    const filtered = timestamps.reduce((acc, ts, i) => {
      const tsMin  = ts.substring(0, 16);            // "YYYY-MM-DDTHH:mm" — same resolution as the pickers
      const inFrom = !fromStr || tsMin >= fromStr;
      const inTo   = !toStr   || tsMin <= toStr;
      if (inFrom && inTo) acc.push({ lbl: labels[i], val: values[i], ts });
      return acc;
    }, []);
    labels     = filtered.map(f => f.lbl);
    values     = filtered.map(f => f.val);
    timestamps = filtered.map(f => f.ts);
  }

  // ── Step 2: point count cap ────────────────────────────────────────────────
  // Skip when a filter is active — the range defines the window.
  if (!hasFilter) {
    const n = Math.max(1, Math.min(capPts || state.chartFilter.maxPts, labels.length));
    labels     = labels.slice(-n);
    values     = values.slice(-n);
    timestamps = timestamps.slice(-n);
  }

  return { labels, values, timestamps };
}

// Apply the SAME window rule as getFilteredData() to a parallel per-reading
// series (temperature, humidity, ultrasonic level…): the date range when one
// is set, otherwise the newest-N cap. Returns [] when the series doesn't line
// up with the readings (caller falls back to the unfiltered array).
export function alignToFilter(arr, rawLabels, rawTs, capPts) {
  if (!arr || arr.length !== rawLabels.length) return [];
  const hasFilter = !!(state.chartFilter.dtFrom || state.chartFilter.dtTo);
  if (!hasFilter) {
    const n = Math.max(1, Math.min(capPts || state.chartFilter.maxPts, arr.length));
    return arr.slice(-n);
  }
  const fromStr = state.chartFilter.dtFrom || null;
  const toStr   = state.chartFilter.dtTo   || null;
  const out = [];
  rawTs.forEach((ts, i) => {
    const tsMin = ts.substring(0, 16);
    if ((!fromStr || tsMin >= fromStr) && (!toStr || tsMin <= toStr)) out.push(arr[i]);
  });
  return out;
}
