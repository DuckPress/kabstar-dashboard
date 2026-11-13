/* The time-window toolbar: preset buttons (6 h, 24 h, 7 d …), the point cap,
   the reset and "latest" buttons, and saving the window in the page address. */

import { state } from '../state.js';
import { STATIONS } from '../config.js';
import { T } from '../i18n.js';
import { longHistory, longSeriesFor, windowNeedsLong } from '../data/long-history.js';
import { updateDashboard } from './dashboard.js';
import { CAL, calClose, calRender, calUpdateLabel } from './calendar.js';

/* ═══════════════════════════════════════════════════
   CUSTOM CALENDAR PICKER
   Shows a month grid with dots on dates that have
   actual readings.  Replaces the native datetime-local
   inputs which cannot highlight individual dates.
═══════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════
   TIME WINDOW — presets, single range calendar, URL state
   state.chartFilter is the single source of truth:
     preset      : '1h'|'3h'|'6h'|'12h'|'24h'|'7d'|'15d'|'30d'|'today'|'all'|null
     dtFrom/dtTo : "YYYY-MM-DDTHH:mm" (minute) — derived from the preset, or a
                   custom range (calendar / drag-brush), or null
     maxPts      : cap on the newest N points; only used when no dtFrom/dtTo
   Presets are TIME-based and anchored to the newest reading of the active
   station, so "24J" is 24 hours at ANY sampling cadence (the old point-count
   presets assumed 10-min sampling and showed 2.4 h at the 60 s cadence), and
   an offline station still shows its last day instead of an empty chart.
═══════════════════════════════════════════════════ */
const PRESET_MS = {
  '1h': 3600e3, '3h': 3 * 3600e3, '6h': 6 * 3600e3, '12h': 12 * 3600e3, '24h': 24 * 3600e3,
  '7d': 7 * 86400e3, '15d': 15 * 86400e3, '30d': 30 * 86400e3,
};
export const DEFAULT_PRESET = '24h';

