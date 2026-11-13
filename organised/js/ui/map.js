/* Maps: the full-screen station picker and the small map in the station tab
   (Leaflet with ESRI tiles). */

import { state } from '../state.js';
import { STATIONS } from '../config.js';
import { T, stationDisplayName, stationTypeLabel, statusLabel_ } from '../i18n.js';
import { switchToStation } from './sidebar.js';

/* ═══════════════════════════════════════════════════
   STATION MAP  (Leaflet)
   Two maps:
   1. Full-screen overlay — station selector shown by "Peta Stesen" button.
      Displays all stations as custom tide-gauge icons; clicking opens a popup
      with live level + a "Lihat Stesen" button that loads the station.
   2. Small map inside the Maklumat Stesen tab — single-station position view.
═══════════════════════════════════════════════════ */

/* ── Shared tile layer factory (ESRI — no Referer required) ─── */
function makeEsriTileLayer() {
  return L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 19, attribution: 'Tiles © <a href="https://www.esri.com/">Esri</a>' }
  );
}

/* ═══════════════════════════════════════════════════
   1. FULL-SCREEN OVERLAY MAP
═══════════════════════════════════════════════════ */
let overlayMap        = null;
let overlayMarkers    = [];    // one per STATION
let overlayInitialised = false;

/** SVG tide gauge icon used in the overlay map */
function makeTideGaugeIcon(s, isSelected) {
  const gradId = { active: 'linear-gradient(135deg,#1e4096,#2563eb)', warning: 'linear-gradient(135deg,#b45309,#d97706)', offline: 'linear-gradient(135deg,#374151,#6b748f)' }[s.sysStatus] || 'linear-gradient(135deg,#374151,#6b748f)';
  const pulseHtml = s.sysStatus !== 'offline'
    ? `<div class="tg-pulse ${s.sysStatus}"></div>` : '';
  const selectedClass = isSelected ? ' selected' : '';
  // Short label — strip "Stesen N: " prefix for compactness
  const shortName = s.name.replace(/^Stesen \d+:\s*/i, '');
  return L.divIcon({
    className: '',
    html: `
      <div class="tg-marker">
        <div class="tg-icon ${s.sysStatus}${selectedClass}" style="background:${gradId}">
          ${pulseHtml}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.95)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 22c1.5-1.5 3.5-2 5-1s3 1 5 0 3.5-1.5 5 0"/>
            <path d="M2 17c1.5-1.5 3.5-2 5-1s3 1 5 0 3.5-1.5 5 0"/>
            <rect x="9" y="2" width="6" height="11" rx="1"/>
            <line x1="12" y1="2" x2="12" y2="1"/>
          </svg>
        </div>
        <div class="tg-label">${shortName}</div>
      </div>`,
    iconSize:    [42, 62],
    iconAnchor:  [21, 42],
    popupAnchor: [0, -46],
  });
}

/** Build the rich popup HTML for the overlay map */
function buildOverlayPopup(s, idx) {
  const statusLabel = statusLabel_(s.sysStatus);
  const typeLabel   = stationTypeLabel(s);

  // Get latest reading from state.allData if available
  let levelHtml = '—';
  if (state.allData && state.allData[idx]) {
    const vals = state.allData[idx].values.filter(v => v !== null && !isNaN(v));
    if (vals.length) {
      const latest = vals[vals.length - 1];
      levelHtml = `<span style="font-family:Inter,Roboto,Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;color:#0d2149;">${latest.toFixed(3)}<span style="font-size:13px;font-weight:400;color:#6b748f;"> m</span></span>`;
    }
  }

  const errRow = (s.sysStatus === 'warning' && s.errorCode)
    ? `<div class="msp-row"><span class="msp-key">${T('mapCode')}</span><span class="msp-val" style="color:#b45309">${s.errorCode}</span></div>` : '';

  return `
    <div class="map-station-popup">
      <div class="msp-header">
        <div class="msp-id">${s.id}</div>
        <div class="msp-name">${stationDisplayName(s)}</div>
        <div class="msp-location">${s.location}</div>
      </div>
      <div class="msp-body">
        <div style="text-align:center;padding:6px 0 2px;">${levelHtml}</div>
        <div style="font-size:10px;color:#6b748f;text-align:center;margin-bottom:8px;font-weight:500;">${T('mapLatest')}</div>
        <div class="msp-row">
          <span class="msp-key">${T('mapStatus')}</span>
          <span class="msp-status ${s.sysStatus}">${statusLabel}</span>
        </div>
        <div class="msp-row">
          <span class="msp-key">${T('mapCoords')}</span>
          <span class="msp-val">${s.lat.toFixed(4)}° N, ${s.lng.toFixed(4)}° E</span>
        </div>
        <div class="msp-row">
          <span class="msp-key">${T('mapType')}</span>
          <span class="msp-val">${typeLabel}</span>
        </div>
        ${errRow}
      </div>
      <button class="msp-select-btn" onclick="selectStationFromMap(${idx})">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        ${T('mapView')}
      </button>
    </div>`;
}

/** Called from the popup button — switches dashboard to the station and closes overlay */
function selectStationFromMap(idx) {
  // Highlight the clicked marker briefly
  overlayMarkers.forEach((mk, i) => {
    if (mk) mk.setIcon(makeTideGaugeIcon(STATIONS[i], i === idx));
  });

  setTimeout(() => {
    closeMapOverlay();
    switchToStation(idx);
  }, 250);
}

