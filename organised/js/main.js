/* Start-up. Wires every button and control, then loads the data and starts
   the refresh loop. index.html loads only this file; it imports the rest. */

import { state } from './state.js';
import { DASHBOARD_NORMAL_REFRESH_MS, DASHBOARD_OFFLINE_REFRESH_MS, DASHBOARD_STALE_REFRESH_MS, DASHBOARD_SURVEY_REFRESH_MS, GAS_API_URL, STATIONS } from './config.js';
import { applyLang, toggleLang } from './i18n.js';
import { loadData, loadFullHistory } from './data/fetch.js';
import { ensureLongData, windowNeedsLong } from './data/long-history.js';
import { setupAnomalyToggle } from './charts/main-chart.js';
import { setupZoomOutButton } from './charts/drag-select.js';
import { setupConnectivityPanel } from './ui/connectivity.js';
import { updateDashboard } from './ui/dashboard.js';
import { setupMapOverlay } from './ui/map.js';
import { buildSidebar, setupSidebar } from './ui/sidebar.js';
import { applyPreset, applyUrlState, setupTimeWindow } from './ui/time-window.js';
import { setupCalendar } from './ui/calendar.js';
import { applyTheme, setupPage, toggleTheme, updateClock } from './ui/page.js';
import { setupCsvExport } from './ui/export-csv.js';
import { setupCardJumps } from './ui/cards.js';

async function init() {
  updateClock();
  setInterval(updateClock, 1000);

  // Restore theme + language, and wire the toggles.
  try { applyTheme(localStorage.getItem('kabstar_theme') || 'light'); } catch (e) { applyTheme('light'); }
  try { applyLang(localStorage.getItem('kabstar_lang') || 'ms'); } catch (e) { applyLang('ms'); }
  const themeBtn = document.getElementById('theme-toggle');
  const langBtn  = document.getElementById('lang-toggle');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
  if (langBtn)  langBtn.addEventListener('click', toggleLang);

  // Restore the last-viewed station across reloads.
  try {
    const saved = parseInt(localStorage.getItem('kabstar_station'), 10);
    if (!isNaN(saved) && saved >= 0 && saved < STATIONS.length) state.activeStation = saved;
  } catch (e) {}

  await loadData();
  applyUrlState();   // ?station=&preset= | &from=&to= — a shared link beats the saved station

  buildSidebar();
  updateDashboard(state.activeStation);
  loadFullHistory();   // the rest of the read window, after the first paint

  // Single refresh loop below (scheduleRefresh). A second 5-minute
  // setInterval used to run alongside it, double-polling the GAS endpoint
  // and redrawing every chart twice.

  // Auto-refresh every 10 minutes (API) or every 60 s (sim — to advance tidal curve)
  const simRefreshMs = 60 * 1000;           // 60 s — smooth live feel for mock stations
  const apiRefreshMs = DASHBOARD_NORMAL_REFRESH_MS;

  function scheduleRefresh() {
    const usingApi = GAS_API_URL && GAS_API_URL !== "YOUR_WEB_APP_URL_HERE";
    // Survey mode: poll every 60 s so the survey party sees near-live tide
    // during sounding operations, instead of the battery-friendly 10 min.
    const st = (STATIONS[0] && STATIONS[0].isIoT) ? STATIONS[0].sysStatus : 'active';
    const delay    = usingApi
      ? (state.stationMeta.survey_mode ? DASHBOARD_SURVEY_REFRESH_MS
         : st === 'offline'        ? DASHBOARD_OFFLINE_REFRESH_MS
         : st === 'warning'        ? DASHBOARD_STALE_REFRESH_MS
         : apiRefreshMs)
      : simRefreshMs;

    setTimeout(async () => {
      await loadData();
      // A long window keeps its 10-minute means fresh too (at most every
      // LONG_REFRESH_MS; a no-op otherwise).
      if (windowNeedsLong(state.activeStation)) await ensureLongData();
      // A preset window follows the newest reading; a custom range or point
      // cap is the user's selection and must not be stomped.
      if (state.chartFilter.preset) {
        applyPreset(state.chartFilter.preset, { silent: true });
        updateDashboard(state.activeStation);   // charts update in place
      } else if (!state.chartFilter.dtFrom && !state.chartFilter.dtTo) {
        updateDashboard(state.activeStation);
      }
      scheduleRefresh();   // chain next tick
    }, delay);
  }

  scheduleRefresh();
}

// Wire every control, then load the data and start refreshing.
setupMapOverlay();
setupCalendar();
setupZoomOutButton();
setupSidebar();
setupPage();
setupTimeWindow();
setupCsvExport();
setupConnectivityPanel();
setupAnomalyToggle();
setupCardJumps();
init();

// ─── PWA: register the service worker (only when served over http/https) ───
// Service workers don't run from file:// — host the folder to enable offline.
// The single-file build (tools/build_single_file.py) has no sw.js beside it.
if (!window.KAB_SINGLE_FILE && 'serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .catch(err => console.warn('Service worker registration failed:', err));
  });
}
