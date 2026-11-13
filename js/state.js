/* Everything the page needs to remember while it runs, in one object:
   the selected station, the loaded data, the chart objects, the time window
   and a few view settings. Other files read and change `state.x` directly. */

export const state = {
  activeStation: 0,
  allData: null,       // fetched or generated — full dataset
  lang: 'ms',
  mainChart: null,
  // Station metadata from the backend (Config tab): current datum, vertical
  // datum offsets (gauge zero above CD / MSL, in cm) and survey-mode state.
  // Drives the export datum selector, chart datum lines and survey polling.
  stationMeta: {
    datum_cm: null, cd_off: 0, msl_off: 0, survey_mode: 0,
    benchmark_id: '', levelling_date: '',
    max_sd_cm: 0, max_skew_s: 0   // Config QC limits (0 = no limit), same gates as ?action=tide
  },
  miniChart: null,
  tempChart: null,
  humidChart: null,
  radarChart: null,   // per-sensor distance charts (below the map)
  usChart: null,
  // Chart filter state — applied before rendering
  chartFilter: {
    preset: '24h',  // active time preset, or null for a custom range / point cap (see TIME WINDOW)
    maxPts: 144,    // newest-N-points cap — only used when no dtFrom/dtTo
    dtFrom: null,   // "YYYY-MM-DDTHH:mm" string | null — start of range
    dtTo:   null,   // "YYYY-MM-DDTHH:mm" string | null — end of range
  },
  // Show the red anomaly markers on the main chart (legend toggle, remembered).
  showAnomalies: true,
  lastConnReadings: null,
  stationMap: null,
  lastSpan: null,   // remembered so a language switch can re-render the units
};

// Remembered per browser (if storage is available).
try { state.showAnomalies = localStorage.getItem('kabstar_anom') !== '0'; } catch (e) {}
