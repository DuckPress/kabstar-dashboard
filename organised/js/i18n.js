/* Bilingual text (Bahasa Melayu / English). Every visible string lives in the
   I18N table; T(key) looks one up in the current language. applyLang() swaps
   the static labels in index.html (data-i18n attributes) and redraws the charts. */

import { state } from './state.js';
import { syncConnMore, updateConnectivityPanel, updateLiveBadge } from './ui/connectivity.js';
import { updateDashboard } from './ui/dashboard.js';
import { buildSidebar } from './ui/sidebar.js';
import { syncZoomMore, updateWindowSpan } from './ui/time-window.js';
import { CAL, calRender, calUpdateLabel } from './ui/calendar.js';

// Bilingual chrome. Extend by adding entries + tagging more elements.
export const I18N = {
  ms: {
    locale: 'ms-MY',
    pageTitle: 'KAB STAR — Sistem Pemantauan Air Pasang Surut Mudah Alih',
    title: 'Sistem Pemantauan Air Pasang Surut Mudah Alih',
    subtitle: 'Sains Ukur Geomatik UiTM Shah Alam',
    live: 'LANGSUNG', liveStale: 'LAMBAT', liveOffline: 'LUAR TALIAN',
    liveOfflineTitle: 'Stesen sebenar luar talian — tiada data baharu', liveStaleTitle: 'Bacaan terakhir lambat',
    map: 'Peta Stesen', mapBtnTitle: 'Pilih Stesen dari Peta', themeTitle: 'Tema Gelap/Cerah',
    exportCsv: 'Eksport CSV', exportCsvTitle: 'Muat turun data sebagai CSV', refresh: 'Muat Semula', loading: 'Memuatkan…',
    // time window
    quickZoom: 'Zum Cepat', p1h: '1J', p3h: '3J', p6h: '6J', p12h: '12J', p24h: '24J',
    p7d: '7H', p15d: '15H', p30d: '30H', pToday: 'Hari ini', pAll: 'Semua',
    p7dTitle: '7 hari — satu minggu', p15dTitle: '15 hari — kitaran pasang perbani/anak', p30dTitle: '30 hari — analisis harmonik',
    latest: 'Terkini', latestTitle: 'Kembali ke bacaan terbaharu', reset: 'Set Semula', rangeLabel: 'Julat Tarikh & Masa',
    rangePlaceholder: 'Julat…', rangeEnd: 'akhir', advanced: 'Lanjutan',
    pointsLabel: 'Bilangan Titik Data', exportRangeOnly: 'Julat dipilih sahaja',
    exportRangeTitle: 'Eksport hanya tetingkap yang dipaparkan pada graf; tanpa tanda = keseluruhan set data',
    calPickStart: 'Pilih tarikh mula', calPickEnd: 'Pilih tarikh tamat',
    calPickAgain: 'Pilih tarikh mula baharu', calFrom: 'Dari', calTo: 'Hingga',
    calClear: 'Padam', calDone: 'Tutup',
    // map overlay
    mapPick: 'Pilih Stesen — Klik Ikon untuk Butiran', close: 'Tutup',
    mapLatest: 'Paras Terkini', mapStatus: 'Status', mapCoords: 'Koordinat', mapType: 'Jenis', mapCode: 'Kod Ralat', mapView: 'Lihat Data Stesen',
    // sidebar
    stationsReal: 'Stesen Sebenar', stationsDemo: 'Stesen Demo ({n})', sidebarTagline: 'Sistem Air Pasang Surut Mudah Alih',
    more: 'Lagi', connMore: 'Butiran lanjut', connLess: 'Kurangkan butiran', legendAnom: 'Anomali', anomToggleTitle: 'Tunjuk atau sembunyi penanda anomali pada graf', cardJumpTitle: 'Klik untuk ke graf berkaitan',
    stActive: 'Aktif', stWarning: 'Amaran', stOffline: 'Luar Talian', stLoading: 'Memuatkan…',
    typeIoT: 'IoT (Masa Nyata)', typeSim: 'Simulasi', noLink: 'Tiada Sambungan', simCodeTitle: 'Kod ralat simulasi (demo)',
    stationWord: 'Stesen',
    // banners
    apiLoading: '⏳ <strong>Memuatkan…</strong> Mengambil bacaan terkini daripada Google Sheets.',
    apiUnconfigured: '⚠️ <strong>Mod Pratonton:</strong> API URL tidak dikonfigurasi. Data simulasi digunakan. Tetapkan <code>GAS_API_URL</code> untuk data langsung.',
    errFetchStatic: 'Gagal mengambil data daripada Google Sheets. Semak sambungan atau URL API anda.',
    errFetch: 'Gagal mengambil data: {msg}. Menggunakan data tersimpan/simulasi.', errBackend: 'ralat backend',
    simBanner: '🧪 <strong>DATA SIMULASI</strong>&nbsp;— Stesen ini menjana data tiruan untuk tujuan demonstrasi, bukan bacaan sensor sebenar.',
    staleBanner: '⚠ Data lapuk — bacaan terakhir {age}. Nilai "semasa" di bawah BUKAN keadaan sekarang.',
    staleNone: '⚠ Tiada bacaan diterima daripada stesen ini lagi.',
    // connectivity
    connTitle: 'Sambungan Nod — Stesen 1: Pelabuhan Klang', connChecking: 'Memeriksa…',
    connLastPost: 'Pos Terakhir', connAge: 'Masa Berlalu', connCount: 'Jumlah Bacaan (24j)', connLastVal: 'Paras Terakhir',
    connBat: 'Bateri Nod', connSnr: 'Isyarat (SNR)', connQc: 'Kualiti Rujukan (24j)',
    connTilt: 'Kecondongan', connPres: 'Tekanan Udara',
    connSensor: 'Sensor Jarak', connUs: 'Paras Ultrasonik',
    connUsTitle: 'Bacaan sensor ultrasonik pada datum yang sama; Δ = ultrasonik − bacaan utama (radar)',
    connQcTitle: 'Kualiti tetingkap sebagai rujukan pasang surut: % bacaan dengan jam RTC sah, bilangan gap >10 min, dan sisihan piawai pancaran terburuk',
    connFreshLabel: 'Kesegaran Data (0 = baru, 15 min = had amaran)',
    connConnected: 'Disambungkan', connSlow: 'Amaran — Lambat', connOffline: 'Luar Talian', connNoData: 'Tiada data',
    readingsUnit: 'bacaan', freshFresh: 'Segar', freshSlow: 'Lambat', freshStale: 'Lapuk',
    qcNoGap: 'tiada gap', qcGaps: '{n} gap', qcClock: 'jam Δ≤{s}s', qcMoved: '⚠ ALIH×{n}', qcFailed: '{n} gagal QC',
    ageS: '{n} s lalu', ageMin: '{n} min lalu', ageHr: '{h} jam lalu', ageHrMin: '{h} jam {m} min lalu', ageDay: '{n} hari lalu',
    // station header + tiles
    breadcrumb: 'Papan Pemuka', coords: 'Koordinat', datumGauge: 'Datum: Tolok',
    tLevel: 'Paras Air Semasa', tLevelLoading: 'Sedang mengambil data…', tStatus: 'Status Pasang Surut', tRate: 'Kadar Perubahan',
    tUpdated: 'Kemaskini Terakhir', tTemp: 'Suhu Terkini', tHumid: 'Kelembapan Terkini', tAnom: 'Bacaan Anomali', tRadar: 'Bacaan Radar', tUs: 'Bacaan Ultrasonik',
    distToWater: 'Jarak ke permukaan air', sensorLast: 'Bacaan terakhir {age}', radarNone: 'Tiada bacaan radar', usNone: 'Tiada bacaan ultrasonik',
    anomNone: 'Tiada anomali dikesan', anomCount: '{n} bacaan luar jangkaan dikesan',
    levelSub: 'Paras carta: {mm} mm · Purata: {avg} m', levelWait: 'Menunggu bacaan sah (jurang sensor)',
    tideUnknown: 'Tidak Diketahui', tideHigh: 'Air Tinggi', tideLow: 'Air Rendah', tideRising: 'Sedang Naik', tideFalling: 'Sedang Surut', tideStable: 'Stabil', tideStale: 'Data Lapuk',
    subRising: 'Paras air meningkat', subFalling: 'Paras air menurun', subHigh: 'Mencapai paras tertinggi', subLow: 'Mencapai paras terendah',
    subStale: 'Tiada bacaan baharu — status pasang surut tidak diketahui',
    rateUp: 'Kadar kenaikan', rateDown: 'Kadar penurunan', rateNone: 'Tiada perubahan',
    tempHot: '⚠ Suhu Tinggi (&gt;{t}°C)', tempOver: 'Melebihi ambang amaran', inRange: 'Dalam julat normal', tempNone: 'Tiada data suhu',
    tempStale: 'Bacaan lapuk — bukan suhu semasa', humidHigh: 'Kelembapan tinggi', humidLow: 'Kelembapan rendah', humidNone: 'Tiada data kelembapan',
    updatedSrc: ' · Nod',
    // charts
    chartTitle: 'Graf Pasang Surut', chartSubUnit: 'FinalReading_m (meter)', legendLevel: 'Paras Air (Bacaan Akhir)', legendAvg: 'Purata (Dikira)',
    dragHint: 'Seret pada graf untuk zum kawasan', dsLevel: 'Bacaan Akhir (m)', dsAvg: 'Purata', dsForecast: 'Model harmonik (padanan)',
    ttAnom: ' ⚠ Anomali', ttLevel: 'Bacaan Akhir', ttAvg: 'Purata', ttForecast: 'Model',
    ptsWord: 'titik', aggMeans: 'purata {m} min', longLoading: 'memuatkan tetingkap panjang…',
    longOld: 'tetingkap panjang perlukan skrip awan terkini — data dimuatkan sahaja',
    ttUs: 'Ultrasonik', dsUs: 'Paras (Ultrasonik)',
    avgNow: 'Purata semasa: {v} m', avgOnly: 'Purata: {v} m', surge: 'Sisa/Surge (RMS): {v} m',
    selLabel: 'Pilihan', selPts: 'Titik', selMax: 'Maks', selAvg: 'Purata', selRange: 'Julat', zoomOut: 'Zum Keluar',
    tempChart: 'Graf Suhu', tempChartSub: 'Suhu persekitaran (°C) berbanding masa', legendTemp: 'Suhu (°C)', legendMean: 'Purata',
    tempNoData: 'Tiada data suhu tersedia', humidChart: 'Graf Kelembapan', humidChartSub: 'Kelembapan relatif (%) berbanding masa',
    legendHumid: 'Kelembapan (%)', humidNoData: 'Tiada data kelembapan tersedia',
    envStat: 'Terkini: {latest} · Purata: {avg}', ttTemp: 'Suhu', ttHumid: 'Kelembapan',
    radarChart: 'Jarak Radar', radarChartSub: 'Jarak radar ke permukaan air (cm) berbanding masa',
    usChart: 'Jarak Ultrasonik', usChartSub: 'Jarak ultrasonik ke permukaan air (cm) berbanding masa',
    legendRadar: 'Radar (cm)', legendUs: 'Ultrasonik (cm)', ttRadar: 'Radar',
    radarNoData: 'Tiada data radar dalam tetingkap ini', usNoData: 'Tiada data ultrasonik dalam tetingkap ini',
    radarChartAria: 'Carta jarak radar (cm) mengikut masa', usChartAria: 'Carta jarak ultrasonik (cm) mengikut masa',
    distDerivTitle: 'Dikira daripada awan: datum − paras air (hanya baris yang dibaca oleh radar)',
    distDerivUsTitle: 'Dikira daripada awan: datum − paras ultrasonik (termasuk anjakan Config us_offset_cm)',
    distPrimaryNote: '(sensor utama)',
    // info panel
    tabStation: 'Maklumat Stesen', tabSystem: 'Maklumat Sistem', infoId: 'ID Stesen', infoLat: 'Latitud', infoLng: 'Longitud',
    infoType: 'Jenis Sensor', infoMax: 'Paras Tertinggi (24j)', infoMin: 'Paras Terendah (24j)', infoAmp: 'Amplitud',
    trend6h: 'Trend 6 Jam Terkini', tideEventsTitle: 'Air Pasang & Surut Terkini',
    tideEventsNone: 'Tiada peristiwa pasang/surut dikesan dalam tetingkap ini.', evHigh: '▲ Air Pasang', evLow: '▼ Air Surut',
    // system panel (matches the real hardware)
    sysHeader: 'Komponen Perkakasan',
    sysRadarName: 'Radar HLK-LD2413 (24 GHz)',
    sysEnvName: 'Sensor SHT3x',
    sysRtcName: 'RTC DS3231',
    sysSdName: 'Kad Micro SD',
    sysLoraName: 'LoRa SX1262 (923 MHz)',
    sysFooter: 'Platform: LilyGO T3-S3 (ESP32-S3), nod tidur dalam · LoRa 923 MHz → get laluan XIAO ESP32-C3 → HTTPS ke Google Apps Script · Empat lapisan perlindungan data: SD → LoRa+ACK → WiFi → baris gilir cuba semula',
  },
  en: {
    locale: 'en-GB',
    pageTitle: 'KAB STAR — Portable Tide Monitoring System',
    title: 'Portable Tide Monitoring System',
    subtitle: 'Geomatic Surveying Science, UiTM Shah Alam',
    live: 'LIVE', liveStale: 'STALE', liveOffline: 'OFFLINE',
    liveOfflineTitle: 'Real station offline — no new data', liveStaleTitle: 'Last reading is late',
    map: 'Station Map', mapBtnTitle: 'Choose a station from the map', themeTitle: 'Dark / light theme',
    exportCsv: 'Export CSV', exportCsvTitle: 'Download data as CSV', refresh: 'Refresh', loading: 'Loading…',
    quickZoom: 'Quick zoom', p1h: '1h', p3h: '3h', p6h: '6h', p12h: '12h', p24h: '24h',
    p7d: '7d', p15d: '15d', p30d: '30d', pToday: 'Today', pAll: 'All',
    p7dTitle: '7 days — one week', p15dTitle: '15 days — spring–neap cycle', p30dTitle: '30 days — harmonic analysis',
    latest: 'Latest', latestTitle: 'Jump to the newest reading', reset: 'Reset', rangeLabel: 'Date & time range',
    rangePlaceholder: 'Range…', rangeEnd: 'end', advanced: 'Advanced',
    pointsLabel: 'Data points', exportRangeOnly: 'Selected range only',
    exportRangeTitle: 'Export only the window shown on the chart; unticked = the whole dataset',
    calPickStart: 'Pick a start date', calPickEnd: 'Pick an end date',
    calPickAgain: 'Pick a new start date', calFrom: 'From', calTo: 'To',
    calClear: 'Clear', calDone: 'Done',
    mapPick: 'Select a Station — click an icon for details', close: 'Close',
    mapLatest: 'Latest Level', mapStatus: 'Status', mapCoords: 'Coordinates', mapType: 'Type', mapCode: 'Error Code', mapView: 'View Station Data',
    stationsReal: 'Live Station', stationsDemo: 'Demo Stations ({n})', sidebarTagline: 'Portable Tide Monitoring System',
    more: 'More', connMore: 'More details', connLess: 'Fewer details', legendAnom: 'Anomalies', anomToggleTitle: 'Show or hide the anomaly markers on the chart', cardJumpTitle: 'Click to jump to the related graph',
    stActive: 'Active', stWarning: 'Warning', stOffline: 'Offline', stLoading: 'Loading…',
    typeIoT: 'IoT (Real-Time)', typeSim: 'Simulated', noLink: 'No Connection', simCodeTitle: 'Simulated error code (demo)',
    stationWord: 'Station',
    apiLoading: '⏳ <strong>Loading…</strong> Fetching the latest readings from Google Sheets.',
    apiUnconfigured: '⚠️ <strong>Preview mode:</strong> API URL not configured. Simulated data is shown. Set <code>GAS_API_URL</code> for live data.',
    errFetchStatic: 'Failed to fetch data from Google Sheets. Check your connection or API URL.',
    errFetch: 'Failed to fetch data: {msg}. Using cached/simulated data.', errBackend: 'backend error',
    simBanner: '🧪 <strong>SIMULATED DATA</strong>&nbsp;— this station generates synthetic data for demonstration; these are not real sensor readings.',
    staleBanner: '⚠ Stale data — last reading {age}. The "current" values below are NOT the present state.',
    staleNone: '⚠ No readings have been received from this station yet.',
    connTitle: 'Node Connection — Station 1: Pelabuhan Klang', connChecking: 'Checking…',
    connLastPost: 'Last Packet', connAge: 'Elapsed', connCount: 'Readings (24h)', connLastVal: 'Last Level',
    connBat: 'Node Battery', connSnr: 'Signal (SNR)', connQc: 'Reference Quality (24h)',
    connTilt: 'Tilt', connPres: 'Air Pressure',
    connSensor: 'Distance Sensor', connUs: 'Ultrasonic Level',
    connUsTitle: 'Ultrasonic sensor reading on the same datum; Δ = ultrasonic − primary (radar) reading',
    connQcTitle: 'Quality of this window as a tide reference: % of readings with a valid RTC clock, number of gaps >10 min, and the worst burst standard deviation',
    connFreshLabel: 'Data Freshness (0 = fresh, 15 min = warning threshold)',
    connConnected: 'Connected', connSlow: 'Warning — Slow', connOffline: 'Offline', connNoData: 'No data',
    readingsUnit: 'readings', freshFresh: 'Fresh', freshSlow: 'Slow', freshStale: 'Stale',
    qcNoGap: 'no gaps', qcGaps: '{n} gap(s)', qcClock: 'clock Δ≤{s}s', qcMoved: '⚠ MOVED×{n}', qcFailed: '{n} fail QC',
    ageS: '{n} s ago', ageMin: '{n} min ago', ageHr: '{h} h ago', ageHrMin: '{h} h {m} min ago', ageDay: '{n} days ago',
    breadcrumb: 'Dashboard', coords: 'Coordinates', datumGauge: 'Datum: Gauge zero',
    tLevel: 'Current Water Level', tLevelLoading: 'Fetching data…', tStatus: 'Tide Status', tRate: 'Rate of Change',
    tUpdated: 'Last Update', tTemp: 'Current Temperature', tHumid: 'Current Humidity', tAnom: 'Anomalous Readings', tRadar: 'Radar Reading', tUs: 'Ultrasonic Reading',
    distToWater: 'Distance to the water surface', sensorLast: 'Last reading {age}', radarNone: 'No radar reading', usNone: 'No ultrasonic reading',
    anomNone: 'No anomalies detected', anomCount: '{n} out-of-range readings detected',
    levelSub: 'Chart level: {mm} mm · Mean: {avg} m', levelWait: 'Waiting for a valid reading (sensor gap)',
    tideUnknown: 'Unknown', tideHigh: 'High Water', tideLow: 'Low Water', tideRising: 'Rising', tideFalling: 'Falling', tideStable: 'Stable', tideStale: 'Stale Data',
    subRising: 'Water level rising', subFalling: 'Water level falling', subHigh: 'At high water', subLow: 'At low water',
    subStale: 'No new readings — tide status unknown',
    rateUp: 'Rising rate', rateDown: 'Falling rate', rateNone: 'No change',
    tempHot: '⚠ High Temperature (&gt;{t}°C)', tempOver: 'Above warning threshold', inRange: 'Within normal range', tempNone: 'No temperature data',
    tempStale: 'Stale reading — not the current temperature', humidHigh: 'High humidity', humidLow: 'Low humidity', humidNone: 'No humidity data',
    updatedSrc: ' · Node',
    chartTitle: 'Tide Chart', chartSubUnit: 'FinalReading_m (metres)', legendLevel: 'Water Level (Final Reading)', legendAvg: 'Mean (Computed)',
    dragHint: 'Drag on the chart to zoom into a region', dsLevel: 'Final Reading (m)', dsAvg: 'Mean', dsForecast: 'Harmonic model (fit)',
    ttAnom: ' ⚠ Anomaly', ttLevel: 'Final Reading', ttAvg: 'Mean', ttForecast: 'Model',
    ptsWord: 'pts', aggMeans: '{m}-min means', longLoading: 'loading long window…',
    longOld: 'long windows need the updated cloud script — loaded data only',
    ttUs: 'Ultrasonic', dsUs: 'Level (Ultrasonic)',
    avgNow: 'Current mean: {v} m', avgOnly: 'Mean: {v} m', surge: 'Residual/Surge (RMS): {v} m',
    selLabel: 'Selection', selPts: 'Points', selMax: 'Max', selAvg: 'Mean', selRange: 'Range', zoomOut: 'Zoom Out',
    tempChart: 'Temperature Chart', tempChartSub: 'Ambient temperature (°C) vs time', legendTemp: 'Temperature (°C)', legendMean: 'Mean',
    tempNoData: 'No temperature data available', humidChart: 'Humidity Chart', humidChartSub: 'Relative humidity (%) vs time',
    legendHumid: 'Humidity (%)', humidNoData: 'No humidity data available',
    envStat: 'Latest: {latest} · Mean: {avg}', ttTemp: 'Temperature', ttHumid: 'Humidity',
    radarChart: 'Radar Distance', radarChartSub: 'Radar distance to the water surface (cm) vs time',
    usChart: 'Ultrasonic Distance', usChartSub: 'Ultrasonic distance to the water surface (cm) vs time',
    legendRadar: 'Radar (cm)', legendUs: 'Ultrasonic (cm)', ttRadar: 'Radar',
    radarNoData: 'No radar data in this window', usNoData: 'No ultrasonic data in this window',
    radarChartAria: 'Radar distance (cm) over time', usChartAria: 'Ultrasonic distance (cm) over time',
    distDerivTitle: 'Worked out from the cloud data: datum − water level (rows the radar measured only)',
    distDerivUsTitle: 'Worked out from the cloud data: datum − ultrasonic level (includes the Config us_offset_cm shift)',
    distPrimaryNote: '(primary sensor)',
    tabStation: 'Station Info', tabSystem: 'System Info', infoId: 'Station ID', infoLat: 'Latitude', infoLng: 'Longitude',
    infoType: 'Sensor Type', infoMax: 'Highest Level (24h)', infoMin: 'Lowest Level (24h)', infoAmp: 'Amplitude',
    trend6h: 'Last 6 Hours Trend', tideEventsTitle: 'Recent High & Low Water',
    tideEventsNone: 'No high/low water events detected in this window.', evHigh: '▲ High Water', evLow: '▼ Low Water',
    sysHeader: 'Hardware Components',
    sysRadarName: 'HLK-LD2413 Radar (24 GHz)',
    sysEnvName: 'SHT3x Sensor',
    sysRtcName: 'DS3231 RTC',
    sysSdName: 'Micro SD Card',
    sysLoraName: 'LoRa SX1262 (923 MHz)',
    sysFooter: 'Platform: LilyGO T3-S3 (ESP32-S3) deep-sleep node · LoRa 923 MHz → XIAO ESP32-C3 gateway → HTTPS to Google Apps Script · Four layers of data protection: SD → LoRa+ACK → WiFi → retry queues',
  },
};

