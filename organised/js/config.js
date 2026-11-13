/* Settings that rarely change: the Apps Script address, refresh timings,
   tide-analysis thresholds and the list of stations shown in the sidebar. */

/* ═══════════════════════════════════════════════════
   CONFIGURATION
═══════════════════════════════════════════════════ */
export const GAS_API_URL = "https://script.google.com/macros/s/AKfycbw3sLNBleij3DFtf_uylJHa6sCmmiebRlrW77K0UTe0OWtrPwkEh06lYsg0HpasSav9Qg/exec";
export const CHART_FONT = '"Inter", "Roboto", Helvetica, Arial, sans-serif';   // Chart.js has no CSS-variable access
export const DASHBOARD_READ_LIMIT = 5000;
// The first read asks for about 6 hours of rows (at the 15 s cadence) so the page
// paints quickly; the full DASHBOARD_READ_LIMIT window, about 21 hours, follows in
// the background (loadFullHistory). Older windows use the 10-minute means.
export const DASHBOARD_FIRST_N = 1500;
export const DASHBOARD_NORMAL_REFRESH_MS = 15 * 1000;
export const DASHBOARD_SURVEY_REFRESH_MS = 15 * 1000;
// Back off when the real station isn't delivering — re-downloading the whole
// window every minute while it's dead burns Apps Script quota for nothing.
export const DASHBOARD_STALE_REFRESH_MS   =  5 * 60 * 1000;   // status 'warning'
export const DASHBOARD_OFFLINE_REFRESH_MS = 10 * 60 * 1000;   // status 'offline'
// Incremental polls only need the rows appended since the last cursor; the
// backend still reads a tail window this deep and flags `partial` if the
// cursor falls outside it (→ full refetch).
export const DASHBOARD_INCR_N = 300;

// Tide-analytics guards. A tide is a metre-scale, hours-long signal;
// anything smaller is sensor noise, a handling artefact, or a bench test.
export const TIDE_MIN_RANGE_M   = 0.10;            // window range below this → no "high/low" state
export const TIDE_EVENT_PROM_M  = 0.10;            // a turning point must reverse by ≥ this to count
export const TIDE_EVENT_SEP_MS  = 3 * 3600 * 1000; // consecutive events closer than this are noise

// Malaysia is UTC+8. Used to render simulated data on the same MYT wall-clock
// as the real station (whose timestamps already carry +08:00) and the clock,
// so all 10 stations share one time base regardless of the viewer's timezone.
export const MYT_OFFSET_MS = 8 * 3600 * 1000;

/* ═══════════════════════════════════════════════════
   STATION METADATA
═══════════════════════════════════════════════════ */
export const STATIONS = [
  { id: "MY-STN-001", name: "Stesen 1: Pelabuhan",       location: "Pelabuhan Klang, Selangor",     lat: 3.0508, lng: 101.3561, type: "IoT (Real-Time)", isIoT: true,  phase: 0.0,  amp: 1.15, mean: 1.80, sysStatus: "loading", errorCode: null        },
  { id: "MY-STN-002", name: "Stesen 2: Lumut",           location: "Lumut, Perak",                  lat: 4.2352, lng: 100.6125, type: "Simulasi",        isIoT: false, phase: 0.4,  amp: 1.05, mean: 1.75, sysStatus: "active",  errorCode: null        },
  { id: "MY-STN-003", name: "Stesen 3: P. Tioman",       location: "Pulau Tioman, Pahang",          lat: 2.8072, lng: 104.1383, type: "Simulasi",        isIoT: false, phase: 0.8,  amp: 1.20, mean: 1.82, sysStatus: "warning", errorCode: "ERR-0x14"  },
  { id: "MY-STN-004", name: "Stesen 4: Tg. Pengelih",    location: "Tanjung Pengelih, Johor",       lat: 1.3786, lng: 104.0901, type: "Simulasi",        isIoT: false, phase: 1.2,  amp: 0.95, mean: 1.65, sysStatus: "active",  errorCode: null        },
  { id: "MY-STN-005", name: "Stesen 5: P. Pinang",       location: "Fort Cornwallis, Pulau Pinang", lat: 5.4214, lng: 100.3450, type: "Simulasi",        isIoT: false, phase: 1.6,  amp: 0.80, mean: 1.50, sysStatus: "offline", errorCode: null        },
  { id: "MY-STN-006", name: "Stesen 6: Kukup",           location: "Kukup, Johor",                  lat: 1.3250, lng: 103.4408, type: "Simulasi",        isIoT: false, phase: 2.0,  amp: 1.10, mean: 1.70, sysStatus: "active",  errorCode: null        },
  { id: "MY-STN-007", name: "Stesen 7: Kota Kinabalu",   location: "Kota Kinabalu, Sabah",          lat: 5.9956, lng: 116.0806, type: "Simulasi",        isIoT: false, phase: 2.4,  amp: 0.70, mean: 1.40, sysStatus: "warning", errorCode: "ERR-0x2B"  },
  { id: "MY-STN-008", name: "Stesen 8: Sandakan",        location: "Sandakan, Sabah",               lat: 5.8089, lng: 118.0811, type: "Simulasi",        isIoT: false, phase: 2.8,  amp: 0.85, mean: 1.55, sysStatus: "active",  errorCode: null        },
  { id: "MY-STN-009", name: "Stesen 9: Santubong",       location: "Santubong, Sarawak",            lat: 1.7164, lng: 110.3283, type: "Simulasi",        isIoT: false, phase: 3.2,  amp: 1.30, mean: 1.90, sysStatus: "offline", errorCode: null        },
  { id: "MY-STN-010", name: "Stesen 10: Miri",           location: "Miri, Sarawak",                 lat: 4.4006, lng: 113.9769, type: "Simulasi",        isIoT: false, phase: 3.6,  amp: 1.00, mean: 1.68, sysStatus: "active",  errorCode: null        },
];
