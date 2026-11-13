/* Reduces long series to a few hundred points without losing their shape
   (the LTTB algorithm), so charts stay fast. */

/**
 * Largest-Triangle-Three-Buckets: indices of about `target` points that keep
 * the line's shape (peaks, troughs), always including the first and last.
 * x = index — readings are near-uniform in time. A bucket holding a gap (null)
 * also keeps one null so the drawn line still breaks there. null = no thinning.
 */
export function lttbIndices(values, target) {
  const n = values.length;
  if (n <= target || target < 3) return null;
  const ok = i => values[i] !== null && values[i] !== undefined && !isNaN(values[i]);
  const out = [0];
  const size = (n - 2) / (target - 2);
  let a = 0;                                    // last selected index
  for (let b = 0; b < target - 2; b++) {
    const start = Math.floor(b * size) + 1;
    const end   = Math.min(Math.floor((b + 1) * size) + 1, n - 1);
    // Average of the NEXT bucket — the third corner of each triangle.
    const nStart = end, nEnd = Math.min(Math.floor((b + 2) * size) + 1, n);
    let ax = 0, ay = 0, cnt = 0;
    for (let i = nStart; i < nEnd; i++) if (ok(i)) { ax += i; ay += values[i]; cnt++; }
    if (cnt) { ax /= cnt; ay /= cnt; } else { ax = nEnd - 1; ay = ok(a) ? values[a] : 0; }
    let best = -1, bestArea = -1, gap = -1;
    const pa = ok(a) ? values[a] : ay;
    for (let i = start; i < end; i++) {
      if (!ok(i)) { if (gap < 0) gap = i; continue; }
      const area = Math.abs((a - ax) * (values[i] - pa) - (a - i) * (ay - pa));
      if (area > bestArea) { bestArea = area; best = i; }
    }
    if (gap >= 0) out.push(gap);
    if (best >= 0) { out.push(best); a = best; }
  }
  out.push(n - 1);
  return Array.from(new Set(out)).sort((x, y) => x - y);
}
