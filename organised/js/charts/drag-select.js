/* Drag across the main chart to zoom into that span; shows the selection
   statistics bar and the zoom-out button. */

import { state } from '../state.js';
import { DEFAULT_PRESET, applyChartFilter, applyCustomRange, applyPreset } from '../ui/time-window.js';
import { calClose } from '../ui/calendar.js';

/* ═══════════════════════════════════════════════════
   DRAG-SELECT BRUSH ZOOM
   Lets the user click-drag on the main chart canvas
   to select a time range, then zooms into it.
═══════════════════════════════════════════════════ */

const dragState = {
  active:    false,   // currently dragging
  startX:    null,    // pixel X where drag started (canvas-relative)
  endX:      null,    // pixel X where drag ended
  startIdx:  null,    // data index at drag start
  endIdx:    null,    // data index at drag end
};

function getChartArea() {
  if (!state.mainChart) return null;
  return state.mainChart.chartArea;
}

/** Convert a canvas-relative X pixel to the nearest data index */
function xPixelToDataIndex(px) {
  if (!state.mainChart) return null;
  const ca   = state.mainChart.chartArea;
  const meta = state.mainChart.getDatasetMeta(0);
  if (!meta || !meta.data.length) return null;
  // Clamp to chart area
  const clamped = Math.max(ca.left, Math.min(ca.right, px));
  // Binary-search for closest point
  let closest = 0;
  let minDist = Infinity;
  meta.data.forEach((pt, i) => {
    const d = Math.abs(pt.x - clamped);
    if (d < minDist) { minDist = d; closest = i; }
  });
  return closest;
}

function getCanvasRelativeX(canvas, clientX) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  return (clientX - rect.left) * scaleX;
}

function showOverlay(x1, x2) {
  const overlay = document.getElementById('select-overlay');
  if (!overlay || !state.mainChart) return;
  const ca = state.mainChart.chartArea;
  const left  = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  // Convert canvas px → CSS px (canvas may be scaled)
  const canvas = document.getElementById('mainChart');
  const scaleX = canvas.getBoundingClientRect().width / canvas.width;
  overlay.style.left    = (left  * scaleX) + 'px';
  overlay.style.width   = ((right - left) * scaleX) + 'px';
  overlay.style.display = 'block';
}

function hideOverlay() {
  const overlay = document.getElementById('select-overlay');
  if (overlay) overlay.style.display = 'none';
}

/** Called after drag ends — zoom into the selected index range */
function applyDragZoom(i0, i1) {
  if (!state.allData || i0 === null || i1 === null) return;
  const startIdx = Math.min(i0, i1);
  const endIdx   = Math.max(i0, i1);
  if (endIdx - startIdx < 1) return;   // too small, ignore

  // Get the currently rendered labels (post-filter) from the chart
  const chartLabels = state.mainChart._labels || [];
  const chartData   = state.mainChart.data.datasets[0].data.map(p => p.y);

  const selLabels = chartLabels.slice(startIdx, endIdx + 1);
  // Stats from the full-resolution series when the chart is thinned.
  const full = state.mainChart._full;
  const selValues = (full && full.idx)
    ? full.values.slice(full.idx[startIdx], full.idx[endIdx] + 1)
    : chartData.slice(startIdx, endIdx + 1);

  if (!selLabels.length) return;

  function toLocalISO(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth()+1).padStart(2,'0') + '-' +
      String(d.getDate()).padStart(2,'0') + 'T' +
      String(d.getHours()).padStart(2,'0') + ':' +
      String(d.getMinutes()).padStart(2,'0');
  }

  // Prefer the full "YYYY-MM-DDTHH:mm" timestamps stashed by renderMainChart:
  // rebuilding dates from bare "HH:mm" labels has to GUESS the day (wrong on
  // multi-day data), and the old code used the UTC calendar date, which is
  // yesterday's date before 08:00 MYT.
  const tsStrings = state.mainChart._tsStrings || [];
  const tsFrom = tsStrings[startIdx];
  const tsTo   = tsStrings[endIdx];

  let fromStr, toStr;
  if (tsFrom && tsFrom.length >= 16 && tsTo && tsTo.length >= 16) {
    fromStr = tsFrom.slice(0, 16);
    toStr   = tsTo.slice(0, 16);
  } else {
    // Simulated stations only carry "HH:mm" labels — build dates on the
    // LOCAL calendar (sim data is generated relative to local now).
    const today = new Date();
    function lblToDate(lbl) {
      if (!lbl) return null;
      if (lbl.length <= 5) {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate(),
                           parseInt(lbl.slice(0, 2), 10) || 0,
                           parseInt(lbl.slice(3, 5), 10) || 0);
        return d > today ? new Date(d.getTime() - 86400000) : d;
      }
      const d = new Date(lbl);
      return isNaN(d.getTime()) ? null : d;
    }
    const fromDate = lblToDate(selLabels[0]);
    const toDate   = lblToDate(selLabels[selLabels.length - 1]);
    if (!fromDate || !toDate) return;
    fromStr = toLocalISO(fromDate);
    toStr   = toLocalISO(toDate);
  }

  // A brush selection is a custom range: clears the preset, updates the
  // calendar label, slider and URL through the single code path.
  applyCustomRange(fromStr, toStr, { silent: true });

  // Compute stats for the selection bar
  const nums = selValues.filter(v => v !== null && !isNaN(v));
  if (nums.length) {
    const minV = Math.min(...nums);
    const maxV = Math.max(...nums);
    const avgV = nums.reduce((a,b)=>a+b,0) / nums.length;
    const rngV = maxV - minV;

    const selBar = document.getElementById('chart-selection-bar');
    document.getElementById('sel-bar-range').textContent =
      `${selLabels[0]}  →  ${selLabels[selLabels.length-1]}`;
    document.getElementById('sel-stat-pts').textContent = nums.length;
    document.getElementById('sel-stat-min').textContent = minV.toFixed(3) + ' m';
    document.getElementById('sel-stat-max').textContent = maxV.toFixed(3) + ' m';
    document.getElementById('sel-stat-avg').textContent = avgV.toFixed(3) + ' m';
    document.getElementById('sel-stat-rng').textContent = rngV.toFixed(3) + ' m';
    if (selBar) selBar.classList.add('visible');
  }

  // Hide the drag hint once user has made a selection
  const hint = document.getElementById('chart-drag-hint');
  if (hint) hint.style.opacity = '0';

  applyChartFilter();
}

