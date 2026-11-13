/* The "latest high and low waters" list in the side panel. */

import { T } from '../i18n.js';
import { findTideEvents } from '../analysis/tide.js';

export function fmtEventLabel(ms, fallback) {
  if (!(ms > 0)) return fallback || '';
  const d = new Date(ms);
  const p2 = n => String(n).padStart(2, '0');
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

export function renderTideEvents(values, timestamps, labels) {
  const el = document.getElementById('tide-events');
  if (!el) return;
  const events = findTideEvents(values, timestamps, labels);
  el.innerHTML = '';
  // No turning point in the window: drop the whole section rather than show
  // an empty heading (the card then sizes to the trend chart alone).
  const block = document.getElementById('tide-events-block');
  if (block) block.hidden = !events.length;
  if (!events.length) {
    const empty = document.createElement('div');
    empty.style.color = 'var(--text-muted)';
    empty.style.padding = '6px 0';
    empty.textContent = T('tideEventsNone');
    el.appendChild(empty);
    return;
  }
  // e.l is derived from sheet data (the unauthenticated GAS endpoint), so it
  // MUST go in via textContent, never innerHTML — otherwise a crafted
  // timestamp/label value could execute as HTML/script for every visitor.
  events.forEach(e => {
    const isHigh = e.type === 'high';
    const row = document.createElement('div');
    row.className = 'info-row';
    const keySpan = document.createElement('span');
    keySpan.className = 'key ' + (isHigh ? 'tide-high' : 'tide-low');
    keySpan.textContent = isHigh ? T('evHigh') : T('evLow');
    const valSpan = document.createElement('span');
    valSpan.className = 'val';
    valSpan.textContent = `${e.l} · ${e.v.toFixed(3)} m`;
    row.appendChild(keySpan);
    row.appendChild(valSpan);
    el.appendChild(row);
  });
}
