/* The date-range calendar pop-up next to the preset buttons. */

import { state } from '../state.js';
import { I18N } from '../i18n.js';
import { calendarTimestamps, ensureLongData } from '../data/long-history.js';
import { DEFAULT_PRESET, applyCustomRange, applyPreset, fmtTsLong } from './time-window.js';

/* ── Single range calendar: click a start day, click an end day, set times ── */
export const CAL = {
  open: false,
  picking: false,                 // a start day is chosen; the next click is the end day
  dateDates: new Set(),           // "YYYY-MM-DD" days that have readings
  allTimestamps: [],
  view: { year: new Date().getFullYear(), month: new Date().getMonth() },
};
const MONTHS_MS = ['Jan','Feb','Mac','Apr','Mei','Jun','Jul','Ogo','Sep','Okt','Nov','Dis'];
const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DOW_MS    = ['Isn','Sel','Rab','Kha','Jum','Sab','Ahd'];
const DOW_EN    = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

/** Feed the calendar all timestamps for the current station. */
export function calendarSetData(rawTimestamps) {
  CAL.allTimestamps = [...new Set(rawTimestamps)].sort();
  CAL.dateDates.clear();
  CAL.allTimestamps.forEach(ts => CAL.dateDates.add(ts.substring(0, 10)));
  if (CAL.allTimestamps.length && !CAL.open) {
    const latest = CAL.allTimestamps[CAL.allTimestamps.length - 1];
    CAL.view = { year: parseInt(latest.substring(0, 4), 10), month: parseInt(latest.substring(5, 7), 10) - 1 };
  }
  calUpdateLabel();
}
function timesForDate(dateStr) {   // unique "HH:mm" for a day, sorted
  return [...new Set(CAL.allTimestamps.filter(ts => ts.startsWith(dateStr)).map(ts => ts.substring(11, 16)))];
}
function calOpen() {
  CAL.open = true;
  // Offer the long window's days too (older than the raw read) once loaded.
  ensureLongData().then(ok => { if (ok && CAL.open) { calendarSetData(calendarTimestamps()); calRender(); } });
  const anchor = state.chartFilter.dtFrom || (CAL.allTimestamps.length ? CAL.allTimestamps[CAL.allTimestamps.length - 1] : null);
  if (anchor) CAL.view = { year: parseInt(anchor.substring(0, 4), 10), month: parseInt(anchor.substring(5, 7), 10) - 1 };
  calRender();
  document.getElementById('cal-popup').classList.add('open');
  document.getElementById('cal-btn').classList.add('open');
}
export function calClose() {
  CAL.open = false;
  const pop = document.getElementById('cal-popup'), btn = document.getElementById('cal-btn');
  if (pop) pop.classList.remove('open');
  if (btn) btn.classList.remove('open');
}
export function calUpdateLabel() {
  const el = document.getElementById('cal-label'); if (!el) return;
  const d = I18N[state.lang] || I18N.ms;
  if (!state.chartFilter.dtFrom && !state.chartFilter.dtTo) { el.textContent = d.rangePlaceholder; return; }
  const from = state.chartFilter.dtFrom ? fmtTsLong(state.chartFilter.dtFrom) : '…';
  const to   = state.chartFilter.dtTo ? fmtTsLong(state.chartFilter.dtTo) : (CAL.picking ? '…' : d.rangeEnd);
  el.textContent = `${from} → ${to}`;
}

