/* The station list in the sidebar (real station first, demo stations folded
   into a group) and switching between stations. */

import { state } from '../state.js';
import { STATIONS } from '../config.js';
import { T, stationDisplayName, stationTypeLabel } from '../i18n.js';
import { fmtAge } from './connectivity.js';
import { updateDashboard } from './dashboard.js';
import { DEFAULT_PRESET, applyPreset } from './time-window.js';
import { calClose } from './calendar.js';

/* ═══════════════════════════════════════════════════
   SHARED STATION-SWITCH HELPER
   Used by both maps and the sidebar list
═══════════════════════════════════════════════════ */
export function switchToStation(idx) {
  state.activeStation = idx;
  try { localStorage.setItem('kabstar_station', String(idx)); } catch (e) {}
  // Sync sidebar highlight
  document.querySelectorAll('.station-item').forEach((el, i) => {
    el.classList.toggle('active', i === idx);
  });
  // Destroy charts
  if (state.mainChart)  { state.mainChart.destroy();  state.mainChart  = null; }
  if (state.miniChart)  { state.miniChart.destroy();  state.miniChart  = null; }
  if (state.tempChart)  { state.tempChart.destroy();  state.tempChart  = null; }
  if (state.humidChart) { state.humidChart.destroy(); state.humidChart = null; }
  if (state.radarChart) { state.radarChart.destroy(); state.radarChart = null; }
  if (state.usChart)    { state.usChart.destroy();    state.usChart    = null; }
  // Reset to the default window, anchored to THIS station's newest reading
  calClose();
  applyPreset(DEFAULT_PRESET, { silent: true });
  const selBar = document.getElementById('chart-selection-bar');
  if (selBar) selBar.classList.remove('visible');
  const hint = document.getElementById('chart-drag-hint');
  if (hint) hint.style.opacity = '1';
  closeSidebar();
  updateDashboard(idx);
}

/* ═══════════════════════════════════════════════════
   SIDEBAR
═══════════════════════════════════════════════════ */
function getSysStatusClass(status) {
  if (status === 'active')  return 'st-active';
  if (status === 'warning') return 'st-warning';
  return 'st-offline';
}

// Demo-station group open/closed (remembered). Opens on its own whenever a demo
// station is the one being viewed.
let demoOpen = false;
try { demoOpen = localStorage.getItem('kabstar_demo_open') === '1'; } catch (e) {}

function stationItemEl(s, i) {
  const item = document.createElement('div');
  item.className = 'station-item' + (i === state.activeStation ? ' active' : '') + (s.isIoT ? ' is-real' : '');
  item.dataset.idx = i;
  item.setAttribute('role', 'button');
  item.setAttribute('tabindex', '0');
  item.setAttribute('aria-label', `${stationDisplayName(s)} — ${stationTypeLabel(s)}`);
  if (i === state.activeStation) item.setAttribute('aria-current', 'true');
  let typeLabel = stationTypeLabel(s);
  if (s.isIoT && s._lastSeenMs) {
    typeLabel += ' · ' + fmtAge(Date.now() - s._lastSeenMs, true);
  } else if (s.isIoT && s.sysStatus === 'offline') {
    typeLabel += ' · ' + T('noLink');
  }
  // A (simulated) error code rides on the type line, so the name keeps its width.
  const err = (s.sysStatus === 'warning' && s.errorCode)
    ? ` · <span class="station-err-inline" title="${s.isIoT ? '' : T('simCodeTitle')}">${s.errorCode}</span>` : '';
  item.innerHTML = `
    <div class="station-num">${i + 1}</div>
    <div class="station-info">
      <div class="station-name">${stationDisplayName(s)}</div>
      <div class="station-type">${typeLabel}${err}</div>
    </div>
    <div class="station-dot ${getSysStatusClass(s.sysStatus)}"></div>
  `;
  item.addEventListener('click', () => switchToStation(i));
  item.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchToStation(i); }
  });
  return item;
}

/**
 * Sidebar station list: the real (IoT) station(s) pinned at the top, the
 * simulated demo stations in a collapsible group below.
 */
export function buildSidebar() {
  const list = document.getElementById('station-list');
  list.innerHTML = '';
  const real = [], demo = [];
  STATIONS.forEach((s, i) => (s.isIoT ? real : demo).push(i));

  const label = (text) => {
    const el = document.createElement('div');
    el.className = 'sidebar-section-label';
    el.textContent = text;
    return el;
  };

  if (real.length) {
    list.appendChild(label(T('stationsReal')));
    real.forEach(i => list.appendChild(stationItemEl(STATIONS[i], i)));
  }
  if (demo.length) {
    const open = demoOpen || demo.includes(state.activeStation);
    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'sidebar-group-toggle' + (open ? ' open' : '');
    head.setAttribute('aria-expanded', open ? 'true' : 'false');
    head.innerHTML = `<span class="chev">&#9656;</span> ${T('stationsDemo', { n: demo.length })}`;
    head.addEventListener('click', () => {
      demoOpen = !open;
      try { localStorage.setItem('kabstar_demo_open', demoOpen ? '1' : '0'); } catch (e) {}
      buildSidebar();
    });
    list.appendChild(head);
    if (open) {
      const group = document.createElement('div');
      group.className = 'sidebar-demo-group';
      demo.forEach(i => group.appendChild(stationItemEl(STATIONS[i], i)));
      list.appendChild(group);
    }
  }
}

/* ═══════════════════════════════════════════════════
   MOBILE SIDEBAR TOGGLE
═══════════════════════════════════════════════════ */
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
}

/** Wire this file's buttons and listeners (called once from main.js). */
export function setupSidebar() {
  document.getElementById('menu-toggle').addEventListener('click', () => {
    const open = document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('overlay').classList.toggle('show', open);
  });

  document.getElementById('overlay').addEventListener('click', closeSidebar);
}
