/* Shared chart look: colours for light and dark mode, and the time axis
   (tick spacing and labels in Malaysia time). */

import { CHART_FONT, MYT_OFFSET_MS } from '../config.js';

/** Colours the charts use for the current light/dark theme. */
export function chartTheme() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  return dark
    ? { line: '#6f9bff', fillTop: 'rgba(111,155,255,0.22)', fillBot: 'rgba(111,155,255,0.02)',
        grid: 'rgba(255,255,255,0.06)', tick: '#959ec0', us: 'rgba(170,178,204,0.85)',
        usSolid: '#aab2cc', usFillTop: 'rgba(170,178,204,0.22)', usFillBot: 'rgba(170,178,204,0.02)' }
    : { line: '#1e4096', fillTop: 'rgba(30,64,150,0.18)', fillBot: 'rgba(30,64,150,0.01)',
        grid: 'rgba(0,0,0,0.05)', tick: '#6b748f', us: 'rgba(107,116,143,0.80)',
        usSolid: '#6b748f', usFillTop: 'rgba(107,116,143,0.20)', usFillBot: 'rgba(107,116,143,0.01)' };
}

/** Epoch ms of a Malaysia-local "YYYY-MM-DDTHH:mm[:ss]" stamp, NaN if unusable. */
export function mytMs(ts) {
  if (!ts || ts.length < 16) return NaN;
  return Date.parse(ts.slice(0, 16) + ':' + (ts.length >= 19 ? ts.slice(17, 19) : '00') + '+08:00');
}

// Tick spacing for a time axis: the first step giving at most `maxTicks` ticks.
const TIME_STEPS_MS = [1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440, 2880, 10080]
  .map(m => m * 60000);
function timeTickStep(spanMs, maxTicks) {
  return TIME_STEPS_MS.find(s => spanMs / s <= maxTicks) || TIME_STEPS_MS[TIME_STEPS_MS.length - 1];
}

/** Axis label for an instant, in Malaysia time, sized to the window span. */
function fmtAxisTime(ms, spanMs) {
  const d  = new Date(ms + MYT_OFFSET_MS);
  const p  = n => String(n).padStart(2, '0');
  const hm = p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
  const dm = p(d.getUTCDate()) + '/' + p(d.getUTCMonth() + 1);
  if (spanMs > 3 * 86400000) return dm;
  if (spanMs > 18 * 3600000) return [hm, dm];
  return hm;
}

/**
 * Linear x-axis config that reads as a time axis: ticks on round Malaysia-time
 * boundaries (built in afterBuildTicks), labelled by fmtAxisTime. With xs = null
 * (no usable timestamps) it falls back to the point index and its label.
 */
export function timeAxisX(xs, labels, theme) {
  const timed = !!xs;
  const min = timed ? xs[0] : 0;
  const max = timed ? xs[xs.length - 1] : Math.max(0, labels.length - 1);
  const span = Math.max(1, max - min);
  const maxTicks = window.innerWidth < 600 ? 5 : 10;
  return {
    type: 'linear',
    min, max,
    grid: { color: theme.grid, drawBorder: false },
    afterBuildTicks: (axis) => {
      if (!timed) return;
      const step = timeTickStep(span, maxTicks);
      const off  = MYT_OFFSET_MS;
      const ticks = [];
      for (let t = Math.ceil((min + off) / step) * step - off; t <= max; t += step) ticks.push({ value: t });
      axis.ticks = ticks;
    },
    ticks: {
      color: theme.tick,
      font: { size: 10, family: CHART_FONT },
      maxRotation: 0,
      autoSkip: !timed,
      maxTicksLimit: maxTicks,
      callback: (v) => timed ? fmtAxisTime(v, span) : (labels[Math.round(v)] || ''),
    },
  };
}

/**
 * Lines break across real outages: consecutive points farther apart than this
 * are not joined. 3x the typical interval, never under 10 minutes.
 */
export function gapSpanMs(xs) {
  if (!xs || xs.length < 3) return 10 * 60000;
  const d = [];
  for (let i = 1; i < xs.length; i++) d.push(xs[i] - xs[i - 1]);
  d.sort((a, b) => a - b);
  return Math.max(10 * 60000, 3 * d[Math.floor(d.length / 2)]);
}
