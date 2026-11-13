/* Tide maths: a harmonic fit for the predicted curve, the rising / falling /
   high / low status, the rate of change, and detection of high and low waters. */

import { TIDE_EVENT_PROM_M, TIDE_EVENT_SEP_MS, TIDE_MIN_RANGE_M } from '../config.js';
import { T } from '../i18n.js';
import { robustInlierMask } from './anomalies.js';
import { fmtEventLabel } from '../ui/tide-events.js';

/* ═══════════════════════════════════════════════════
   HARMONIC TIDE FIT (least-squares) — measured vs predicted
   Fits mean + M2/S2/K1/O1 to the timestamped data and returns a
   predicted series + RMS residual (≈ storm-surge / model error).
═══════════════════════════════════════════════════ */
function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => row.slice().concat(b[i]));   // augmented
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++)
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) return null;          // singular
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col];
    for (let j = col; j <= n; j++) M[col][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      for (let j = col; j <= n; j++) M[r][j] -= f * M[col][j];
    }
  }
  return M.map(row => row[n]);
}

export function harmonicFit(values, timestamps) {
  if (!timestamps || timestamps.length !== values.length) return null;
  const HOUR = 3600 * 1000;

  const ts = [], ys = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i], t = new Date(timestamps[i]).getTime();
    if (v !== null && !isNaN(v) && !isNaN(t)) { ts.push(t); ys.push(v); }
  }
  if (ys.length < 12) return null;
  const spanH = (ts[ts.length - 1] - ts[0]) / HOUR;
  if (spanH < 6) return null;   // too short to fit tides

  // Fit only constituents the window can tell apart (Rayleigh criterion: two
  // frequencies separate after 1/|f1 − f2| of record — M2/S2 ≈ 14.8 days,
  // K1/O1 ≈ 13.7 days, M2/K1 ≈ 1.1 days). Unresolvable pairs make the normal
  // equations near-singular: huge, cancelling amplitudes and a meaningless fit.
  const periods = spanH >= 15 * 24 ? [12.4206, 12.0, 23.9345, 25.8194]   // M2 S2 K1 O1
                : spanH >= 26      ? [12.4206, 23.9345]                  // M2 K1
                :                    [12.4206];                          // M2
  const omegas = periods.map(h => 2 * Math.PI / (h * HOUR));

  const ncol = 1 + 2 * omegas.length;
  const t0 = ts[0];
  const designRow = (t) => {
    const r = [1];
    for (const w of omegas) { r.push(Math.cos(w * (t - t0))); r.push(Math.sin(w * (t - t0))); }
    return r;
  };

  const XtX = Array.from({ length: ncol }, () => new Array(ncol).fill(0));
  const Xty = new Array(ncol).fill(0);
  for (let k = 0; k < ts.length; k++) {
    const r = designRow(ts[k]);
    for (let a = 0; a < ncol; a++) {
      Xty[a] += r[a] * ys[k];
      for (let b = 0; b < ncol; b++) XtX[a][b] += r[a] * r[b];
    }
  }
  const c = solveLinear(XtX, Xty);
  if (!c) return null;

  const pred = timestamps.map(tsStr => {
    const t = new Date(tsStr).getTime();
    if (isNaN(t)) return null;
    const r = designRow(t);
    let y = 0; for (let a = 0; a < ncol; a++) y += r[a] * c[a];
    return Math.round(y * 1000) / 1000;
  });

  let sse = 0, n = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] !== null && !isNaN(values[i]) && pred[i] !== null) {
      const e = values[i] - pred[i]; sse += e * e; n++;
    }
  }
  return { pred, rms: n ? Math.sqrt(sse / n) : null };
}

export function getTideStatus(values, timestamps) {
  // Collect valid (time, value) pairs so gaps and adaptive spacing don't skew
  // the rising/falling decision.
  const inlier = robustInlierMask(values, 6, TIDE_MIN_RANGE_M);
  const pts = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!inlier[i]) continue;                       // null, NaN or a spike
    const t = (timestamps && timestamps[i]) ? new Date(timestamps[i]).getTime() : i;
    pts.push({ t, v });
  }
  if (pts.length < 4) return { status: 'unknown', label: T('tideUnknown'), cls: 'status-high' };

  const vals  = pts.map(p => p.v);
  const mx    = Math.max(...vals);
  const mn    = Math.min(...vals);
  const range = mx - mn;
  const cur   = pts[pts.length - 1].v;
  const highThresh = mn + range * 0.80;
  const lowThresh  = mn + range * 0.20;

  // Rising/falling: mean of the most-recent 30 min vs the prior 30 min (by time).
  const lastT = pts[pts.length - 1].t;
  const HALF  = 30 * 60 * 1000;
  const recent = pts.filter(p => p.t >  lastT - HALF);
  const older  = pts.filter(p => p.t <= lastT - HALF && p.t > lastT - 2 * HALF);
  let diff;
  if (recent.length && older.length) {
    diff = recent.reduce((a,p) => a+p.v, 0) / recent.length -
           older.reduce((a,p) => a+p.v, 0) / older.length;
  } else {
    diff = cur - pts[Math.max(0, pts.length - 5)].v;   // fallback slope
  }

  // A "high/low water" call needs a tide-sized window; a few cm of range is
  // noise or a bench test, and must not be read as a tidal state.
  if (range > TIDE_MIN_RANGE_M && cur >= highThresh) return { status: 'high',    label: T('tideHigh'),    cls: 'status-high' };
  if (range > TIDE_MIN_RANGE_M && cur <= lowThresh)  return { status: 'low',     label: T('tideLow'),     cls: 'status-low'  };
  if (diff > 0.005)                       return { status: 'rising',  label: T('tideRising'),  cls: 'status-rising'  };
  if (diff < -0.005)                      return { status: 'falling', label: T('tideFalling'), cls: 'status-falling' };
  return { status: 'high', label: T('tideStable'), cls: 'status-high' };
}