/** Translate a key in the active language (Malay fallback), with {placeholder} substitution. */
export function T(key, vars) {
  const tbl = I18N[state.lang] || I18N.ms;
  let str = (tbl[key] !== undefined) ? tbl[key] : (I18N.ms[key] !== undefined ? I18N.ms[key] : key);
  if (vars) Object.keys(vars).forEach(k => { str = str.split('{' + k + '}').join(String(vars[k])); });
  return str;
}
export function statusLabel_(st) {
  return { active: T('stActive'), warning: T('stWarning'), offline: T('stOffline'), loading: T('stLoading') }[st] || '—';
}
export function stationTypeLabel(s) { return s.isIoT ? T('typeIoT') : T('typeSim'); }
/** "Stesen 2: Lumut" → "Station 2: Lumut" in EN; the STATIONS data stays Malay (it feeds the CSV). */
export function stationDisplayName(s) { return String(s.name || '').replace(/^Stesen\s+/, T('stationWord') + ' '); }
export function applyLang(lang) {
  const L = lang === 'en' ? 'en' : 'ms';
  const d = I18N[L];
  const byClass = (sel, txt) => { const el = document.querySelector(sel); if (el) el.textContent = txt; };
  const byId    = (id,  txt) => { const el = document.getElementById(id);  if (el) el.textContent = txt; };
  state.lang = L;
  byClass('.main-title', d.title);
  byClass('.sub-title',  d.subtitle);
  updateLiveBadge();
  document.querySelectorAll('[data-i18n]').forEach(el => { const k = el.dataset.i18n; if (d[k] !== undefined) el.textContent = d[k]; });
  document.querySelectorAll('[data-i18n-html]').forEach(el => { const k = el.dataset.i18nHtml; if (d[k] !== undefined) el.innerHTML = d[k]; });
  document.querySelectorAll('[data-i18n-title]').forEach(el => { const k = el.dataset.i18nTitle; if (d[k] !== undefined) el.title = d[k]; });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { const k = el.dataset.i18nAria; if (d[k] !== undefined) el.setAttribute('aria-label', d[k]); });
  document.title = d.pageTitle;
  if (typeof calUpdateLabel === 'function') { calUpdateLabel(); if (CAL.open) calRender(); }
  if (state.lastSpan) updateWindowSpan(state.lastSpan.ts, state.lastSpan.n);
  syncZoomMore();
  syncConnMore();
  // Everything rendered from JS (tiles, chart legends/tooltips, sidebar, link
  // panel) is rebuilt in the new language. Charts are recreated because their
  // dataset labels are fixed at construction.
  if (state.allData) {
    try { if (state.mainChart)  { state.mainChart.destroy();  state.mainChart  = null; } } catch (e) {}
    try { if (state.miniChart)  { state.miniChart.destroy();  state.miniChart  = null; } } catch (e) {}
    try { if (state.tempChart)  { state.tempChart.destroy();  state.tempChart  = null; } } catch (e) {}
    try { if (state.humidChart) { state.humidChart.destroy(); state.humidChart = null; } } catch (e) {}
    try { if (state.radarChart) { state.radarChart.destroy(); state.radarChart = null; } } catch (e) {}
    try { if (state.usChart)    { state.usChart.destroy();    state.usChart    = null; } } catch (e) {}
    if (state.lastConnReadings) updateConnectivityPanel(state.lastConnReadings);
    buildSidebar();
    updateDashboard(state.activeStation);
  }
  byId('btn-map-text',     d.map);
  byId('btn-export-text',  d.exportCsv);
  byId('refresh-btn-text', d.refresh);
  document.documentElement.lang = L;
  try { localStorage.setItem('kabstar_lang', L); } catch (e) {}
  const btn = document.getElementById('lang-toggle');
  if (btn) btn.textContent = L === 'en' ? 'BM' : 'EN';
}
export function toggleLang() {
  let cur = 'ms';
  try { cur = localStorage.getItem('kabstar_lang') || 'ms'; } catch (e) {}
  applyLang(cur === 'en' ? 'ms' : 'en');
}
