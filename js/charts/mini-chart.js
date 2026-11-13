/* The small "last 6 hours" trend chart in the side panel. */

import { state } from '../state.js';
import { CHART_FONT } from '../config.js';

export function renderMiniChart(labels, values) {
  const ctx = document.getElementById('miniChart').getContext('2d');
  const last36 = values.slice(-36);
  const lastLbls = labels.slice(-36);

  // Ignore null gaps: Math.min(null, ...) coerces null to 0 and pins the
  // y-axis to zero for data that actually sits around ~4 m.
  const valid = last36.filter(v => v !== null && !isNaN(v));
  const minV = valid.length ? Math.min(...valid) : 0;
  const maxV = valid.length ? Math.max(...valid) : 1;

  if (state.miniChart) {
    state.miniChart.data.labels = lastLbls;
    state.miniChart.data.datasets[0].data = last36;
    // The axis bounds were fixed at creation — rescale them for the new data.
    state.miniChart.options.scales.y.min = minV - 0.1;
    state.miniChart.options.scales.y.max = maxV + 0.1;
    state.miniChart.update();   // see renderMainChart: never 'active'
    return;
  }

  state.miniChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: lastLbls,
      datasets: [{
        data: last36,
        borderColor: '#2980b9',
        borderWidth: 2,
        pointRadius: 0,
        fill: true,
        backgroundColor: 'rgba(41,128,185,0.10)',
        tension: 0.4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { display: false },
        y: {
          display: true,
          grid: { display: false },
          ticks: {
            color: '#6b748f',
            font: { size: 9, family: CHART_FONT },
            maxTicksLimit: 4,
            callback: v => v.toFixed(2),
          },
          min: minV - 0.1,
          max: maxV + 0.1,
        },
      },
    },
  });
}