function openMapOverlay() {
  const overlay = document.getElementById('map-overlay');
  overlay.classList.add('open');

  // Initialise map the first time
  if (!overlayInitialised) {
    overlayInitialised = true;
    overlayMap = L.map('map-overlay-map', {
      zoomControl: true,
      scrollWheelZoom: true,
    });
    makeEsriTileLayer().addTo(overlayMap);

    // Fit to Malaysia bounds
    overlayMap.fitBounds([[0.8, 99.5], [7.5, 119.5]]);

    // Place a marker for every station
    STATIONS.forEach((s, i) => {
      const mk = L.marker([s.lat, s.lng], {
        icon: makeTideGaugeIcon(s, i === state.activeStation),
        zIndexOffset: i === state.activeStation ? 1000 : 0,
      }).addTo(overlayMap);

      mk.bindPopup(buildOverlayPopup(s, i), {
        maxWidth: 260,
        closeButton: true,
        autoPan: true,
      });

      // Open popup on click
      mk.on('click', () => {
        // Highlight selected icon
        overlayMarkers.forEach((m, j) => {
          if (m) m.setIcon(makeTideGaugeIcon(STATIONS[j], j === i));
          if (m) m.setZIndexOffset(j === i ? 1000 : 0);
        });
        // Refresh popup with latest data
        mk.setPopupContent(buildOverlayPopup(s, i));
      });

      overlayMarkers.push(mk);
    });
  } else {
    // Refresh all markers and popup content (data may have updated)
    overlayMarkers.forEach((mk, i) => {
      if (!mk) return;
      mk.setIcon(makeTideGaugeIcon(STATIONS[i], i === state.activeStation));
      mk.setZIndexOffset(i === state.activeStation ? 1000 : 0);
      mk.setPopupContent(buildOverlayPopup(STATIONS[i], i));
    });
    overlayMap.fitBounds([[0.8, 99.5], [7.5, 119.5]]);
  }

  // Invalidate size after CSS transition completes
  setTimeout(() => overlayMap && overlayMap.invalidateSize(), 420);
}

function closeMapOverlay() {
  document.getElementById('map-overlay').classList.remove('open');
}
let activeMarker  = null;
let allMarkers    = [];

function makeSmallPinIcon(status, isActive) {
  const colour = { active: '#1e4096', warning: '#b45309', offline: '#6b748f' }[status] || '#6b748f';
  if (isActive) {
    return L.divIcon({
      className: '',
      html: `<div style="width:26px;height:26px;background:${colour};border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2.5px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;"><div style="width:8px;height:8px;background:#fff;border-radius:50%;transform:rotate(45deg);"></div></div>`,
      iconSize:   [26, 26],
      iconAnchor: [13, 26],
      popupAnchor:[0, -28],
    });
  }
  return L.divIcon({
    className: '',
    html: `<div style="width:10px;height:10px;background:${colour};border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.25);opacity:0.75;"></div>`,
    iconSize:   [10, 10],
    iconAnchor: [5, 5],
    popupAnchor:[0, -8],
  });
}

function buildSmallPopupHtml(s) {
  const statusLabel = statusLabel_(s.sysStatus);
  return `<div class="map-popup"><div class="map-popup-name">${stationDisplayName(s)}</div><div class="map-popup-loc">${s.location}</div><div class="map-popup-coord">${s.lat.toFixed(4)}° N &nbsp;${s.lng.toFixed(4)}° E</div><br><span class="map-popup-status ${s.sysStatus}">${statusLabel}</span></div>`;
}

export function updateStationMap(activeS) {
  if (!state.stationMap) {
    state.stationMap = L.map('station-map', {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false,
      dragging: true,
    });
    makeEsriTileLayer().addTo(state.stationMap);

    STATIONS.forEach((s, i) => {
      const mk = L.marker([s.lat, s.lng], { icon: makeSmallPinIcon(s.sysStatus, false) })
        .addTo(state.stationMap)
        .bindPopup(buildSmallPopupHtml(s), { maxWidth: 220 });

      mk.on('click', () => switchToStation(i));
      allMarkers.push(mk);
    });
  }

  STATIONS.forEach((s, i) => {
    const mk = allMarkers[i];
    if (!mk) return;
    mk.setIcon(makeSmallPinIcon(s.sysStatus, s === activeS));
    mk.setZIndexOffset(s === activeS ? 1000 : 0);
    mk.setPopupContent(buildSmallPopupHtml(s));
  });

  state.stationMap.setView([activeS.lat, activeS.lng], 12, { animate: true, duration: 0.5 });

  if (activeMarker) activeMarker.closePopup();
  activeMarker = allMarkers[STATIONS.indexOf(activeS)];
  if (activeMarker) setTimeout(() => activeMarker.openPopup(), 600);

  setTimeout(() => state.stationMap && state.stationMap.invalidateSize(), 50);
}

/** Wire this file's buttons and listeners (called once from main.js). */
export function setupMapOverlay() {
  document.getElementById('map-view-btn').addEventListener('click', openMapOverlay);
  document.getElementById('map-overlay-close').addEventListener('click', closeMapOverlay);

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMapOverlay();
  });
}
