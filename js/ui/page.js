/* Page-wide bits: error banners, light/dark theme, the clock, the refresh
   button and the station / system info tabs. */

import { state } from '../state.js';
import { T } from '../i18n.js';
import { loadData } from '../data/fetch.js';
import { updateDashboard } from './dashboard.js';

/* ═══════════════════════════════════════════════════
   ERROR BANNER HELPERS
═══════════════════════════════════════════════════ */
export function showErrorBanner(msg) {
  const banner = document.getElementById('error-banner');
  const msgEl  = document.getElementById('error-banner-msg');
  if (!banner) return;
  if (msg) msgEl.textContent = msg;
  banner.classList.add('visible');
}

export function hideErrorBanner() {
  const banner = document.getElementById('error-banner');
  if (banner) banner.classList.remove('visible');
}

/* ═══════════════════════════════════════════════════
   THEME (dark/light) + LANGUAGE (BM/EN) TOGGLES
═══════════════════════════════════════════════════ */
export function applyTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('kabstar_theme', t); } catch (e) {}
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = t === 'dark' ? '☀️' : '🌙';
}
export function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  applyTheme(cur === 'dark' ? 'light' : 'dark');
  // Chart colours are fixed at creation (chartTheme) — rebuild them.
  [state.mainChart, state.tempChart, state.humidChart, state.miniChart, state.radarChart, state.usChart]
    .forEach(c => { if (c) c.destroy(); });
  state.mainChart = state.tempChart = state.humidChart = state.miniChart = null;
  state.radarChart = state.usChart = null;
  if (state.allData) updateDashboard(state.activeStation);
}

/* ═══════════════════════════════════════════════════
   CLOCK
═══════════════════════════════════════════════════ */
export function updateClock() {
  const now = new Date();
  // Always display Malaysia time (UTC+8), regardless of the viewer's timezone.
  const MYT = 'Asia/Kuala_Lumpur';
  document.getElementById('clock').textContent =
    new Intl.DateTimeFormat('en-GB', {
      timeZone: MYT, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(now);
  document.getElementById('date-str').textContent =
    now.toLocaleDateString(T('locale'), {
      timeZone: MYT, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
    });
}

/* ═══════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════ */
/**
 * loadData — build the dataset for all 10 stations.
 * Stations 2–10 are ALWAYS simulated; station 1 (the real IoT node) is
 * overlaid with live Google-Sheets data whenever the API returns any.
 * This is what produces "1 real + 9 mock" instead of all-or-nothing.
 */
// The top banner has exactly three honest states: "loading" (first
// fetch in flight), "not configured" (placeholder URL → sim data only), and
// hidden. A fetch FAILURE is reported by the separate red error banner, never
// by claiming the URL is unset.
export function setApiBanner(mode) {
  const banner = document.getElementById('api-banner');
  const msg    = document.getElementById('api-banner-msg');
  if (!banner) return;
  if (mode === 'hidden') { banner.classList.add('hidden'); return; }
  banner.classList.remove('hidden');
  if (!msg) return;
  if (mode === 'unconfigured') {
    msg.innerHTML = T('apiUnconfigured');
  } else {
    msg.innerHTML = T('apiLoading');
  }
}

/* ═══════════════════════════════════════════════════
   TAB SWITCHER — Maklumat Stesen / Maklumat Sistem
═══════════════════════════════════════════════════ */
function switchTab(tab) {
  document.querySelectorAll('.info-tab').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.info-panel').forEach(panel => panel.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.getElementById('panel-' + tab).classList.add('active');
  // Leaflet needs an invalidateSize call whenever the map container becomes visible
  if (tab === 'stesen' && state.stationMap) {
    setTimeout(() => state.stationMap.invalidateSize(), 50);
  }
}

/** Wire this file's buttons and listeners (called once from main.js). */
export function setupPage() {
  /* ═══════════════════════════════════════════════════
     REFRESH BUTTON
  ═══════════════════════════════════════════════════ */
  document.getElementById('refresh-btn').addEventListener('click', async () => {
    const btn    = document.getElementById('refresh-btn');
    const btnTxt = document.getElementById('refresh-btn-text');
    btn.classList.add('loading');
    btn.disabled = true;
    if (btnTxt) btnTxt.textContent = T('loading');

    // Re-fetch real station + regenerate the simulated mock stations
    await loadData();

    // Charts update in place (renderers handle their own lifecycle) — this
    // preserves any active zoom across the refresh instead of resetting it.
    updateDashboard(state.activeStation);

    setTimeout(() => {
      btn.classList.remove('loading');
      btn.disabled = false;
      if (btnTxt) btnTxt.textContent = T('refresh');
    }, 600);
  });

  // Station / system info tabs under the charts
  document.querySelectorAll('.info-tab[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Back-to-top button: visible once the metric cards start disappearing under
  // the top bar (for example after a card jump), and scrolls the page back up.
  const topBtn = document.getElementById('back-to-top');
  if (topBtn) {
    const grid = document.querySelector('.metric-grid');
    const topbar = document.getElementById('topbar');
    const syncTopBtn = () => {
      const barBottom = topbar ? topbar.getBoundingClientRect().bottom : 0;
      const past = grid ? grid.getBoundingClientRect().top < barBottom : window.scrollY > 300;
      topBtn.classList.toggle('show', past);
    };
    window.addEventListener('scroll', syncTopBtn, { passive: true });
    window.addEventListener('resize', syncTopBtn);
    syncTopBtn();
    topBtn.addEventListener('click', (e) => {
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
      // Keyboard press (no mouse position): keep focus near the top, on the first card.
      if (e.detail === 0) {
        const first = document.querySelector('.metric-card[data-jump]');
        if (first) first.focus({ preventScroll: true });
      }
    });
  }
}