function tsToMs(ts) { const m = new Date(ts).getTime(); return isNaN(m) ? null : m; }
// Local wall-clock "YYYY-MM-DDTHH:mm". Timestamps are zone-less MYT wall-clock
// strings that Date parses as LOCAL; formatting back with local getters keeps
// the arithmetic self-consistent whatever zone the browser is in.
function msToLocalMin(ms) {
  const d = new Date(ms), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtTsShort(ts) {   // "YYYY-MM-DDTHH:mm…" → "DD/MM HH:mm"
  return (ts && ts.length >= 16) ? `${ts.substring(8, 10)}/${ts.substring(5, 7)} ${ts.substring(11, 16)}` : (ts || '');
}
export function fmtTsLong(ts) {    // → "DD/MM/YYYY HH:mm"
  return (ts && ts.length >= 16) ? `${ts.substring(8, 10)}/${ts.substring(5, 7)}/${ts.substring(0, 4)} ${ts.substring(11, 16)}` : (ts || '');
}
function fmtDuration(ms) {
  const en = state.lang === 'en';
  const min = Math.round(ms / 60000), h = Math.floor(min / 60), d = Math.floor(h / 24);
  if (min < 60) return `${min}m`;
  if (h < 48)   return `${h}${en ? 'h' : 'j'} ${min % 60}m`;
  return `${d}${en ? 'd' : 'h'} ${h % 24}${en ? 'h' : 'j'}`;
}

export function activeSeries()   { return (state.allData && state.allData[state.activeStation]) ? state.allData[state.activeStation] : null; }
function activeTotalPts() { const d = activeSeries(); return (d && d.values) ? d.values.length : 144; }
/** Newest timestamp of the active station, or null. */
function windowAnchorTs() {
  const d = activeSeries(); if (!d) return null;
  const ts = d.timestamps || [];
  for (let i = ts.length - 1; i >= 0; i--) if (ts[i]) return ts[i];
  return null;
}

/** Apply a preset window anchored to the newest reading. */
export function applyPreset(preset, opts) {
  opts = opts || {};
  if (!(preset in PRESET_MS) && preset !== 'all' && preset !== 'today') preset = DEFAULT_PRESET;
  state.chartFilter.preset = preset;
  state.chartFilter.maxPts = activeTotalPts();
  CAL.picking = false;
  if (preset === 'all') {
    state.chartFilter.dtFrom = null;
  } else {
    const a = windowAnchorTs();
    const aMs = a ? tsToMs(a) : null;
    if (preset === 'today') state.chartFilter.dtFrom = a ? a.substring(0, 10) + 'T00:00' : null;
    else                    state.chartFilter.dtFrom = (aMs !== null) ? msToLocalMin(aMs - PRESET_MS[preset]) : null;
  }
  state.chartFilter.dtTo = null;
  syncWindowUI();
  if (!opts.silent) applyChartFilter();   // (updateDashboard fetches long data if needed)
}

/** Newest-N-points mode (the advanced slider). */
function applyPointCap(n) {
  const total = activeTotalPts();
  n = Math.max(6, Math.min(parseInt(n, 10) || 6, total));
  state.chartFilter.preset = null; state.chartFilter.dtFrom = null; state.chartFilter.dtTo = null;
  state.chartFilter.maxPts = n; CAL.picking = false;
  syncWindowUI();
  applyChartFilter();
}

/** Custom range (calendar / drag-brush). */
export function applyCustomRange(from, to, opts) {
  opts = opts || {};
  state.chartFilter.preset = null;
  state.chartFilter.dtFrom = from || null; state.chartFilter.dtTo = to || null;
  state.chartFilter.maxPts = activeTotalPts();
  if (to) CAL.picking = false;
  syncWindowUI();
  if (!opts.silent) applyChartFilter();
}

/** Push state.chartFilter into every control + the URL. */
function syncWindowUI() {
  document.querySelectorAll('.zoom-preset-btn').forEach(b => b.classList.toggle('active', b.dataset.preset === state.chartFilter.preset));
  syncZoomMore();
  const slider = document.getElementById('pts-slider'), input = document.getElementById('pts-input');
  if (slider) slider.value = state.chartFilter.maxPts;
  if (input)  input.value  = state.chartFilter.maxPts;
  calUpdateLabel();
  if (CAL.open) calRender();
  writeUrlState();
}
export function updateWindowSpan(filtTimestamps, shownPts, aggS) {
  state.lastSpan = { ts: filtTimestamps, n: shownPts, aggS: aggS || 0 };
  const el = document.getElementById('window-span'); if (!el) return;
  const ts = (filtTimestamps || []).filter(Boolean);
  // What kind of points these are, and — for a window longer than the raw
  // read — whether its long-window means are still loading / unavailable.
  let note = '';
  if (aggS) note = ` · ${T('aggMeans', { m: Math.round(aggS / 60) })}`;
  else if (windowNeedsLong(state.activeStation) && !longSeriesFor(state.activeStation)) {
    note = longHistory.loading ? ` · ${T('longLoading')}`
         : longHistory.unsupported ? ` · ${T('longOld')}` : '';
  }
  if (ts.length < 2) { el.textContent = '—' + note; return; }
  const a = tsToMs(ts[0]), b = tsToMs(ts[ts.length - 1]);
  const dur = (a !== null && b !== null) ? fmtDuration(b - a) : '';
  el.textContent = `${fmtTsShort(ts[0])} – ${fmtTsShort(ts[ts.length - 1])}` +
                   (dur ? ` · ${dur}` : '') + ` · ${shownPts} ${T('ptsWord')}` + note;
}

function clearSelectionBar() {
  const selBar = document.getElementById('chart-selection-bar'); if (selBar) selBar.classList.remove('visible');
  const hint = document.getElementById('chart-drag-hint');      if (hint)   hint.style.opacity = '1';
}

// ── URL state (?station=&preset= | &from=&to= | &pts=) ─────────────────────
// Makes a view shareable/bookmarkable ("look at this exact window").
function writeUrlState() {
  try {
    const p = new URLSearchParams();
    p.set('station', String(state.activeStation));
    if (state.chartFilter.preset) p.set('preset', state.chartFilter.preset);
    else if (state.chartFilter.dtFrom || state.chartFilter.dtTo) {
      if (state.chartFilter.dtFrom) p.set('from', state.chartFilter.dtFrom);
      if (state.chartFilter.dtTo)   p.set('to',   state.chartFilter.dtTo);
    } else p.set('pts', String(state.chartFilter.maxPts));
    history.replaceState(null, '', location.pathname + '?' + p.toString());
  } catch (e) {}
}
/** Restore station + window from the URL (URL beats the saved station). Call once after data has loaded, before the first render. */
export function applyUrlState() {
  let p; try { p = new URLSearchParams(location.search); } catch (e) { p = null; }
  if (p) {
    const st = parseInt(p.get('station'), 10);
    if (!isNaN(st) && st >= 0 && st < STATIONS.length) state.activeStation = st;
    const isMin = v => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v || '');
    const preset = p.get('preset');
    if (preset) { applyPreset(preset, { silent: true }); return; }
    const from = p.get('from'), to = p.get('to');
    if (isMin(from) || isMin(to)) { applyCustomRange(isMin(from) ? from : null, isMin(to) ? to : null, { silent: true }); return; }
    const pts = parseInt(p.get('pts'), 10);
    if (!isNaN(pts) && pts >= 6) {
      state.chartFilter.preset = null; state.chartFilter.dtFrom = null; state.chartFilter.dtTo = null;
      state.chartFilter.maxPts = Math.min(pts, activeTotalPts());
      syncWindowUI(); return;
    }
  }
  applyPreset(DEFAULT_PRESET, { silent: true });
}

