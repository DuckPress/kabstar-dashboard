/* The metric cards at the top: the radar / ultrasonic readings, and clicking a
   card scrolls to the chart it summarises. (The other cards are filled in
   ui/dashboard.js.) */

import { state } from '../state.js';
import { T } from '../i18n.js';
import { toggleAnomalyMarkers } from '../charts/main-chart.js';
import { sensorDistances } from '../charts/sensor-charts.js';
import { fmtAge } from './connectivity.js';

/**
 * Radar and ultrasonic cards: each sensor's newest distance to the water (cm),
 * from the station's full raw series, not just the window on the charts.
 * If that sensor has gone quiet while the other kept reading, the card says
 * how old its last reading is. Simulated stations have no sensors, so the two
 * cards are hidden for them (as the distance charts are).
 */
export function updateSensorCards(d, isReal) {
  const dist = isReal ? sensorDistances(d, false) : null;
  const ts = d.timestamps || [];
  for (const [key, id, none] of [['radar', 'card-radar', 'radarNone'], ['us', 'card-us', 'usNone']]) {
    const card = document.getElementById(id + '-wrap');
    const valEl = document.getElementById(id);
    const subEl = document.getElementById(id + '-sub');
    if (!card || !valEl || !subEl) continue;
    card.hidden = !isReal;
    if (!isReal) continue;
    const vals = dist[key];
    let i = vals.length - 1;
    while (i >= 0 && (vals[i] === null || isNaN(vals[i]))) i--;
    if (i < 0) {
      valEl.innerHTML = '—<span class="metric-unit">cm</span>';
      subEl.textContent = T(none);
      continue;
    }
    valEl.innerHTML = `${vals[i].toFixed(1)}<span class="metric-unit">cm</span>`;
    const readingMs = ts[i] ? new Date(ts[i]).getTime() : NaN;
    subEl.textContent = (i === vals.length - 1 || isNaN(readingMs))
      ? T('distToWater')
      : T('sensorLast', { age: fmtAge(Date.now() - readingMs) });
  }
}

/** Wire this file's buttons and listeners (called once from main.js). */
export function setupCardJumps() {
  // ── Metric cards → their graph: click / Enter / Space scrolls to the chart
  //    card named in data-jump and flashes it. The anomaly card also turns the
  //    anomaly markers back on if they were hidden, since that's what it points at.
  (function wireCardJumps() {
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function jump(card) {
      const target = document.getElementById(card.dataset.jump);
      if (!target) return;
      if (card.id === 'card-anomaly-wrap' && !state.showAnomalies) toggleAnomalyMarkers();
      target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      target.classList.remove('jump-flash');
      void target.offsetWidth;                 // restart the animation on a repeat click
      target.classList.add('jump-flash');
      clearTimeout(target._jumpTimer);
      target._jumpTimer = setTimeout(() => target.classList.remove('jump-flash'), 1500);
    }
    document.querySelectorAll('.metric-card[data-jump]').forEach(card => {
      card.addEventListener('click', () => jump(card));
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jump(card); }
      });
    });
  })();
}
