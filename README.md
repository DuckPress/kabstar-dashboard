# KAB STAR dashboard

A web page that shows the tide gauge's readings live: water level, temperature, humidity and the two distance sensors. It also shows nine simulated demo stations, so the page has something to compare against. The data comes from a Google Sheet through a Google Apps Script web app; the page itself stores nothing.

It is plain HTML, CSS and JavaScript: no framework, no build step, no `npm install`.

**Live version:** https://duckpress.github.io/kabstar-dashboard/

## Running it

The scripts are ES modules, and browsers will not load modules from a file opened by double-clicking (`file://`). Serve the folder instead:

```
python -m http.server 8765
```

then open http://localhost:8765.

To share it as one file that does open with a double-click, build `KAB-STAR-dashboard.html` (see [Making the one-file copy](#making-the-one-file-copy)).

## How it fits together

```
index.html            the page structure (no logic, no inline styles)
  ├─ css/*.css        how it looks, loaded in order: general → specific
  └─ js/main.js       start-up; imports everything else in js/
       │
       ├─ data/       get the readings          (Sheet → clean series)
       ├─ analysis/   work things out            (tide status, anomalies, …)
       ├─ charts/     draw the charts            (Chart.js)
       └─ ui/         everything else on screen  (cards, sidebar, map, toolbar, …)
```

Every refresh follows the same path:

1. `data/fetch.js` downloads new rows from the Sheet.
2. `data/parse.js` turns them into series (time, level, temperature, …).
3. `ui/dashboard.js` (`updateDashboard`) cuts the series to the selected time window (`analysis/window-filter.js`), works out the tide status and anomalies (`analysis/`), and redraws every card and chart (`charts/`, `ui/`).

`state.js` holds the few things the page remembers while it runs: the selected station, the loaded data, the time window and the chart objects. Any file that needs them imports `state` and reads or changes `state.something`.

## Files

### css/ (loaded in this order; later files win when two rules clash)

| File | What it styles |
|---|---|
| `tokens.css` | Colours, fonts and shadows as variables, plus their dark-mode values. Change a colour here and it changes everywhere. |
| `base.css` | Small reusable pieces: top-bar buttons, pills, text helpers, scrollbar. |
| `layout.css` | Page frame: top bar, sidebar, main column, station header, footer. |
| `cards.css` | The metric cards along the top and the warning banners. |
| `charts.css` | Chart cards, legends, the time-window toolbar, drag-to-zoom. |
| `calendar.css` | The date-range calendar pop-up. |
| `panels.css` | Info tabs, sensor list, connection panel. |
| `map.css` | The station maps and their markers and pop-ups. |
| `responsive.css` | Tablet and phone adjustments (last, so they override the desktop styles). |

### js/

| File | What it does |
|---|---|
| `main.js` | Start-up: wires every button, loads the data, starts the refresh loop. |
| `config.js` | Settings: the Apps Script address, refresh timings, tide thresholds, the station list. |
| `state.js` | The page's shared memory (see above). |
| `i18n.js` | All text in Bahasa Melayu and English, and the language switch. |
| **data/** | |
| `fetch.js` | Downloads readings from the Sheet; small incremental updates after the first load. |
| `parse.js` | Cleans the raw rows into series for the charts. |
| `long-history.js` | Windows longer than a day use 10-minute averages from the Sheet instead of raw rows. |
| `demo.js` | The simulated tide for the nine demo stations. |
| **analysis/** | |
| `window-filter.js` | Cuts a series to the selected time window. |
| `anomalies.js` | Flags readings that jump away from their neighbours. |
| `tide.js` | Predicted tide (harmonic fit), rising/falling/high/low status, rate of change, high and low waters. |
| `downsample.js` | Thins long series to a few hundred points without losing their shape. |
| **charts/** | |
| `theme.js` | Shared chart colours (light/dark) and the time axis. |
| `main-chart.js` | The water-level chart and its anomaly markers. |
| `env-charts.js` | Temperature and humidity charts. |
| `sensor-charts.js` | Radar and ultrasonic distance charts. |
| `mini-chart.js` | The small 6-hour trend chart. |
| `drag-select.js` | Drag across the main chart to zoom in. |
| **ui/** | |
| `dashboard.js` | `updateDashboard()`: redraws everything for the selected station. |
| `cards.js` | The radar and ultrasonic cards, and clicking a card to scroll to its chart. |
| `time-window.js` | Preset buttons, point cap, reset/latest, the window saved in the page address. |
| `calendar.js` | The date-range calendar. |
| `sidebar.js` | The station list and switching stations. |
| `map.js` | The full-screen station map and the small map. |
| `connectivity.js` | The live/stale/offline badge and the connection panel. |
| `tide-events.js` | The list of recent high and low waters. |
| `export-csv.js` | The Export CSV button. |
| `page.js` | Banners, light/dark theme, clock, refresh button, info tabs. |

### Other files

| File | Purpose |
|---|---|
| `sw.js` | Service worker: caches the page and libraries so it still opens offline. Bump `CACHE` when you add, rename or remove a file, and list it in `LOCAL_SHELL`. |
| `manifest.webmanifest`, `apple-touch-icon.png` | "Add to Home Screen" name and icon. |
| `KAB-STAR-dashboard.html` | The one-file copy: double-click it to see the dashboard without a server (generated; don't edit by hand). |
| `tools/build_single_file.py` | Rebuilds the one-file copy from `css/` and `js/` (Python 3, no extra packages). |

## Common changes

- **Text on the page:** edit both languages in the `I18N` table in `js/i18n.js`. In `index.html`, a static label carries `data-i18n="key"`; in the scripts, use `T('key')`. Never type Malay or English straight into the HTML or JS.
- **A colour:** `css/tokens.css` for theme colours. The chart line colours are in `js/charts/theme.js` (Chart.js cannot read CSS variables).
- **Refresh rate or the Apps Script address:** `js/config.js`.
- **A new button:** add it to `index.html`, then wire it in the `setup…()` function of the file it belongs to; `main.js` calls each `setup…()` once at start-up.

## Making the one-file copy

```
python tools/build_single_file.py
```

It inlines every stylesheet and script into `KAB-STAR-dashboard.html`, placing each script after the ones it imports. Re-run it after every change. The one-file copy has no offline cache (no `sw.js`).

## Libraries (loaded from the jsDelivr CDN)

Chart.js 4.4 with the zoom and annotation plugins, Hammer.js (touch gestures), Leaflet 1.9 (maps), and the Inter font from Google Fonts.