export function calRender() {
  const popup = document.getElementById('cal-popup'); if (!popup) return;
  const d  = I18N[state.lang] || I18N.ms;
  const en = state.lang === 'en';
  const { year, month } = CAL.view;
  const firstDow    = (new Date(year, month, 1).getDay() + 6) % 7;   // Mon-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const fromDate = state.chartFilter.dtFrom ? state.chartFilter.dtFrom.substring(0, 10) : null;
  const toDate   = state.chartFilter.dtTo   ? state.chartFilter.dtTo.substring(0, 10)   : null;

  let dayHTML = '';
  for (let f = 0; f < firstDow; f++) dayHTML += '<div class="cal-day other-month"></div>';
  for (let day = 1; day <= daysInMonth; day++) {
    const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const hasData = CAL.dateDates.has(ds);
    let cls = 'cal-day';
    if (hasData) cls += ' has-data';
    if (ds === fromDate || ds === toDate) cls += ' selected';
    if (fromDate && toDate && ds > fromDate && ds < toDate) cls += ' in-range';
    if (ds === fromDate && toDate && fromDate !== toDate) cls += ' range-start';
    if (ds === toDate && fromDate && fromDate !== toDate) cls += ' range-end';
    dayHTML += `<div class="${cls}" ${hasData ? `data-date="${ds}"` : ''}>${day}</div>`;
  }
  const total = firstDow + daysInMonth, trail = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let t = 0; t < trail; t++) dayHTML += '<div class="cal-day other-month"></div>';

  const fromTime = state.chartFilter.dtFrom ? state.chartFilter.dtFrom.substring(11, 16) : '';
  const toTime   = state.chartFilter.dtTo   ? state.chartFilter.dtTo.substring(11, 16)   : '';
  const hint = CAL.picking ? d.calPickEnd : (fromDate ? d.calPickAgain : d.calPickStart);

  popup.innerHTML = `
    <div class="cal-header">
      <button class="cal-nav" data-nav="-1" type="button">&#8249;</button>
      <span class="cal-month-label">${(en ? MONTHS_EN : MONTHS_MS)[month]} ${year}</span>
      <button class="cal-nav" data-nav="1" type="button">&#8250;</button>
    </div>
    <div class="cal-dow-row">${(en ? DOW_EN : DOW_MS).map(x => `<div class="cal-dow">${x}</div>`).join('')}</div>
    <div class="cal-grid">${dayHTML}</div>
    <div class="cal-hint">${hint}</div>
    <div class="cal-time-grid">
      <label class="cal-time-cell"><span class="cal-time-label">${d.calFrom}</span>
        <input type="time" class="cal-time-input" id="cal-from-time" value="${fromTime}" ${fromDate ? '' : 'disabled'}></label>
      <label class="cal-time-cell"><span class="cal-time-label">${d.calTo}</span>
        <input type="time" class="cal-time-input" id="cal-to-time" value="${toTime}" ${toDate ? '' : 'disabled'}></label>
    </div>
    <div class="cal-actions">
      <button class="cal-clear" data-cal-clear type="button">${d.calClear}</button>
      <button class="cal-clear cal-done" data-cal-close type="button">${d.calDone}</button>
    </div>`;
}

function calDayClick(ds) {
  const times = timesForDate(ds);
  const first = times[0] || '00:00', last = times[times.length - 1] || '23:59';
  const fromDate = state.chartFilter.dtFrom ? state.chartFilter.dtFrom.substring(0, 10) : null;
  if (!CAL.picking || !fromDate || ds < fromDate) {
    CAL.picking = true;                                   // (re)start: this day begins the range
    applyCustomRange(`${ds}T${first}`, null);
  } else {
    applyCustomRange(state.chartFilter.dtFrom, `${ds}T${last}`); // end of the range (same day = whole day)
  }
  calRender();
}
function calTimeChange(which, val) {
  if (!/^\d{2}:\d{2}$/.test(val || '')) return;
  let from = state.chartFilter.dtFrom, to = state.chartFilter.dtTo;
  if (which === 'from' && from) from = from.substring(0, 10) + 'T' + val;
  if (which === 'to'   && to)   to   = to.substring(0, 10)   + 'T' + val;
  if (from && to && to < from) { if (which === 'from') to = from; else from = to; }
  applyCustomRange(from, to);
}

/** Wire this file's buttons and listeners (called once from main.js). */
export function setupCalendar() {
  // ── Event delegation ───────────────────────────────────────────────────────
  document.addEventListener('click', e => {
    if (e.target.closest('#cal-btn')) { e.stopPropagation(); if (CAL.open) calClose(); else calOpen(); return; }
    const nav = e.target.closest('#cal-popup [data-nav]');
    if (nav) {
      CAL.view.month += parseInt(nav.dataset.nav, 10);
      if (CAL.view.month > 11) { CAL.view.month = 0;  CAL.view.year++; }
      if (CAL.view.month < 0)  { CAL.view.month = 11; CAL.view.year--; }
      calRender(); e.stopPropagation(); return;
    }
    const dayEl = e.target.closest('#cal-popup .cal-day.has-data[data-date]');
    if (dayEl) { calDayClick(dayEl.dataset.date); e.stopPropagation(); return; }
    if (e.target.closest('#cal-popup [data-cal-clear]')) { applyPreset(DEFAULT_PRESET); calRender(); e.stopPropagation(); return; }
    if (e.target.closest('#cal-popup [data-cal-close]')) { calClose(); e.stopPropagation(); return; }
    if (e.target.closest('#cal-popup')) { e.stopPropagation(); return; }   // clicks inside (time inputs) don't close
    if (CAL.open) calClose();
  });
  document.addEventListener('change', e => {
    if (e.target.id === 'cal-from-time') calTimeChange('from', e.target.value);
    if (e.target.id === 'cal-to-time')   calTimeChange('to',   e.target.value);
  });
}
