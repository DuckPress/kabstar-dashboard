/* The live / stale / offline badge and the connection panel (last reading,
   signal strength, battery, data quality). */

import { state } from '../state.js';
import { STATIONS } from '../config.js';
import { I18N, T } from '../i18n.js';

/* ═══════════════════════════════════════════════════
   CONNECTIVITY PANEL
   Only shown for Station 1 (the real IoT Arduino).
   Derives status purely from the freshness of the
   most-recent timestamp in the API response.
═══════════════════════════════════════════════════ */

// Thresholds (ms)
const CONN_STALE_MS   = 15 * 60 * 1000;   // 15 min → warning (~15 missed 60 s readings)
const CONN_OFFLINE_MS = 60 * 60 * 1000;   // 60 min → offline

/**
 * Call this after every API fetch (or failed fetch) to update both:
 *   • The connectivity panel UI
 *   • STATIONS[0].sysStatus / errorCode (so sidebar dot + header badge sync)
 *
 * @param {Array|null} readings  — array of reading objects from raw.sensors["1"],
 *                                 or null if fetch failed entirely.
 */
/** "14601 min 3 s lalu" → "10 hari lalu". */
export function fmtAge(ms, short) {
  if (!(ms >= 0)) return '—';
  const sec = Math.floor(ms / 1000), min = Math.floor(sec / 60), hr = Math.floor(min / 60), day = Math.floor(hr / 24);
  if (sec < 60) return T('ageS', { n: sec });
  if (min < 60) return T('ageMin', { n: min });
  if (hr  < 48) return short ? T('ageHr', { h: hr }) : T('ageHrMin', { h: hr, m: min % 60 });
  return T('ageDay', { n: day });
}