/* ═══════════════════════════════════════════════════
   CHART CONTROLS — slider, textbox, datetime range
═══════════════════════════════════════════════════ */

/** Re-render the main chart using the current state.chartFilter state. */
export function applyChartFilter() {
  if (!state.allData) return;
  updateDashboard(state.activeStation);   // charts update in place (no destroy/recreate)
}

// ── Reset: back to the default preset window ─────────────────────────────────
function doResetFilter() {
  calClose();
  clearSelectionBar();
  applyPreset(DEFAULT_PRESET);
}

// ── "More" presets menu ──────────────────────────────────────────────────────
// The four common windows sit in the segmented control; the rest live in this
// menu. Its button shows the chosen one when that is active.
export function syncZoomMore() {
  const lbl = document.getElementById('zoom-more-label');
  const btn = document.getElementById('zoom-more-btn');
  if (!lbl || !btn) return;
  const chosen = document.querySelector('#zoom-more-menu .zoom-preset-btn.active');
  lbl.textContent = chosen ? chosen.textContent : T('more');
  btn.classList.toggle('active', !!chosen);
}
function setZoomMenu(open) {
  const wrap = document.getElementById('zoom-more');
  const btn  = document.getElementById('zoom-more-btn');
  if (!wrap || !btn) return;
  wrap.classList.toggle('open', open);
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

/** Wire this file's buttons and listeners (called once from main.js). */
export function setupTimeWindow() {
  // ── Slider ↔ textbox sync ────────────────────────────────────────────────────
  document.getElementById('pts-slider').addEventListener('input', function () { applyPointCap(this.value); });
  document.getElementById('pts-input').addEventListener('change', function () { applyPointCap(this.value); });
  document.getElementById('pts-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') this.dispatchEvent(new Event('change'));
  });
  const zoomResetInline = document.getElementById('zoom-reset-inline-btn');
  if (zoomResetInline) zoomResetInline.addEventListener('click', doResetFilter);

  // ── Advanced (point-cap slider) disclosure, remembered per browser ───────────
  (function () {
    const adv = document.getElementById('ctrl-advanced');
    const tog = document.getElementById('ctrl-adv-toggle');
    if (!adv || !tog) return;
    let open = false; try { open = localStorage.getItem('kabstar_adv') === '1'; } catch (e) {}
    adv.classList.toggle('open', open); tog.setAttribute('aria-expanded', String(open));
    tog.addEventListener('click', () => {
      const now = !adv.classList.contains('open');
      adv.classList.toggle('open', now); tog.setAttribute('aria-expanded', String(now));
      try { localStorage.setItem('kabstar_adv', now ? '1' : '0'); } catch (e) {}
    });
  })();

  // ── Preset buttons (time-based; see TIME WINDOW) ─────────────────────────────
  document.querySelectorAll('.zoom-preset-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      calClose();
      clearSelectionBar();
      applyPreset(this.dataset.preset);
    });
  });
  (function wireZoomMore() {
    const btn = document.getElementById('zoom-more-btn');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      setZoomMenu(!document.getElementById('zoom-more').classList.contains('open'));
    });
    document.querySelectorAll('#zoom-more-menu .zoom-preset-btn').forEach(b =>
      b.addEventListener('click', () => setZoomMenu(false)));
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#zoom-more')) setZoomMenu(false);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setZoomMenu(false); });
  })();

  // ── "Terkini": re-anchor to the newest reading ───────────────────────────────
  const zoomLiveBtn = document.getElementById('zoom-live-btn');
  if (zoomLiveBtn) {
    zoomLiveBtn.addEventListener('click', () => {
      calClose();
      clearSelectionBar();
      if (state.chartFilter.preset) applyPreset(state.chartFilter.preset);   // same window, newest data
      else applyPreset(DEFAULT_PRESET);                          // custom range/cap → the default newest window
    });
  }
}