/** Wire up mouse events on the canvas */
export function attachDragSelect() {
  const canvas = document.getElementById('mainChart');
  if (!canvas) return;

  // The canvas element outlives Chart destroy/recreate cycles (e.g. theme
  // changes), so re-attaching here would stack duplicate listeners and fire
  // applyDragZoom several times per drag. Bind once.
  if (canvas.dataset.dragBound) return;
  canvas.dataset.dragBound = '1';

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;     // left button only
    const ca = getChartArea();
    if (!ca) return;
    const px = getCanvasRelativeX(canvas, e.clientX);
    if (px < ca.left || px > ca.right) return;   // outside plot area
    dragState.active = true;
    dragState.startX = px;
    dragState.endX   = px;
    dragState.startIdx = xPixelToDataIndex(px);
    canvas.style.cursor = 'ew-resize';
    e.preventDefault();
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!dragState.active) return;
    const px = getCanvasRelativeX(canvas, e.clientX);
    dragState.endX = px;
    showOverlay(dragState.startX, dragState.endX);
  });

  function endDrag(e) {
    if (!dragState.active) return;
    dragState.active = false;
    canvas.style.cursor = 'crosshair';
    const px = getCanvasRelativeX(canvas, e.clientX ?? dragState.endX);
    dragState.endIdx = xPixelToDataIndex(px);
    hideOverlay();

    const dist = Math.abs((dragState.endX ?? px) - dragState.startX);
    if (dist > 8) {   // minimum drag width (pixels) to count as a selection
      applyDragZoom(dragState.startIdx, dragState.endIdx);
    }
  }

  canvas.addEventListener('mouseup',    endDrag);
  canvas.addEventListener('mouseleave', (e) => {
    if (dragState.active) {
      dragState.endX = getCanvasRelativeX(canvas, e.clientX);
      endDrag(e);
    }
  });

  // Touch support (mobile)
  canvas.addEventListener('touchstart', (e) => {
    const ca = getChartArea();
    if (!ca) return;
    const touch = e.touches[0];
    const px = getCanvasRelativeX(canvas, touch.clientX);
    if (px < ca.left || px > ca.right) return;
    dragState.active   = true;
    dragState.startX   = px;
    dragState.endX     = px;
    dragState.startIdx = xPixelToDataIndex(px);
  }, { passive: true });

  canvas.addEventListener('touchmove', (e) => {
    if (!dragState.active) return;
    const touch = e.touches[0];
    const px = getCanvasRelativeX(canvas, touch.clientX);
    dragState.endX = px;
    showOverlay(dragState.startX, dragState.endX);
  }, { passive: true });

  canvas.addEventListener('touchend', (e) => {
    if (!dragState.active) return;
    dragState.active = false;
    const touch = e.changedTouches[0];
    const px = getCanvasRelativeX(canvas, touch.clientX);
    dragState.endIdx = xPixelToDataIndex(px);
    hideOverlay();
    const dist = Math.abs(px - dragState.startX);
    if (dist > 8) applyDragZoom(dragState.startIdx, dragState.endIdx);
  });
}

/** Wire this file's buttons and listeners (called once from main.js). */
export function setupZoomOutButton() {
  /** Zoom-out button — clears selection and restores full view */
  document.addEventListener('DOMContentLoaded', () => {
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', () => {
        calClose();
        applyPreset(DEFAULT_PRESET, { silent: true });
        document.getElementById('chart-selection-bar').classList.remove('visible');
        const hint = document.getElementById('chart-drag-hint');
        if (hint) hint.style.opacity = '1';

        // Sync toolbar preset highlight
        document.querySelectorAll('.zoom-preset-btn').forEach(b => b.classList.remove('active'));
        const btn24h = document.querySelector('.zoom-preset-btn[data-preset="24h"]');
        if (btn24h) btn24h.classList.add('active');

        applyChartFilter();
      });
    }
  });
}