/** Header pill: green LIVE only while the real station is actually fresh. */
export function updateLiveBadge() {
  const el = document.querySelector('.live-badge');
  if (!el) return;
  const d  = I18N[state.lang] || I18N.ms;
  const st = (STATIONS[0] && STATIONS[0].isIoT) ? STATIONS[0].sysStatus : 'active';
  el.classList.toggle('live-offline', st === 'offline');
  el.classList.toggle('live-stale',   st === 'warning');
  el.textContent = st === 'offline' ? d.liveOffline : st === 'warning' ? d.liveStale : d.live;
  el.title = st === 'offline' ? T('liveOfflineTitle') : st === 'warning' ? T('liveStaleTitle') : '';
}
export function updateConnectivityPanel(readings) {
  state.lastConnReadings = readings;
  const panel    = document.getElementById('conn-panel');
  const indic    = document.getElementById('conn-indicator');
  const lbl      = document.getElementById('conn-indicator-label');
  const lastPost = document.getElementById('conn-last-post');
  const ageEl    = document.getElementById('conn-age');
  const countEl  = document.getElementById('conn-count');
  const valEl    = document.getElementById('conn-last-val');
  const pctEl    = document.getElementById('conn-freshness-pct');
  const barFill  = document.getElementById('conn-bar-fill');

  if (!panel) return;

  // Panel is only relevant for IoT station (index 0)
  // Show/hide is handled by updateDashboard based on selected station

  if (!readings || readings.length === 0) {
    // No data at all
    STATIONS[0].sysStatus = 'offline';
    STATIONS[0].errorCode = null;

    indic.className = 'conn-indicator ci-offline';
    lbl.textContent = T('connOffline');
    lastPost.textContent = T('connNoData');  lastPost.className = 'conn-stat-value none';
    ageEl.textContent    = '—';           ageEl.className    = 'conn-stat-value none';
    countEl.textContent  = '0';           countEl.className  = 'conn-stat-value none';
    valEl.textContent    = '—';           valEl.className    = 'conn-stat-value none';
    const batE = document.getElementById('conn-bat');
    const snrE = document.getElementById('conn-snr');
    if (batE) { batE.textContent = '—'; batE.className = 'conn-stat-value none'; }
    if (snrE) { snrE.textContent = '—'; snrE.className = 'conn-stat-value none'; }
    const qcE = document.getElementById('conn-qc');
    if (qcE) { qcE.textContent = '—'; qcE.className = 'conn-stat-value none'; }
    pctEl.textContent    = '—';
    barFill.style.width  = '100%';
    barFill.className    = 'conn-bar-fill dead';
    updateLiveBadge();
    return;
  }

  // Find latest timestamp
  let latestMs = 0;
  let latestVal = null;
  let latestBat = null;
  let latestSnr = null;
  let latestTilt = null, latestPres = null, latestSensor = null, latestUs = null;
  readings.forEach(r => {
    const t = r.timestamp ? new Date(r.timestamp).getTime() : 0;
    if (t > latestMs) {
      latestMs  = t;
      latestVal = r.finalReading ?? r.waterLevel ?? r.emaDist ?? null;
      latestBat = (r.battery ?? null);
      latestSnr = (r.gwSnr   ?? null);
      latestTilt = (r.tilt ?? null);
      latestPres = (r.pres ?? null);
      latestSensor = (r.sn  ?? null);
      latestUs     = (r.usl ?? null);
    }
  });
  // Optional sensors (node >= 1.2.9): show the cells only when the node reports them.
  const tiltCell = document.getElementById('conn-tilt-wrap'), presCell = document.getElementById('conn-pres-wrap');
  const tiltE = document.getElementById('conn-tilt'), presE = document.getElementById('conn-pres');
  if (tiltCell) tiltCell.hidden = (latestTilt === null);
  if (presCell) presCell.hidden = (latestPres === null);
  if (tiltE && latestTilt !== null) tiltE.textContent = latestTilt.toFixed(1) + '°';
  if (presE && latestPres !== null) presE.textContent = latestPres.toFixed(1) + ' hPa';
  // Dual-sensor nodes (>= 1.2.10): which sensor fed the level, and the
  // ultrasonic's own level with its offset from it — a live cross-check of
  // the two sensors. Hidden for single-sensor / older nodes.
  const snCell = document.getElementById('conn-sensor-wrap'), usCell = document.getElementById('conn-us-wrap');
  const snE = document.getElementById('conn-sensor'), usE = document.getElementById('conn-us');
  if (snCell) snCell.hidden = (latestSensor === null);
  if (usCell) usCell.hidden = (latestUs === null);
  if (snE && latestSensor !== null) {
    snE.textContent = latestSensor +
      ((latestUs !== null && latestSensor !== 'RCWL-1670') ? ' + RCWL-1670' : '');
  }
  if (usE && latestUs !== null) {
    // Δ compares the ultrasonic with the RADAR's level; when the ultrasonic
    // itself fed this reading (radar burst empty) there is nothing to compare.
    const deltaCm = (latestVal !== null && latestVal !== undefined && latestSensor !== 'RCWL-1670')
                    ? (latestUs - latestVal) * 100 : null;
    usE.textContent = latestUs.toFixed(3) + ' m' +
      (deltaCm !== null ? ` (Δ ${deltaCm >= 0 ? '+' : ''}${deltaCm.toFixed(1)} cm)` : '');
  }

  const ageMs  = Date.now() - latestMs;
  const ageMins = Math.floor(ageMs / 60000);
  const ageSecs = Math.floor((ageMs % 60000) / 1000);

  // Freshness bar: 0% = just posted, 100% = 15 min+ ago
  const barPct = Math.min(100, Math.round(ageMs / CONN_STALE_MS * 100));

  // Format last-post time
  const lastDate = new Date(latestMs);
  const lastStr  = lastDate.getFullYear() + '-' +
    String(lastDate.getMonth()+1).padStart(2,'0') + '-' +
    String(lastDate.getDate()).padStart(2,'0') + ' ' +
    String(lastDate.getHours()).padStart(2,'0') + ':' +
    String(lastDate.getMinutes()).padStart(2,'0') + ':' +
    String(lastDate.getSeconds()).padStart(2,'0');

  // Determine status
  let status, errCode;
  if (ageMs > CONN_OFFLINE_MS) {
    status  = 'offline';
    errCode = null;
  } else if (ageMs > CONN_STALE_MS) {
    status  = 'warning';
    errCode = 'ERR-0x31';
  } else {
    status  = 'active';
    errCode = null;
  }

  // Update STATIONS[0] so sidebar dot + header badge reflect this
  STATIONS[0].sysStatus  = status;
  STATIONS[0].errorCode  = errCode;
  STATIONS[0]._lastSeenMs = latestMs || null;

  // Update indicator chip
  const ciClass = { active: 'ci-active', warning: 'ci-warning', offline: 'ci-offline' }[status];
  indic.className = 'conn-indicator ' + ciClass;
  lbl.textContent = status === 'active'  ? T('connConnected')
                  : status === 'warning' ? T('connSlow')
                  : T('connOffline');

  // Last post time
  lastPost.textContent = lastStr;
  lastPost.className   = 'conn-stat-value ' + (status === 'active' ? 'fresh' : 'stale');

  // Age
  const ageStr = fmtAge(ageMs);
  ageEl.textContent  = ageStr;
  ageEl.className    = 'conn-stat-value ' + (status === 'active' ? 'fresh' : 'stale');

  // Count — the label says "(24j)", so count only the last 24 hours, not every
  // fetched row (the API returns up to 1000 rows spanning several days).
  const dayAgoMs = Date.now() - 24 * 3600 * 1000;
  let count24 = 0;
  readings.forEach(r => {
    const t = r.timestamp ? new Date(r.timestamp).getTime() : 0;
    if (t >= dayAgoMs) count24++;
  });
  countEl.textContent = count24 + ' ' + T('readingsUnit');
  countEl.className   = 'conn-stat-value';

  // Reference quality over the same 24 h window — the "can this window be
  // trusted for tide reduction?" glance: % of readings with a valid RTC
  // stamp, gaps (>10 min between consecutive readings), worst burst std-dev.
  const qcEl = document.getElementById('conn-qc');
  if (qcEl) {
    const recent = readings
      .map(r => ({ t: r.timestamp ? new Date(r.timestamp).getTime() : 0,
                   rv: r.rv, sd: r.sd, moved: r.moved, skew: r.skew }))
      .filter(r => r.t >= dayAgoMs)
      .sort((a, b) => a.t - b.t);
    if (recent.length >= 2) {
      const rvKnown = recent.filter(r => r.rv !== undefined && r.rv !== null);
      const rvPct   = rvKnown.length
        ? Math.round(100 * rvKnown.filter(r => Number(r.rv) === 1).length / rvKnown.length)
        : null;
      let gapCount = 0;
      for (let i = 1; i < recent.length; i++) {
        if (recent[i].t - recent[i - 1].t > 10 * 60 * 1000) gapCount++;
      }
      const sds   = recent.map(r => r.sd).filter(v => v !== null && v !== undefined && !isNaN(v));
      const maxSd = sds.length ? Math.max(...sds) : null;
      const movedN = recent.filter(r => Number(r.moved) === 1).length;
      const skews = recent.map(r => r.skew).filter(v => v !== null && v !== undefined && !isNaN(v));
      const maxSkew = skews.length ? Math.max(...skews) : null;
      // Readings the tide reduction would drop: burst SD or node/gateway clock
      // skew over the Config limits (survey_max_sd_cm / max_clock_skew_s).
      const sdLim = state.stationMeta.max_sd_cm, skewLim = state.stationMeta.max_skew_s;
      const failN = recent.filter(r =>
        (sdLim > 0   && r.sd   !== null && r.sd   !== undefined && Number(r.sd)   > sdLim) ||
        (skewLim > 0 && r.skew !== null && r.skew !== undefined && Number(r.skew) > skewLim)).length;

      const parts = [];
      if (rvPct !== null) parts.push(`RTC ${rvPct}%`);
      parts.push(gapCount === 0 ? T('qcNoGap') : T('qcGaps', { n: gapCount }));
      if (maxSd !== null) parts.push(`SD≤${maxSd.toFixed(1)}cm`);
      if (maxSkew !== null) parts.push(T('qcClock', { s: maxSkew }));
      if (failN > 0) parts.push(T('qcFailed', { n: failN }));
      if (movedN > 0) parts.push(T('qcMoved', { n: movedN }));   // mount moved — critical
      qcEl.textContent = parts.join(' · ');
      // Any mount-movement is disqualifying for a reference gauge.
      qcEl.className   = 'conn-stat-value ' +
        ((movedN === 0 && failN === 0 && (rvPct === null || rvPct >= 95) && gapCount === 0) ? 'fresh' : 'stale');
    } else {
      qcEl.textContent = '—';
      qcEl.className   = 'conn-stat-value none';
    }
  }

  // Last value
  valEl.textContent = latestVal !== null ? latestVal.toFixed(3) + ' m' : '—';
  valEl.className   = 'conn-stat-value ' + (status === 'active' ? 'fresh' : 'stale');

  // Node battery + LoRa link quality
  const freshCls = 'conn-stat-value ' + (status === 'active' ? 'fresh' : 'stale');
  const batE = document.getElementById('conn-bat');
  const snrE = document.getElementById('conn-snr');
  if (batE) { batE.textContent = latestBat !== null ? latestBat.toFixed(2) + ' V'  : '—'; batE.className = freshCls; }
  if (snrE) { snrE.textContent = latestSnr !== null ? latestSnr.toFixed(1) + ' dB' : '—'; snrE.className = freshCls; }

  // Freshness bar
  pctEl.textContent   = (status === 'active' ? T('freshFresh') : status === 'warning' ? T('freshSlow') : T('freshStale')) + ' · ' + barPct + '%';
  updateLiveBadge();
  barFill.style.width = barPct + '%';
  barFill.className   = 'conn-bar-fill ' +
    (status === 'active' ? 'fresh' : status === 'warning' ? 'stale' : 'dead');
}

// ── Connection panel: secondary figures fold away on phones ──────────────────
export function syncConnMore() {
  const panel = document.getElementById('conn-panel');
  const btn   = document.getElementById('conn-more-btn');
  if (!panel || !btn) return;
  const open = panel.classList.contains('expanded');
  btn.textContent = open ? T('connLess') : T('connMore');
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

/** Wire this file's buttons and listeners (called once from main.js). */
export function setupConnectivityPanel() {
  (function wireConnMore() {
    const btn = document.getElementById('conn-more-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      document.getElementById('conn-panel').classList.toggle('expanded');
      syncConnMore();
    });
  })();
}