export function getRateOfChange(values, timestamps) {
  // Anchor on the most-recent VALID reading — the real station's latest point can
  // be a null gap, which would otherwise coerce to 0 and report a bogus rate.
  let lastIdx = values.length - 1;
  while (lastIdx >= 0 && (values[lastIdx] === null || isNaN(values[lastIdx]))) lastIdx--;
  if (lastIdx < 1) return '0.0';
  const last = values[lastIdx];

  // Preferred: true mm/min using ACTUAL elapsed time, looking back ~60 min.
  // The node's sampling interval is adaptive (10–120 s), so a fixed
  // point-count assumption would give a wrong rate.
  if (timestamps && timestamps.length === values.length) {
    const lastMs = new Date(timestamps[lastIdx]).getTime();
    if (!isNaN(lastMs)) {
      const targetMs = lastMs - 60 * 60 * 1000;
      let i = lastIdx;
      while (i > 0 && new Date(timestamps[i]).getTime() > targetMs) i--;
      while (i < lastIdx && (values[i] === null || isNaN(values[i]))) i++;  // skip gaps
      const prevMs = new Date(timestamps[i]).getTime();
      const mins   = (lastMs - prevMs) / 60000;
      if (mins > 0.1 && values[i] !== null && !isNaN(values[i])) {
        return ((last - values[i]) * 1000 / mins).toFixed(1);  // mm/min
      }
    }
  }

  // Fallback (no usable timestamps): assume ~10-min spacing as before.
  let pIdx = lastIdx - 6;
  while (pIdx < lastIdx && (values[pIdx] === null || isNaN(values[pIdx]))) pIdx++;
  const prev = (pIdx >= 0 && values[pIdx] != null && !isNaN(values[pIdx])) ? values[pIdx] : last;
  return ((last - prev) * 1000 / 60).toFixed(1);
}

/**
 * High/low tide turning points — zig-zag detector with prominence and
 * minimum separation. A turning point only counts once the series has
 * reversed by ≥ TIDE_EVENT_PROM_M, and consecutive events must be at least
 * TIDE_EVENT_SEP_MS apart. Outliers are removed first. Sub-cm wiggles and
 * handling spikes therefore never become "Air Pasang / Air Surut".
 */
export function findTideEvents(values, timestamps, labels) {
  const mask = robustInlierMask(values, 6, TIDE_EVENT_PROM_M);
  const pts = [];
  for (let i = 0; i < values.length; i++) {
    if (!mask[i]) continue;
    const t = (timestamps && timestamps[i]) ? new Date(timestamps[i]).getTime() : NaN;
    pts.push({ v: values[i], t: isNaN(t) ? i * 60000 : t, l: (labels && labels[i]) || '' });
  }
  if (pts.length < 5) return [];

  const raw = [];
  let dir = 0;                 // 0 = undetermined, 1 = rising (tracking a max), -1 = falling
  let cand = 0;                // index of the current candidate turning point
  let minI = 0, maxI = 0;      // running extremes while direction is unknown
  for (let i = 1; i < pts.length; i++) {
    const v = pts[i].v;
    if (dir === 0) {
      if (v < pts[minI].v) minI = i;
      if (v > pts[maxI].v) maxI = i;
      if (pts[maxI].v - pts[minI].v >= TIDE_EVENT_PROM_M) {
        // The first extreme is a real turning point only if the series had
        // already moved INTO it by the prominence — otherwise it is simply
        // where the window starts, not a high or low water.
        const before = pts.slice(0, Math.min(minI, maxI) + 1).map(p => p.v);
        if (minI < maxI) {
          if (Math.max(...before) - pts[minI].v >= TIDE_EVENT_PROM_M) raw.push({ type: 'low', i: minI });
          dir = 1;  cand = maxI;
        } else {
          if (pts[maxI].v - Math.min(...before) >= TIDE_EVENT_PROM_M) raw.push({ type: 'high', i: maxI });
          dir = -1; cand = minI;
        }
      }
      continue;
    }
    if (dir === 1) {
      if (v > pts[cand].v) { cand = i; continue; }
      if (pts[cand].v - v >= TIDE_EVENT_PROM_M) { raw.push({ type: 'high', i: cand }); dir = -1; cand = i; }
    } else {
      if (v < pts[cand].v) { cand = i; continue; }
      if (v - pts[cand].v >= TIDE_EVENT_PROM_M) { raw.push({ type: 'low', i: cand }); dir = 1; cand = i; }
    }
  }

  const events = [];
  let lastT = -Infinity;
  raw.forEach(e => {
    const pt = pts[e.i];
    if (pt.t - lastT < TIDE_EVENT_SEP_MS) return;   // too close to the previous event → noise
    lastT = pt.t;
    events.push({ type: e.type, v: pt.v, l: fmtEventLabel(pt.t, pt.l) });
  });
  return events.slice(-6).reverse();  // most recent first
}
