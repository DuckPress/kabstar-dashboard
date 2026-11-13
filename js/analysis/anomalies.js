/* Flags readings that jump away from their neighbours (spikes, dropouts),
   shown as red markers on the water-level chart. */

/* ═══════════════════════════════════════════════════
   CHART RENDERING
═══════════════════════════════════════════════════ */
/**
 * Detect anomalies in a value series using the IQR method.
 * Returns an array of booleans (true = anomaly) the same length as values.
 * A value is anomalous if it jumps more than MAX_JUMP_M metres in one step
 * OR falls outside [Q1 - 3*IQR, Q3 + 3*IQR].
 */
export function detectAnomalies(values, timestamps) {
  // Rate threshold (m/min) instead of a per-step jump — correct under the
  // node's adaptive 10–120 s sampling. 0.05 m/min ≈ 0.5 m per 10 min.
  const MAX_RATE_M_PER_MIN = 0.05;
  const flags = new Array(values.length).fill(false);
  if (values.length < 4) return flags;

  // IQR bounds (distribution-based — independent of sampling interval)
  const sorted = [...values].filter(v => v !== null && !isNaN(v)).sort((a, b) => a - b);
  if (sorted.length < 4) return flags;
  const q1  = sorted[Math.floor(sorted.length * 0.25)];
  const q3  = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lo  = q1 - 3 * iqr;
  const hi  = q3 + 3 * iqr;

  let prevIdx = -1;   // last VALID index (skips gaps)
  values.forEach((v, i) => {
    if (v === null || isNaN(v)) return;
    if (v < lo || v > hi) { flags[i] = true; prevIdx = i; return; }   // IQR outlier
    if (prevIdx >= 0) {
      let mins = 10;   // fallback when timestamps are unavailable
      if (timestamps && timestamps[i] && timestamps[prevIdx]) {
        const dt = (new Date(timestamps[i]).getTime() -
                    new Date(timestamps[prevIdx]).getTime()) / 60000;
        if (dt > 0.1) mins = dt;
      }
      if (Math.abs(v - values[prevIdx]) / mins > MAX_RATE_M_PER_MIN) flags[i] = true;
    }
    prevIdx = i;
  });
  return flags;
}

/* ═══════════════════════════════════════════════════
   HIGH / LOW TIDE EVENTS — local turning points
═══════════════════════════════════════════════════ */
/**
 * Robust inlier mask (median ± k·MAD) for a numeric series. Rejects the
 * metre-scale spikes a hand or a passing object puts into a radar record
 * without touching a genuine tide: the MAD of a real tidal window is tens of
 * cm, so the k·MAD band is metres wide there; on a flat record MAD ≈ 0 and
 * the band collapses to `floor`, which is still generous for real noise.
 * Nulls/NaN are simply marked false.
 */
export function robustInlierMask(values, k, floor) {
  k = k || 6; floor = (floor === undefined) ? 0.10 : floor;
  const valid = values.filter(v => v !== null && !isNaN(v)).slice().sort((a, b) => a - b);
  if (valid.length < 4) return values.map(v => v !== null && !isNaN(v));
  const med = valid[Math.floor(valid.length / 2)];
  const dev = valid.map(v => Math.abs(v - med)).sort((a, b) => a - b);
  const mad = dev[Math.floor(dev.length / 2)] * 1.4826;
  const band = Math.max(k * mad, floor);
  return values.map(v => v !== null && !isNaN(v) && Math.abs(v - med) <= band);
}
