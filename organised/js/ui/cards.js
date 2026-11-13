/* The metric cards at the top: clicking one scrolls to the chart it summarises. */

import { state } from '../state.js';
import { toggleAnomalyMarkers } from '../charts/main-chart.js';

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
