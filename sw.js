/*
 * KAB STAR dashboard — service worker
 * Strategy:
 *   • App shell (the HTML page) → network-first, fall back to cache when offline.
 *   • Third-party libs (Chart.js, Leaflet, fonts) → cache-first (rarely change).
 *   • Google Apps Script API calls → never cached (always live); the page's own
 *     localStorage cache handles offline data, not the SW.
 *   • Map tiles (ArcGIS) → never cached: an unbounded, opaque-response tile
 *     hoard bloats storage quota and invites eviction of the whole cache.
 *   • Only successful (res.ok) responses are ever cached — a 500 page or a
 *     captive-portal login must not become the stored app shell.
 */
const CACHE = 'kabstar-v8';   // v8: page revalidated on every visit   // v7: split into css/ and js/ modules   // v6: Inter web font

// Local files the offline experience genuinely needs. addAll() is atomic and
// its failure REJECTS the install, so a bad install can never wipe the
// previous working cache (activate only runs after a successful install).
const LOCAL_SHELL = [
  './',
  './index.html',
  './css/tokens.css',
  './css/base.css',
  './css/layout.css',
  './css/cards.css',
  './css/charts.css',
  './css/calendar.css',
  './css/panels.css',
  './css/map.css',
  './css/responsive.css',
  './js/main.js',
  './js/analysis/anomalies.js',
  './js/analysis/downsample.js',
  './js/analysis/tide.js',
  './js/analysis/window-filter.js',
  './js/charts/drag-select.js',
  './js/charts/env-charts.js',
  './js/charts/main-chart.js',
  './js/charts/mini-chart.js',
  './js/charts/sensor-charts.js',
  './js/charts/theme.js',
  './js/config.js',
  './js/data/demo.js',
  './js/data/fetch.js',
  './js/data/long-history.js',
  './js/data/parse.js',
  './js/i18n.js',
  './js/state.js',
  './js/ui/calendar.js',
  './js/ui/cards.js',
  './js/ui/connectivity.js',
  './js/ui/dashboard.js',
  './js/ui/export-csv.js',
  './js/ui/map.js',
  './js/ui/page.js',
  './js/ui/sidebar.js',
  './js/ui/tide-events.js',
  './js/ui/time-window.js',
  './manifest.webmanifest',
  './apple-touch-icon.png',
];

// CDN libraries — pre-cache best-effort. A flaky CDN shouldn't block install;
// anything missed is picked up by the runtime cache-first handler below.
const CDN_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/hammerjs@2.0.8/hammer.min.js',
  'https://cdn.jsdelivr.net/npm/chartjs-plugin-zoom@2.0.1/dist/chartjs-plugin-zoom.min.js',
  'https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation@3.0.1/dist/chartjs-plugin-annotation.min.js',
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css',
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) =>
        c.addAll(LOCAL_SHELL)                                   // must succeed
          .then(() => Promise.allSettled(CDN_ASSETS.map((u) => c.add(u)))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never cache the live data API — always go to the network.
  if (url.hostname.indexOf('script.google') !== -1 ||
      url.hostname.indexOf('googleusercontent') !== -1) {
    return; // let the browser handle it (the page caches data in localStorage)
  }

  // Never cache map tiles — unbounded growth + opaque-response quota padding.
  if (url.hostname.indexOf('arcgisonline.com') !== -1) {
    return; // plain network; the map simply needs connectivity
  }

  // App shell (the document AND our own styles.css / app.js) → network-first
  // (fresh when online, cached when offline). Same-origin files must NOT be
  // cache-first or an edit to app.js would never reach a returning browser
  // until the cache version is bumped.
  if (req.mode === 'navigate' || req.destination === 'document' ||
      url.origin === self.location.origin) {
    // cache:'no-cache' = always revalidate with the server (If-Modified-Since →
    // 304 when unchanged). Without it a plain fetch() can be satisfied from the
    // browser's HTTP cache (GitHub Pages allows 10 minutes) and hand back an old
    // index.html next to new scripts, so new elements on the page go missing.
    // The page itself is re-requested by URL because a navigation request can't
    // be copied with a new cache mode; if that hits a redirect, use the original.
    const netFetch = (req.mode === 'navigate')
      ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
          .then((res) => (res.redirected ? fetch(req) : res))
      : fetch(new Request(req, { cache: 'no-cache' }));
    e.respondWith(
      netFetch.then((res) => {
        if (res.ok) {   // don't let an error page replace the offline shell
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req).then((m) => m || caches.match('./index.html')))
    );
    return;
  }

  // Everything else (libs, fonts) → cache-first. Only store successful
  // responses; opaque ones (status 0) can hide errors and are quota-padded.
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() =>
      // No cache hit and no network — answer with an explicit error instead
      // of an unhandled rejection.
      new Response('', { status: 504, statusText: 'offline' })
    ))
  );
});
